"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function signIn(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  if (!email || !password) return { error: "Bitte E-Mail und Passwort eingeben." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen." };
  const { data: member } = await supabase.rpc("is_team_member");
  if (member !== true) {
    await supabase.auth.signOut();
    return { error: "Dieses Konto ist nicht für Klarwert freigeschaltet. Bitte an Dominic wenden." };
  }
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
