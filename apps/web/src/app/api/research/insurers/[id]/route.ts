import { discoverTariffs, modelConfigFromEnv } from "@klarwert/extraction";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { teamMemberOrNull } from "@/lib/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ layers: z.array(z.enum(["riester", "basis", "layer3", "bav"])).default([]) });

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();
}

/** Tarifrecherche für einen Versicherer: aktuelle Altersvorsorgetarife als Kandidaten mit Quellen. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!env.anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY ist nicht gesetzt." }, { status: 503 });
  const { id } = await ctx.params;
  const body = Body.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Ungültige Angaben" }, { status: 400 });
  const { supabase } = auth;
  const { data: insurer } = await supabase.from("insurers").select("id,name,aliases").eq("id", id).single<{ id: string; name: string; aliases: string[] }>();
  if (!insurer) return NextResponse.json({ error: "Versicherer nicht gefunden" }, { status: 404 });

  let result;
  try {
    result = await discoverTariffs({ insurer: insurer.name, aliases: insurer.aliases ?? [], layers: body.data.layers }, modelConfigFromEnv());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Recherche fehlgeschlagen" }, { status: 502 });
  }

  const [{ data: existingCandidates }, { data: tariffs }] = await Promise.all([
    supabase.from("tariff_candidates").select("id,name,generation_label,status").eq("insurer_id", id),
    supabase.from("tariffs").select("name,aliases").eq("insurer_id", id),
  ]);
  const catalogNames = new Set((tariffs ?? []).flatMap((t) => [t.name as string, ...((t.aliases as string[]) ?? [])]).map(norm));
  const known = new Set(result.searchResultUrls);
  let created = 0;
  let updated = 0;
  let inCatalog = 0;
  for (const p of result.products) {
    // nur URLs übernehmen, die die Websuche tatsächlich geliefert hat
    const documents = p.documents.map((d) => ({ ...d, fromSearchResults: known.has(d.url) }));
    const sourceUrls = [p.product_url, ...p.documents.map((d) => d.url)].filter((u): u is string => !!u && known.has(u));
    const row = {
      insurer_id: id,
      name: p.name,
      code: p.code,
      layer: p.layer,
      product_type: p.product_type,
      generation_label: p.generation,
      sales_status: p.sales_status,
      product_url: p.product_url && known.has(p.product_url) ? p.product_url : null,
      documents,
      source_urls: sourceUrls,
      reason: p.reason,
      research_model: result.model,
    };
    const match = (existingCandidates ?? []).find((c) => norm(c.name as string) === norm(p.name) && (c.generation_label ?? "") === (p.generation ?? ""));
    if (match) {
      if (match.status === "candidate") {
        await supabase.from("tariff_candidates").update(row).eq("id", match.id);
        updated++;
      }
      continue;
    }
    if (catalogNames.has(norm(p.name))) inCatalog++;
    const { error } = await supabase.from("tariff_candidates").insert({ ...row, reason: catalogNames.has(norm(p.name)) ? `Bereits im Katalog (prüfen, ob neue Generation). ${p.reason}` : p.reason });
    if (!error) created++;
  }
  await supabase.from("insurers").update({ last_research_at: new Date().toISOString(), last_research_remarks: result.remarks }).eq("id", id);
  return NextResponse.json({ found: result.products.length, created, updated, inCatalog, remarks: result.remarks, searchResults: result.searchResultUrls.length });
}
