import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export class AuthError extends Error {}

/** Angemeldeter Berater, der im Team freigeschaltet ist (team_members). */
export async function requireTeamMember(): Promise<{ supabase: SupabaseClient; user: User }> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.rpc("is_team_member");
  if (data !== true) redirect("/login?fehler=kein-teammitglied");
  return { supabase, user };
}

/** Für Route Handler: liefert 401/403 statt Redirect. */
export async function teamMemberOrNull(): Promise<{ supabase: SupabaseClient; user: User } | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("is_team_member");
  return data === true ? { supabase, user } : null;
}
