"use client";

import {
  DEFAULT_RETURN_BY_RISK_CLASS,
  depotCandidate,
  ESG_LABELS,
  runSelection,
  type ContractLayer,
  type DepotAssumptions,
  type EsgLevel,
  type PaymentFrequency,
  type SelectionCandidate,
  type SelectionProfile,
  type SelectionResult,
  type SelectionSortKey,
} from "@klarwert/calc";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { deleteSelection, saveSelection } from "@/app/(app)/tarifauswahl/actions";
import { euro, pp } from "@/lib/format";
import { NumInput, NumListInput } from "../analysis/inputs";
import { AssumptionTag, Badge, Button, Card, Field, inputClass, Notice, Table } from "../ui";

export interface CandidatePayload {
  candidate: SelectionCandidate;
  fundMissing: boolean;
  href: string;
}

export interface SavedSelection {
  id: string;
  title: string;
  case_id: string | null;
  profile: unknown;
  created_at: string;
}

/** Fragebogen (serialisierbar, wird mit der Auswahl gespeichert). Enthält keine Namen. */
export interface SelectionForm {
  startDate: string;
  entryAge: number;
  retirementAge: number;
  amount: number;
  frequency: PaymentFrequency;
  dynamicsPercent: number;
  singlePremium: number;
  layer: ContractLayer | "any";
  guaranteeMinPercent: 0 | 80 | 100;
  esg: EsgLevel;
  riskClass: number | null;
  lumpSumOption: boolean;
  withdrawals: boolean;
  contributionPause: boolean;
  guaranteePeriodYears: number;
  deathBenefitBeforeRetirement: boolean;
  eligible: boolean;
  childrenBirthYears: number[];
  previousYearIncome: number;
  grossReturnOverride: number | null;
  lifeExpectancyAge: number;
  fundTerFallback: number | null;
  depot: DepotAssumptions;
  includeDepot: boolean;
}

