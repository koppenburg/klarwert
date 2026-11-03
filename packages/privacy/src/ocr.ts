import { createRequire } from "node:module";
import path from "node:path";
import Tesseract from "tesseract.js";

/**
 * Lokale OCR mit tesseract.js (WASM, keine Systembinaries). Die deutschen
 * Sprachdaten kommen aus `@tesseract.js-data/deu` – es wird nichts zur Laufzeit
 * aus dem Netz geladen. Ein einzelner Worker wird lazy erzeugt und für alle
 * Aufrufe wiederverwendet; Aufträge laufen nacheinander (Warteschlange).
 */

export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
  /** Laufende Zeilennummer in Tesseract-Lesereihenfolge */
  line: number;
}

export interface OcrResult {
  words: OcrWord[];
  /** Wortindizes je Zeile in Lesereihenfolge */
  lines: number[][];
  /** Mittlere Konfidenz 0–100 */
  confidence: number;
}

let workerPromise: Promise<Tesseract.Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** Verzeichnis mit `deu.traineddata.gz`. Überschreibbar via `KLARWERT_TESSDATA_DIR`. */
export function tessdataDir(): string {
  const fromEnv = process.env["KLARWERT_TESSDATA_DIR"];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve("@tesseract.js-data/deu/package.json")), "4.0.0_best_int");
}

function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    const p = Tesseract.createWorker("deu", Tesseract.OEM.LSTM_ONLY, {
      langPath: tessdataDir(),
      gzip: true,
      // nichts ins (auf Vercel schreibgeschützte) Arbeitsverzeichnis cachen
      cacheMethod: "none",
    });
    workerPromise = p;
    p.catch(() => {
      if (workerPromise === p) workerPromise = null;
    });
  }
  return workerPromise;
}

function convert(page: Tesseract.Page): OcrResult {
  const words: OcrWord[] = [];
  const lines: number[][] = [];
  let lineNo = 0;
  for (const block of page.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        const idx: number[] = [];
        for (const w of line.words) {
          const text = w.text.trim();
          if (text.length === 0) continue;
          idx.push(words.length);
          words.push({ text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, confidence: w.confidence, line: lineNo });
        }
        if (idx.length > 0) {
          lines.push(idx);
          lineNo++;
        }
      }
    }
  }
  return { words, lines, confidence: page.confidence };
}

/** Erkennt Text in einem Bild (PNG/JPEG-Buffer). */
export function recognize(image: Buffer): Promise<OcrResult> {
  const run = queue.then(async () => {
    const worker = await getWorker();
    const res = await worker.recognize(image, {}, { blocks: true, text: false });
    return convert(res.data);
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Beendet den OCR-Worker (z. B. in `afterAll` oder beim Herunterfahren). */
export async function terminateOcr(): Promise<void> {
  const p = workerPromise;
  workerPromise = null;
  await queue.catch(() => undefined);
  if (!p) return;
  try {
    const w = await p;
    await w.terminate();
  } catch {
    // Worker war nie bereit – nichts aufzuräumen
  }
}
