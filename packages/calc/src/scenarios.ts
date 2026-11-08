/**
 * Depot-Modul: Szenarien für Bestandsverträge im Vergleich zum Altersvorsorgedepot.
 *
 * Riester-Altvertrag:  A weiterführen (altes Förderrecht)
 *                      B weiterführen mit Erklärung auf neues Förderrecht
 *                      C beitragsfrei stellen + neu ins Depot sparen
 *                      D Kapitalübertragung ins Depot (D1: abgebender Anbieter max. 150 €; D2: nach 5 Jahren kostenfrei)
 * Ungeförderte Verträge (Schicht 3, Basisrente):
 *                      L3_CONTINUE weiterführen, L3_PAIDUP_DEPOT beitragsfrei + Depot, L3_SURRENDER_DEPOT Kündigung + Depot
 *
 * Gemeinsame Basis aller Szenarien: Stichtag (elapsedMonths) mit Ist-Guthaben, gleiche Eigenbeiträge,
 * gleiche Bruttorendite, gleicher Rentenbeginn. Effektivkosten je Szenario = Bruttorendite − interner
 * Zinsfuß der Gesamtzahlungen ab Stichtag (Ist-Guthaben als Anfangseinzahlung, Eigenbeiträge und
 * Zulagen als Einzahlungen, Summe der Endkapitalien als Auszahlung). Wechselkosten und Stornoabzüge
 * zählen damit als Kosten. Steuern werden nicht gerechnet. Kein Szenario wird empfohlen.
 */
import { transfer as transferRules, subsidyNew, type ChildMatchingReading } from "@klarwert/legal-config";
import { addBreakdown, emptyBreakdown, premiumAt, simulate, surrenderDeduction, sumBreakdown } from "./accumulation";
import { allowanceNew, allowanceOld, type AllowancePerson } from "./allowances";
import { irrAnnualPercent } from "./irr";
import type { CashEvent, ContributionPlan, CostBreakdown, CostFactors, SimulationResult } from "./types";

export type ContractLayer = "riester" | "basis" | "layer3" | "bav";

export interface ContractState {
  label: string;
  layer: ContractLayer;
  /** Kalenderjahr und -monat (1–12) des Vertragsbeginns */
  startYear: number;
  startMonth: number;
  /** Ansparphase in Monaten (Vertragsbeginn bis Rentenbeginn) */
  termMonths: number;
  /** Monate seit Vertragsbeginn am Stichtag */
  elapsedMonths: number;
  /** Guthaben am Stichtag (z. B. laut Standmitteilung) */
  currentValue: number;
  /** Rückkaufswert am Stichtag; Standard: aus Stornoregeln berechnet */
  surrenderValue?: number;
  contributions: ContributionPlan;
  costs: CostFactors;
}

export interface DepotAssumptions {
  label?: string;
  /** Depot-/Verwaltungskosten in % p.a. des Guthabens */
  costPercent: number;
  /** laufende Fondskosten in % p.a. */
  fundTerPercent: number;
  /** feste Kosten in € p.a. */
  kappaEurPerYear: number;
  /** Abschluss-/Vertriebskosten auf neue Beiträge in % je Beitrag */
  alphaPercentOfPremium: number;
  /** Beitragserhalt 0 (ohne Garantie), 80 oder 100 % */
  guaranteeLevel: 0 | 80 | 100;
  /** Garantiekosten in % p.a. (nur bei Garantieprodukt) */
  guaranteeCostPercent: number;
  /** Standarddepot mit gesetzlichem Kostendeckel */
  isStandardDepot?: boolean;
}

export interface ScenarioAssumptions {
  grossReturnPercent: number;
  person: AllowancePerson;
  childReading?: ChildMatchingReading;
  depot: DepotAssumptions;
  /** freie Anlage für das Kündigungskapital (Schicht 3); Standard: wie Depot ohne Abschlusskosten */
  freeInvestment?: DepotAssumptions;
  /** Vertragsmonat des Wechsels; Standard: max(Stichtag, Januar 2027) */
  switchMonth?: number;
  /** Übertragungswert; Standard: Rückkaufswert im Wechselmonat */
  transferValue?: number;
  /** Wechselkosten abgebender Anbieter in € (Standard: gesetzliches Maximum 150 €) */
  outgoingFeeEur?: number;
  /** Verwaltungspauschale aufnehmender Anbieter in € (Standard: 150 €) */
  incomingFeeEur?: number;
  /** Beitragsjahr der Erklärung auf neues Förderrecht (Szenario B); Standard: Jahr des Wechselmonats */
  optInYear?: number;
  /** Zulagengutschrift: Monate nach Dezember des Beitragsjahres (Standard 3) */
  allowanceLagMonths?: number;
}

