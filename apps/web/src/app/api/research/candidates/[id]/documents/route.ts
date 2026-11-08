import { downloadPdf, findTariffDocuments, modelConfigFromEnv } from "@klarwert/extraction";
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
  product_url: string | null;
  documents: Array<{ url: string; title: string; kind: Kind; fromSearchResults?: boolean }>;
  insurer: { name: string };
}

const MAX_DOWNLOADS = 6;

/**
 * Dokumente eines Tarifkandidaten beschaffen: zuerst die Links aus der Recherche, sonst Produktseite öffnen
 * (web_fetch) bzw. gezielt suchen. PDFs werden als KANDIDATEN in der Bibliothek abgelegt.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await ctx.params;
  const { supabase } = auth;
  const { data: c } = await supabase
    .from("tariff_candidates")
    .select("id,name,code,generation_label,generation_id,product_url,documents,insurer:insurers(name)")
    .eq("id", id)
    .single<CandidateRow>();
  if (!c) return NextResponse.json({ error: "Kandidat nicht gefunden" }, { status: 404 });

  const results: Array<{ url: string; title: string; status: string }> = [];
  const tried = new Set<string>();
  const fetchAndStore = async (t: { url: string; title: string; kind: Kind; reason?: string }) => {
    if (tried.has(t.url) || tried.size >= MAX_DOWNLOADS) return;
    tried.add(t.url);
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
  };

  for (const t of (c.documents ?? []).slice(0, MAX_DOWNLOADS)) await fetchAndStore(t);
  const ok = () => results.filter((r) => !r.status.startsWith("nicht")).length;

  let searched = false;
  let remarks: string | null = null;
  let dropped: string[] = [];
  if (ok() < 2 && env.anthropicConfigured()) {
    try {
      const found = await findTariffDocuments({ insurer: c.insurer.name, tariff: c.name, tariffCode: c.code, generation: c.generation_label, productUrl: c.product_url }, modelConfigFromEnv());
      searched = true;
      remarks = found.remarks;
      dropped = found.dropped;
      const links = found.documents.filter((d) => d.matchesGeneration !== "nein");
      // gefundene Links am Kandidaten vermerken (Nachvollziehbarkeit)
      const merged = [...(c.documents ?? [])];
      for (const d of links) if (!merged.some((m) => m.url === d.url)) merged.push({ url: d.url, title: d.title, kind: d.kind, fromSearchResults: true });
      await supabase.from("tariff_candidates").update({ documents: merged }).eq("id", c.id);
      for (const d of links) await fetchAndStore({ url: d.url, title: d.title, kind: d.kind, reason: d.reason });
    } catch (e) {
      if (results.length === 0) return NextResponse.json({ error: e instanceof Error ? e.message : "Dokumentsuche fehlgeschlagen" }, { status: 502 });
    }
  } else if (ok() < 2 && results.length === 0) {
    return NextResponse.json({ error: "Keine Dokument-Links und ANTHROPIC_API_KEY nicht gesetzt." }, { status: 503 });
  }
  return NextResponse.json({ searched, results, stored: ok(), dropped: dropped.length, remarks });
}
