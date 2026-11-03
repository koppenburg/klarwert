import Link from "next/link";
import { CompareView, type CompareItem } from "@/components/compare/CompareView";
import { Button, Card, Notice } from "@/components/ui";
import { buildForBundle, settingsForBundle } from "@/lib/analysis";
import { requireTeamMember } from "@/lib/auth";
import { loadCaseBundle } from "@/lib/data";

export const metadata = { title: "Vergleich" };

interface CaseListRow {
  id: string;
  case_number: string;
  title: string | null;
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ faelle?: string | string[] }> }) {
  const { supabase } = await requireTeamMember();
  const sp = await searchParams;
  const raw = Array.isArray(sp.faelle) ? sp.faelle : sp.faelle ? sp.faelle.split(",") : [];
  const selected = [...new Set(raw.filter(Boolean))].slice(0, 3);
  const { data: cases } = await supabase
    .from("cases")
    .select("id,case_number,title")
    .not("fields_confirmed_at", "is", null)
    .not("costs_confirmed_at", "is", null)
    .order("updated_at", { ascending: false })
    .returns<CaseListRow[]>();

  const items: CompareItem[] = [];
  const problems: string[] = [];
  if (selected.length >= 2) {
    for (const id of selected) {
      const bundle = await loadCaseBundle(supabase, id);
      if (!bundle) continue;
      const b = buildForBundle(bundle, settingsForBundle(bundle));
      if (!b.ok) {
        problems.push(`${bundle.case.case_number}: ${b.gate.messages.join(" · ")}`);
        continue;
      }
      items.push({
        id,
        caseNumber: bundle.case.case_number,
        label: `${bundle.case.case_number} ${bundle.generation ? bundle.generation.tariff.name : (bundle.case.title ?? "")}`.trim(),
        costs: b.built.model.costs,
        elapsedMonths: b.built.state?.elapsedMonths,
        currentValue: b.built.state?.currentValue,
        remainingMonths: b.built.state ? b.built.state.termMonths - b.built.state.elapsedMonths : null,
      });
    }
  }

  return (
    <div className="space-y-5">
      <Card title="Verträge vergleichen (2–3)">
        <form className="space-y-3">
          <p className="text-sm text-muted">Auswählbar sind nur Fälle mit vollständig bestätigten Vertragsdaten und Kostenfaktoren.</p>
          {cases && cases.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-3">
              {cases.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded border border-line px-3 py-2 text-sm">
                  <input type="checkbox" name="faelle" value={c.id} defaultChecked={selected.includes(c.id)} />
                  <span className="font-mono text-xs">{c.case_number}</span>
                  <span>{c.title ?? "–"}</span>
                </label>
              ))}
            </div>
          ) : (
            <Notice tone="brand">Noch keine Fälle mit bestätigten Kostenfaktoren.</Notice>
          )}
          <Button type="submit">Vergleichen</Button>
        </form>
      </Card>
      {selected.length === 1 && <Notice tone="warn">Bitte mindestens zwei Fälle auswählen.</Notice>}
      {raw.length > 3 && <Notice tone="warn">Höchstens drei Fälle – es werden die ersten drei verglichen.</Notice>}
      {problems.map((p) => (
        <Notice key={p} tone="warn">
          {p}
        </Notice>
      ))}
      {items.length >= 2 && <CompareView items={items} />}
      {items.length >= 2 && (
        <p className="text-xs text-muted">
          Einzelanalysen:{" "}
          {items.map((i) => (
            <Link key={i.id} href={`/faelle/${i.id}?schritt=analyse`} className="mr-3 text-brand underline">
              {i.caseNumber}
            </Link>
          ))}
        </p>
      )}
    </div>
  );
}