export type ScenarioId = "A" | "B" | "C" | "D1" | "D2" | "L3_CONTINUE" | "L3_PAIDUP_DEPOT" | "L3_SURRENDER_DEPOT";

export interface ScenarioYear {
  calendarYear: number;
  value: number;
  ownContributionsCum: number;
  allowancesCum: number;
  costsCum: number;
}

export interface ScenarioResult {
  id: ScenarioId;
  label: string;
  description: string;
  endCapital: number;
  endCapitalLegacy: number;
  endCapitalDepot: number;
  ownContributions: number;
  allowances: number;
  /** laufende Vertrags-/Depotkosten ab Stichtag nach Kostenart */
  costsByKind: CostBreakdown;
  /** Wechselkosten (abgebend + aufnehmend) */
  switchFees: number;
  /** Stornoabzug bzw. Differenz Guthaben − Übertragungswert/Rückkaufswert */
  surrenderLoss: number;
  costsCumulative: number;
  netIrrPercent: number | null;
  effectiveCostsPp: number | null;
  notes: string[];
  guaranteeNote?: string;
  years: ScenarioYear[];
}

const DEFAULT_LAG = 3;
const DEPOT_AVAILABLE = { year: 2027, month: 1 };

function calendarOf(c: ContractState, globalMonth: number): { year: number; month: number } {
  const abs = c.startMonth - 1 + globalMonth;
  return { year: c.startYear + Math.floor(abs / 12), month: (abs % 12) + 1 };
}

function globalMonthOf(c: ContractState, year: number, month: number): number {
  return (year - c.startYear) * 12 + (month - c.startMonth);
}

export function defaultSwitchMonth(c: ContractState): number {
  return Math.max(c.elapsedMonths, globalMonthOf(c, DEPOT_AVAILABLE.year, DEPOT_AVAILABLE.month));
}

export function depotCosts(d: DepotAssumptions, withAlpha: boolean): CostFactors {
  return {
    alpha: withAlpha && d.alphaPercentOfPremium > 0 ? { mode: "percent_of_premiums", rate: d.alphaPercentOfPremium, distributionMonths: 12 * 100, onDynamics: true } : undefined,
    gamma: { percentOfValue: d.costPercent },
    fund: { terPercent: d.fundTerPercent },
    kappa: { eurPerYear: d.kappaEurPerYear },
    guarantee: d.guaranteeLevel > 0 ? { percentOfValue: d.guaranteeCostPercent } : undefined,
  };
}

/** Eigenbeiträge laut Plan je globalem Monat im Bereich [from, to). */
function ownContributionEvents(c: ContractState, plan: ContributionPlan, from: number, to: number, offset = 0): CashEvent[] {
  const out: CashEvent[] = [];
  for (let m = from; m < to; m++) {
    const local = m - offset;
    let amount = premiumAt(plan, c.termMonths - offset, local);
    if (local === 0) amount += plan.singlePremium ?? 0;
    for (const t of plan.topUps ?? []) if (t.month === local) amount += t.amount;
    if (amount > 0) out.push({ month: m, amount });
  }
  return out;
}

type Rule = "old" | "new" | "none";

interface Stream {
  id: "legacy" | "depot";
  /** Eigenbeiträge in globalen Monaten (ganze Kalenderjahre, auch vor dem Stichtag, für die Zulagenbemessung) */
  contributions: CashEvent[];
  /** ab diesem globalen Monat existiert der Vertrag nicht mehr (Zulagen gehen an den Nachfolger) */
  endsAt?: number;
}

/**
 * Zulagen auf Personenebene: Beiträge aller geförderten Verträge je Kalenderjahr summieren, Zulage nach der
 * Regel des Jahres berechnen (genau eine Regel je Jahr) und anteilig den Verträgen gutschreiben.
 */
