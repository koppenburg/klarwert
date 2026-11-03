import { detectPii, maskText, PLACEHOLDERS } from "./detect";
import { fillBoxes, findPiiInImage, normalizeImage, sanitizeOcrImage, toUint8 } from "./image";
import { isUsableTextLayer, openPdf } from "./pdf";
import type { Box, DetectOptions, PiiMatch, SanitizedDocument, SanitizedPage, SanitizeInput } from "./types";

/** Mindestbreite für OCR: kleinere Bilder (Screenshots) werden hochskaliert. */
const MIN_OCR_WIDTH_IMAGE = 2000;
/** PDF-Scans werden direkt in passender Auflösung gerendert. */
const PDF_RENDER_DPI = 180;
const PDF_MAX_SIDE = 4200;
const LOW_CONFIDENCE = 70;

type DocKind = "pdf" | "image" | "text";

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|text|log)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|tiff?|gif)$/i;

function detectKind(data: Uint8Array, mimeType: string, fileName: string): DocKind | null {
  const b = data;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf"; // %PDF
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image"; // PNG
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image"; // JPEG
  const mime = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/") || mime === "application/csv" || mime === "application/json") return "text";
  if (/\.pdf$/i.test(fileName)) return "pdf";
  if (IMAGE_EXT.test(fileName)) return "image";
  if (TEXT_EXT.test(fileName)) return "text";
  return null;
}

function decodeText(data: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    text = new TextDecoder("windows-1252").decode(data);
  }
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/** Dateiname bereinigen (z. B. „Police_Erika_Mustermann.pdf"). */
function sanitizeFileName(fileName: string, opts: DetectOptions): string {
  const spaced = fileName.replace(/[_.]/g, " ");
  const matches = detectPii(spaced, opts);
  if (matches.length === 0) return fileName;
  let out = "";
  let pos = 0;
  for (const m of matches) {
    out += fileName.slice(pos, m.start) + PLACEHOLDERS[m.kind];
    pos = m.end;
  }
  return out + fileName.slice(pos);
}

async function imagePage(
  pageNumber: number,
  png: Buffer,
  width: number,
  height: number,
  opts: DetectOptions,
  manual: readonly Box[] | undefined,
  minOcrWidth: number,
  warnings: string[],
): Promise<{ page: SanitizedPage; matches: PiiMatch[] }> {
  const r = await sanitizeOcrImage(png, width, height, { ...opts, minOcrWidth, ...(manual ? { manualBoxes: manual } : {}) });
  const confidence = Math.round(r.confidence);
  if (r.wordCount === 0) {
    warnings.push(`Seite ${pageNumber}: Kein Text erkannt (OCR). Bitte Bild prüfen und ggf. manuell schwärzen.`);
  } else if (confidence < LOW_CONFIDENCE) {
    warnings.push(`Seite ${pageNumber}: OCR-Qualität niedrig (${confidence} %). Erkennung unsicher – Vorschau sorgfältig prüfen.`);
  }
  return {
    page: {
      pageNumber,
      text: r.text,
      image: toUint8(r.image),
      width,
      height,
      source: "ocr",
      boxes: r.boxes,
      ocrConfidence: confidence,
    },
    matches: r.matches,
  };
}

/**
 * Entfernt personenbezogene Daten aus einem Dokument. Nur `pages[].text` und
 * `pages[].image` sind für den Modellaufruf bestimmt; `matches` enthält die
 * Originalwerte und dient ausschließlich der Vorschau für den Berater.
 */
