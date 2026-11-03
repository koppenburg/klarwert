"use client";

import { analyzeContract, COST_KIND_LABELS, COST_KINDS, type ContractModel, type ReturnAnalysis } from "@klarwert/calc";
import { useMemo, useState, useTransition } from "react";
import { CostStackChart, SurrenderChart, ValueLinesChart } from "@/components/charts/Charts";
import { AssumptionTag, Badge, Button, Card, cx, Field, inputClass, Notice, Table } from "@/components/ui";
import { analysisAssumptions, calendarYearOf, type AnalysisSettings } from "@/lib/analysis-settings";
import { euro, pct, pp } from "@/lib/format";
import { saveAnalysisSettings } from "./actions";
import { NumInput, NumListInput } from "./inputs";

export const PIB_TOLERANCE_PP = 0.1;

export function AnalysisView({
  caseId,
  model,
  hasState,
  warnings,
  initialSettings,
}: {
  caseId: string;
  model: ContractModel;
  hasState: boolean;
  warnings: string[];
  initialSettings: AnalysisSettings;
}) {
  const [s, setS] = useState<AnalysisSettings>(initialSettings);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const analysis = useMemo(() => analyzeContract(model, analysisAssumptions(model, s)), [model, s]);
  const defaultReturn = analysis.results.find((r) => r.isPib)?.grossReturnPercent ?? analysis.results.find((r) => r.grossReturnPercent === 4)?.grossReturnPercent ?? analysis.results[0]?.grossReturnPercent ?? 4;
  const [selected, setSelected] = useState<number>(defaultReturn);
  const current = analysis.results.find((r) => r.grossReturnPercent === selected) ?? analysis.results[0];
  const riester = model.layer === "riester";
  const cal = (y: number) => calendarYearOf(model, y);
  const set = <K extends keyof AnalysisSettings>(k: K, v: AnalysisSettings[K]) => {
    setS((prev) => ({ ...prev, [k]: v }));
    setSaved(null);
  };
  const setPerson = <K extends keyof AnalysisSettings["person"]>(k: K, v: AnalysisSettings["person"][K]) => {
    setS((prev) => ({ ...prev, person: { ...prev.person, [k]: v } }));
    setSaved(null);
  };

  return (
    <div className="space-y-5">
      {warnings.map((w) => (
        <Notice key={w} tone="warn">
          {w}
        </Notice>
      ))}
      <Card
        title="Annahmen der Berechnung"
        actions={
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await saveAnalysisSettings(caseId, s, { markAnalysed: true });
                setSaved(r.ok ? "Gespeichert – diese Annahmen gehen in den Report." : `Fehler: ${r.error}`);
              })
            }
          >
            {pending ? "Speichert …" : "Annahmen speichern"}
          </Button>
        }
      >
        <p className="mb-4 text-xs text-muted">
          Alle Eingaben hier sind Annahmen des Beraters <AssumptionTag /> und werden im Report so gekennzeichnet. Die Berechnung aktualisiert sich sofort.
        </p>
        {saved && <p className="mb-3 text-sm text-ok">{saved}</p>}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <Field label="Bruttorenditen (% p.a.)" hint={`Semikolon-getrennt${model.pib ? `; PIB-Satz ${pct(model.pib.grossReturnPercent)} wird ergänzt` : ""}`}>
            <NumListInput value={s.returns} onChange={(v) => set("returns", v.filter((x) => x > -50 && x < 30).slice(0, 6))} />
          </Field>
          <Field label="Alter bei Rentenbeginn">
            <NumInput value={s.retirementAge} onChange={(v) => v !== null && set("retirementAge", v)} />
          </Field>
          <Field label="Lebenserwartung (Alter)">
            <NumInput value={s.lifeExpectancyAge} onChange={(v) => v !== null && set("lifeExpectancyAge", v)} />
          </Field>
          <Field label="Auszahlplan bis Alter">
            <NumInput value={s.payoutPlanEndAge} onChange={(v) => v !== null && set("payoutPlanEndAge", v)} />
          </Field>
          <Field label="Kosten Auszahlplan (% p.a.)">
            <NumInput value={s.payoutPlanCostPercent} onChange={(v) => v !== null && set("payoutPlanCostPercent", v)} />
          </Field>
          <Field label="Rendite Auszahlphase (% p.a.)" hint="leer = wie Ansparphase">
            <NumInput allowEmpty value={s.payoutGrossReturnPercent} onChange={(v) => set("payoutGrossReturnPercent", v)} />
          </Field>
          {riester && (
            <>
              <Field label="Vorjahreseinkommen (€)" hint="beitragspflichtig, für die 4-%-Regel">
                <NumInput value={s.person.previousYearIncome} onChange={(v) => v !== null && setPerson("previousYearIncome", v)} />
              </Field>
              <Field label="Kinder: Geburtsjahre" hint="Semikolon-getrennt, z. B. 2012; 2016">
                <NumListInput value={s.person.children.map((c) => c.birthYear)} onChange={(v) => setPerson("children", v.filter((y) => y > 1950 && y < 2100).map((birthYear) => ({ birthYear })))} />
              </Field>
              <Field label="zulageberechtigt">
                <select className={inputClass} value={s.person.eligible ? "ja" : "nein"} onChange={(e) => setPerson("eligible", e.target.value === "ja")}>
                  <option value="ja">ja</option>
                  <option value="nein">nein</option>
                </select>
              </Field>
              <Field label="Berufseinsteigerbonus im Jahr" hint="leer = keiner">
                <NumInput allowEmpty value={s.person.starterBonusYear} onChange={(v) => setPerson("starterBonusYear", v)} />
              </Field>
              <Field label="Neues Förderrecht im Vertrag ab" hint="leer = altes Recht (Bestandsschutz)">
                <NumInput allowEmpty value={s.newRuleFromYear} onChange={(v) => set("newRuleFromYear", v)} />
              </Field>
              <Field label="erhaltene Steuervorteile (€)" hint="für die Nettoauszahlung bei Kündigung">
                <NumInput value={s.taxBenefitsReceived} onChange={(v) => v !== null && set("taxBenefitsReceived", v)} />
              </Field>
            </>
          )}
        </div>
      </Card>

      <EffectiveCostsSummary results={analysis.results} pib={model.pib} pibDeviation={analysis.pibDeviationPp} selected={current?.grossReturnPercent ?? null} onSelect={setSelected} />

      {current && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Details für Bruttorendite:</span>
            {analysis.results.map((r) => (
              <button
                key={r.grossReturnPercent}
                onClick={() => setSelected(r.grossReturnPercent)}
                className={cx("rounded border px-2.5 py-1", r.grossReturnPercent === current.grossReturnPercent ? "border-brand bg-brand-soft font-semibold text-brand" : "border-line bg-white")}
              >
                {pct(r.grossReturnPercent, 1)}
                {r.isPib ? " (PIB)" : ""}
              </button>
            ))}
          </div>
          <CostDetail result={current} riester={riester} />
          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Kosten je Art pro Jahr">
              <CostStackChart years={current.simulation.years} calendarYear={cal} size={{ height: 300 }} />
            </Card>
            <Card title="Kosten je Art kumuliert">
              <CostStackChart years={current.simulation.years} mode="cumulative" calendarYear={cal} size={{ height: 300 }} />
            </Card>
            <Card title="Brutto- und Nettoguthaben">
              <ValueLinesChart years={current.simulation.years} calendarYear={cal} size={{ height: 300 }} />
            </Card>
            <Card title={`Rückkaufswert${current.breakEvenYear ? ` · Break-even ${cal(current.breakEvenYear)}` : " · kein Break-even in der Laufzeit"}`}>
              <SurrenderChart curve={current.surrenderCurve} breakEvenYear={current.breakEvenYear} calendarYear={cal} size={{ height: 300 }} />
            </Card>
          </div>
          <PayoutCard result={current} settings={s} />
          <YearTable result={current} riester={riester} calendarYear={cal} />
        </>
      )}
      {!hasState && <Notice tone="brand">Für Depot-Szenarien fehlt ein aktuelles Guthaben mit Stichtag (Schritt Erkennung).</Notice>}
    </div>
  );
}