function personAllowances(
  c: ContractState,
  streams: Stream[],
  ruleForYear: (y: number) => Rule,
  a: ScenarioAssumptions,
): Map<Stream["id"], CashEvent[]> {
  const lag = a.allowanceLagMonths ?? DEFAULT_LAG;
  const perYear = new Map<number, Map<Stream["id"], number>>();
  for (const s of streams) {
    for (const e of s.contributions) {
      const { year } = calendarOf(c, e.month);
      const m = perYear.get(year) ?? new Map<Stream["id"], number>();
      m.set(s.id, (m.get(s.id) ?? 0) + e.amount);
      perYear.set(year, m);
    }
  }
  const out = new Map<Stream["id"], CashEvent[]>(streams.map((s) => [s.id, []]));
  for (const [year, shares] of perYear) {
    const rule = ruleForYear(year);
    if (rule === "none") continue;
    const total = [...shares.values()].reduce((x, y) => x + y, 0);
    const b = rule === "old" ? allowanceOld(year, total, a.person) : allowanceNew(year, total, a.person, a.childReading);
    if (b.total <= 0) continue;
    const creditMonth = Math.min(globalMonthOf(c, year, 12) + lag, c.termMonths - 1);
    if (creditMonth < c.elapsedMonths) continue; // vor dem Stichtag gutgeschrieben → im Ist-Guthaben enthalten
    for (const [id, amt] of shares) {
      const stream = streams.find((s) => s.id === id);
      let target: Stream["id"] = id;
      if (stream?.endsAt !== undefined && creditMonth >= stream.endsAt) target = "depot";
      out.get(target)?.push({ month: creditMonth, amount: (b.total * amt) / total });
    }
  }
  return out;
}

function toLocal(events: CashEvent[], offset: number): CashEvent[] {
  return events.map((e) => ({ month: e.month - offset, amount: e.amount }));
}

interface Leg {
  result: SimulationResult;
  /** globaler Monat von lokalem Monat 0 */
  offset: number;
}

function combine(
  c: ContractState,
  a: ScenarioAssumptions,
  id: ScenarioId,
  label: string,
  description: string,
  legacy: Leg | null,
  depots: Leg[],
  extras: { switchFees: number; surrenderLoss: number; notes: string[]; guaranteeNote?: string; legacyEndsAt?: number; legacyFinal?: number },
): ScenarioResult {
  // Zahlungsströme ab Stichtag
  const flows: CashEvent[] = [{ month: c.elapsedMonths, amount: -c.currentValue }];
  let own = 0;
  let allowances = 0;
  let costs = emptyBreakdown();
  const legs = [...(legacy ? [legacy] : []), ...depots];
  for (const leg of legs) {
    for (const r of leg.result.months) {
      const own_ = r.premium + r.singlePremium + r.topUp;
      // interne Umbuchungen (Übertragung/Kündigungskapital) sind keine externen Einzahlungen
      const isInternal = leg !== legacy && r.month === 0 && r.singlePremium > 0 && (leg as Leg & { internalSingle?: boolean }).internalSingle;
      const external = (isInternal ? own_ - r.singlePremium : own_) + r.allowance;
      own += isInternal ? own_ - r.singlePremium : own_;
      allowances += r.allowance;
      if (external !== 0) flows.push({ month: r.month + leg.offset, amount: -external });
    }
    costs = addBreakdown(costs, leg.result.costsTotal);
  }
  const endLegacy = legacy ? (extras.legacyEndsAt !== undefined ? 0 : legacy.result.finalValueNet) : 0;
  const endDepot = depots.reduce((s, d) => s + d.result.finalValueNet, 0);
  const endCapital = endLegacy + endDepot;
  flows.push({ month: c.termMonths, amount: endCapital });
  const irr = irrAnnualPercent(flows);

  // Jahresverlauf (Kalenderjahre) für Charts
  const years = new Map<number, ScenarioYear>();
  const valueAt = new Map<number, number>();
  const costCum = new Map<number, number>();
  for (const leg of legs) {
    let cum = 0;
    for (const r of leg.result.months) {
      const g = r.month + leg.offset;
      cum += sumBreakdown(r.costs);
      const ended = leg === legacy && extras.legacyEndsAt !== undefined && g >= extras.legacyEndsAt;
      if (!ended) valueAt.set(g, (valueAt.get(g) ?? 0) + r.valueNet);
      costCum.set(g, (costCum.get(g) ?? 0) + cum);
    }
    // nach Vertragsende fortgeschriebene kumulierte Kosten
    const last = leg.result.months.at(-1);
    if (last) for (let g = last.month + leg.offset + 1; g < c.termMonths; g++) costCum.set(g, (costCum.get(g) ?? 0) + cum);
  }
  let ownCum = 0;
  let allowCum = 0;
  const inflowByMonth = new Map<number, { own: number; allow: number }>();
  for (const leg of legs) {
    for (const r of leg.result.months) {
      const internal = leg !== legacy && r.month === 0 && (leg as Leg & { internalSingle?: boolean }).internalSingle;
      const o = r.premium + r.topUp + (internal ? 0 : r.singlePremium);
      const g = r.month + leg.offset;
      const cur = inflowByMonth.get(g) ?? { own: 0, allow: 0 };
      cur.own += o;
      cur.allow += r.allowance;
      inflowByMonth.set(g, cur);
    }
  }
  for (let g = c.elapsedMonths; g < c.termMonths; g++) {
    const inflow = inflowByMonth.get(g);
    ownCum += inflow?.own ?? 0;
    allowCum += inflow?.allow ?? 0;
    const { year } = calendarOf(c, g);
    years.set(year, {
      calendarYear: year,
      value: valueAt.get(g) ?? 0,
      ownContributionsCum: ownCum,
      allowancesCum: allowCum,
      costsCum: (costCum.get(g) ?? 0) + (g >= (a.switchMonth ?? defaultSwitchMonth(c)) ? extras.switchFees + extras.surrenderLoss : 0),
    });
  }

  const costsCumulative = sumBreakdown(costs) + extras.switchFees + extras.surrenderLoss;
  return {
    id,
    label,
    description,
    endCapital,
    endCapitalLegacy: endLegacy,
    endCapitalDepot: endDepot,
    ownContributions: own,
    allowances,
    costsByKind: costs,
    switchFees: extras.switchFees,
    surrenderLoss: extras.surrenderLoss,
    costsCumulative,
    netIrrPercent: irr,
    effectiveCostsPp: irr === null ? null : a.grossReturnPercent - irr,
    notes: extras.notes,
    guaranteeNote: extras.guaranteeNote,
    years: [...years.values()],
  };
}

