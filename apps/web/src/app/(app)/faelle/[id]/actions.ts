"use server";

import { checkGate, CONTRACT_FIELDS, costFieldDef } from "@klarwert/extraction";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/lib/auth";
import { loadCaseBundle, toCostRecords, toFieldRecords, type CaseDocumentRow, type CaseFieldRow } from "@/lib/data";
import { removeObjects } from "@/lib/storage";

function refresh(caseId: string) {
  revalidatePath(`/faelle/${caseId}`);
}

/** Nach jeder Änderung: Bestätigungsstempel des Falls neu bestimmen (Gate). */
async function recomputeConfirmation(supabase: SupabaseClient, caseId: string, userId: string): Promise<void> {
  const bundle = await loadCaseBundle(supabase, caseId);
  if (!bundle) return;
  const gate = checkGate(toFieldRecords(bundle.fields), toCostRecords(bundle.costItems, bundle.libraryDocs));
  const fieldsOk = gate.missingFields.length === 0 && gate.unconfirmedFields.length === 0;
  const update: Record<string, unknown> = {
    fields_confirmed_at: fieldsOk ? (bundle.case.fields_confirmed_at ?? new Date().toISOString()) : null,
  };
  if (!gate.ok) {
    update.costs_confirmed_at = null;
    update.costs_confirmed_by = null;
    if (bundle.case.status === "kosten_bestaetigt" || bundle.case.status === "analysiert") update.status = bundle.case.generation_id ? "tarif_zugeordnet" : "erkannt";
  }
  await supabase.from("cases").update(update).eq("id", caseId);
  void userId;
}

// Dokumente --------------------------------------------------------------------

export async function approveSanitized(caseId: string, documentId: string): Promise<void> {
  const { supabase, user } = await requireTeamMember();
  await supabase.from("case_documents").update({ sanitized_approved_at: new Date().toISOString(), sanitized_approved_by: user.id }).eq("id", documentId).eq("case_id", caseId);
  refresh(caseId);
}

export async function setDocumentRole(caseId: string, documentId: string, role: string): Promise<void> {
  const { supabase } = await requireTeamMember();
  await supabase.from("case_documents").update({ doc_role: role }).eq("id", documentId).eq("case_id", caseId);
  refresh(caseId);
}

export async function deleteOriginalNow(caseId: string, documentId: string): Promise<void> {
  const { supabase } = await requireTeamMember();
  const { data: doc } = await supabase.from("case_documents").select("*").eq("id", documentId).single<CaseDocumentRow>();
  if (doc?.original_path) {
    await removeObjects(supabase, "originals", [doc.original_path]);
    await supabase.from("case_documents").update({ original_path: null, original_deleted_at: new Date().toISOString(), keep_original: false }).eq("id", documentId);
  }
  refresh(caseId);
}

export async function deleteDocument(caseId: string, documentId: string): Promise<void> {
  const { supabase } = await requireTeamMember();
  const { data: doc } = await supabase.from("case_documents").select("*").eq("id", documentId).single<CaseDocumentRow>();
  if (!doc) return;
  if (doc.original_path) await removeObjects(supabase, "originals", [doc.original_path]);
  const paths = (doc.sanitized_pages ?? []).flatMap((p) => [p.textPath, p.imagePath].filter((x): x is string => !!x));
  await removeObjects(supabase, "sanitized", paths);
  await supabase.from("case_documents").delete().eq("id", documentId);
  refresh(caseId);
}

// Vertragsfelder ----------------------------------------------------------------

function coerceFieldValue(key: string, raw: string): unknown {
  const def = CONTRACT_FIELDS.find((d) => d.key === key);
  const v = raw.trim();
  if (v === "") return null;
  if (!def) return v;
  if (def.type === "number") {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n)) throw new Error(`${def.label}: keine gültige Zahl`);
    return /,/.test(v) || !/\./.test(v) ? n : Number(v);
  }
  if (def.type === "date") {
    const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
    if (de) return `${de[3]}-${de[2]!.padStart(2, "0")}-${de[1]!.padStart(2, "0")}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${def.label}: Datum als TT.MM.JJJJ eingeben`);
    return v;
  }
  if (def.type === "enum" && def.options && !def.options.includes(v)) throw new Error(`${def.label}: ungültige Auswahl`);
  if (def.type === "json") return JSON.parse(v);
  return v;
}

