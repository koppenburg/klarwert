"use server";

import { SEED_INSURERS } from "@klarwert/extraction";
import { revalidatePath } from "next/cache";
import { requireTeamMember } from "@/lib/auth";

function refresh(caseId?: string | null) {
  revalidatePath("/bibliothek");
  if (caseId) revalidatePath(`/faelle/${caseId}`);
}

export async function confirmLibraryDocument(documentId: string, caseId?: string | null): Promise<void> {
  const { supabase, user } = await requireTeamMember();
  await supabase.from("library_documents").update({ status: "confirmed", confirmed_by: user.id, confirmed_at: new Date().toISOString() }).eq("id", documentId);
  refresh(caseId);
}

export async function rejectLibraryDocument(documentId: string, caseId?: string | null): Promise<void> {
  const { supabase, user } = await requireTeamMember();
  await supabase.from("library_documents").update({ status: "rejected", confirmed_by: user.id, confirmed_at: new Date().toISOString() }).eq("id", documentId);
  refresh(caseId);
}

export async function seedInsurers(): Promise<{ added: number }> {
  const { supabase } = await requireTeamMember();
  const { data: existing } = await supabase.from("insurers").select("name");
  const names = new Set((existing ?? []).map((e) => (e.name as string).toLowerCase()));
  const rows = SEED_INSURERS.filter((s) => !names.has(s.name.toLowerCase())).map((s) => ({ name: s.name, aliases: s.aliases }));
  if (rows.length) await supabase.from("insurers").insert(rows);
  refresh();
  return { added: rows.length };
}

export async function updateAliases(table: "insurers" | "tariffs" | "tariff_generations", id: string, aliasesCsv: string): Promise<void> {
  const { supabase } = await requireTeamMember();
  const aliases = aliasesCsv
    .split(/[;,\n]/)
    .map((a) => a.trim())
    .filter(Boolean);
  await supabase.from(table).update({ aliases: [...new Set(aliases)] }).eq("id", id);
  refresh();
}

export async function libraryDocumentUrl(documentId: string): Promise<string | null> {
  const { supabase } = await requireTeamMember();
  const { data: doc } = await supabase.from("library_documents").select("storage_path").eq("id", documentId).single<{ storage_path: string | null }>();
  if (!doc?.storage_path) return null;
  const { data } = await supabase.storage.from("library").createSignedUrl(doc.storage_path, 600);
  return data?.signedUrl ?? null;
}
