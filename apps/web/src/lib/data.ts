import type { CostRecord, FieldRecord, Provenance } from "@klarwert/extraction";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CaseRow {
  id: string;
  case_number: string;
  customer_name: string | null;
  title: string | null;
  layer: string | null;
  generation_id: string | null;
  status: string;
  fields_confirmed_at: string | null;
  costs_confirmed_at: string | null;
  analysis_assumptions: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseDocumentRow {
  id: string;
  case_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  doc_role: string;
  original_path: string | null;
  keep_original: boolean;
  original_deleted_at: string | null;
  sanitized_path: string | null;
  sanitized_pages: SanitizedPageMeta[] | null;
  pii_summary: Record<string, number> | null;
  sanitize_warnings: string[] | null;
  sanitized_approved_at: string | null;
  extracted_at: string | null;
  created_at: string;
}

export interface SanitizedPageMeta {
  pageNumber: number;
  source: "text" | "text-layer" | "ocr";
  textPath: string;
  imagePath?: string;
  width?: number;
  height?: number;
  /** Anzahl der Schwärzungen */
  boxes: number;
  /** Koordinaten der Schwärzungen (keine personenbezogenen Daten); nötig, damit die Prüfung sie als Platzhalter erkennt */
  boxList?: Array<{ x: number; y: number; width: number; height: number }>;
  ocrConfidence?: number;
}

export interface CaseFieldRow {
  case_id: string;
  key: string;
  value: unknown;
  confidence: number | null;
  source: FieldSource | null;
  status: "proposed" | "confirmed";
  confirmed_at: string | null;
}

export interface FieldSource {
  kind: "document" | "manual" | "assumption";
  documentId?: string;
  fileName?: string;
  page?: number | null;
  region?: string | null;
  quote?: string | null;
  note?: string | null;
}

export interface CostItemRow {
  id: string;
  generation_id: string | null;
  case_id: string | null;
  key: string;
  value: number | boolean | string | null;
  unit: string | null;
  status: "proposed" | "confirmed" | "rejected";
  source_kind: "library" | "websearch" | "manual" | "document" | "assumption";
  source_document_id: string | null;
  page: number | null;
  quote: string | null;
  source_note: string | null;
  confidence: number | null;
  proposed_by: "model" | "user";
  confirmed_at: string | null;
  updated_at: string;
}

export interface LibraryDocumentRow {
  id: string;
  generation_id: string | null;
  kind: string;
  title: string;
  storage_path: string | null;
  source_url: string | null;
  source_kind: string;
  status: "candidate" | "confirmed" | "rejected";
  page_count: number | null;
  confirmed_at: string | null;
  created_at: string;
  cost_remarks?: { remarks?: string[]; notFound?: string[]; model?: string; at?: string } | null;
  search_meta?: Record<string, unknown> | null;
}

export interface GenerationInfo {
  id: string;
  label: string;
  valid_from: string | null;
  valid_to: string | null;
  tariff: { id: string; name: string; code: string | null; layer: string; insurer: { id: string; name: string } };
}

export interface CaseBundle {
  case: CaseRow;
  documents: CaseDocumentRow[];
  fields: CaseFieldRow[];
  costItems: CostItemRow[];
  generation: GenerationInfo | null;
  libraryDocs: LibraryDocumentRow[];
}

export async function loadCaseBundle(supabase: SupabaseClient, caseId: string): Promise<CaseBundle | null> {
  const { data: c } = await supabase.from("cases").select("*").eq("id", caseId).maybeSingle<CaseRow>();
  if (!c) return null;
  const [docs, fields, generation] = await Promise.all([
    supabase.from("case_documents").select("*").eq("case_id", caseId).order("created_at").returns<CaseDocumentRow[]>(),
    supabase.from("case_fields").select("*").eq("case_id", caseId).returns<CaseFieldRow[]>(),
    c.generation_id
      ? supabase
          .from("tariff_generations")
          .select("id,label,valid_from,valid_to,tariff:tariffs(id,name,code,layer,insurer:insurers(id,name))")
          .eq("id", c.generation_id)
          .maybeSingle<GenerationInfo>()
      : Promise.resolve({ data: null }),
  ]);
  const costQuery = c.generation_id ? `case_id.eq.${caseId},generation_id.eq.${c.generation_id}` : `case_id.eq.${caseId}`;
  const [{ data: costs }, { data: lib }] = await Promise.all([
    supabase.from("cost_items").select("*").or(costQuery).neq("status", "rejected").order("key").returns<CostItemRow[]>(),
    c.generation_id
      ? supabase.from("library_documents").select("*").eq("generation_id", c.generation_id).order("created_at").returns<LibraryDocumentRow[]>()
      : Promise.resolve({ data: [] as LibraryDocumentRow[] }),
  ]);
  return {
    case: c,
    documents: docs.data ?? [],
    fields: fields.data ?? [],
    costItems: costs ?? [],
    generation: (generation.data as GenerationInfo | null) ?? null,
    libraryDocs: lib ?? [],
  };
}

export function fieldProvenance(f: CaseFieldRow): Provenance | null {
  const s = f.source;
  if (!s) return null;
  if (s.kind === "document") {
    return { kind: "document", label: `${s.fileName ?? "Dokument"}${s.page ? `, S. ${s.page}` : ""}${s.region ? `, ${s.region}` : ""}`, quote: s.quote ?? null };
  }
  if (s.kind === "assumption") return { kind: "assumption", label: s.note ?? "Annahme des Beraters" };
  return { kind: "manual", label: s.note ? s.note : "vom Berater erfasst" };
}

export function costProvenance(c: CostItemRow, docs: LibraryDocumentRow[]): Provenance {
  const doc = docs.find((d) => d.id === c.source_document_id);
  if (c.source_kind === "library" || c.source_kind === "websearch") {
    return { kind: c.source_kind, label: `${doc?.title ?? "Bedingungswerk"}${c.page ? `, S. ${c.page}` : ""}`, quote: c.quote };
  }
  if (c.source_kind === "assumption") return { kind: "assumption", label: c.source_note ?? "Annahme" };
  return { kind: c.source_kind === "document" ? "document" : "manual", label: c.source_note ? c.source_note : "manuell erfasst", quote: c.quote };
}

export function toFieldRecords(fields: CaseFieldRow[]): FieldRecord[] {
  return fields.map((f) => ({ key: f.key, value: f.value, status: f.status, source: fieldProvenance(f) }));
}

export function toCostRecords(items: CostItemRow[], docs: LibraryDocumentRow[]): CostRecord[] {
  return items.map((c) => ({
    key: c.key,
    value: c.value,
    status: c.status,
    scope: c.case_id ? "case" : "generation",
    source: costProvenance(c, docs),
  }));
}
