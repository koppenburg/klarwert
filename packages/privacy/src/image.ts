import sharp, { type OverlayOptions } from "sharp";
import { detectPii, PLACEHOLDERS } from "./detect";
import { blockLayout, mergeSynthetic, rowLayout, wordsInRange, type TextLayout } from "./layout";
import { recognize, type OcrResult, type OcrWord } from "./ocr";
import type { Box, DetectOptions, PiiKind, PiiMatch } from "./types";

export function toBuffer(data: Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

export function toUint8(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * Dekodiert ein Bild, dreht es gemäß EXIF-Orientierung, entfernt Alpha
 * (weißer Hintergrund) und alle Metadaten (EXIF, XMP, ICC, IPTC, Textblöcke).
 */
export async function normalizeImage(data: Uint8Array): Promise<{ png: Buffer; width: number; height: number }> {
  const { data: png, info } = await sharp(toBuffer(data), { failOn: "error" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 6 })
    .toBuffer({ resolveWithObject: true });
  return { png, width: info.width, height: info.height };
}

/** Schwarze Rechtecke auf ein PNG zeichnen. Ergebnis: PNG ohne Metadaten. */
export async function fillBoxes(png: Uint8Array, boxes: readonly Box[]): Promise<Buffer> {
  const img = sharp(toBuffer(png));
  const meta = await img.metadata();
  const W = meta.width;
  const H = meta.height;
  const overlays: OverlayOptions[] = [];
  for (const b of boxes) {
    const x = Math.max(0, Math.floor(b.x));
    const y = Math.max(0, Math.floor(b.y));
    const x1 = Math.min(W, Math.ceil(b.x + b.width));
    const y1 = Math.min(H, Math.ceil(b.y + b.height));
    if (x1 <= x || y1 <= y) continue;
    overlays.push({
      input: { create: { width: x1 - x, height: y1 - y, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } },
      left: x,
      top: y,
    });
  }
  const out = overlays.length > 0 ? img.composite(overlays) : img;
  return out.flatten({ background: "#ffffff" }).png({ compressionLevel: 6 }).toBuffer();
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Sucht zusammenhängende dunkle Flächen (Kopfleisten, Buttons, Seitenmenüs).
 * Tesseract behandelt solche Flächen oft als Grafik und liest helle Schrift
 * darin nicht – sie werden deshalb separat invertiert gelesen.
 */
async function darkRegions(png: Buffer, width: number, height: number, ignore: readonly Box[]): Promise<Rect[]> {
  const cell = 6;
  const gw = Math.max(1, Math.ceil(width / cell));
  const gh = Math.max(1, Math.ceil(height / cell));
  const { data } = await sharp(png).greyscale().resize({ width: gw, height: gh, fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const dark = new Uint8Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) dark[i] = (data[i] ?? 255) < 110 ? 1 : 0;
  const seen = new Uint8Array(gw * gh);
  const sx = width / gw;
  const sy = height / gh;
  const out: Array<Rect & { cells: number }> = [];
  for (let start = 0; start < gw * gh; start++) {
    if (!dark[start] || seen[start]) continue;
    let minX = gw;
    let minY = gh;
    let maxX = 0;
    let maxY = 0;
    let cells = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const c = stack.pop()!;
      const cx = c % gw;
      const cyy = (c - cx) / gw;
      cells++;
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cyy);
      maxY = Math.max(maxY, cyy);
      const nb = [cx > 0 ? c - 1 : -1, cx < gw - 1 ? c + 1 : -1, cyy > 0 ? c - gw : -1, cyy < gh - 1 ? c + gw : -1];
      for (const n of nb) {
        if (n >= 0 && dark[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const rect = { x: minX * sx, y: minY * sy, w: bw * sx, h: bh * sy, cells };
    if (rect.h < 18 || rect.w < 40 || cells / (bw * bh) < 0.5) continue;
    const inIgnored = ignore.some((b) => {
      const ix = Math.min(rect.x + rect.w, b.x + b.width) - Math.max(rect.x, b.x);
      const iy = Math.min(rect.y + rect.h, b.y + b.height) - Math.max(rect.y, b.y);
      return ix > 0 && iy > 0 && (ix * iy) / (rect.w * rect.h) > 0.8;
    });
    if (!inIgnored) out.push(rect);
  }
  return out.sort((a, b) => b.cells - a.cells).slice(0, 15);
}

function overlapRatio(a: OcrWord, b: OcrWord): number {
  const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (ix <= 0 || iy <= 0) return 0;
  return (ix * iy) / Math.max(1, Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0)));
}

/**
 * OCR mit optionaler Hochskalierung (kleine Screenshots werden für Tesseract
 * vergrößert) und Zusatzdurchlauf für dunkle Flächen mit heller Schrift.
 * Koordinaten beziehen sich auf das Originalbild. `ignore`: Bereiche (z. B.
 * Schwärzungen), die nicht als dunkle Fläche gelesen werden müssen.
 */
export async function ocrImage(png: Buffer, width: number, minOcrWidth: number, ignore: readonly Box[] = []): Promise<OcrResult> {
  const meta = await sharp(png).metadata();
  const height = meta.height;
  const factor = width > 0 && width < minOcrWidth ? Math.min(3, Math.ceil(minOcrWidth / width)) : 1;
  let input = png;
  if (factor > 1) {
    input = await sharp(png).resize({ width: width * factor, kernel: "lanczos3" }).png().toBuffer();
  }
  const raw = await recognize(input);
  const words: OcrWord[] = raw.words.map((w) => ({ ...w, x0: w.x0 / factor, y0: w.y0 / factor, x1: w.x1 / factor, y1: w.y1 / factor }));
  const lines = raw.lines.map((l) => [...l]);

  const regions = await darkRegions(png, width, height, ignore);
  const border = 12;
  for (const r of regions) {
    const left = Math.max(0, Math.floor(r.x * factor));
    const top = Math.max(0, Math.floor(r.y * factor));
    const w = Math.min(width * factor - left, Math.ceil(r.w * factor));
    const h = Math.min(height * factor - top, Math.ceil(r.h * factor));
    if (w < 10 || h < 10) continue;
    const crop = await sharp(input)
      .extract({ left, top, width: w, height: h })
      .negate({ alpha: false })
      .extend({ top: border, bottom: border, left: border, right: border, background: "#ffffff" })
      .png()
      .toBuffer();
    const sub = await recognize(crop);
    for (const line of sub.lines) {
      const fresh: OcrWord[] = [];
      for (const wi of line) {
        const sw = sub.words[wi]!;
        const mapped: OcrWord = {
          ...sw,
          x0: (sw.x0 - border + left) / factor,
          y0: (sw.y0 - border + top) / factor,
          x1: (sw.x1 - border + left) / factor,
          y1: (sw.y1 - border + top) / factor,
        };
        if (/[\p{L}\p{N}]/u.test(mapped.text) && !words.some((o) => overlapRatio(o, mapped) > 0.3)) fresh.push(mapped);
      }
      if (fresh.length === 0) continue;
      const idx = fresh.map((fw) => words.push(fw) - 1);
      const y = fresh[0]!.y0;
      const pos = lines.findIndex((l) => (words[l[0]!]?.y0 ?? 0) > y);
      if (pos === -1) lines.push(idx);
      else lines.splice(pos, 0, idx);
    }
  }
  lines.forEach((l, li) => l.forEach((wi) => (words[wi]!.line = li)));
  return { words, lines, confidence: raw.confidence };
}

type MaskKind = PiiKind | "manual";

interface WordMask {
  kind: MaskKind;
  rule: string;
}

const KIND_PRIORITY: Readonly<Record<MaskKind, number>> = {
  manual: 200,
  email: 100,
  iban: 95,
  tax_id: 92,
  birthdate: 90,
  phone: 88,
  policy_number: 85,
  name: 80,
  address: 75,
};

export const MANUAL_PLACEHOLDER = "[GESCHWÄRZT]";

function setMask(masks: Map<number, WordMask>, word: number, mask: WordMask): void {
  const cur = masks.get(word);
  if (!cur || KIND_PRIORITY[mask.kind] > KIND_PRIORITY[cur.kind]) masks.set(word, mask);
}

function placeholder(kind: MaskKind): string {
  return kind === "manual" ? MANUAL_PLACEHOLDER : PLACEHOLDERS[kind];
}

/** Baut den maskierten Ausgabetext; gleichartige benachbarte Wörter teilen sich einen Platzhalter. */
function renderMasked(
  words: readonly OcrWord[],
  lines: readonly (readonly number[])[],
  masks: ReadonlyMap<number, WordMask>,
): TextLayout {
  let text = "";
  const ranges: TextLayout["ranges"] = [];
  lines.forEach((line, li) => {
    if (li > 0) text += "\n";
    let prevKind: MaskKind | null = null;
    let first = true;
    for (const wi of line) {
      const w = words[wi];
      if (!w) continue;
      const m = masks.get(wi);
      if (m && m.kind === prevKind) continue;
      if (!first) text += " ";
      first = false;
      if (m) {
        text += placeholder(m.kind);
        prevKind = m.kind;
      } else {
        ranges.push({ word: wi, start: text.length, end: text.length + w.text.length });
        text += w.text;
        prevKind = null;
      }
    }
  });
  return { text, ranges };
}

function intersects(w: OcrWord, b: Box, minRatio: number): boolean {
  const ix = Math.min(w.x1, b.x + b.width) - Math.max(w.x0, b.x);
  const iy = Math.min(w.y1, b.y + b.height) - Math.max(w.y0, b.y);
  if (ix <= 0 || iy <= 0) return false;
  const area = Math.max(1, (w.x1 - w.x0) * (w.y1 - w.y0));
  return (ix * iy) / area >= minRatio;
}

/** Erkennt PII in beiden Textdarstellungen (Lesereihenfolge + optische Zeilen). */
export function detectOnWords(
  words: readonly OcrWord[],
  lines: readonly (readonly number[])[],
  opts: DetectOptions,
): Array<{ word: number; match: PiiMatch; layoutText: string }> {
  const out: Array<{ word: number; match: PiiMatch; layoutText: string }> = [];
  for (const layout of [blockLayout(words, lines), rowLayout(words)]) {
    for (const m of detectPii(layout.text, opts)) {
      for (const wi of wordsInRange(layout, m.start, m.end)) out.push({ word: wi, match: m, layoutText: layout.text });
    }
  }
  return out;
}

export interface OcrPageResult {
  text: string;
  image: Buffer;
  boxes: Box[];
  matches: PiiMatch[];
  confidence: number;
  wordCount: number;
}

/**
 * Kern der Bildbereinigung: OCR → Erkennung → Wort-Boxen schwärzen →
 * maskierter OCR-Text. `png` muss bereits normalisiert sein.
 */
export async function sanitizeOcrImage(
  png: Buffer,
  width: number,
  height: number,
  opts: DetectOptions & { manualBoxes?: readonly Box[]; minOcrWidth: number },
): Promise<OcrPageResult> {
  const ocr = await ocrImage(png, width, opts.minOcrWidth);
  const { words, lines } = ocr;
  const masks = new Map<number, WordMask>();

  for (const hit of detectOnWords(words, lines, opts)) setMask(masks, hit.word, { kind: hit.match.kind, rule: hit.match.rule });

  // Unsichere OCR-Wörter mit vielen Ziffern vorsorglich schwärzen
  words.forEach((w, i) => {
    if (w.confidence < 45 && w.text.replace(/\D/g, "").length >= 4 && !/\d,\d/.test(w.text)) {
      setMask(masks, i, { kind: "policy_number", rule: "ocr-low-confidence" });
    }
  });

  // Treffer (Originaltext, Lesereihenfolge) für die Vorschau
  const original = blockLayout(words, lines);
  const matches: PiiMatch[] = [];
  for (const line of lines) {
    let run: { kind: PiiKind; rule: string; start: number; end: number } | null = null;
    for (const wi of line) {
      const m = masks.get(wi);
      const r = original.ranges.find((x) => x.word === wi);
      if (!r) continue;
      if (m && m.kind !== "manual" && run && run.kind === m.kind) {
        run.end = r.end;
        continue;
      }
      if (run) matches.push({ ...run, text: original.text.slice(run.start, run.end) });
      run = m && m.kind !== "manual" ? { kind: m.kind, rule: m.rule, start: r.start, end: r.end } : null;
    }
    if (run) matches.push({ ...run, text: original.text.slice(run.start, run.end) });
  }

  // Manuelle Boxen: darunterliegende Wörter auch im Text entfernen
  const manual = (opts.manualBoxes ?? []).filter((b) => b.width > 0 && b.height > 0);
  words.forEach((w, i) => {
    if (manual.some((b) => intersects(w, b, 0.2))) setMask(masks, i, { kind: "manual", rule: "manual-box" });
  });

  // Fixpunkt: maskierten Text erneut prüfen, bis nichts mehr gefunden wird
  let rendered = renderMasked(words, lines, masks);
  for (let iter = 0; iter < 3; iter++) {
    const again = detectPii(rendered.text, opts);
    if (again.length === 0) break;
    let changed = false;
    for (const m of again) {
      for (const wi of wordsInRange(rendered, m.start, m.end)) {
        if (!masks.has(wi)) {
          setMask(masks, wi, { kind: m.kind, rule: `${m.rule}+recheck` });
          changed = true;
        }
      }
    }
    if (!changed) break;
    rendered = renderMasked(words, lines, masks);
  }

  // Boxen: benachbarte maskierte Wörter derselben Zeile zusammenfassen, mit Rand
  const boxes: Box[] = [];
  for (const line of lines) {
    let cur: { x0: number; y0: number; x1: number; y1: number } | null = null;
    for (const wi of line) {
      const w = words[wi]!;
      const m = masks.get(wi);
      if (!m || m.kind === "manual") {
        if (cur) boxes.push(pad(cur, width, height));
        cur = null;
        continue;
      }
      const h = w.y1 - w.y0;
      if (cur && w.x0 - cur.x1 <= 2 * Math.max(h, cur.y1 - cur.y0)) {
        cur = { x0: Math.min(cur.x0, w.x0), y0: Math.min(cur.y0, w.y0), x1: Math.max(cur.x1, w.x1), y1: Math.max(cur.y1, w.y1) };
      } else {
        if (cur) boxes.push(pad(cur, width, height));
        cur = { x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 };
      }
    }
    if (cur) boxes.push(pad(cur, width, height));
  }
  const allBoxes = [...boxes, ...manual.map((b) => ({ ...b }))];
  const image = await fillBoxes(png, allBoxes);
  return { text: rendered.text, image, boxes: allBoxes, matches, confidence: ocr.confidence, wordCount: words.length };
}

function pad(r: { x0: number; y0: number; x1: number; y1: number }, W: number, H: number): Box {
  const h = Math.max(1, r.y1 - r.y0);
  const px = Math.max(4, Math.round(h * 0.3));
  const py = Math.max(3, Math.round(h * 0.2));
  const x = Math.max(0, Math.floor(r.x0 - px));
  const y = Math.max(0, Math.floor(r.y0 - py));
  const x1 = Math.min(W, Math.ceil(r.x1 + px));
  const y1 = Math.min(H, Math.ceil(r.y1 + py));
  return { x, y, width: Math.max(0, x1 - x), height: Math.max(0, y1 - y) };
}

/** Re-OCR eines geschwärzten Bildes; Schwärzungen werden als Platzhalter-Wörter eingefügt. */
export async function findPiiInImage(png: Uint8Array, boxes: readonly Box[], opts: DetectOptions & { minOcrWidth: number }): Promise<PiiMatch[]> {
  const buf = toBuffer(png);
  const meta = await sharp(buf).metadata();
  const ocr = await ocrImage(buf, meta.width, opts.minOcrWidth, boxes);
  // Wörter, die (fast) vollständig in einer Schwärzung liegen, sind OCR-Artefakte
  const visible = ocr.words.map((w, i) => ({ w, i })).filter(({ w }) => !boxes.some((b) => intersects(w, b, 0.8)));
  const keep = new Set(visible.map((v) => v.i));
  const remap = new Map<number, number>();
  const words: OcrWord[] = [];
  for (const { w, i } of visible) {
    remap.set(i, words.length);
    words.push(w);
  }
  const lines = ocr.lines.map((l) => l.filter((i) => keep.has(i)).map((i) => remap.get(i)!)).filter((l) => l.length > 0);
  const synthetic: OcrWord[] = boxes.map((b) => ({
    text: MANUAL_PLACEHOLDER,
    x0: b.x,
    y0: b.y,
    x1: b.x + b.width,
    y1: b.y + b.height,
    confidence: 100,
    line: -1,
  }));
  const merged = mergeSynthetic(words, lines, synthetic);
  const seen = new Set<string>();
  const out: PiiMatch[] = [];
  for (const hit of detectOnWords(merged.words, merged.lines, opts)) {
    const key = `${hit.match.kind}:${hit.match.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit.match);
  }
  return out;
}