export function EffectiveCostsSummary({
  results,
  pib,
  pibDeviation,
  selected,
  onSelect,
}: {
  results: ReturnAnalysis[];
  pib?: ContractModel["pib"];
  pibDeviation: number | null;
  selected?: number | null;
  onSelect?: (r: number) => void;
}) {
  return (
    <Card title="Effektivkosten und Ergebnis je Bruttorendite">
      <Table>
        <thead>
          <tr>
            <th>Bruttorendite</th>
            <th className="text-right">Effektivkosten p.a.</th>
            <th className="text-right">Rendite nach Kosten</th>
            <th className="text-right">Einzahlungen</th>
            <th className="text-right">Kosten gesamt</th>
            <th className="text-right">Endkapital brutto</th>
            <th className="text-right">Endkapital netto</th>
            <th className="text-right">Rente garantiert</th>
            <th className="text-right">Rente aktuell</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const paid = r.simulation.ownPremiumsTotal + r.simulation.allowancesTotal;
            return (
              <tr key={r.grossReturnPercent} className={cx(onSelect && "cursor-pointer hover:bg-brand-soft/40", selected === r.grossReturnPercent && "bg-brand-soft/60")} onClick={() => onSelect?.(r.grossReturnPercent)}>
                <td className="tabular">
                  {pct(r.grossReturnPercent, 1)} {r.isPib && <Badge tone="brand">PIB-Satz</Badge>}
                </td>
                <td className="tabular text-right font-semibold">{pp(r.effectiveCosts.reductionInYieldPp)}</td>
                <td className="tabular text-right">{pct(r.effectiveCosts.netIrrPercent)}</td>
                <td className="tabular text-right">{euro(paid)}</td>
                <td className="tabular text-right">{euro(r.simulation.costsTotalSum)}</td>
                <td className="tabular text-right">{euro(r.simulation.finalValueGross)}</td>
                <td className="tabular text-right">{euro(r.simulation.finalValueNet)}</td>
                <td className="tabular text-right">{r.annuity.monthlyGuaranteed === null ? "–" : `${euro(r.annuity.monthlyGuaranteed)}/Monat`}</td>
                <td className="tabular text-right">{r.annuity.monthlyCurrent === null ? "–" : `${euro(r.annuity.monthlyCurrent)}/Monat`}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {pib && <PibCheck pib={pib} deviation={pibDeviation} />}
      <p className="mt-3 text-xs text-muted">
        Effektivkosten = Renditeminderung p.a. bis Rentenbeginn: interner Zinsfuß ohne Kosten minus interner Zinsfuß mit allen Kosten (§ 2 Abs. 1 Nr. 9 VVG-InfoV). Monatsgenaue Simulation; Steuern nicht berücksichtigt.
      </p>
    </Card>
  );
}

export function PibCheck({ pib, deviation }: { pib: NonNullable<ContractModel["pib"]>; deviation: number | null }) {
  const ok = deviation !== null && Math.abs(deviation) <= PIB_TOLERANCE_PP;
  return (
    <div className="mt-4">
      <Notice tone={ok ? "ok" : "warn"} title="Plausibilitätsabgleich mit dem Produktinformationsblatt">
        Ausgewiesen: {pp(pib.effectiveCostsPp)} bei {pct(pib.grossReturnPercent, 1)} Wertentwicklung vor Kosten. Berechnet: {deviation === null ? "–" : pp(pib.effectiveCostsPp + deviation)}. Abweichung: {deviation === null ? "–" : pp(deviation)}.
        {!ok && deviation !== null && (
          <span className="block pt-1">
            Abweichung größer als {pp(PIB_TOLERANCE_PP, 1)}: Kostenfaktoren, Laufzeit, Beitrag und Fondskosten prüfen. Häufige Ursachen: PIB rechnet mit Musterbeitrag/Musterlaufzeit oder anderen Fondskosten.
          </span>
        )}
      </Notice>
    </div>
  );
}

export function CostDetail({ result, riester }: { result: ReturnAnalysis; riester: boolean }) {
  const sim = result.simulation;
  const paid = sim.ownPremiumsTotal + sim.allowancesTotal;
  const byKind = result.effectiveCosts.byKind;
  const kinds = COST_KINDS.filter((k) => Math.abs(sim.costsTotal[k]) > 0.005 || Math.abs(byKind?.[k] ?? 0) > 0.00005);
  return (
    <Card title={`Kosten je Art bei ${pct(result.grossReturnPercent, 1)} Bruttorendite`}>
      <Table>
        <thead>
          <tr>
            <th>Kostenart</th>
            <th className="text-right">Summe in €</th>
            <th className="text-right">in % der Einzahlungen</th>
            <th className="text-right">Anteil Effektivkosten (Näherung)</th>
          </tr>
        </thead>
        <tbody>
          {kinds.map((k) => (
            <tr key={k}>
              <td>{COST_KIND_LABELS[k]}</td>
              <td className="tabular text-right">{euro(sim.costsTotal[k])}</td>
              <td className="tabular text-right">{paid > 0 ? pct((sim.costsTotal[k] / paid) * 100) : "–"}</td>
              <td className="tabular text-right">{byKind ? pp(byKind[k]) : "–"}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td>Summe direkte Kosten</td>
            <td className="tabular text-right">{euro(sim.costsTotalSum)}</td>
            <td className="tabular text-right">{paid > 0 ? pct((sim.costsTotalSum / paid) * 100) : "–"}</td>
            <td className="tabular text-right">{pp(result.effectiveCosts.reductionInYieldPp)}</td>
          </tr>
          <tr>
            <td>Renditeverlust durch Kosten (Brutto − Netto − direkte Kosten)</td>
            <td className="tabular text-right">{euro(sim.finalValueGross - sim.finalValueNet - sim.costsTotalSum)}</td>
            <td className="tabular text-right" />
            <td />
          </tr>
          <tr className="font-semibold">
            <td>Differenz Brutto- zu Nettoendkapital</td>
            <td className="tabular text-right">{euro(sim.finalValueGross - sim.finalValueNet)}</td>
            <td className="tabular text-right">{paid > 0 ? pct(((sim.finalValueGross - sim.finalValueNet) / paid) * 100) : "–"}</td>
            <td />
          </tr>
        </tbody>
      </Table>
      <p className="mt-3 text-xs text-muted">
        Einzahlungen = Eigenbeiträge {euro(sim.ownPremiumsTotal)}
        {riester ? ` + Zulagen ${euro(sim.allowancesTotal)}` : ""}. Zerlegung der Effektivkosten: sequentiell in der Reihenfolge α, β, γ, κ, Fonds, Garantie, Beitragsfreistellung – Summe exakt, Aufteilung als Näherung.
      </p>
    </Card>
  );
}

export function PayoutCard({ result, settings }: { result: ReturnAnalysis; settings: AnalysisSettings }) {
  const a = result.annuity;
  const p = result.payoutComparison;
  return (
    <Card title="Rentenphase: Rente und Auszahlplan">
      <div className="grid gap-5 md:grid-cols-2">
        <Table>
          <tbody>
            <tr>
              <td>Kapital zu Rentenbeginn (nach Kosten)</td>
              <td className="tabular text-right font-semibold">{euro(a.capital)}</td>
            </tr>
            <tr>
              <td>Monatsrente garantiert</td>
              <td className="tabular text-right">{a.monthlyGuaranteed === null ? "nicht angegeben" : euro(a.monthlyGuaranteed, true)}</td>
            </tr>
            <tr>
              <td>Monatsrente mit aktuellem Rentenfaktor (nicht garantiert)</td>
              <td className="tabular text-right">{a.monthlyCurrent === null ? "nicht angegeben" : euro(a.monthlyCurrent, true)}</td>
            </tr>
            <tr>
              <td>Verwaltungskosten Rentenphase p.a.</td>
              <td className="tabular text-right">{euro(a.annualAnnuityCosts, true)}</td>
            </tr>
            <tr>
              <td>Kapitalabfindung nach Kosten</td>
              <td className="tabular text-right">{euro(a.lumpSumNet)}</td>
            </tr>
          </tbody>
        </Table>
        {p ? (
          <Table>
            <tbody>
              <tr>
                <td>
                  Auszahlplan bis {settings.payoutPlanEndAge}: monatlich <AssumptionTag />
                </td>
                <td className="tabular text-right">{euro(p.payoutPlanMonthly, true)}</td>
              </tr>
              <tr>
                <td>Summe Renten bis Alter {settings.lifeExpectancyAge} (mind. Garantiezeit)</td>
                <td className="tabular text-right">{euro(p.annuityTotalToLifeExpectancy)}</td>
              </tr>
              <tr>
                <td>Summe Auszahlplan bis Alter {settings.lifeExpectancyAge} (inkl. Restkapital)</td>
                <td className="tabular text-right">{euro(p.payoutPlanTotalToLifeExpectancy)}</td>
              </tr>
              <tr>
                <td>Rente hat das Kapital ausgezahlt mit Alter</td>
                <td className="tabular text-right">{p.annuityBreakEvenAge === null ? "–" : p.annuityBreakEvenAge.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</td>
              </tr>
              {p.payoutPlanGapMonths > 0 && (
                <tr>
                  <td>Monate ohne Auszahlplan-Einkommen bis zur Lebenserwartung</td>
                  <td className="tabular text-right">{p.payoutPlanGapMonths}</td>
                </tr>
              )}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted">Für den Vergleich Rente gegen Auszahlplan fehlt ein Rentenfaktor.</p>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">Die lebenslange Rente sichert das Langlebigkeitsrisiko ab; der Auszahlplan endet mit dem gewählten Alter. Steuern und Sozialabgaben nicht berücksichtigt.</p>
    </Card>
  );
}

export function YearTable({ result, riester, calendarYear }: { result: ReturnAnalysis; riester: boolean; calendarYear: (y: number) => number }) {
  const [open, setOpen] = useState(false);
  const rows = result.simulation.years;
  const curve = new Map(result.surrenderCurve.map((p) => [p.year, p]));
  return (
    <Card title="Jahresverlauf" actions={<Button variant="secondary" onClick={() => setOpen((o) => !o)}>{open ? "Einklappen" : "Alle Jahre anzeigen"}</Button>}>
      <Table>
        <thead>
          <tr>
            <th>Jahr</th>
            <th className="text-right">Eigenbeiträge kum.</th>
            {riester && <th className="text-right">Zulagen kum.</th>}
            <th className="text-right">Kosten im Jahr</th>
            <th className="text-right">Kosten kum.</th>
            <th className="text-right">Guthaben brutto</th>
            <th className="text-right">Guthaben netto</th>
            <th className="text-right">Rückkaufswert</th>
            {riester && <th className="text-right">nach Förderrückzahlung</th>}
          </tr>
        </thead>
        <tbody>
          {(open ? rows : rows.filter((r, i) => i < 5 || r.year % 5 === 0 || i === rows.length - 1)).map((y) => (
            <tr key={y.year} className={y.year === result.breakEvenYear ? "bg-green-50" : undefined}>
              <td className="tabular">
                {calendarYear(y.year)} <span className="text-muted">({y.year}.)</span>
              </td>
              <td className="tabular text-right">{euro(y.ownPremiumsCum)}</td>
              {riester && <td className="tabular text-right">{euro(y.allowancesCum)}</td>}
              <td className="tabular text-right">{euro(y.costsTotal)}</td>
              <td className="tabular text-right">{euro(y.costsTotalCum)}</td>
              <td className="tabular text-right">{euro(y.valueGross)}</td>
              <td className="tabular text-right">{euro(y.valueNet)}</td>
              <td className="tabular text-right">{euro(y.surrenderValue)}</td>
              {riester && <td className="tabular text-right">{euro(curve.get(y.year)?.netAfterSubsidyRepayment ?? null)}</td>}
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="mt-2 text-xs text-muted">Break-even = erstes Jahr, in dem der Rückkaufswert{riester ? " nach Rückzahlung der Förderung" : ""} die Summe der Eigenbeiträge erreicht{result.breakEvenYear ? ` (grün markiert)` : ""}.</p>
    </Card>
  );
}
