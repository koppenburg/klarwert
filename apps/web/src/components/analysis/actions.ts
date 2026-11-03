"use server";

import { revalidatePath } from "next/cache";
import { mergeSettings } from "@/lib/analysis-settings";
import { requireTeamMember } from "@/lib/auth";

/** Einstellungen der Analyse/Szenarien speichern (cases.analysis_assumptions). */
export async function saveAnalysisSettings(caseId: string, settings: unknown, opts: { markAnalysed?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireTeamMember();
  const clean = mergeSettings(settings);
  const update: Record<string, unknown> = { analysis_assumptions: clean };
  if (opts.markAnalysed) {
    const { data: c } = await supabase.from("cases").select("costs_confirmed_at,fields_confirmed_at").eq("id", caseId).maybeSingle<{ costs_confirmed_at: string | null; fields_confirmed_at: string | null }>();
    if (c?.costs_confirmed_at && c.fields_confirmed_at) update.status = "analysiert";
  }
  const { error } = await supabase.from("cases").update(update).eq("id", caseId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/faelle/${caseId}`);
  return { ok: true };
}