function legacyContinue(c: ContractState, a: ScenarioAssumptions, allowances: CashEvent[], plan: ContributionPlan = c.contributions, term = c.termMonths): SimulationResult {
  return simulate({
    termMonths: term,
    contributions: plan,
    costs: c.costs,
    grossReturnPercent: a.grossReturnPercent,
    allowances,
    start: { month: c.elapsedMonths, value: c.currentValue },
  });
}

/** Beitragsplan des Depots: gleicher Eigenbeitrag wie der Altvertrag zum Wechselzeitpunkt, gleiche Dynamik. */
function depotPlan(c: ContractState, switchMonth: number): ContributionPlan {
  const plan = c.contributions;
  const current = premiumAtOrRegular(c, switchMonth);
  const paymentEnd = Math.min(plan.paymentMonths ?? c.termMonths, plan.paidUpFromMonth ?? Infinity, c.termMonths);
  return {
    amount: current,
    frequency: plan.frequency,
    paymentMonths: Math.max(0, paymentEnd - switchMonth),
    dynamics: plan.dynamics
      ? { ratePercent: plan.dynamics.ratePercent, untilMonth: plan.dynamics.untilMonth !== undefined ? plan.dynamics.untilMonth - switchMonth : undefined }
      : undefined,
    topUps: (plan.topUps ?? []).filter((t) => t.month >= switchMonth).map((t) => ({ month: t.month - switchMonth, amount: t.amount })),
  };
}

/** Beitragshöhe im Wechselmonat (auch wenn der Monat kein Zahlungsmonat ist). */
function premiumAtOrRegular(c: ContractState, m: number): number {
  const plan = c.contributions;
  const interval = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12, none: 0 }[plan.frequency];
  if (interval === 0) return 0;
  // nächsten Zahlungsmonat ab m suchen
  for (let k = m; k < m + interval && k < c.termMonths; k++) {
    const p = premiumAt(plan, c.termMonths, k);
    if (p > 0) return p;
  }
  return 0;
}

