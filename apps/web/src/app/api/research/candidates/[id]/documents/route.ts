import { downloadPdf, modelConfigFromEnv, searchConditions } from "@klarwert/extraction";
import { NextResponse } from "next/server";
import { teamMemberOrNull } from "@/lib/auth";
import { env } from "@/lib/env";
import { storeLibraryPdf } from "@/lib/library";

export const runtime = "nodejs";
export const maxDuration = 300;

type Kind = "avb" | "tarifbestimmungen" | "pib" | "kostenblatt" | "sonstiges";

interface CandidateRow {
  id: string;
  name: string;
  code: string | null;
  generation_label: string | null;
  generation_id: string | null;
  documents: Array<{ url: string; title: string; kind: Kind; fromSearchResults?: boolean }>;
  insurer: { name: string };
}

/**
 * Dokumente eines Tarifkandidaten herunterladen (Bedingungen, Kosteninformation, Basisinformations-/Produktinformationsblatt)
 * und als KANDIDATEN in der Bibliothek ablegen. Ohne Links aus der Recherche: gezielte Websuche nach dem Bedingungswerk.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await ctx.params;
  const { supabase } = auth;
  const { data: c } = await supabase.from("tariff_candidates").select("id,name,code,generation_label,generation_id,documents,insurer:insurers(name)").eq("id", id).single<CandidateRow>();
  if (!c) return NextResponse.json({ error: "Kandidat nicht gefunden" }, { status: 404 });

  let targets: Array<{ url: string; title: string; kind: Kind; reason?: string }> = (c.documents ?? []).slice(0, 6);
  let searched = false;
  if (targets.length === 0) {
    if (!env.anthropicConfigured()) return NextResponse.json({ error: "Keine Dokument-Links und ANTHROPIC_API_KEY nicht gesetzt." }, { status: 503 });
    try {
      const s = await searchConditions({ insurer: c.insurer.name, tariff: c.name, tariffCode: c.code, generation: c.generation_label }, modelConfigFromEnv());
      targets = s.candidates.filter((x) => x.matches_generation !== "nein").slice(0, 6).map((x) => ({ url: x.url, title: x.title, kind: x.kind, reason: x.reason }));
      searched = true;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Websuche fehlgeschlagen" }, { status: 502 });
    }
  }
  const results: Array<{ url: string; title: string; status: string }> = [];
  for (const t of targets) {
    try {
      const pdf = await downloadPdf(t.url);
      const stored = await storeLibraryPdf(supabase, {
        data: pdf.data,
        generationId: c.generation_id,
        kind: t.kind,
        title: `${t.title} (${c.insurer.name})`,
        sourceKind: "websearch",
        sourceUrl: pdf.url,
        status: "candidate",
        searchMeta: { candidate: c.name, reason: t.reason ?? null, fetchedAt: new Date().toISOString() },
      });
      await supabase.from("library_documents").update({ tariff_candidate_id: c.id, ...(c.generation_id ? { generation_id: c.generation_id } : {}) }).eq("id", stored.id).is("tariff_candidate_id", null);
      results.push({ url: pdf.url, title: t.title, status: stored.duplicateOf ? "bereits in der Bibliothek" : `abgelegt (${stored.pageCount} Seiten)` });
    } catch (e) {
      results.push({ url: t.url, title: t.title, status: `nicht abrufbar: ${e instanceof Error ? e.message : "Fehler"}` });
    }
  }
  return NextResponse.json({ searched, results });
}
