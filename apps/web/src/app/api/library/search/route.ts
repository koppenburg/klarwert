import { downloadPdf, modelConfigFromEnv, searchConditions } from "@klarwert/extraction";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { teamMemberOrNull } from "@/lib/auth";
import type { GenerationInfo } from "@/lib/data";
import { env } from "@/lib/env";
import { storeLibraryPdf } from "@/lib/library";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ generationId: z.string().uuid(), contractStart: z.string().nullable().optional() });

/**
 * Stufe (b): Websuche nach dem Bedingungswerk. Gefundene PDFs werden heruntergeladen und als
 * KANDIDAT mit Quelle abgelegt – nie automatisch als gültig übernommen.
 */
export async function POST(request: NextRequest) {
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!env.anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY ist nicht gesetzt." }, { status: 503 });
  const body = Body.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungültige Angaben" }, { status: 400 });
  const { data: gen } = await auth.supabase
    .from("tariff_generations")
    .select("id,label,valid_from,valid_to,tariff:tariffs(id,name,code,layer,insurer:insurers(id,name))")
    .eq("id", body.data.generationId)
    .single<GenerationInfo>();
  if (!gen) return NextResponse.json({ error: "Generation nicht gefunden" }, { status: 404 });
  let search;
  try {
    search = await searchConditions(
      { insurer: gen.tariff.insurer.name, tariff: gen.tariff.name, tariffCode: gen.tariff.code, generation: gen.label, contractStart: body.data.contractStart ?? null },
      modelConfigFromEnv(),
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Websuche fehlgeschlagen" }, { status: 502 });
  }
  const results: Array<{ url: string; title: string; status: string; documentId?: string }> = [];
  const known = new Set(search.searchResultUrls);
  for (const c of search.candidates.slice(0, 6)) {
    if (c.matches_generation === "nein") {
      results.push({ url: c.url, title: c.title, status: "passt laut Suche nicht zur Generation – übersprungen" });
      continue;
    }
    try {
      const pdf = await downloadPdf(c.url);
      const stored = await storeLibraryPdf(auth.supabase, {
        data: pdf.data,
        generationId: gen.id,
        kind: c.kind,
        title: c.title,
        sourceKind: "websearch",
        sourceUrl: pdf.url,
        status: "candidate",
        searchMeta: { reason: c.reason, matchesGeneration: c.matches_generation, urlFromSearchResults: known.has(c.url), model: search.model, searchedAt: new Date().toISOString() },
      });
      results.push({ url: pdf.url, title: c.title, status: stored.duplicateOf ? "bereits in der Bibliothek" : `als Kandidat abgelegt (${stored.pageCount} Seiten)`, documentId: stored.id });
    } catch (e) {
      results.push({ url: c.url, title: c.title, status: `nicht abrufbar: ${e instanceof Error ? e.message : "Fehler"}` });
    }
  }
  return NextResponse.json({ results, remarks: search.remarks });
}