function nextMonthStart(): string {
  const d = new Date();
  const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
  const m = d.getMonth() === 11 ? 1 : d.getMonth() + 2;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function defaultForm(depot: DepotAssumptions): SelectionForm {
  return {
    startDate: nextMonthStart(),
    entryAge: 35,
    retirementAge: 67,
    amount: 150,
    frequency: "monthly",
    dynamicsPercent: 0,
    singlePremium: 0,
    layer: "any",
    guaranteeMinPercent: 0,
    esg: "none",
    riskClass: null,
    lumpSumOption: false,
    withdrawals: false,
    contributionPause: false,
    guaranteePeriodYears: 0,
    deathBenefitBeforeRetirement: false,
    eligible: true,
    childrenBirthYears: [],
    previousYearIncome: 40_000,
    grossReturnOverride: null,
    lifeExpectancyAge: 87,
    fundTerFallback: null,
    depot,
    includeDepot: true,
  };
}

const LAYERS: Array<[ContractLayer | "any", string]> = [
  ["any", "offen (alle Schichten)"],
  ["layer3", "Private Rentenversicherung (Schicht 3)"],
  ["basis", "Basisrente (Schicht 1)"],
  ["riester", "gefördert (Riester / neues Recht)"],
  ["bav", "Betriebliche Altersversorgung"],
];
const FREQ: Array<[PaymentFrequency, string]> = [
  ["monthly", "monatlich"],
  ["quarterly", "vierteljährlich"],
  ["semiannual", "halbjährlich"],
  ["annual", "jährlich"],
  ["none", "nur Einmalbeitrag"],
];
const SORTS: Array<[SelectionSortKey, string]> = [
  ["effectiveCostsPp", "Effektivkosten (aufsteigend)"],
  ["endCapital", "Endkapital (absteigend)"],
  ["monthlyAnnuityGuaranteed", "garantierte Rente (absteigend)"],
  ["monthlyAnnuityCurrent", "Rente mit aktuellem Faktor (absteigend)"],
  ["label", "Name (A–Z)"],
];

export function grossReturnFor(form: SelectionForm): number {
  if (form.grossReturnOverride !== null) return form.grossReturnOverride;
  return form.riskClass ? (DEFAULT_RETURN_BY_RISK_CLASS[form.riskClass] ?? 4) : 4;
}

export function toProfile(form: SelectionForm): SelectionProfile {
  const [y, m] = form.startDate.split("-").map(Number);
  return {
    startYear: y as number,
    startMonth: m as number,
    entryAge: form.entryAge,
    retirementAge: form.retirementAge,
    contribution: { amount: form.amount, frequency: form.frequency, dynamicsPercent: form.dynamicsPercent || undefined, singlePremium: form.singlePremium || undefined },
    layer: form.layer,
    guaranteeMinPercent: form.guaranteeMinPercent,
    esg: form.esg,
    riskClass: form.riskClass,
    needs: {
      lumpSumOption: form.lumpSumOption,
      withdrawals: form.withdrawals,
      contributionPause: form.contributionPause,
      guaranteePeriodMonths: form.guaranteePeriodYears ? form.guaranteePeriodYears * 12 : null,
      deathBenefitBeforeRetirement: form.deathBenefitBeforeRetirement,
    },
    person: {
      children: form.childrenBirthYears.map((birthYear) => ({ birthYear })),
      previousYearIncome: form.previousYearIncome,
      eligible: form.eligible,
      // Berufseinsteigerbonus: unter 25 zu Beginn des ersten Beitragsjahres
      starterBonusYear: form.entryAge < 25 ? (y as number) : undefined,
    },
    grossReturnPercent: grossReturnFor(form),
    lifeExpectancyAge: form.lifeExpectancyAge,
    payoutPlanEndAge: 85,
    payoutPlanCostPercent: 0.5,
  };
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function ResultRows({ rows, hrefs, showFigures }: { rows: SelectionResult[]; hrefs: Map<string, string>; showFigures: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Table>
      <thead>
        <tr>
          <th>Tarif</th>
          {showFigures && (
            <>
              <th className="text-right">Effektivkosten p.a.</th>
              <th className="text-right">Endkapital</th>
              <th className="text-right">davon Zulagen</th>
              <th className="text-right">Kosten gesamt</th>
              <th className="text-right">Rente garantiert</th>
              <th className="text-right">Rente aktuell</th>
            </>
          )}
          <th>Kriterien</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const href = hrefs.get(r.candidateId);
          const issues = [...r.failures, ...r.openPoints];
          return (
            <tr key={r.candidateId} className="align-top">
              <td>
                {href ? (
                  <Link href={href} className="text-brand underline-offset-2 hover:underline">
                    {r.label}
                  </Link>
                ) : (
                  <span>
                    {r.label} <AssumptionTag>Vergleich</AssumptionTag>
                  </span>
                )}
              </td>
              {showFigures && (
                <>
                  <td className="tabular text-right font-medium">{pp(r.effectiveCostsPp)}</td>
                  <td className="tabular text-right">{euro(r.endCapital)}</td>
                  <td className="tabular text-right">{r.allowances ? euro(r.allowances) : "–"}</td>
                  <td className="tabular text-right">{euro(r.costsTotal)}</td>
                  <td className="tabular text-right">{r.monthlyAnnuityGuaranteed !== null ? `${euro(r.monthlyAnnuityGuaranteed)}/M.` : "–"}</td>
                  <td className="tabular text-right">{r.monthlyAnnuityCurrent !== null ? `${euro(r.monthlyAnnuityCurrent)}/M.` : "–"}</td>
                </>
              )}
              <td className="max-w-xs text-xs">
                {r.failures.map((f) => (
                  <div key={f} className="text-bad">
                    ✗ {f}
                  </div>
                ))}
                {issues.length === r.failures.length ? (
                  r.failures.length === 0 ? (
                    <span className="text-ok">alle Anforderungen erfüllt</span>
                  ) : null
                ) : (
                  <>
                    <button type="button" className="text-warn underline" onClick={() => setOpen(open === r.candidateId ? null : r.candidateId)}>
                      {r.openPoints.length} offen – bitte prüfen
                    </button>
                    {open === r.candidateId && (
                      <ul className="mt-1 list-disc pl-4 text-muted">
                        {r.openPoints.map((o) => (
                          <li key={o}>{o}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export function SelectionView({
  candidates,
  fundLabel,
  depotDefaults,
  saved,
  cases,
  initialProfile,
}: {
  candidates: CandidatePayload[];
  fundLabel: string;
  depotDefaults: DepotAssumptions;
  saved: SavedSelection[];
  cases: Array<{ id: string; label: string }>;
  initialProfile: unknown;
}) {
  const [form, setForm] = useState<SelectionForm>(() => ({ ...defaultForm(depotDefaults), ...((initialProfile as Partial<SelectionForm> | null) ?? {}) }));
  const [sortKey, setSortKey] = useState<SelectionSortKey>("effectiveCostsPp");
  const [title, setTitle] = useState("");
  const [caseId, setCaseId] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof SelectionForm>(k: K, v: SelectionForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setDepot = <K extends keyof DepotAssumptions>(k: K, v: DepotAssumptions[K]) => setForm((f) => ({ ...f, depot: { ...f.depot, [k]: v } }));

  const hrefs = useMemo(() => new Map(candidates.map((c) => [c.candidate.id, c.href])), [candidates]);
  const result = useMemo(() => {
    const prepared: SelectionCandidate[] = candidates.map(({ candidate, fundMissing }) => {
      if (!fundMissing || form.fundTerFallback === null) return candidate;
      const costs = { ...candidate.costs, fund: { ...(candidate.costs.fund ?? {}), terPercent: form.fundTerFallback } };
      return { ...candidate, costs, missingCosts: (candidate.missingCosts ?? []).filter((m) => m !== fundLabel) };
    });
    if (form.includeDepot) prepared.push(depotCandidate(form.depot, { esgLevel: null, riskClassMin: 1, riskClassMax: 5, withdrawalsAllowed: null, contributionPauseAllowed: null }));
    const out = runSelection(prepared, toProfile(form), sortKey);
    // Fondskosten-Annahme sichtbar machen
    const fundFallbackIds = new Set(candidates.filter((c) => c.fundMissing && form.fundTerFallback !== null).map((c) => c.candidate.id));
    const mark = (rows: SelectionResult[]) =>
      rows.map((r) => (fundFallbackIds.has(r.candidateId) ? { ...r, openPoints: [`Fondskosten: Annahme ${form.fundTerFallback} % p.a. (kein Tarifwert bestätigt)`, ...r.openPoints] } : r));
    return { suitable: mark(out.suitable), unsuitable: mark(out.unsuitable), notComputable: mark(out.notComputable) };
  }, [candidates, form, sortKey, fundLabel]);

  const termYears = form.retirementAge - form.entryAge;
  const monthlyEq = form.frequency === "none" ? 0 : (form.amount * { monthly: 12, quarterly: 4, semiannual: 2, annual: 1, none: 0 }[form.frequency]) / 12;

  return (
    <div className="space-y-5">
      <Card title="Tarifauswahl – Kundenprofil">
        <p className="mb-4 text-sm text-muted">
          Klarwert rechnet alle Tarife aus dem eigenen Katalog unter identischen Annahmen durch. Beitragsstaffeln gelten für den konkreten Beitrag, Rentenfaktoren für das Rentenbeginnalter.
          Das Ergebnis ist eine Entscheidungsgrundlage; kein Tarif wird empfohlen. Keine Namen eingeben.
        </p>
        <div className="space-y-5">
          <fieldset className="grid gap-4 md:grid-cols-4">
            <legend className="mb-2 text-sm font-semibold">Beitrag und Laufzeit</legend>
            <Field label="Vertragsbeginn">
              <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Eintrittsalter">
              <NumInput value={form.entryAge} onChange={(v) => v !== null && set("entryAge", v)} />
            </Field>
            <Field label="Rentenbeginn mit" hint={`Ansparphase ${termYears > 0 ? termYears : "–"} Jahre`}>
              <NumInput value={form.retirementAge} onChange={(v) => v !== null && set("retirementAge", v)} />
            </Field>
            <Field label="Zahlweise">
              <select value={form.frequency} onChange={(e) => set("frequency", e.target.value as PaymentFrequency)} className={inputClass}>
                {FREQ.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Beitrag je Zahlung (€)" hint={form.frequency !== "monthly" && form.frequency !== "none" ? `entspricht ${euro(monthlyEq, true)} im Monat` : undefined}>
              <NumInput value={form.amount} onChange={(v) => v !== null && set("amount", v)} />
            </Field>
            <Field label="Dynamik (% p.a.)">
              <NumInput value={form.dynamicsPercent} onChange={(v) => v !== null && set("dynamicsPercent", v)} />
            </Field>
            <Field label="Einmalbeitrag zu Beginn (€)">
              <NumInput value={form.singlePremium} onChange={(v) => v !== null && set("singlePremium", v)} />
            </Field>
            <Field label="Schicht">
              <select value={form.layer} onChange={(e) => set("layer", e.target.value as ContractLayer | "any")} className={inputClass}>
                {LAYERS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </fieldset>

          <fieldset className="grid gap-4 md:grid-cols-4">
            <legend className="mb-2 text-sm font-semibold">Anforderungen</legend>
            <Field label="Beitragserhalt mindestens">
              <select value={form.guaranteeMinPercent} onChange={(e) => set("guaranteeMinPercent", Number(e.target.value) as 0 | 80 | 100)} className={inputClass}>
                <option value={0}>keine Garantie nötig</option>
                <option value={80}>80 % der Beiträge</option>
                <option value={100}>100 % der Beiträge</option>
              </select>
            </Field>
            <Field label="Risikoprofil (SRI 1–7)">
              <select value={form.riskClass ?? ""} onChange={(e) => set("riskClass", e.target.value ? Number(e.target.value) : null)} className={inputClass}>
                <option value="">keine Vorgabe</option>
                {[1, 2, 3, 4, 5, 6, 7].map((k) => (
                  <option key={k} value={k}>
                    Risikoklasse {k}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nachhaltigkeit">
              <select value={form.esg} onChange={(e) => set("esg", e.target.value as EsgLevel)} className={inputClass}>
                {(Object.keys(ESG_LABELS) as EsgLevel[]).map((k) => (
                  <option key={k} value={k}>
                    {ESG_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rentengarantiezeit mindestens (Jahre)">
              <NumInput value={form.guaranteePeriodYears} onChange={(v) => v !== null && set("guaranteePeriodYears", v)} />
            </Field>
            <div className="space-y-2 md:col-span-4">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <Check label="Kapitalwahlrecht" checked={form.lumpSumOption} onChange={(v) => set("lumpSumOption", v)} />
                <Check label="Entnahmen während der Ansparphase" checked={form.withdrawals} onChange={(v) => set("withdrawals", v)} />
                <Check label="Beitragspausen möglich" checked={form.contributionPause} onChange={(v) => set("contributionPause", v)} />
                <Check label="Todesfallleistung vor Rentenbeginn" checked={form.deathBenefitBeforeRetirement} onChange={(v) => set("deathBenefitBeforeRetirement", v)} />
              </div>
            </div>
          </fieldset>

          <fieldset className="grid gap-4 md:grid-cols-4">
            <legend className="mb-2 text-sm font-semibold">Förderung (gefördertes Altersvorsorgedepot / Riester)</legend>
            <div className="pt-6">
              <Check label="unmittelbar zulageberechtigt" checked={form.eligible} onChange={(v) => set("eligible", v)} />
            </div>
            <Field label="Geburtsjahre der Kinder" hint="z. B. „2016; 2019“">
              <NumListInput value={form.childrenBirthYears} onChange={(v) => set("childrenBirthYears", v)} />
            </Field>
            <Field label="Vorjahreseinkommen (€)" hint="nur für Altverträge (4-%-Regel)">
              <NumInput value={form.previousYearIncome} onChange={(v) => v !== null && set("previousYearIncome", v)} />
            </Field>
            <p className="pt-6 text-xs text-muted">{form.entryAge < 25 ? "Berufseinsteigerbonus (unter 25) wird berücksichtigt." : "Steuerliche Effekte werden nicht gerechnet."}</p>
          </fieldset>

          <fieldset className="grid gap-4 md:grid-cols-4">
            <legend className="mb-2 text-sm font-semibold">
              Annahmen <AssumptionTag />
            </legend>
            <Field label="Bruttorendite (% p.a.)" hint={form.grossReturnOverride === null ? `Standard aus Risikoprofil: ${grossReturnFor(form)} %` : "frei gesetzt"}>
              <NumInput value={form.grossReturnOverride} allowEmpty onChange={(v) => set("grossReturnOverride", v)} />
            </Field>
            <Field label="Lebenserwartung (Alter)">
              <NumInput value={form.lifeExpectancyAge} onChange={(v) => v !== null && set("lifeExpectancyAge", v)} />
            </Field>
            <Field label="Fondskosten, falls im Tarif nicht bestätigt (% p.a.)" hint="leer = solche Tarife nicht berechnen">
              <NumInput value={form.fundTerFallback} allowEmpty onChange={(v) => set("fundTerFallback", v)} />
            </Field>
            <div className="space-y-2 pt-6">
              <Check label="Altersvorsorgedepot als Vergleich" checked={form.includeDepot} onChange={(v) => set("includeDepot", v)} />
            </div>
            {form.includeDepot && (
              <>
                <Field label="Depot: Verwaltung (% p.a.)">
                  <NumInput value={form.depot.costPercent} onChange={(v) => v !== null && setDepot("costPercent", v)} />
                </Field>
                <Field label="Depot: Fondskosten (% p.a.)">
                  <NumInput value={form.depot.fundTerPercent} onChange={(v) => v !== null && setDepot("fundTerPercent", v)} />
                </Field>
                <Field label="Depot: feste Kosten (€ p.a.)">
                  <NumInput value={form.depot.kappaEurPerYear} onChange={(v) => v !== null && setDepot("kappaEurPerYear", v)} />
                </Field>
                <Field label="Depot: Beitragserhalt">
                  <select value={form.depot.guaranteeLevel} onChange={(e) => setDepot("guaranteeLevel", Number(e.target.value) as 0 | 80 | 100)} className={inputClass}>
                    <option value={0}>ohne Garantie</option>
                    <option value={80}>80 %</option>
                    <option value={100}>100 %</option>
                  </select>
                </Field>
              </>
            )}
          </fieldset>
        </div>
      </Card>

      {candidates.length === 0 && <Notice>Der Tarifkatalog ist noch leer. Tarife werden über Fälle oder unter „Tarifkatalog & Bibliothek“ erfasst; mit bestätigten Kostenfaktoren erscheinen sie hier.</Notice>}

      <Card
        title={`Passende Tarife (${result.suitable.length})`}
        actions={
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SelectionSortKey)} className={inputClass}>
            {SORTS.map(([k, l]) => (
              <option key={k} value={k}>
                sortiert nach {l}
              </option>
            ))}
          </select>
        }
      >
        {result.suitable.length ? <ResultRows rows={result.suitable} hrefs={hrefs} showFigures /> : <p className="text-sm text-muted">Kein Tarif erfüllt alle Anforderungen.</p>}
        <p className="mt-3 text-xs text-muted">
          Gleiche Annahmen für alle: {grossReturnFor(form)} % Bruttorendite, {termYears} Jahre Ansparphase, Rentenbeginn mit {form.retirementAge}. Effektivkosten = Renditeminderung p.a. bis
          Rentenbeginn. „Offen“ heißt: Das Merkmal ist im Katalog nicht erfasst und muss vor dem Kundengespräch geprüft werden. Sortierung nach einer Kennzahl ist keine Empfehlung.
        </p>
      </Card>

      {result.notComputable.length > 0 && (
        <Card title={`Nicht berechenbar (${result.notComputable.length})`}>
          <p className="mb-2 text-sm text-muted">Kostenfaktoren im Katalog unvollständig – über den Link vervollständigen.</p>
          <ResultRows rows={result.notComputable} hrefs={hrefs} showFigures={false} />
        </Card>
      )}

      {result.unsuitable.length > 0 && (
        <Card title={`Nicht passend (${result.unsuitable.length})`}>
          <ResultRows rows={result.unsuitable} hrefs={hrefs} showFigures={false} />
        </Card>
      )}

      <Card title="Auswahl speichern" className="no-print">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Bezeichnung (ohne Kundennamen)">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="z. B. Schicht 3, 150 €, Eintritt 35" />
          </Field>
          <Field label="Fall zuordnen (optional)">
            <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className={inputClass}>
              <option value="">– kein Fall –</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const summary = [...result.suitable, ...result.notComputable, ...result.unsuitable].map(({ resolvedCosts: _r, ...rest }) => rest);
                  const r = await saveSelection({ title, caseId: caseId || null, profile: form, results: { sortKey, grossReturnPercent: grossReturnFor(form), rows: summary } });
                  setMsg(r.error ? { tone: "bad", text: r.error } : { tone: "ok", text: "Gespeichert." });
                })
              }
            >
              Speichern
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Drucken
            </Button>
          </div>
        </div>
        {msg && (
          <div className="mt-3">
            <Notice tone={msg.tone}>{msg.text}</Notice>
          </div>
        )}
        {saved.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold">Gespeicherte Auswahlen</p>
            <ul className="space-y-1 text-sm">
              {saved.map((s) => (
                <li key={s.id} className="flex items-center gap-3">
                  <Link href={`/tarifauswahl?auswahl=${s.id}`} className="text-brand underline-offset-2 hover:underline">
                    {s.title}
                  </Link>
                  <span className="text-xs text-muted">{new Date(s.created_at).toLocaleDateString("de-DE")}</span>
                  {s.case_id && <Badge>mit Fall</Badge>}
                  <button type="button" className="text-xs text-bad" onClick={() => start(() => deleteSelection(s.id))}>
                    löschen
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
