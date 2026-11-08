"use server";

import type { TierBasis } from "@klarwert/calc";
import { costFieldDef, featureFieldDef, type CostValue } from "@klarwert/extraction";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/lib/auth";
import { coerceCatalogValue, type ValueMode } from "@/lib/catalog-values";

/**
 * Änderungen an Tarifwerten wirken auf alle Fälle dieser Generation: deren Kostenbestätigung wird
 * zurückgesetzt, damit kein Report auf veralteten Werten beruht.
 */
async function invalidateCases(supabase: SupabaseClient, generationId: string): Promise<number> {
  const { data } = await supabase
    .from("cases")
    .update({ costs_confirmed_at: null, costs_confirmed_by: null, status: "tarif_zugeordnet" })
    .eq("generation_id", generationId)
    .not("costs_confirmed_at", "is", null)
    .select("id");
  return data?.length ?? 0;
}

function refresh(generationId: string) {
  revalidatePath(`/bibliothek/${generationId}`);
  revalidatePath("/tarifauswahl");
}

export async function saveGenerationItem(
  generationId: string,
  input: { key: string; rawValue: string; valueMode?: ValueMode; tierBasis?: TierBasis; sourceNote: string; page?: number | null; sourceDocumentId?: string | null; confirm: boolean },
): Promise<{ error?: string; invalidatedCases?: number }> {
  const { supabase, user } = await requireTeamMember();
  const def = costFieldDef(input.key) ?? featureFieldDef(input.key);
  if (!def) return { error: "Unbekannter Schlüssel" };
  let value: CostValue;
  try {
    value = coerceCatalogValue({ key: input.key, raw: input.rawValue, mode: input.valueMode, tierBasis: input.tierBasis });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ungültiger Wert" };
  }
  if (!input.sourceNote.trim() && !input.sourceDocumentId) return { error: "Bitte eine Fundstelle angeben (z. B. „AVB § 5 Abs. 2, S. 7“)." };
  const { data: ex } = await supabase.from("cost_items").select("id").eq("generation_id", generationId).eq("key", input.key).neq("status", "rejected").maybeSingle<{ id: string }>();
  const row = {
    generation_id: generationId,
    case_id: null,
    key: input.key,
    value,
    unit: "unit" in def ? (def.unit ?? null) : null,
    status: input.confirm ? "confirmed" : "proposed",
    source_kind: input.sourceDocumentId ? "library" : "manual",
    source_document_id: input.sourceDocumentId ?? null,
    page: input.page ?? null,
    quote: null,
    source_note: input.sourceNote.trim() || null,
    proposed_by: "user",
    confirmed_by: input.confirm ? user.id : null,
    confirmed_at: input.confirm ? new Date().toISOString() : null,
  };
  const res = ex ? await supabase.from("cost_items").update(row).eq("id", ex.id) : await supabase.from("cost_items").insert(row);
  if (res.error) return { error: res.error.message };
  const invalidatedCases = input.key.startsWith("feature.") ? 0 : await invalidateCases(supabase, generationId);
  refresh(generationId);
  return { invalidatedCases };
}

export async function confirmGenerationItem(generationId: string, itemId: string): Promise<void> {
  const { supabase, user } = await requireTeamMember();
  const { data } = await supabase.from("cost_items").update({ status: "confirmed", confirmed_by: user.id, confirmed_at: new Date().toISOString() }).eq("id", itemId).eq("generation_id", generationId).select("key").single();
  if (data && !String(data.key).startsWith("feature.")) await invalidateCases(supabase, generationId);
  refresh(generationId);
}

export async function rejectGenerationItem(generationId: string, itemId: string): Promise<void> {
  const { supabase, user } = await requireTeamMember();
  const { data } = await supabase.from("cost_items").update({ status: "rejected", confirmed_by: user.id, confirmed_at: new Date().toISOString() }).eq("id", itemId).eq("generation_id", generationId).select("key").single();
  if (data && !String(data.key).startsWith("feature.")) await invalidateCases(supabase, generationId);
  refresh(generationId);
}