function guaranteeNoteFor(c: ContractState, d: DepotAssumptions, switchMonth: number): string | undefined {
  if (c.layer !== "riester") return undefined;
  if (d.guaranteeLevel === 100) return undefined;
  const paid = ownContributionEvents(c, c.contributions, 0, switchMonth).reduce((s, e) => s + e.amount, 0);
  const level = d.guaranteeLevel === 0 ? "ohne Beitragsgarantie" : `mit ${d.guaranteeLevel} % Beitragserhalt`;
  return `Der Riester-Altvertrag sichert zu Rentenbeginn mindestens die eingezahlten Beiträge und Zulagen zu (laut Beitragsplan bisher rund ${Math.round(paid).toLocaleString("de-DE")} € Eigenbeiträge zzgl. Zulagen). Das gewählte Depot ist ${level}; diese Zusage entfällt bzw. sinkt für das übertragene bzw. neu angesparte Kapital.`;
}

const COMMON_NOTES = [
  "Steuerliche Effekte (Sonderausgabenabzug, Günstigerprüfung, nachgelagerte Besteuerung, Kapitalertragsteuer) sind nicht gerechnet – bitte steuerliche Beratung einbeziehen.",
];

/** Riester-Bestandsvertrag: Wege A–D. */
export function runRiesterScenarios(c: ContractState, a: ScenarioAssumptions): ScenarioResult[] {
  const switchMonth = a.switchMonth ?? defaultSwitchMonth(c);
  const switchYear = calendarOf(c, switchMonth).year;
  const optInYear = a.optInYear ?? Math.max(switchYear, Number(subsidyNew.effectiveFrom.value.slice(0, 4)));
  const fullContribs = ownContributionEvents(c, c.contributions, 0, c.termMonths);
  const results: ScenarioResult[] = [];

  // A: unverändert, altes Förderrecht
  {
    const allow = personAllowances(c, [{ id: "legacy", contributions: fullContribs }], () => "old", a);
    const sim = legacyContinue(c, a, allow.get("legacy") ?? []);
    results.push(
      combine(c, a, "A", "A – Weiterführen (altes Förderrecht)", "Vertrag läuft unverändert weiter; Zulagen nach altem Recht (175 € Grundzulage, 185/300 € Kinderzulage, 4-%-Regel).", { result: sim, offset: 0 }, [], {
        switchFees: 0,
        surrenderLoss: 0,
        notes: [...COMMON_NOTES],
      }),
    );
  }

  // B: Erklärung auf neues Förderrecht im Altvertrag
  {
    const allow = personAllowances(c, [{ id: "legacy", contributions: fullContribs }], (y) => (y >= optInYear ? "new" : "old"), a);
    const sim = legacyContinue(c, a, allow.get("legacy") ?? []);
    results.push(
      combine(c, a, "B", "B – Weiterführen mit neuem Förderrecht", `Unwiderrufliche Erklärung auf das neue Förderrecht ab Beitragsjahr ${optInYear}; Vertrag und Kosten bleiben unverändert.`, { result: sim, offset: 0 }, [], {
        switchFees: 0,
        surrenderLoss: 0,
        notes: [
          "Die Erklärung ist unwiderruflich und gilt einheitlich für alle Altersvorsorge-Bestandsverträge der Person (§ 52 Abs. 50a S. 4 EStG n. F.).",
          "Neues Recht: Mindesteigenbeitrag 120 € p.a. als Schwelle; darunter keine Zulage.",
          ...COMMON_NOTES,
        ],
      }),
    );
  }

  // C: beitragsfrei stellen + neu ins Depot sparen
  {
    const plan: ContributionPlan = { ...c.contributions, paidUpFromMonth: switchMonth };
    const legacyContribs = ownContributionEvents(c, plan, 0, c.termMonths);
    const dPlan = depotPlan(c, switchMonth);
    const depotTerm = c.termMonths - switchMonth;
    const depotContribs = ownContributionEvents({ ...c, termMonths: c.termMonths }, dPlan, switchMonth, c.termMonths, switchMonth);
    const allow = personAllowances(
      c,
      [
        { id: "legacy", contributions: legacyContribs },
        { id: "depot", contributions: depotContribs },
      ],
      (y) => (y >= switchYear ? "new" : "old"),
      a,
    );
    const legacySim = legacyContinue(c, a, allow.get("legacy") ?? [], plan);
    const depotSim = simulate({
      termMonths: depotTerm,
      contributions: dPlan,
      costs: depotCosts(a.depot, true),
      grossReturnPercent: a.grossReturnPercent,
      allowances: toLocal(allow.get("depot") ?? [], switchMonth),
    });
    results.push(
      combine(c, a, "C", "C – Beitragsfrei stellen + Depot", "Altvertrag ab Wechsel beitragsfrei, Guthaben bleibt im Altvertrag; neue Beiträge fließen ins Altersvorsorgedepot (neues Förderrecht für alle Verträge).", { result: legacySim, offset: 0 }, [{ result: depotSim, offset: switchMonth }], {
        switchFees: 0,
        surrenderLoss: 0,
        guaranteeNote: guaranteeNoteFor(c, a.depot, switchMonth),
        notes: [
          "Mit dem ersten neuen Vertrag ab 01.01.2027 gilt das neue Förderrecht automatisch für alle Verträge der Person (§ 52 Abs. 50a S. 6 EStG n. F.).",
          "Kosten der Beitragsfreistellung und abweichende Kosten im beitragsfreien Zustand laut Bedingungswerk sind berücksichtigt, soweit erfasst.",
          ...COMMON_NOTES,
        ],
      }),
    );
  }

  // D: Kapitalübertragung ins Depot (zwei Lesarten der Wechselkosten des abgebenden Anbieters)
  for (const variant of ["D1", "D2"] as const) {
    const legacyStop: ContributionPlan = { ...c.contributions, paidUpFromMonth: switchMonth };
    const legacyContribs = ownContributionEvents(c, legacyStop, 0, switchMonth);
    const dPlan = depotPlan(c, switchMonth);
    const depotTerm = c.termMonths - switchMonth;
    const depotContribs = ownContributionEvents(c, dPlan, switchMonth, c.termMonths, switchMonth);
    const allow = personAllowances(
      c,
      [
        { id: "legacy", contributions: legacyContribs, endsAt: switchMonth },
        { id: "depot", contributions: depotContribs },
      ],
      (y) => (y >= switchYear ? "new" : "old"),
      a,
    );
    // Altvertrag bis zum Wechsel fortschreiben (ohne Beitragsfreistellungskosten: Übertragung ist keine Freistellung)
    const legacySim = simulate({
      termMonths: switchMonth,
      contributions: c.contributions,
      costs: c.costs,
      grossReturnPercent: a.grossReturnPercent,
      allowances: (allow.get("legacy") ?? []).filter((e) => e.month < switchMonth),
      start: { month: c.elapsedMonths, value: c.currentValue },
    });
    const valueAtSwitch = legacySim.finalValueNet;
    const yearsSinceStart = switchMonth / 12;
    const computedSurrender = valueAtSwitch - surrenderDeduction(c.costs.surrender, valueAtSwitch, Math.floor(switchMonth / 12) + 1);
    const transferValue = a.transferValue ?? (switchMonth === c.elapsedMonths && c.surrenderValue !== undefined ? c.surrenderValue : computedSurrender);
    const maxOut = transferRules.outgoingFeeMax.value;
    const outgoing =
      variant === "D2" && yearsSinceStart >= transferRules.outgoingFreeAfterYears.value ? 0 : Math.min(a.outgoingFeeEur ?? maxOut, maxOut);
    const incoming = Math.min(a.incomingFeeEur ?? transferRules.incomingFeeMax.value, transferRules.incomingFeeMax.value);
    const netTransfer = Math.max(0, transferValue - outgoing - incoming);
    const depotSim = simulate({
      termMonths: depotTerm,
      contributions: { ...dPlan, singlePremium: netTransfer },
      // keine Abschluss-/Vertriebskosten auf übertragenes Kapital (§ 1 Abs. 1 S. 4 AltZertG n. F.)
      costs: depotCosts(a.depot, true),
      grossReturnPercent: a.grossReturnPercent,
      allowances: toLocal(allow.get("depot") ?? [], switchMonth),
    });
    const depotLeg = { result: depotSim, offset: switchMonth, internalSingle: true } as Leg & { internalSingle: boolean };
    const variantText =
      variant === "D1"
        ? `Lesart 1: abgebender Anbieter berechnet Wechselkosten bis ${maxOut} € ohne Frist (§ 1 Abs. 1 S. 3 AltZertG a. F.).`
        : `Lesart 2: nach ${transferRules.outgoingFreeAfterYears.value} Jahren Vertragslaufzeit ist der Wechsel kostenfrei (§ 1 Abs. 1 S. 3 AltZertG n. F.).`;
    results.push(
      combine(
        c,
        a,
        variant,
        `${variant} – Übertragung ins Depot (${variant === "D1" ? "max. 150 € abgebend" : "kostenfrei nach 5 Jahren"})`,
        `Kapital wird ohne Kündigung ins Altersvorsorgedepot übertragen, Förderung bleibt erhalten. ${variantText} Aufnehmender Anbieter: Pauschale bis ${transferRules.incomingFeeMax.value} €, keine Abschlusskosten auf das übertragene Kapital.`,
        { result: legacySim, offset: 0 },
        [depotLeg],
        {
          switchFees: outgoing + incoming,
          surrenderLoss: Math.max(0, valueAtSwitch - transferValue),
          legacyEndsAt: switchMonth,
          guaranteeNote: guaranteeNoteFor(c, a.depot, switchMonth),
          notes: [
            "Lesart der Wechselkosten für Bestandsverträge ist uneinheitlich (bitte prüfen); D1 und D2 zeigen beide Varianten.",
            "Keine Doppelförderung im Wechseljahr: je Beitragsjahr gilt nur ein Förderrecht (Auslegung § 52 Abs. 50a EStG n. F., bitte prüfen).",
            "Mit dem neuen Vertrag gilt das neue Förderrecht automatisch für alle Verträge der Person.",
            ...COMMON_NOTES,
          ],
        },
      ),
    );
  }
  return results;
}