export async function sanitizeDocument(input: SanitizeInput): Promise<SanitizedDocument> {
  const opts: DetectOptions = input.knownNames ? { knownNames: input.knownNames } : {};
  const warnings: string[] = [];
  const pages: SanitizedPage[] = [];
  const matches: Array<PiiMatch & { pageNumber: number }> = [];
  const manual = input.manualBoxes ?? {};
  const kind = detectKind(input.data, input.mimeType, input.fileName);
  if (kind === null) {
    throw new Error(`Nicht unterstützter Dateityp: ${input.mimeType || "unbekannt"} (${input.fileName})`);
  }

  const push = (page: SanitizedPage, found: readonly PiiMatch[]): void => {
    pages.push(page);
    for (const m of found) matches.push({ ...m, pageNumber: page.pageNumber });
  };

  if (kind === "text") {
    const r = maskText(decodeText(input.data), opts);
    push({ pageNumber: 1, text: r.text, source: "text", boxes: [] }, r.matches);
  } else if (kind === "image") {
    const img = await normalizeImage(input.data);
    const r = await imagePage(1, img.png, img.width, img.height, opts, manual[1], MIN_OCR_WIDTH_IMAGE, warnings);
    push(r.page, r.matches);
  } else {
    let pdf: Awaited<ReturnType<typeof openPdf>>;
    try {
      pdf = await openPdf(input.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/password/i.test(msg)) throw new Error("PDF ist passwortgeschützt und kann nicht verarbeitet werden.");
      throw new Error(`PDF konnte nicht gelesen werden: ${msg}`);
    }
    try {
      for (let n = 1; n <= pdf.numPages; n++) {
        let info: Awaited<ReturnType<typeof pdf.page>>;
        try {
          info = await pdf.page(n);
        } catch (err) {
          warnings.push(`Seite ${n}: konnte nicht gelesen werden (${err instanceof Error ? err.message : String(err)}). Seite ausgelassen.`);
          push({ pageNumber: n, text: "", source: "text-layer", boxes: [] }, []);
          continue;
        }
        if (isUsableTextLayer(info.text)) {
          const r = maskText(info.text, opts);
          if (info.hasImages) {
            warnings.push(`Seite ${n}: enthält eingebettete Bilder; nur der Textlayer wurde übernommen (Bildinhalte gehen nicht an das Modell).`);
          }
          push({ pageNumber: n, text: r.text, source: "text-layer", boxes: [] }, r.matches);
          continue;
        }
        // Scan-Seite → rendern + OCR
        let rendered: Awaited<ReturnType<typeof info.render>>;
        try {
          rendered = await info.render(PDF_RENDER_DPI, PDF_MAX_SIDE);
        } catch (err) {
          warnings.push(
            `Seite ${n}: Scan-Seite konnte nicht gerendert werden (${err instanceof Error ? err.message : String(err)}). Seite ausgelassen – bitte als Bild hochladen.`,
          );
          push({ pageNumber: n, text: "", source: "ocr", boxes: [] }, []);
          continue;
        }
        const img = await normalizeImage(rendered.png);
        const r = await imagePage(n, img.png, img.width, img.height, opts, manual[n], 0, warnings);
        push(r.page, r.matches);
      }
    } finally {
      await pdf.close();
    }
  }

  for (const [key, boxes] of Object.entries(manual)) {
    const n = Number(key);
    if (!boxes || boxes.length === 0) continue;
    const page = pages.find((p) => p.pageNumber === n);
    if (!page) warnings.push(`Manuelle Schwärzung für Seite ${key} ignoriert: Seite existiert nicht.`);
    else if (!page.image) warnings.push(`Manuelle Schwärzung für Seite ${n} ignoriert: Seite hat kein Bild (nur Text wird weitergegeben).`);
  }

  const fileName = sanitizeFileName(input.fileName, opts);
  if (fileName !== input.fileName) warnings.push("Dateiname enthielt personenbezogene Daten und wurde maskiert.");
  if (matches.length === 0 && pages.some((p) => p.text.trim().length > 0)) {
    warnings.push("Keine personenbezogenen Daten erkannt – bitte Vorschau prüfen (z. B. unbeschriftete Namen).");
  }

  return { fileName, mimeType: input.mimeType, pages, matches, warnings };
}

/**
 * Zweitprüfung: Text jeder Seite erneut prüfen, Bilder erneut per OCR lesen
 * und prüfen. `ok` ist nur true, wenn nirgends mehr PII gefunden wird.
 */
export async function verifySanitized(
  doc: SanitizedDocument,
  opts: DetectOptions = {},
): Promise<{ ok: boolean; findings: Array<PiiMatch & { pageNumber: number }> }> {
  const findings: Array<PiiMatch & { pageNumber: number }> = [];
  for (const m of detectPii(doc.fileName.replace(/[_.]/g, " "), opts)) findings.push({ ...m, pageNumber: 0 });
  const isPdf = /pdf/i.test(doc.mimeType) || /\.pdf$/i.test(doc.fileName);
  for (const page of doc.pages) {
    for (const m of detectPii(page.text, opts)) findings.push({ ...m, pageNumber: page.pageNumber });
    if (page.image) {
      // gleiche OCR-Skalierung wie bei der Bereinigung
      const minOcrWidth = isPdf ? 0 : MIN_OCR_WIDTH_IMAGE;
      for (const m of await findPiiInImage(page.image, page.boxes, { ...opts, minOcrWidth })) {
        findings.push({ ...m, pageNumber: page.pageNumber });
      }
    }
  }
  return { ok: findings.length === 0, findings };
}

/** Zeichnet schwarze Rechtecke in ein PNG (manuelle Nachschwärzung). Ergebnis: PNG ohne Metadaten. */
export async function applyBoxes(png: Uint8Array, boxes: Box[]): Promise<Uint8Array> {
  return toUint8(await fillBoxes(png, boxes));
}
