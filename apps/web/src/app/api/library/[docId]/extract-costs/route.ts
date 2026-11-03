import { costFieldDef, extractCosts, modelConfigFromEnv } from "@klarwert/extraction";
import { NextResponse } from "next/server";
import { teamMemberOrNull } from "@/lib/auth";
import type { GenerationInfo, LibraryDocumentRow } from "@/lib/data";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Kostenklauseln aus einem bestätigten Bedingungswerk als Vorschläge für die Tarifgeneration. */
export async function POST(_req: Request, ctx: { params: Promise<{ docId: string }> }) {
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!env.anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY ist nicht gesetzt." }, { status: 503 });
  const { docId } = await ctx.params;
  const { supabase } = auth;
  const { data: doc } = await supabase.from("library_documents").select("*").eq("id", docId).single<LibraryDocumentRow>();
  if (!doc) return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
  if (doc.status !== "confirmed") return NextResponse.json({ error: "Nur bestätigte Bedingungswerke werden ausgewertet." }, { status: 409 });
  if (!doc.generation_id) return NextResponse.json({ error: "Dokument ist keiner Tarifgeneration zugeordnet." }, { status: 409 });
  const { data: gen } = await supabase
    .from("tariff_generations")
    .select("id,label,valid_from,valid_to,tariff:tariffs(id,name,code,layer,insurer:insurers(id,name))")
    .eq("id", doc.generation_id)
    .single<GenerationInfo>();
  const { data: pages } = await supabase.from("library_pages").select("page_number, content").eq("document_id", docId).order("page_number");
  let result;
  try {
    result = await extractCosts(
      {
        pages: (pages ?? []).map((p) => ({ pageNumber: p.page_number as number, text: p.content as string })),
        meta: { insurer: gen?.tariff.insurer.name ?? "", tariff: gen?.tariff.name ?? "", generation: gen?.label, title: doc.title },
      },
      modelConfigFromEnv(),
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Auswertung fehlgeschlagen" }, { status: 502 });
  }
  const { data: existing } = await supabase.from("cost_items").select("id,key,status").eq("generation_id", doc.generation_id).neq("status", "rejected");
  let inserted = 0;
  let skipped = 0;
  for (const item of result.data.items) {
    const def = costFieldDef(item.key);
    if (!def) continue;
    let value: number | boolean | string | null = item.value_number;
    if (def.type === "boolean") value = item.value_text === "true" ? true : item.value_text === "false" ? false : null;
    if (def.type === "enum") value = item.value_text && def.options?.includes(item.value_text) ? item.value_text : null;
    if (value === null && !def.nullable) continue;
    const ex = existing?.find((e) => e.key === item.key);
    if (ex?.status === "confirmed") {
      skipped++;
      continue;
    }
    const row = {
      generation_id: doc.generation_id,
      key: item.key,
      value,
      unit: def.unit ?? null,
      status: "proposed",
      source_kind: "library",
      source_document_id: doc.id,
      page: item.page,
      quote: item.quote,
      source_note: item.note,
      confidence: item.confidence,
      proposed_by: "model",
    };
    const res = ex ? await supabase.from("cost_items").update(row).eq("id", ex.id) : await supabase.from("cost_items").insert(row);
    if (!res.error) inserted++;
  }
  await supabase.from("library_documents").update({ cost_remarks: { remarks: result.data.remarks, notFound: result.data.not_found, model: result.model, at: new Date().toISOString() } }).eq("id", doc.id);
  return NextResponse.json({ proposed: inserted, skippedConfirmed: skipped, notFound: result.data.not_found, remarks: result.data.remarks });
}
