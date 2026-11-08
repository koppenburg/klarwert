"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/lib/auth";

function refresh() {
  revalidatePath("/bibliothek/recherche");
  revalidatePath("/bibliothek");
  revalidatePath("/tarifauswahl");
}

/** Kandidat in den Katalog übernehmen: Tarif (ggf. vorhanden) + Generation anlegen, Dokumente zuordnen (bleiben Kandidaten). */
export async function acceptCandidate(id: string, generationLabel: string): Promise<{ generationId?: string; error?: string }> {
  const { supabase } = await requireTeamMember();
  const { data: c } = await supabase.from("tariff_candidates").select("*").eq("id", id).single();
  if (!c) return { error: "Kandidat nicht gefunden" };
  if (!c.layer) return { error: "Schicht fehlt – bitte im Katalog anlegen." };
  const label = generationLabel.trim() || c.generation_label || `Stand ${new Date().toISOString().slice(0, 7)}`;
  let { data: tariff } = await supabase.from("tariffs").select("id,aliases").eq("insurer_id", c.insurer_id).eq("name", c.name).maybeSingle();
  if (!tariff) {
    const ins = await supabase.from("tariffs").insert({ insurer_id: c.insurer_id, name: c.name, code: c.code, layer: c.layer, product_type: c.product_type }).select("id,aliases").single();
    if (ins.error || !ins.data) return { error: ins.error?.message ?? "Tarif konnte nicht angelegt werden" };
    tariff = ins.data;
  }
  let { data: gen } = await supabase.from("tariff_generations").select("id").eq("tariff_id", tariff.id).eq("label", label).maybeSingle();
  if (!gen) {
    const ins = await supabase.from("tariff_generations").insert({ tariff_id: tariff.id, label, notes: `aus Tarifrecherche${c.product_url ? `: ${c.product_url}` : ""}` }).select("id").single();
    if (ins.error || !ins.data) return { error: ins.error?.message ?? "Generation konnte nicht angelegt werden" };
    gen = ins.data;
  }
  await supabase.from("tariff_candidates").update({ status: "accepted", generation_id: gen.id }).eq("id", id);
  await supabase.from("library_documents").update({ generation_id: gen.id }).eq("tariff_candidate_id", id).is("generation_id", null);
  refresh();
  return { generationId: gen.id };
}

export async function rejectCandidate(id: string): Promise<void> {
  const { supabase } = await requireTeamMember();
  await supabase.from("tariff_candidates").update({ status: "rejected" }).eq("id", id);
  refresh();
}
