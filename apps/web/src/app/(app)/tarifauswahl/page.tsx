import { buildSelectionCandidate, COST_FIELDS } from "@klarwert/extraction";
import type { ContractLayer, SelectionCandidate } from "@klarwert/calc";
import { SelectionView, type CandidatePayload, type SavedSelection } from "@/components/selection/SelectionView";
import { requireTeamMember } from "@/lib/auth";
import { DEFAULT_SETTINGS } from "@/lib/analysis-settings";

export const metadata = { title: "Tarifauswahl" };

interface GenRow {
  id: string;
  label: string;
  tariff: { name: string; code: string | null; layer: ContractLayer; insurer: { name: string } };
}

export default async function SelectionPage({ searchParams }: { searchParams: Promise<{ auswahl?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireTeamMember();
  const [{ data: gens }, { data: items }, { data: saved }, { data: cases }] = await Promise.all([
    supabase.from("tariff_generations").select("id,label,tariff:tariffs(name,code,layer,insurer:insurers(name))").returns<GenRow[]>(),
    supabase.from("cost_items").select("generation_id,key,value,status").not("generation_id", "is", null).neq("status", "rejected"),
    supabase.from("selections").select("id,title,case_id,profile,created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("cases").select("id,case_number,title").order("updated_at", { ascending: false }).limit(100),
  ]);
  const fundLabel = COST_FIELDS.find((f) => f.key === "fund.terPercent")?.label ?? "Fondskosten";
  const candidates: CandidatePayload[] = (gens ?? []).map((g) => {
    const records = (items ?? []).filter((i) => i.generation_id === g.id).map((i) => ({ key: i.key as string, value: i.value, status: i.status as "proposed" | "confirmed" }));
    const c: SelectionCandidate = buildSelectionCandidate(
      { id: g.id, label: `${g.tariff.insurer.name} · ${g.tariff.name}${g.tariff.code ? ` (${g.tariff.code})` : ""} · ${g.label}`, layer: g.tariff.layer },
      records,
    );
    return { candidate: c, fundMissing: !records.some((r) => r.key === "fund.terPercent" && r.status === "confirmed"), href: `/bibliothek/${g.id}` };
  });
  const loaded = sp.auswahl ? ((saved ?? []).find((s) => s.id === sp.auswahl) ?? null) : null;
  return (
    <SelectionView
      candidates={candidates}
      fundLabel={fundLabel}
      depotDefaults={DEFAULT_SETTINGS.depot}
      saved={(saved ?? []) as SavedSelection[]}
      cases={(cases ?? []).map((c) => ({ id: c.id as string, label: `${c.case_number} – ${c.title ?? "ohne Bezeichnung"}` }))}
      initialProfile={loaded?.profile ?? null}
    />
  );
}
