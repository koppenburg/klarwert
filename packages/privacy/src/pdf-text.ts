import { openPdf } from "./pdf";

/**
 * Reiner Textauszug je Seite OHNE Maskierung – ausschließlich für unpersönliche Bedingungswerke
 * (AVB, Tarifbestimmungen, PIB-Muster) in der Bibliothek. Für Vertragsunterlagen immer sanitizeDocument verwenden.
 */
export async function extractPdfText(data: Uint8Array, opts: { maxPages?: number } = {}): Promise<Array<{ pageNumber: number; text: string }>> {
  const pdf = await openPdf(data);
  try {
    const out: Array<{ pageNumber: number; text: string }> = [];
    const last = Math.min(pdf.numPages, opts.maxPages ?? pdf.numPages);
    for (let n = 1; n <= last; n++) {
      const page = await pdf.page(n);
      out.push({ pageNumber: n, text: page.text });
    }
    return out;
  } finally {
    await pdf.close();
  }
}
