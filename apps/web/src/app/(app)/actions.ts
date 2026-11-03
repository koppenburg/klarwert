"use server";

import { redirect } from "next/navigation";
import { requireTeamMember } from "@/lib/auth";

export async function createCase(formData: FormData): Promise<void> {
  const { supabase } = await requireTeamMember();
  const title = String(formData.get("title") ?? "").trim() || null;
  const customerName = String(formData.get("customer_name") ?? "").trim() || null;
  const { data, error } = await supabase.from("cases").insert({ title, customer_name: customerName }).select("id").single();
  if (error || !data) throw new Error(`Fall konnte nicht angelegt werden: ${error?.message ?? "unbekannt"}`);
  redirect(`/faelle/${data.id}`);
}
