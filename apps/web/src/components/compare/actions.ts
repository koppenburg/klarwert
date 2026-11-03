"use server";

import { requireTeamMember } from "@/lib/auth";

export async function saveComparison(title: string, caseIds: string[], assumptions: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireTeamMember();
  if (caseIds.length < 2 || caseIds.length > 3) return { ok: false, error: "Bitte 2 bis 3 Fälle wählen." };
  const { error } = await supabase.from("comparisons").insert({ title: title.trim() || "Vergleich", case_ids: caseIds, assumptions });
  return error ? { ok: false, error: error.message } : { ok: true };
}
