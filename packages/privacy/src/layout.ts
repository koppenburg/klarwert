import type { OcrWord } from "./ocr";

/** Text aus OCR-Wörtern mit Zuordnung Zeichenbereich → Wortindex. */
export interface TextLayout {
  text: string;
  ranges: Array<{ word: number; start: number; end: number }>;
}

/** Text in Tesseract-Lesereihenfolge (Blöcke → Absätze → Zeilen). */
export function blockLayout(words: readonly OcrWord[], lines: readonly (readonly number[])[]): TextLayout {
  let text = "";
  const ranges: TextLayout["ranges"] = [];
  lines.forEach((line, li) => {
    if (li > 0) text += "\n";
    line.forEach((wi, k) => {
      const w = words[wi];
      if (!w) return;
      if (k > 0) text += " ";
      ranges.push({ word: wi, start: text.length, end: text.length + w.text.length });
      text += w.text;
    });
  });
  return { text, ranges };
}

/**
 * Text nach optischen Zeilen: Wörter mit überlappender vertikaler Lage bilden
 * eine Zeile, auch über Tesseract-Blöcke hinweg (Tabellen, Formulare,
 * Portal-Screenshots mit Label/Wert in getrennten Spalten). Große Lücken
 * werden als Tabulator ausgegeben.
 */
export function rowLayout(words: readonly OcrWord[]): TextLayout {
  const order = words.map((_, i) => i).sort((a, b) => cy(words[a]!) - cy(words[b]!));
  const rows: Array<{ y0: number; y1: number; items: number[] }> = [];
  for (const i of order) {
    const w = words[i]!;
    const h = Math.max(1, w.y1 - w.y0);
    let best: (typeof rows)[number] | undefined;
    let bestOverlap = 0;
    for (let r = rows.length - 1; r >= 0 && r >= rows.length - 4; r--) {
      const row = rows[r]!;
      const overlap = Math.min(row.y1, w.y1) - Math.max(row.y0, w.y0);
      const ratio = overlap / Math.min(h, Math.max(1, row.y1 - row.y0));
      if (ratio > 0.5 && ratio > bestOverlap) {
        best = row;
        bestOverlap = ratio;
      }
    }
    if (best) {
      best.items.push(i);
    } else {
      rows.push({ y0: w.y0, y1: w.y1, items: [i] });
    }
  }
  rows.sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  let text = "";
  const ranges: TextLayout["ranges"] = [];
  rows.forEach((row, ri) => {
    if (ri > 0) text += "\n";
    row.items.sort((a, b) => words[a]!.x0 - words[b]!.x0);
    const rowH = Math.max(1, row.y1 - row.y0);
    let prev: OcrWord | undefined;
    for (const wi of row.items) {
      const w = words[wi]!;
      if (prev) text += w.x0 - prev.x1 > 1.5 * rowH ? "\t" : " ";
      ranges.push({ word: wi, start: text.length, end: text.length + w.text.length });
      text += w.text;
      prev = w;
    }
  });
  return { text, ranges };
}

function cy(w: OcrWord): number {
  return (w.y0 + w.y1) / 2;
}

/** Wortindizes, deren Zeichenbereich [start, end) überlappt. */
export function wordsInRange(layout: TextLayout, start: number, end: number): number[] {
  const out: number[] = [];
  for (const r of layout.ranges) if (r.start < end && r.end > start) out.push(r.word);
  return out;
}

/**
 * Fügt synthetische Wörter (z. B. Schwärzungen als „[GESCHWÄRZT]") in die
 * Tesseract-Zeilen ein, mit denen sie sich vertikal überlappen. Nicht
 * zuordenbare Wörter bilden eigene Zeilen.
 */
export function mergeSynthetic(
  words: readonly OcrWord[],
  lines: readonly (readonly number[])[],
  synthetic: readonly OcrWord[],
): { words: OcrWord[]; lines: number[][] } {
  const allWords = [...words];
  const allLines = lines.map((l) => [...l]);
  for (const s of synthetic) {
    const idx = allWords.length;
    allWords.push(s);
    let target = -1;
    let bestRatio = 0.5;
    allLines.forEach((line, li) => {
      if (line.length === 0) return;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const wi of line) {
        const w = allWords[wi]!;
        y0 = Math.min(y0, w.y0);
        y1 = Math.max(y1, w.y1);
      }
      const overlap = Math.min(y1, s.y1) - Math.max(y0, s.y0);
      const ratio = overlap / Math.max(1, Math.min(y1 - y0, s.y1 - s.y0));
      if (ratio > bestRatio) {
        bestRatio = ratio;
        target = li;
      }
    });
    if (target >= 0) {
      const line = allLines[target]!;
      line.push(idx);
      line.sort((a, b) => allWords[a]!.x0 - allWords[b]!.x0);
    } else {
      allLines.push([idx]);
    }
  }
  return { words: allWords, lines: allLines };
}
