import "server-only";
import { extractPdfText } from "@klarwert/privacy";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { upload } from "./storage";

/** Bedingungswerk (unpersönlich) ablegen: PDF im Bucket „library“, Seitentexte für die Volltextsuche. */
export async function storeLibraryPdf(
  supabase: SupabaseClient,
  input: {
    data: Uint8Array;
    generationId: string | null;
    kind: string;
    title: string;
    sourceKind: "upload" | "websearch" | "manual";
    sourceUrl?: string | null;
    status: "candidate" | "confirmed";
    confirmedBy?: string | null;
    storagePath?: string;
    searchMeta?: Record<string, unknown> | null;
  },
): Promise<{ id: string; pageCount: number; duplicateOf?: string }> {
  const sha256 = createHash("sha256").update(input.data).digest("hex");
  const { data: dup } = await supabase.from("library_documents").select("id").eq("sha256", sha256).neq("status", "rejected").limit(1).maybeSingle<{ id: string }>();
  if (dup) return { id: dup.id, pageCount: 0, duplicateOf: dup.id };
  const pages = await extractPdfText(input.data);
  const path = input.storagePath ?? `${input.generationId ?? "ohne-generation"}/${sha256.slice(0, 16)}.pdf`;
  if (!input.storagePath) await upload(supabase, "library", path, input.data, "application/pdf");
  const { data, error } = await supabase
    .from("library_documents")
    .insert({
      generation_id: input.generationId,
      kind: input.kind,
      title: input.title,
      storage_path: path,
      source_url: input.sourceUrl ?? null,
      source_kind: input.sourceKind,
      status: input.status,
      page_count: pages.length,
      sha256,
      confirmed_by: input.status === "confirmed" ? (input.confirmedBy ?? null) : null,
      confirmed_at: input.status === "confirmed" ? new Date().toISOString() : null,
      search_meta: input.searchMeta ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Bibliothekseintrag fehlgeschlagen");
  const rows = pages.map((p) => ({ document_id: data.id, page_number: p.pageNumber, content: p.text.replace(/\u0000/g, "") }));
  for (let i = 0; i < rows.length; i += 50) {
    const { error: e } = await supabase.from("library_pages").insert(rows.slice(i, i + 50));
    if (e) throw new Error(e.message);
  }
  return { id: data.id, pageCount: pages.length };
}