export async function saveField(caseId: string, key: string, rawValue: string, note: string | null, confirm: boolean): Promise<{ error?: string }> {
  const { supabase, user } = await requireTeamMember();
  let value: unknown;
  try {
    value = coerceFieldValue(key, rawValue);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ungültiger Wert" };
  }
  const { data: existing } = await supabase.from("case_fields").select("*").eq("case_id", caseId).eq("key", key).maybeSingle<CaseFieldRow>();
  const changed = !existing || JSON.stringify(existing.value) !== JSON.stringify(value);
  const source = changed ? { kind: "manual", note: note || "vom Berater eingegeben/korrigiert", previous: existing?.source ?? null } : existing?.source;
  await supabase.from("case_fields").upsert(
    {
      case_id: caseId,
      key,
      value,
      confidence: changed ? 1 : existing?.confidence,
      source,
      status: confirm ? "confirmed" : "proposed",
      confirmed_by: confirm ? user.id : null,
      confirmed_at: confirm ? new Date().toISOString() : null,
    },
    { onConflict: "case_id,key" },
  );
  await recomputeConfirmation(supabase, caseId, user.id);
  refresh(caseId);
  return {};
}

export async function confirmField(caseId: string, key: string): Promise<void> {
  const { supabase, user } = await requireTeamMember();
  await supabase.from("case_fields").update({ status: "confirmed", confirmed_by: user.id, confirmed_at: new Date().toISOString() }).eq("case_id", caseId).eq("key", key);
  await recomputeConfirmation(supabase, caseId, user.id);
  refresh(caseId);
}

export async function unconfirmField(caseId: string, key: string): Promise<void> {
  const { supabase, user } = await requireTeamMember();
  await supabase.from("case_fields").update({ status: "proposed", confirmed_by: null, confirmed_at: null }).eq("case_id", caseId).eq("key", key);
  await recomputeConfirmation(supabase, caseId, user.id);
  refresh(caseId);
}

export async function deleteField(caseId: string, key: string): Promise<void> {
  const { supabase, user } = await requireTeamMember();
  await supabase.from("case_fields").delete().eq("case_id", caseId).eq("key", key);
  await recomputeConfirmation(supabase, caseId, user.id);
  refresh(caseId);
}

export async function updateCaseMeta(caseId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireTeamMember();
  await supabase
    .from("cases")
    .update({ title: String(formData.get("title") ?? "").trim() || null, customer_name: String(formData.get("customer_name") ?? "").trim() || null, notes: String(formData.get("notes") ?? "").trim() || null })
    .eq("id", caseId);
  refresh(caseId);
}

// Tarifzuordnung ------------------------------------------------------------------

function addAlias(list: string[], alias: string | null | undefined): string[] {
  const a = alias?.trim();
  if (!a || list.some((x) => x.toLowerCase() === a.toLowerCase())) return list;
  return [...list, a];
}

