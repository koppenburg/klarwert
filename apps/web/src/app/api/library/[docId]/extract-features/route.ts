import { extractFeatures, featureProposals, modelConfigFromEnv } from "@klarwert/extraction";
import { NextResponse } from "next/server";
import { teamMemberOrNull } from "@/lib/auth";
import type { GenerationInfo, LibraryDocumentRow } from "@/lib/data";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Tarifmerkmale, Beitragsstaffeln und Rentenfaktor-Tabelle aus einem bestätigten Bedingungswerk als Vorschläge. */
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
    result = await extractFeatures(
      {
        pages: (pages ?? []).map((p) => ({ pageNumber: p.page_number as number, text: p.content as string })),
        meta: { insurer: gen?.tariff.insurer.name ?? "", tariff: gen?.tariff.name ?? "", generation: gen?.label, title: doc.title },
      },
      modelConfigFromEnv(),
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Auswertung fehlgeschlagen" }, { status: 502 });
  }
  const { proposals, rejected } = featureProposals(result.data);
  const { data: existing } = await supabase.from("cost_items").select("id,key,status").eq("generation_id", doc.generation_id).neq("status", "rejected");
  let proposed = 0;
  let skipped = 0;
  for (const p of proposals) {
    const ex = existing?.find((e) => e.key === p.key);
    if (ex?.status === "confirmed") {
      skipped++;
      continue;
    }
    const row = {
      generation_id: doc.generation_id,
      key: p.key,
      value: p.value,
      status: "proposed",
      source_kind: "library",
      source_document_id: doc.id,
      page: p.page,
      quote: p.quote,
      source_note: p.note,
      confidence: p.confidence,
      proposed_by: "model",
    };
    const res = ex ? await supabase.from("cost_items").update(row).eq("id", ex.id) : await supabase.from("cost_items").insert(row);
    if (!res.error) proposed++;
  }
  return NextResponse.json({ proposed, skippedConfirmed: skipped, rejected, remarks: result.data.remarks });
}
