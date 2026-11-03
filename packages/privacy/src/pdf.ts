import { createRequire } from "node:module";
import path from "node:path";
import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * PDF-Zugriff über pdfjs-dist (Legacy-Build für Node). Text wird aus dem
 * Textlayer gelesen; Seiten ohne brauchbaren Textlayer werden mit
 * @napi-rs/canvas gerendert. Beides ohne Systembinaries.
 */

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

function pdfjsDir(): string {
  const require = createRequire(import.meta.url);
  return path.dirname(require.resolve("pdfjs-dist/package.json"));
}

export interface PdfPageInfo {
  pageNumber: number;
  text: string;
  hasImages: boolean;
  /** Rendert die Seite als PNG (für OCR). */
  render: (dpi: number, maxSide: number) => Promise<{ png: Buffer; width: number; height: number }>;
}

export interface OpenedPdf {
  numPages: number;
  page: (n: number) => Promise<PdfPageInfo>;
  close: () => Promise<void>;
}

export async function openPdf(data: Uint8Array): Promise<OpenedPdf> {
  const pdfjs = await loadPdfJs();
  const dir = pdfjsDir();
  const task = pdfjs.getDocument({
    // pdfjs übernimmt (detacht) den Puffer – daher Kopie
    data: new Uint8Array(data),
    standardFontDataUrl: path.join(dir, "standard_fonts") + path.sep,
    cMapUrl: path.join(dir, "cmaps") + path.sep,
    cMapPacked: true,
    wasmUrl: path.join(dir, "wasm") + path.sep,
    iccUrl: path.join(dir, "iccs") + path.sep,
    enableXfa: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  return {
    numPages: doc.numPages,
    page: async (n: number) => {
      const page = await doc.getPage(n);
      const text = await extractText(page);
      const ops = await page.getOperatorList();
      const imageOps = new Set<number>([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageXObjectRepeat]);
      const hasImages = ops.fnArray.some((fn) => imageOps.has(fn));
      return {
        pageNumber: n,
        text,
        hasImages,
        render: (dpi, maxSide) => renderPage(page, dpi, maxSide),
      };
    },
    close: async () => {
      await task.destroy();
    },
  };
}

interface Item {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

async function extractText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  const items: Item[] = [];
  for (const it of content.items) {
    if (!("str" in it) || it.str.length === 0) continue;
    const t = it.transform as number[];
    const h = it.height > 0 ? it.height : Math.hypot(t[2] ?? 0, t[3] ?? 0) || 10;
    items.push({ str: it.str, x: t[4] ?? 0, y: t[5] ?? 0, w: it.width, h });
  }
  // Zeilen nach y-Koordinate bilden (PDF: y wächst nach oben)
  const lines: Array<{ y: number; h: number; items: Item[] }> = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= 0.5 * Math.min(l.h, it.h));
    if (line) line.items.push(it);
    else lines.push({ y: it.y, h: it.h, items: [it] });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines
    .map((l) => {
      l.items.sort((a, b) => a.x - b.x);
      let s = "";
      let prev: Item | undefined;
      for (const it of l.items) {
        if (prev) {
          const gap = it.x - (prev.x + prev.w);
          if (gap > 2 * l.h) s += "\t";
          else if (gap > 0.15 * l.h && !/\s$/.test(s) && !/^\s/.test(it.str)) s += " ";
        }
        s += it.str;
        prev = it;
      }
      return s.replace(/[ \u00a0]+$/g, "");
    })
    .join("\n");
}

async function renderPage(page: PDFPageProxy, dpi: number, maxSide: number): Promise<{ png: Buffer; width: number; height: number }> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(dpi / 72, maxSide / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const canvas = createCanvas(width, height);
  type RenderParams = Parameters<PDFPageProxy["render"]>[0];
  await page.render({
    canvas: canvas as unknown as RenderParams["canvas"],
    viewport,
    background: "#ffffff",
  }).promise;
  const png = canvas.toBuffer("image/png");
  page.cleanup();
  return { png, width, height };
}

/** Anteil „kaputter" Zeichen (Ersatzzeichen, Private Use, Steuerzeichen). */
export function isUsableTextLayer(text: string): boolean {
  const meaningful = text.replace(/[^\p{L}\p{N}]/gu, "").length;
  if (meaningful < 25) return false;
  // eslint-disable-next-line no-control-regex -- Steuerzeichen deuten auf kaputte Zeichenkodierung hin
  const broken = (text.match(/[�\p{Co}\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu) ?? []).length;
  return broken / Math.max(1, text.length) < 0.05;
}
