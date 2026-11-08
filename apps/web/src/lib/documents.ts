import "server-only";
import { sanitizeDocument, verifySanitized, type Box, type SanitizedDocument } from "@klarwert/privacy";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseDocumentRow, SanitizedPageMeta } from "./data";
import { download, listPrefix, removeObjects, upload } from "./storage";

/** Namen, die zusätzlich geschwärzt werden (lokaler Kundenname). Verlässt den Server nie. */
export function knownNamesFor(customerName: string | null): string[] {
  if (!customerName) return [];
  return [customerName, ...customerName.split(/\s+/).filter((p) => p.length > 2)];
}

export interface ProcessResult {
  pages: SanitizedPageMeta[];
  piiSummary: Record<string, number>;
  warnings: string[];
  fileName: string;
}

/**
 * Bereinigt ein Original aus dem privaten Bucket und legt NUR die bereinigte Fassung (maskierter Text,
 * geschwärzte PNGs) im Bucket „sanitized“ ab. Gefundene PII-Werte werden nicht gespeichert, nur ihre Anzahl je Art.
 */
export async function processDocument(
  supabase: SupabaseClient,
  doc: CaseDocumentRow,
  opts: { originalFileName: string; customerName: string | null; manualBoxes?: Record<number, Box[]> },
): Promise<ProcessResult> {
  if (!doc.original_path) throw new Error("Original nicht mehr vorhanden – bitte Datei erneut hochladen.");
  const data = await download(supabase, "originals", doc.original_path);
  const sanitized = await sanitizeDocument({
    data,
    mimeType: doc.mime_type,
    fileName: opts.originalFileName,
    knownNames: knownNamesFor(opts.customerName),
    manualBoxes: opts.manualBoxes,
  });
  const prefix = `${doc.case_id}/${doc.id}`;
  // alte bereinigte Fassung entfernen
  await removeObjects(supabase, "sanitized", await listPrefix(supabase, "sanitized", prefix));
  const pages: SanitizedPageMeta[] = [];
  for (const p of sanitized.pages) {
    const textPath = `${prefix}/page-${p.pageNumber}.txt`;
    await upload(supabase, "sanitized", textPath, p.text, "text/plain; charset=utf-8");
    let imagePath: string | undefined;
    if (p.image) {
      imagePath = `${prefix}/page-${p.pageNumber}.png`;
      await upload(supabase, "sanitized", imagePath, p.image, "image/png");
    }
    pages.push({ pageNumber: p.pageNumber, source: p.source, textPath, imagePath, width: p.width, height: p.height, boxes: p.boxes.length, boxList: p.boxes, ocrConfidence: p.ocrConfidence });
  }
  const piiSummary: Record<string, number> = {};
  for (const m of sanitized.matches) piiSummary[m.kind] = (piiSummary[m.kind] ?? 0) + 1;
  const { error } = await supabase
    .from("case_documents")
    .update({
      file_name: sanitized.fileName,
      sanitized_path: prefix,
      sanitized_pages: pages,
      pii_summary: piiSummary,
      sanitize_warnings: sanitized.warnings,
      sanitized_approved_at: null,
      sanitized_approved_by: null,
    })
    .eq("id", doc.id);
  if (error) throw new Error(error.message);
  return { pages, piiSummary, warnings: sanitized.warnings, fileName: sanitized.fileName };
}

/** Lädt die gespeicherte bereinigte Fassung als SanitizedDocument (für erneute Prüfung und Modellaufruf). */
export async function loadSanitized(supabase: SupabaseClient, doc: CaseDocumentRow): Promise<SanitizedDocument> {
  const pages = [];
  for (const meta of doc.sanitized_pages ?? []) {
    const text = new TextDecoder().decode(await download(supabase, "sanitized", meta.textPath));
    const image = meta.imagePath ? await download(supabase, "sanitized", meta.imagePath) : undefined;
    pages.push({ pageNumber: meta.pageNumber, text, image, width: meta.width, height: meta.height, source: meta.source, boxes: meta.boxList ?? [] });
  }
  return { fileName: doc.file_name, mimeType: doc.mime_type, pages, matches: [], warnings: doc.sanitize_warnings ?? [] };
}

export async function verifyStored(supabase: SupabaseClient, doc: CaseDocumentRow, customerName: string | null) {
  const sanitized = await loadSanitized(supabase, doc);
  const result = await verifySanitized(sanitized, { knownNames: knownNamesFor(customerName) });
  return { sanitized, ok: result.ok, findingKinds: [...new Set(result.findings.map((f) => f.kind))] };
}

/** Löscht das Original, sofern der Berater es nicht ausdrücklich behalten will. */
export async function deleteOriginalUnlessKept(supabase: SupabaseClient, doc: CaseDocumentRow): Promise<boolean> {
  if (doc.keep_original || !doc.original_path) return false;
  await removeObjects(supabase, "originals", [doc.original_path]);
  await supabase.from("case_documents").update({ original_path: null, original_deleted_at: new Date().toISOString() }).eq("id", doc.id);
  return true;
}