/** Ungeförderte Verträge (Schicht 3, Basisrente, bAV ohne Übertragungsrecht): Weiterführen, Beitragsfreistellung + Depot, Kündigung + Depot. */
export function runUnsubsidisedScenarios(c: ContractState, a: ScenarioAssumptions): ScenarioResult[] {
  const switchMonth = a.switchMonth ?? defaultSwitchMonth(c);
  const results: ScenarioResult[] = [];
  const depotTerm = c.termMonths - switchMonth;
  const notTransferable = "Eine Übertragung ins Altersvorsorgedepot ist für ungeförderte Verträge und Basisrenten nicht vorgesehen.";

  // Weiterführen
  {
    const sim = legacyContinue(c, a, []);
    results.push(
      combine(c, a, "L3_CONTINUE", "Weiterführen", "Vertrag läuft unverändert weiter.", { result: sim, offset: 0 }, [], { switchFees: 0, surrenderLoss: 0, notes: [...COMMON_NOTES] }),
    );
  }

  const dPlan = depotPlan(c, switchMonth);
  const depotContribs = ownContributionEvents(c, dPlan, switchMonth, c.termMonths, switchMonth);
  const eligible = a.person.eligible !== false;
  const allow = eligible ? personAllowances(c, [{ id: "depot", contributions: depotContribs }], () => "new", a) : new Map<Stream["id"], CashEvent[]>();
  const depotAllowances = toLocal(allow.get("depot") ?? [], switchMonth);
  const capNote = `Einzahlungsgrenze Altersvorsorgedepot: ${subsidyNew.annualContributionCap.value.toLocaleString("de-DE")} € je Vertrag und Jahr (§ 1 Abs. 1 S. 1 Nr. 5 AltZertG n. F.).`;
  const eligibilityNote = eligible ? "Zulagen im Depot nach neuem Förderrecht (Zulageberechtigung vorausgesetzt)." : "Keine Zulageberechtigung angenommen – Depot ohne Zulagen gerechnet.";

  // Beitragsfreistellung + Depot
  {
    const plan: ContributionPlan = { ...c.contributions, paidUpFromMonth: switchMonth };
    const legacySim = legacyContinue(c, a, [], plan);
    const depotSim = simulate({ termMonths: depotTerm, contributions: dPlan, costs: depotCosts(a.depot, true), grossReturnPercent: a.grossReturnPercent, allowances: depotAllowances });
    results.push(
      combine(c, a, "L3_PAIDUP_DEPOT", "Beitragsfrei stellen + Depot", "Bestehender Vertrag wird beitragsfrei gestellt und läuft weiter; neue Beiträge fließen ins Altersvorsorgedepot.", { result: legacySim, offset: 0 }, [{ result: depotSim, offset: switchMonth }], {
        switchFees: 0,
        surrenderLoss: 0,
        notes: [notTransferable, eligibilityNote, capNote, ...COMMON_NOTES],
      }),
    );
  }

  // Kündigung + Depot
  {
    const legacySim = simulate({
      termMonths: switchMonth,
      contributions: c.contributions,
      costs: c.costs,
      grossReturnPercent: a.grossReturnPercent,
      start: { month: c.elapsedMonths, value: c.currentValue },
    });
    const valueAtSwitch = legacySim.finalValueNet;
    const surrender =
      a.transferValue ??
      (switchMonth === c.elapsedMonths && c.surrenderValue !== undefined
        ? c.surrenderValue
        : valueAtSwitch - surrenderDeduction(c.costs.surrender, valueAtSwitch, Math.floor(switchMonth / 12) + 1));
    const free = a.freeInvestment ?? { ...a.depot, alphaPercentOfPremium: 0, label: "freie Anlage" };
    const lumpSim = simulate({
      termMonths: depotTerm,
      contributions: { amount: 0, frequency: "none", singlePremium: surrender },
      costs: depotCosts(free, false),
      grossReturnPercent: a.grossReturnPercent,
    });
    const depotSim = simulate({ termMonths: depotTerm, contributions: dPlan, costs: depotCosts(a.depot, true), grossReturnPercent: a.grossReturnPercent, allowances: depotAllowances });
    results.push(
      combine(
        c,
        a,
        "L3_SURRENDER_DEPOT",
        "Kündigung + Depot",
        "Vertrag wird gekündigt; der Rückkaufswert wird frei angelegt, laufende Beiträge fließen ins Altersvorsorgedepot.",
        { result: legacySim, offset: 0 },
        [
          { result: lumpSim, offset: switchMonth, internalSingle: true } as Leg & { internalSingle: boolean },
          { result: depotSim, offset: switchMonth },
        ],
        {
          switchFees: 0,
          surrenderLoss: Math.max(0, valueAtSwitch - surrender),
          legacyEndsAt: switchMonth,
          guaranteeNote:
            c.layer === "basis"
              ? "Basisrenten sind grundsätzlich nicht kündbar (nur Beitragsfreistellung); Szenario nur zur Information."
              : undefined,
          notes: [
            notTransferable,
            "Kündigungskapital: Einmalbetrag in freier Anlage (Kosten wie Depot ohne Abschlusskosten, sofern nicht abweichend eingegeben), weil die Einzahlung ins geförderte Depot je Jahr begrenzt ist.",
            "Bei Kündigung können Steuern auf Erträge anfallen; Garantien und Rentenfaktoren des Altvertrags entfallen.",
            eligibilityNote,
            capNote,
            ...COMMON_NOTES,
          ],
        },
      ),
    );
  }
  return results;
}

