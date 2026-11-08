"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/lib/auth";

/** Speichert Kundenprofil und Ergebnis einer Tarifauswahl (ohne Namen; optional einem Fall zugeordnet). */
export async function saveSelection(input: { title: string; caseId: string | null; profile: unknown; results: unknown }): Promise<{ id?: string; error?: string }> {
  const { supabase } = await requireTeamMember();
  if (!input.title.trim()) return { error: "Bitte eine Bezeichnung angeben (ohne Kundennamen)." };
  const { data, error } = await supabase
    .from("selections")
    .insert({ title: input.title.trim(), case_id: input.caseId, profile: input.profile, results: input.results })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Speichern fehlgeschlagen" };
  revalidatePath("/tarifauswahl");
  return { id: data.id };
}

export async function deleteSelection(id: string): Promise<void> {
  const { supabase } = await requireTeamMember();
  await supabase.from("selections").delete().eq("id", id);
  revalidatePath("/tarifauswahl");
}
