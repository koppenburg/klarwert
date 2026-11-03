import { CONTRACT_FIELDS, extractContract, ExtractionError, modelConfigFromEnv, PrivacyGuardError, type ContractExtraction, type SanitizedPageInput } from "@klarwert/extraction";
import { NextResponse } from "next/server";
import { teamMemberOrNull } from "@/lib/auth";
import type { CaseDocumentRow, CaseFieldRow, FieldSource } from "@/lib/data";
import { deleteOriginalUnlessKept, verifyStored } from "@/lib/documents";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

type FieldValue = { value: unknown; confidence: number; source: { file: string; page: number | null; region: string | null; quote: string | null } | null };

/**
 * Erkennung: nur freigegebene, bereinigte Dokumente; die Bereinigung wird unmittelbar vor dem Modellaufruf
 * erneut geprüft (Text + Re-OCR der Bilder). Danach werden Originale gelöscht, sofern nicht ausdrücklich behalten.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!env.anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY ist nicht gesetzt." }, { status: 503 });
  const { id } = await ctx.params;
  const { supabase, user } = auth;
  const { data: c } = await supabase.from("cases").select("id, customer_name").eq("id", id).maybeSingle<{ id: string; customer_name: string | null }>();
  if (!c) return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
  const { data: docs } = await supabase.from("case_documents").select("*").eq("case_id", id).order("created_at").returns<CaseDocumentRow[]>();
  const ready = (docs ?? []).filter((d) => d.sanitized_pages?.length);
  if (ready.length === 0) return NextResponse.json({ error: "Keine bereinigten Dokumente vorhanden." }, { status: 400 });
  const unapproved = ready.filter((d) => !d.sanitized_approved_at);
  if (unapproved.length) return NextResponse.json({ error: `Bereinigte Vorschau noch nicht freigegeben: ${unapproved.map((d) => d.file_name).join(", ")}` }, { status: 409 });

  const pages: SanitizedPageInput[] = [];
  for (const d of ready) {
    const v = await verifyStored(supabase, d, c.customer_name);
    if (!v.ok) {
      return NextResponse.json(
        { error: `Prüfung der Bereinigung fehlgeschlagen für ${d.file_name} (gefunden: ${v.findingKinds.join(", ")}). Bitte nachschwärzen.` },
        { status: 422 },
      );
    }
    for (const p of v.sanitized.pages) pages.push({ fileName: d.file_name, pageNumber: p.pageNumber, text: p.text, image: p.image });
  }

  let result: { data: ContractExtraction; model: string };
  try {
    result = await extractContract({ pages, verification: { ok: true, checkedAt: new Date().toISOString() } }, modelConfigFromEnv());
  } catch (e) {
    const status = e instanceof PrivacyGuardError ? 422 : e instanceof ExtractionError ? 502 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erkennung fehlgeschlagen" }, { status });
  }

  await supabase.from("extractions").insert({ case_id: id, model: result.model, raw: result.data, created_by: user.id });

  // Felder als Vorschläge übernehmen – bestätigte Felder bleiben unangetastet
  const { data: existing } = await supabase.from("case_fields").select("*").eq("case_id", id).returns<CaseFieldRow[]>();
  const confirmed = new Set((existing ?? []).filter((f) => f.status === "confirmed").map((f) => f.key));
  const docByName = new Map(ready.map((d) => [d.file_name, d.id]));
  const rows = [];
  const raw = result.data as unknown as Record<string, FieldValue>;
  for (const def of CONTRACT_FIELDS) {
    const f = raw[def.key];
    if (!f || f.value === null || f.value === undefined || confirmed.has(def.key)) continue;
    const source: FieldSource | null = f.source
      ? { kind: "document", documentId: docByName.get(f.source.file), fileName: f.source.file, page: f.source.page, region: f.source.region, quote: f.source.quote }
      : null;
    rows.push({ case_id: id, key: def.key, value: f.value, confidence: f.confidence, source, status: "proposed" });
  }
  if (rows.length) await supabase.from("case_fields").upsert(rows, { onConflict: "case_id,key" });

  // Rentenfaktoren aus den Vertragsunterlagen als vertragsindividuelle Kostenvorschläge
  const costRows = [];
  const addCost = (key: string, f: FieldValue | undefined, note: string) => {
    if (!f || typeof f.value !== "number") return;
    costRows.push({
      case_id: id,
      key,
      value: f.value,
      status: "proposed",
      source_kind: "document",
      page: f.source?.page ?? null,
      quote: f.source?.quote ?? null,
      source_note: `${f.source?.file ?? "Vertragsunterlage"}${f.source?.page ? `, S. ${f.source.page}` : ""} – ${note}`,
      confidence: f.confidence,
      proposed_by: "model",
    });
  };
  addCost("payout.annuityFactorGuaranteed", raw.annuity_factor_guaranteed, "Rentenfaktor laut Vertragsunterlagen");
  addCost("payout.annuityFactorCurrent", raw.annuity_factor_current, "Rentenfaktor laut Vertragsunterlagen");
  // Fondskosten: gewichtete TER aus der Fondsauswahl (deterministisch berechnet, nicht vom Modell)
  const funds = raw.funds?.value as Array<{ sharePercent: number | null; terPercent: number | null; name: string }> | null | undefined;
  if (Array.isArray(funds) && funds.length && funds.every((x) => typeof x.terPercent === "number" && typeof x.sharePercent === "number")) {
    const share = funds.reduce((s, x) => s + (x.sharePercent ?? 0), 0);
    if (share > 0) {
      const ter = funds.reduce((s, x) => s + (x.terPercent ?? 0) * (x.sharePercent ?? 0), 0) / share;
      costRows.push({
        case_id: id,
        key: "fund.terPercent",
        value: Math.round(ter * 10000) / 10000,
        status: "proposed",
        source_kind: "document",
        page: raw.funds?.source?.page ?? null,
        quote: raw.funds?.source?.quote ?? null,
        source_note: `gewichtet aus Fondsauswahl (${funds.map((x) => `${x.name} ${x.sharePercent} % / TER ${x.terPercent} %`).join("; ")})`,
        confidence: raw.funds?.confidence ?? null,
        proposed_by: "model",
      });
    }
  }
  for (const row of costRows) {
    const { data: ex } = await supabase.from("cost_items").select("id,status").eq("case_id", id).eq("key", row.key).neq("status", "rejected").maybeSingle<{ id: string; status: string }>();
    if (!ex) await supabase.from("cost_items").insert(row);
    else if (ex.status === "proposed") await supabase.from("cost_items").update(row).eq("id", ex.id);
  }

  const now = new Date().toISOString();
  let deleted = 0;
  for (const d of ready) {
    await supabase.from("case_documents").update({ extracted_at: now }).eq("id", d.id);
    if (await deleteOriginalUnlessKept(supabase, d)) deleted++;
  }
  const layer = raw.layer?.value;
  await supabase.from("cases").update({ status: "erkannt", ...(typeof layer === "string" ? { layer } : {}) }).eq("id", id).in("status", ["neu", "erkannt"]);
  return NextResponse.json({ fields: rows.length, costProposals: costRows.length, originalsDeleted: deleted, notes: result.data.notes, model: result.model });
}
