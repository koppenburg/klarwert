import { downloadPdf, findTariffDocuments, modelConfigFromEnv } from "@klarwert/extraction";
import { NextResponse, type NextRequest } from "next/server";
import { teamMemberOrNull } from "@/lib/auth";
import { isBlocked, prioritizeDocuments } from "@/lib/document-priority";
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

function hostOf(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return "?";
  }
}

/**
 * Dokumente eines Tarifkandidaten beschaffen.
 * 1. Ohne gespeicherte Links (oder auf ausdrücklichen Wunsch `search: true`) sucht die KI Links über die Produktseite.
 * 2. Die wichtigsten Links werden direkt geladen und als KANDIDATEN in der Bibliothek abgelegt.
 * Sperrt der Server des Versicherers automatisierte Abrufe, wird das respektiert: keine weiteren Versuche bei diesem
 * Host, der Berater lädt die Dokumente im Browser und lädt sie hoch.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await ctx.params;
  const search = Boolean(((await request.json().catch(() => ({}))) as { search?: boolean }).search);
  const { supabase } = auth;
  const { data: c } = await supabase
    .from("tariff_candidates")
    .select("id,name,code,generation_label,generation_id,product_url,documents,insurer:insurers(name)")
    .eq("id", id)
    .single<CandidateRow>();
  if (!c) return NextResponse.json({ error: "Kandidat nicht gefunden" }, { status: 404 });

  let links = c.documents ?? [];
  let searched = false;
  let remarks: string | null = null;
  let dropped = 0;
  if (links.length === 0 || search) {
    if (!env.anthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY ist nicht gesetzt." }, { status: 503 });
    try {
      const found = await findTariffDocuments({ insurer: c.insurer.name, tariff: c.name, tariffCode: c.code, generation: c.generation_label, productUrl: c.product_url }, modelConfigFromEnv());
      searched = true;
      remarks = found.remarks;
      dropped = found.dropped.length;
      const merged = [...links];
      for (const d of found.documents.filter((x) => x.matchesGeneration !== "nein")) if (!merged.some((m) => m.url === d.url)) merged.push({ url: d.url, title: d.title, kind: d.kind, fromSearchResults: true });
      links = merged;
      await supabase.from("tariff_candidates").update({ documents: merged }).eq("id", c.id);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Dokumentsuche fehlgeschlagen" }, { status: 502 });
    }
  }

  const results: Array<{ url: string; title: string; status: string }> = [];
  const blockedHosts = new Set<string>();
  for (const t of prioritizeDocuments(links, 6)) {
    if (blockedHosts.has(hostOf(t.url))) {
      results.push({ url: t.url, title: t.title, status: "nicht abrufbar: Server des Versicherers sperrt automatische Abrufe – bitte im Browser öffnen und hochladen" });
      continue;
    }
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
        searchMeta: { candidate: c.name, fetchedAt: new Date().toISOString() },
      });
      await supabase.from("library_documents").update({ tariff_candidate_id: c.id, ...(c.generation_id ? { generation_id: c.generation_id } : {}) }).eq("id", stored.id).is("tariff_candidate_id", null);
      results.push({ url: pdf.url, title: t.title, status: stored.duplicateOf ? "bereits in der Bibliothek" : `abgelegt (${stored.pageCount} Seiten)` });
    } catch (e) {
      const status = `nicht abrufbar: ${e instanceof Error ? e.message : "Fehler"}`;
      if (isBlocked(status)) blockedHosts.add(hostOf(t.url));
      results.push({ url: t.url, title: t.title, status });
    }
  }
  const stored = results.filter((r) => !r.status.startsWith("nicht")).length;
  return NextResponse.json({ searched, results, stored, dropped, remarks, blockedHosts: [...blockedHosts] });
}