export async function assignGeneration(caseId: string, generationId: string, learnAliases: boolean): Promise<void> {
  const { supabase, user } = await requireTeamMember();
  const { data: gen } = await supabase
    .from("tariff_generations")
    .select("id, label, aliases, tariff:tariffs(id, name, aliases, layer, insurer:insurers(id, name, aliases))")
    .eq("id", generationId)
    .single<{ id: string; label: string; aliases: string[]; tariff: { id: string; name: string; aliases: string[]; layer: string; insurer: { id: string; name: string; aliases: string[] } } }>();
  if (!gen) throw new Error("Tarifgeneration nicht gefunden");
  if (learnAliases) {
    const { data: fields } = await supabase.from("case_fields").select("key,value").eq("case_id", caseId).in("key", ["insurer", "tariff_name", "tariff_code", "tariff_generation"]);
    const val = (k: string) => {
      const v = fields?.find((f) => f.key === k)?.value;
      return typeof v === "string" ? v : null;
    };
    const insAliases = addAlias(gen.tariff.insurer.aliases, val("insurer") !== gen.tariff.insurer.name ? val("insurer") : null);
    const tarAliases = addAlias(gen.tariff.aliases, val("tariff_name") !== gen.tariff.name ? val("tariff_name") : null);
    const genAliases = addAlias(gen.aliases, val("tariff_generation") !== gen.label ? val("tariff_generation") : null);
    await Promise.all([
      supabase.from("insurers").update({ aliases: insAliases }).eq("id", gen.tariff.insurer.id),
      supabase.from("tariffs").update({ aliases: tarAliases }).eq("id", gen.tariff.id),
      supabase.from("tariff_generations").update({ aliases: genAliases }).eq("id", gen.id),
    ]);
  }
  await supabase.from("cases").update({ generation_id: generationId, layer: gen.tariff.layer, status: "tarif_zugeordnet", costs_confirmed_at: null }).eq("id", caseId);
  await recomputeConfirmation(supabase, caseId, user.id);
  refresh(caseId);
}

export async function createCatalogEntry(caseId: string | null, formData: FormData): Promise<{ generationId?: string; error?: string }> {
  const { supabase } = await requireTeamMember();
  const insurerId = String(formData.get("insurer_id") ?? "");
  const insurerName = String(formData.get("insurer_name") ?? "").trim();
  const tariffId = String(formData.get("tariff_id") ?? "");
  const tariffName = String(formData.get("tariff_name") ?? "").trim();
  const tariffCode = String(formData.get("tariff_code") ?? "").trim() || null;
  const layer = String(formData.get("layer") ?? "layer3");
  const productType = String(formData.get("product_type") ?? "") || null;
  const genLabel = String(formData.get("generation_label") ?? "").trim();
  const validFrom = String(formData.get("valid_from") ?? "") || null;
  const validTo = String(formData.get("valid_to") ?? "") || null;
  if (!genLabel) return { error: "Bitte eine Generation/einen Stand angeben." };
  let iid = insurerId;
  if (!iid) {
    if (!insurerName) return { error: "Bitte Versicherer wählen oder neu anlegen." };
    const { data, error } = await supabase.from("insurers").insert({ name: insurerName }).select("id").single();
    if (error || !data) return { error: error?.message ?? "Versicherer konnte nicht angelegt werden" };
    iid = data.id;
  }
  let tid = tariffId;
  if (!tid) {
    if (!tariffName) return { error: "Bitte Tarif wählen oder neu anlegen." };
    const { data, error } = await supabase.from("tariffs").insert({ insurer_id: iid, name: tariffName, code: tariffCode, layer, product_type: productType }).select("id").single();
    if (error || !data) return { error: error?.message ?? "Tarif konnte nicht angelegt werden" };
    tid = data.id;
  }
  const { data: gen, error } = await supabase.from("tariff_generations").insert({ tariff_id: tid, label: genLabel, valid_from: validFrom, valid_to: validTo }).select("id").single();
  if (error || !gen) return { error: error?.message ?? "Generation konnte nicht angelegt werden" };
  if (caseId) await assignGeneration(caseId, gen.id, true);
  revalidatePath("/bibliothek");
  return { generationId: gen.id };
}

// Kostenfaktoren ------------------------------------------------------------------

function coerceCostValue(key: string, raw: string): number | boolean | string | null {
  const def = costFieldDef(key);
  const v = raw.trim();
  if (!def) throw new Error("Unbekannter Kostenschlüssel");
  if (v === "" || v === "–") {
    if (def.nullable) return null;
    throw new Error(`${def.label}: Wert erforderlich (0, falls keine Kosten dieser Art)`);
  }
  if (def.type === "boolean") return ["ja", "true", "1", "x"].includes(v.toLowerCase());
  if (def.type === "enum") {
    if (!def.options?.includes(v)) throw new Error(`${def.label}: ungültige Auswahl`);
    return v;
  }
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`${def.label}: keine gültige Zahl`);
  return n;
}

