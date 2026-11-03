"use client";

import { defaultSwitchMonth, type ContractState } from "@klarwert/calc";
import { avDepot, subsidyNew, transfer } from "@klarwert/legal-config";
import { useMemo, useState, useTransition } from "react";
import { NumInput, NumListInput } from "@/components/analysis/inputs";
import { saveAnalysisSettings } from "@/components/analysis/actions";
import { ScenarioBars } from "@/components/charts/Charts";
import { AssumptionTag, Badge, Button, Card, Field, inputClass, Notice } from "@/components/ui";
import { computeScenarios, type AnalysisSettings } from "@/lib/analysis-settings";
import { euro, pct } from "@/lib/format";
import { ScenarioTable, SensitivityTable } from "./ScenarioTables";

export function ScenarioView({ caseId, state, initialSettings }: { caseId: string; state: ContractState; initialSettings: AnalysisSettings }) {
  const [s, setS] = useState<AnalysisSettings>(initialSettings);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const result = useMemo(() => computeScenarios(state, s), [state, s]);
  const riester = state.layer === "riester";
  const set = <K extends keyof AnalysisSettings>(k: K, v: AnalysisSettings[K]) => {
    setS((p) => ({ ...p, [k]: v }));
    setSaved(null);
  };
  const setDepot = <K extends keyof AnalysisSettings["depot"]>(k: K, v: AnalysisSettings["depot"][K]) => {
    setS((p) => ({ ...p, depot: { ...p.depot, [k]: v } }));
    setSaved(null);
  };
  const setPerson = <K extends keyof AnalysisSettings["person"]>(k: K, v: AnalysisSettings["person"][K]) => {
    setS((p) => ({ ...p, person: { ...p.person, [k]: v } }));
    setSaved(null);
  };
  const switchMonth = defaultSwitchMonth(state);
  const switchDate = new Date(Date.UTC(state.startYear, state.startMonth - 1 + switchMonth, 1)).toISOString().slice(0, 7);
  const depotRunning = s.depot.costPercent + s.depot.fundTerPercent;
  const cap = avDepot.standardDepotCostCapPercent.value;

  return (
    <div className="space-y-5">
      <Card
        title="Annahmen der Szenarien"
        actions={
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await saveAnalysisSettings(caseId, s);
                setSaved(r.ok ? "Gespeichert – diese Annahmen gehen in den Report." : `Fehler: ${r.error}`);
              })
            }
          >
            {pending ? "Speichert …" : "Annahmen speichern"}
          </Button>
        }
      >
        <p className="mb-4 text-xs text-muted">
          Gemeinsame Basis aller Szenarien: Stichtag mit Guthaben {euro(state.currentValue)}, gleiche Eigenbeiträge, gleiche Bruttorendite, gleicher Rentenbeginn. Wechsel frühestens zum Marktstart des Altersvorsorgedepots ({switchDate}). Depot-Kosten sind produktabhängig und vor
          Marktstart unbekannt – alle Werte sind Annahmen <AssumptionTag />.
        </p>
        {saved && <p className="mb-3 text-sm text-ok">{saved}</p>}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <Field label="Bruttorendite (% p.a.)">
            <NumInput value={s.scenarioReturnPercent} onChange={(v) => v !== null && set("scenarioReturnPercent", v)} />
          </Field>
          <Field label="Übertragungs-/Rückkaufswert (€)" hint={`leer = ${state.surrenderValue !== undefined ? `Rückkaufswert ${euro(state.surrenderValue)}` : "aus Stornoregeln berechnet"}`}>
            <NumInput allowEmpty value={s.transferValue} onChange={(v) => set("transferValue", v)} />
          </Field>
          {riester && (
            <>
              <Field label="Wechselkosten abgebend (€)" hint={`leer = max. ${transfer.outgoingFeeMax.value} €`}>
                <NumInput allowEmpty value={s.outgoingFeeEur} onChange={(v) => set("outgoingFeeEur", v)} />
              </Field>
              <Field label="Pauschale aufnehmend (€)" hint={`leer = max. ${transfer.incomingFeeMax.value} €`}>
                <NumInput allowEmpty value={s.incomingFeeEur} onChange={(v) => set("incomingFeeEur", v)} />
              </Field>
            </>
          )}
          <Field label="Depot: Verwaltungskosten (% p.a.)">
            <NumInput value={s.depot.costPercent} onChange={(v) => v !== null && setDepot("costPercent", v)} />
          </Field>
          <Field label="Depot: Fondskosten TER (% p.a.)">
            <NumInput value={s.depot.fundTerPercent} onChange={(v) => v !== null && setDepot("fundTerPercent", v)} />
          </Field>
          <Field label="Depot: feste Kosten (€ p.a.)">
            <NumInput value={s.depot.kappaEurPerYear} onChange={(v) => v !== null && setDepot("kappaEurPerYear", v)} />
          </Field>
          <Field label="Depot: Abschlusskosten (% je Beitrag)" hint="nur auf neue Beiträge, nie auf übertragenes Kapital">
            <NumInput value={s.depot.alphaPercentOfPremium} onChange={(v) => v !== null && setDepot("alphaPercentOfPremium", v)} />
          </Field>
          <Field label="Depot: Beitragserhalt">
            <select className={inputClass} value={s.depot.guaranteeLevel} onChange={(e) => setDepot("guaranteeLevel", Number(e.target.value) as 0 | 80 | 100)}>
              <option value={0}>ohne Garantie</option>
              <option value={80}>80 % Beitragserhalt</option>
              <option value={100}>100 % Beitragserhalt</option>
            </select>
          </Field>
          {s.depot.guaranteeLevel > 0 && (
            <Field label="Depot: Garantiekosten (% p.a.)">
              <NumInput value={s.depot.guaranteeCostPercent} onChange={(v) => v !== null && setDepot("guaranteeCostPercent", v)} />
            </Field>
          )}
          <Field label="Produkt">
            <select className={inputClass} value={s.depot.isStandardDepot ? "std" : "frei"} onChange={(e) => setDepot("isStandardDepot", e.target.value === "std")}>
              <option value="frei">Altersvorsorgedepot (frei)</option>
              <option value="std">Standarddepot (Kostendeckel)</option>
            </select>
          </Field>
          <Field label="zulageberechtigt">
            <select className={inputClass} value={s.person.eligible ? "ja" : "nein"} onChange={(e) => setPerson("eligible", e.target.value === "ja")}>
              <option value="ja">ja</option>
              <option value="nein">nein</option>
            </select>
          </Field>
          <Field label="Kinder: Geburtsjahre" hint="Semikolon-getrennt">
            <NumListInput value={s.person.children.map((c) => c.birthYear)} onChange={(v) => setPerson("children", v.filter((y) => y > 1950 && y < 2100).map((birthYear) => ({ birthYear })))} />
          </Field>
          {riester && (
            <Field label="Vorjahreseinkommen (€)" hint="4-%-Regel im alten Recht">
              <NumInput value={s.person.previousYearIncome} onChange={(v) => v !== null && setPerson("previousYearIncome", v)} />
            </Field>
          )}
          <Field label="Lesart Kinderzulage (neues Recht)" hint="bitte prüfen – Auslegung § 85 Abs. 1 EStG n. F. offen">
            <select className={inputClass} value={s.childReading} onChange={(e) => set("childReading", e.target.value === "shared" ? "shared" : "per_child_full")}>
              <option value="per_child_full">je Kind 100 % der Beiträge (max. 300 €)</option>
              <option value="shared">Summe aller Kinderzulagen höchstens Eigenbeitrag</option>
            </select>
          </Field>
          <Field label="Sensitivität: Renditen (% p.a.)">
            <NumListInput value={s.sensitivityReturns} onChange={(v) => set("sensitivityReturns", v.slice(0, 6))} />
          </Field>
          <Field label="Sensitivität: Rentenbeginn ± Jahre">
            <NumListInput value={s.sensitivityShiftsYears} onChange={(v) => set("sensitivityShiftsYears", v.slice(0, 5))} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Badge tone="warn">bitte prüfen: Lesart Kinderzulage</Badge>
          {riester && <Badge tone="warn">bitte prüfen: Wechselkosten Bestandsvertrag (D1/D2)</Badge>}
          <Badge tone="neutral">Mindesteigenbeitrag neu: {subsidyNew.minOwnContribution.value} € p.a.</Badge>
          <Badge tone="neutral">Einzahlungsgrenze Depot: {subsidyNew.annualContributionCap.value.toLocaleString("de-DE")} € p.a.</Badge>
        </div>
        {s.depot.isStandardDepot && depotRunning > cap && (
          <div className="mt-3">
            <Notice tone="warn">
              Angenommene laufende Depot-Kosten ({pct(depotRunning)}) liegen über dem gesetzlichen Kostendeckel des Standarddepots ({pct(cap, 1)} Effektivkosten, § 2a Abs. 2 AltZertG n. F.). Annahme prüfen.
            </Notice>
          </div>
        )}
      </Card>

      <Card title="Szenarien im Überblick">
        <ScenarioTable results={result.results} />
        <div className="mt-5">
          <ScenarioBars scenarios={result.results} size={{ height: 280 }} />
        </div>
        <p className="mt-3 text-xs text-muted">Neutrale Darstellung: Reihenfolge fest, kein Szenario wird hervorgehoben oder empfohlen. Die Produktentscheidung trifft der Berater im Kundengespräch.</p>
      </Card>

      <Card title="Hinweise je Szenario">
        <div className="grid gap-4 md:grid-cols-2">
          {result.results.map((r) => (
            <div key={r.id} className="rounded-md border border-line p-4 text-sm">
              <p className="font-semibold">{r.label}</p>
              <p className="mt-1 text-muted">{r.description}</p>
              {r.guaranteeNote && (
                <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-warn">
                  <strong>Garantie:</strong> {r.guaranteeNote}
                </p>
              )}
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
                {r.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Sensitivität: Endkapital nach Bruttorendite und Rentenbeginn">
        <SensitivityTable cells={result.sensitivity} results={result.results} />
      </Card>
    </div>
  );
}