export function runScenarios(c: ContractState, a: ScenarioAssumptions): ScenarioResult[] {
  return c.layer === "riester" ? runRiesterScenarios(c, a) : runUnsubsidisedScenarios(c, a);
}

export interface SensitivityCell {
  grossReturnPercent: number;
  retirementShiftYears: number;
  endCapital: Record<string, number>;
  effectiveCostsPp: Record<string, number | null>;
}

/** Sensitivität: Endkapital und Effektivkosten je Szenario über Bruttorendite × Verschiebung des Rentenbeginns. */
export function scenarioSensitivity(
  c: ContractState,
  a: ScenarioAssumptions,
  returns: number[] = [2, 4, 6],
  shiftsYears: number[] = [-5, 0, 5],
): SensitivityCell[] {
  const out: SensitivityCell[] = [];
  for (const r of returns) {
    for (const s of shiftsYears) {
      const term = c.termMonths + s * 12;
      if (term <= Math.max(c.elapsedMonths, a.switchMonth ?? defaultSwitchMonth(c)) + 12) continue;
      const shifted: ContractState = {
        ...c,
        termMonths: term,
        contributions: {
          ...c.contributions,
          paymentMonths: c.contributions.paymentMonths !== undefined ? Math.min(c.contributions.paymentMonths + s * 12, term) : undefined,
        },
      };
      const res = runScenarios(shifted, { ...a, grossReturnPercent: r });
      out.push({
        grossReturnPercent: r,
        retirementShiftYears: s,
        endCapital: Object.fromEntries(res.map((x) => [x.id, x.endCapital])),
        effectiveCostsPp: Object.fromEntries(res.map((x) => [x.id, x.effectiveCostsPp])),
      });
    }
  }
  return out;
}