/**
 * Wert setzen (und bestätigen). scope "generation" = gilt für alle Verträge dieser Tarifgeneration,
 * scope "case" = vertragsindividuelle Abweichung (Override).
 */
export async function saveCostItem(
  caseId: string,
  input: { key: string; rawValue: string; scope: "generation" | "case"; sourceNote: string; page?: number | null; quote?: string | null; sourceDocumentId?: string | null; confirm: boolean },
): Promise<{ error?: string }> {
  const { supabase, user } = await requireTeamMember();
  const { data: c } = await supabase.from("cases").select("generation_id").eq("id", caseId).single<{ generation_id: string | null }>();
  if (input.scope === "generation" && !c?.generation_id) return { error: "Zuerst Tarifgeneration zuordnen." };
  let value: number | boolean | string | null;
  try {
    value = coerceCostValue(input.key, input.rawValue);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ungültiger Wert" };
  }
  if (!input.sourceNote.trim() && !input.sourceDocumentId) return { error: "Bitte eine Fundstelle angeben (z. B. „AVB § 12 Abs. 3, S. 14“)." };
  const scopeCol: { generation_id: string | null; case_id: string | null } = input.scope === "generation" ? { generation_id: c?.generation_id ?? null, case_id: null } : { generation_id: null, case_id: caseId };
  const matchCol = input.scope === "generation" ? "generation_id" : "case_id";
  const matchVal = input.scope === "generation" ? c?.generation_id : caseId;
  const { data: ex } = await supabase.from("cost_items").select("id").eq(matchCol, matchVal as string).eq("key", input.key).neq("status", "rejected").maybeSingle<{ id: string }>();
  const row: Record<string, unknown> = {
    ...scopeCol,
    key: input.key,
    value,
    unit: costFieldDef(input.key)?.unit ?? null,
    status: input.confirm ? "confirmed" : "proposed",
    source_kind: input.sourceDocumentId ? "library" : "manual",
    source_document_id: input.sourceDocumentId ?? null,
    page: input.page ?? null,
    quote: input.quote ?? null,
    source_note: input.sourceNote.trim() || null,
    proposed_by: "user",
    confirmed_by: input.confirm ? user.id : null,
    confirmed_at: input.confirm ? new Date().toISOString() : null,
  };
  const res = ex ? await supabase.from("cost_items").update(row).eq("id", ex.id) : await supabase.from("cost_items").insert(row);
  if (res.error) return { error: res.error.message };
  await recomputeConfirmation(supabase, caseId, user.id);
  refresh(caseId);
  return {};
}

export async function confirmCostItem(caseId: string, itemId: string): Promise<void> {
  const { supabase, user } = await requireTeamMember();
  await supabase.from("cost_items").update({ status: "confirmed", confirmed_by: user.id, confirmed_at: new Date().toISOString() }).eq("id", itemId);
  await recomputeConfirmation(supabase, caseId, user.id);
  refresh(caseId);
}

export async function rejectCostItem(caseId: string, itemId: string): Promise<void> {
  const { supabase, user } = await requireTeamMember();
  await supabase.from("cost_items").update({ status: "rejected", confirmed_by: user.id, confirmed_at: new Date().toISOString() }).eq("id", itemId);
  await recomputeConfirmation(supabase, caseId, user.id);
  refresh(caseId);
}

export async function finalizeCosts(caseId: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireTeamMember();
  const bundle = await loadCaseBundle(supabase, caseId);
  if (!bundle) return { error: "Fall nicht gefunden" };
  const gate = checkGate(toFieldRecords(bundle.fields), toCostRecords(bundle.costItems, bundle.libraryDocs));
  if (!gate.ok) return { error: gate.messages.join(" · ") };
  await supabase.from("cases").update({ costs_confirmed_at: new Date().toISOString(), costs_confirmed_by: user.id, fields_confirmed_at: bundle.case.fields_confirmed_at ?? new Date().toISOString(), status: "kosten_bestaetigt" }).eq("id", caseId);
  refresh(caseId);
  return {};
}
