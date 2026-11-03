/**
 * Monatsgenaue Simulation der Ansparphase.
 *
 * Ablauf je Monat m (dokumentiert, damit Referenzfälle von Hand nachrechenbar sind):
 *  1. Zuflüsse am Monatsanfang: laufender Beitrag (falls Zahlungsmonat und nicht beitragsfrei),
 *     Einmalbeitrag (Monat 0), Zuzahlungen, Zulagen.
 *  2. Sofortkosten: β auf Beitrag/Zuzahlung/Zulage, α-Rate laut Tilgungsplan, α auf Zuzahlung/
 *     Einmalbeitrag/Zulage, Kosten der Beitragsfreistellung.
 *  3. Wertentwicklung: Guthaben × (1 + r)^(1/12).
 *  4. Monatsendkosten: (γ + Garantiekosten + Fondskosten netto)/12 × Guthaben, κ/12.
 * Abzüge werden auf das vorhandene Guthaben begrenzt (Guthaben wird nie negativ).
 */
import {
  COST_KINDS,
  type CashEvent,
  type ContributionPlan,
  type CostBreakdown,
  type CostFactors,
  type CostKind,
  type MonthRow,
  type PaymentFrequency,
  type SimulationInput,
  type SimulationResult,
  type SurrenderRules,
  type YearRow,
} from "./types";

export function emptyBreakdown(): CostBreakdown {
  return Object.fromEntries(COST_KINDS.map((k) => [k, 0])) as CostBreakdown;
}

export function sumBreakdown(b: CostBreakdown): number {
  return COST_KINDS.reduce((s, k) => s + b[k], 0);
}

export function addBreakdown(a: CostBreakdown, b: CostBreakdown): CostBreakdown {
  const out = emptyBreakdown();
  for (const k of COST_KINDS) out[k] = a[k] + b[k];
  return out;
}

export function monthlyRate(annualPercent: number): number {
  return Math.pow(1 + annualPercent / 100, 1 / 12) - 1;
}

const FREQUENCY_INTERVAL: Record<PaymentFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
  none: 0,
};

export function paymentsPerYear(frequency: PaymentFrequency): number {
  const interval = FREQUENCY_INTERVAL[frequency];
  return interval === 0 ? 0 : 12 / interval;
}

/** Ist m ein planmäßiger Zahlungsmonat (ohne Berücksichtigung der Beitragsfreistellung)? */
export function isScheduledPaymentMonth(plan: ContributionPlan, termMonths: number, m: number): boolean {
  const interval = FREQUENCY_INTERVAL[plan.frequency];
  if (interval === 0 || plan.amount <= 0) return false;
  const paymentMonths = plan.paymentMonths ?? termMonths;
  return m < paymentMonths && m < termMonths && m % interval === 0;
}

function isPaidUp(plan: ContributionPlan, m: number): boolean {
  return plan.paidUpFromMonth !== undefined && m >= plan.paidUpFromMonth;
}

/** Monate, in denen eine Dynamikerhöhung wirksam wird (12, 24, …), unter Beachtung von Ende und Beitragsfreistellung. */
export function dynamicIncreaseMonths(plan: ContributionPlan, termMonths: number): number[] {
  const d = plan.dynamics;
  if (!d || d.ratePercent <= 0) return [];
  const paymentMonths = plan.paymentMonths ?? termMonths;
  const until = Math.min(d.untilMonth ?? paymentMonths, paymentMonths, plan.paidUpFromMonth ?? Infinity);
  const out: number[] = [];
  for (let a = 12; a < until; a += 12) out.push(a);
  return out;
}

/** Laufender Beitrag im Monat m inklusive Dynamik (0, falls kein Zahlungsmonat oder beitragsfrei). */
export function premiumAt(plan: ContributionPlan, termMonths: number, m: number): number {
  if (!isScheduledPaymentMonth(plan, termMonths, m) || isPaidUp(plan, m)) return 0;
  return regularAmountAt(plan, termMonths, m);
}

function regularAmountAt(plan: ContributionPlan, termMonths: number, m: number): number {
  const increases = dynamicIncreaseMonths(plan, termMonths).filter((a) => a <= m).length;
  const rate = (plan.dynamics?.ratePercent ?? 0) / 100;
  return plan.amount * Math.pow(1 + rate, increases);
}

/**
 * Tilgungsplan der α-Kosten auf laufende Beiträge: Monat → Betrag.
 * Die Raten fallen an den planmäßigen Zahlungsterminen im Verteilungsfenster an.
 */
export function alphaSchedule(plan: ContributionPlan, costs: CostFactors, termMonths: number): Map<number, number> {
  const schedule = new Map<number, number>();
  const alpha = costs.alpha;
  if (!alpha || alpha.rate === 0 || FREQUENCY_INTERVAL[plan.frequency] === 0) return schedule;
  const paymentMonths = Math.min(plan.paymentMonths ?? termMonths, termMonths);
  const distribution = alpha.distributionMonths ?? 60;
  const basisMonths = alpha.premiumSumBasisMonths ?? paymentMonths;

  const tranches: Array<{ from: number; amount: number }> = [{ from: 0, amount: plan.amount }];
  if (alpha.onDynamics ?? true) {
    for (const a of dynamicIncreaseMonths(plan, termMonths)) {
      const before = regularAmountAt(plan, termMonths, a - 1);
      const after = regularAmountAt(plan, termMonths, a);
      tranches.push({ from: a, amount: after - before });
    }
  }

  for (const t of tranches) {
    const windowEnd = Math.min(t.from + distribution, paymentMonths);
    const eventsInWindow: number[] = [];
    for (let m = t.from; m < windowEnd; m++) {
      if (isScheduledPaymentMonth(plan, termMonths, m)) eventsInWindow.push(m);
    }
    if (eventsInWindow.length === 0) continue;
    if (alpha.mode === "permille_of_premium_sum") {
      const basisEnd = Math.min(basisMonths, paymentMonths);
      let events = 0;
      for (let m = t.from; m < basisEnd; m++) if (isScheduledPaymentMonth(plan, termMonths, m)) events++;
      const total = (alpha.rate / 1000) * t.amount * events;
      const rate = total / eventsInWindow.length;
      for (const m of eventsInWindow) schedule.set(m, (schedule.get(m) ?? 0) + rate);
    } else {
      const perEvent = (alpha.rate / 100) * t.amount;
      for (const m of eventsInWindow) schedule.set(m, (schedule.get(m) ?? 0) + perEvent);
    }
  }
  return schedule;
}

export function alphaWindowEnd(plan: ContributionPlan, costs: CostFactors, termMonths: number): number {
  const paymentMonths = Math.min(plan.paymentMonths ?? termMonths, termMonths);
  return Math.min(costs.alpha?.distributionMonths ?? 60, paymentMonths);
}

/** Stornoabzug für ein Guthaben im Vertragsjahr `year` (1-basiert). */
export function surrenderDeduction(rules: SurrenderRules | undefined, value: number, year: number): number {
  if (!rules || value <= 0) return 0;
  let percent = rules.percentOfValue ?? 0;
  for (const s of rules.schedule ?? []) {
    if (year >= s.fromYear && year <= (s.toYear ?? Infinity)) percent = s.percentOfValue;
  }
  let d = (percent / 100) * value + (rules.fixedEur ?? 0);
  if (rules.maxEur !== undefined) d = Math.min(d, rules.maxEur);
  return Math.max(0, Math.min(d, value));
}

/** Kostenarten, die in einem Lauf aktiv sind (für Brutto-Lauf und Effektivkosten-Zerlegung). */
export type EnabledKinds = ReadonlySet<CostKind>;
const ALL_KINDS: EnabledKinds = new Set(COST_KINDS);

interface Ledger {
  value: number;
  costs: CostBreakdown;
}

function charge(ledger: Ledger, kind: CostKind, amount: number, enabled: EnabledKinds): void {
  if (!enabled.has(kind) || amount === 0) return;
  // Gutschriften (z. B. Rückvergütung > TER) voll, Belastungen höchstens bis zum vorhandenen Guthaben
  const actual = amount < 0 ? amount : Math.min(amount, Math.max(ledger.value, 0));
  ledger.value -= actual;
  ledger.costs[kind] += actual;
}

function eventsAt(events: CashEvent[] | undefined, m: number): number {
  if (!events) return 0;
  let s = 0;
  for (const e of events) if (e.month === m) s += e.amount;
  return s;
}

/**
 * Kernsimulation mit wählbaren aktiven Kostenarten.
 * Liefert nur die Monatszeilen (netto) – Bruttowerte und Jahreszeilen ergänzt `simulate`.
 */
export function simulateMonths(input: SimulationInput, enabled: EnabledKinds = ALL_KINDS): MonthRow[] {
  const { termMonths, contributions: plan, costs } = input;
  const i = monthlyRate(input.grossReturnPercent);
  const schedule = alphaSchedule(plan, costs, termMonths);
  const windowEnd = alphaWindowEnd(plan, costs, termMonths);
  const onPaidUp = costs.alpha?.onPaidUp ?? "stop";
  const startMonth = input.start?.month ?? 0;
  const ledger: Ledger = { value: input.start?.value ?? 0, costs: emptyBreakdown() };
  const rows: MonthRow[] = [];

  for (let m = startMonth; m < termMonths; m++) {
    ledger.costs = emptyBreakdown();
    const paidUp = isPaidUp(plan, m);
    const premium = premiumAt(plan, termMonths, m);
    const singlePremium = m === 0 ? (plan.singlePremium ?? 0) : 0;
    const topUp = (plan.topUps ?? []).filter((t) => t.month === m).reduce((s, t) => s + t.amount, 0);
    const allowance = eventsAt(input.allowances, m);

    // 1. Zuflüsse
    ledger.value += premium + singlePremium + topUp + allowance;

    // 2. Sofortkosten
    const beta = costs.beta;
    if (beta) {
      const premiumRate = m >= windowEnd && beta.percentOfPremiumAfterAlpha !== undefined ? beta.percentOfPremiumAfterAlpha : beta.percentOfPremium;
      const topUpRate = beta.onTopUpsPercent ?? beta.percentOfPremium;
      const allowanceRate = beta.onAllowancesPercent ?? beta.percentOfPremium;
      charge(ledger, "beta", (premiumRate / 100) * premium + (topUpRate / 100) * (topUp + singlePremium) + (allowanceRate / 100) * allowance, enabled);
    }
    const alpha = costs.alpha;
    if (alpha) {
      let installment = 0;
      if (!paidUp || onPaidUp === "continue") {
        installment = schedule.get(m) ?? 0;
      } else if (onPaidUp === "charge_remaining" && m === plan.paidUpFromMonth) {
        for (const [month, amount] of schedule) if (month >= m) installment += amount;
      }
      installment += ((alpha.onTopUpsPercent ?? 0) / 100) * topUp;
      installment += ((alpha.onSinglePremiumPercent ?? 0) / 100) * singlePremium;
      installment += ((alpha.onAllowancesPercent ?? 0) / 100) * allowance;
      charge(ledger, "alpha", installment, enabled);
    }
    if (plan.paidUpFromMonth === m && costs.paidUpFeeEur) charge(ledger, "paidUpFee", costs.paidUpFeeEur, enabled);

    // 3. Wertentwicklung
    ledger.value *= 1 + i;

    // 4. Monatsendkosten auf das Guthaben
    const valueBase = Math.max(ledger.value, 0);
    const gammaRate = paidUp && costs.gamma?.percentOfValuePaidUp !== undefined ? costs.gamma.percentOfValuePaidUp : (costs.gamma?.percentOfValue ?? 0);
    const fundRate = (costs.fund?.terPercent ?? 0) - (costs.fund?.kickbackPercent ?? 0);
    const guaranteeRate = costs.guarantee?.percentOfValue ?? 0;
    const gammaAmt = (gammaRate / 100 / 12) * valueBase;
    const fundAmt = (fundRate / 100 / 12) * valueBase;
    const guaranteeAmt = (guaranteeRate / 100 / 12) * valueBase;
    charge(ledger, "gamma", gammaAmt, enabled);
    charge(ledger, "fund", fundAmt, enabled);
    charge(ledger, "guarantee", guaranteeAmt, enabled);
    const kappaYear = paidUp && costs.kappa?.eurPerYearPaidUp !== undefined ? costs.kappa.eurPerYearPaidUp : (costs.kappa?.eurPerYear ?? 0);
    charge(ledger, "kappa", kappaYear / 12, enabled);

    rows.push({
      month: m,
      premium,
      singlePremium,
      topUp,
      allowance,
      costs: ledger.costs,
      valueNet: ledger.value,
      valueGross: 0,
      paidUp,
    });
  }
  return rows;
}

/** Cashflows für den internen Zinsfuß: Einzahlungen negativ zum Monatsanfang, Endwert positiv nach dem letzten Monat. */
export function buildCashflows(input: SimulationInput, months: MonthRow[], finalValue: number): CashEvent[] {
  const flows: CashEvent[] = [];
  if (input.start && input.start.value !== 0) flows.push({ month: input.start.month, amount: -input.start.value });
  for (const r of months) {
    const inflow = r.premium + r.singlePremium + r.topUp + r.allowance;
    if (inflow !== 0) flows.push({ month: r.month, amount: -inflow });
  }
  flows.push({ month: input.termMonths, amount: finalValue });
  return flows;
}

const NO_KINDS: EnabledKinds = new Set();

/** Vollständige Simulation: netto, brutto (ohne Kosten), Jahreszeilen mit Rückkaufswerten. */
export function simulate(input: SimulationInput): SimulationResult {
  validateInput(input);
  const months = simulateMonths(input);
  const gross = simulateMonths(input, NO_KINDS);
  months.forEach((row, idx) => {
    row.valueGross = gross[idx]?.valueNet ?? 0;
  });

  const years: YearRow[] = [];
  let ownCum = 0;
  let allowCum = 0;
  let costsCum = emptyBreakdown();
  let current: YearRow | undefined;
  for (const r of months) {
    const year = Math.floor(r.month / 12) + 1;
    if (!current || current.year !== year) {
      current = {
        year,
        endMonth: r.month,
        ownPremiums: 0,
        allowances: 0,
        ownPremiumsCum: 0,
        allowancesCum: 0,
        costs: emptyBreakdown(),
        costsCum: emptyBreakdown(),
        costsTotal: 0,
        costsTotalCum: 0,
        valueNet: 0,
        valueGross: 0,
        surrenderDeduction: 0,
        surrenderValue: 0,
      };
      years.push(current);
    }
    const own = r.premium + r.singlePremium + r.topUp;
    current.ownPremiums += own;
    current.allowances += r.allowance;
    ownCum += own;
    allowCum += r.allowance;
    current.costs = addBreakdown(current.costs, r.costs);
    costsCum = addBreakdown(costsCum, r.costs);
    current.endMonth = r.month;
    current.ownPremiumsCum = ownCum;
    current.allowancesCum = allowCum;
    current.costsCum = costsCum;
    current.costsTotal = sumBreakdown(current.costs);
    current.costsTotalCum = sumBreakdown(costsCum);
    current.valueNet = r.valueNet;
    current.valueGross = r.valueGross;
    current.surrenderDeduction = surrenderDeduction(input.costs.surrender, r.valueNet, year);
    current.surrenderValue = r.valueNet - current.surrenderDeduction;
  }

  const finalValueNet = months.at(-1)?.valueNet ?? input.start?.value ?? 0;
  const finalValueGross = months.at(-1)?.valueGross ?? input.start?.value ?? 0;
  return {
    input,
    months,
    years,
    ownPremiumsTotal: ownCum,
    allowancesTotal: allowCum,
    costsTotal: costsCum,
    costsTotalSum: sumBreakdown(costsCum),
    finalValueNet,
    finalValueGross,
    cashflows: buildCashflows(input, months, finalValueNet),
  };
}

export class CalcInputError extends Error {}

export function validateInput(input: SimulationInput): void {
  const errors: string[] = [];
  // termMonths = 0 nur als leere Fortschreibung (Wechsel am Stichtag) zulässig
  if (!Number.isInteger(input.termMonths) || input.termMonths < 0 || (input.termMonths === 0 && input.start?.month !== 0)) errors.push("Ansparphase (termMonths) muss eine positive ganze Zahl sein");
  if (!Number.isFinite(input.grossReturnPercent) || input.grossReturnPercent <= -100) errors.push("Bruttorendite ungültig");
  const p = input.contributions;
  if (p.amount < 0) errors.push("Beitrag darf nicht negativ sein");
  if (p.paidUpFromMonth !== undefined && p.paidUpFromMonth < 0) errors.push("Beitragsfreistellung ungültig");
  if (input.start && (input.start.month < 0 || input.start.month > input.termMonths)) errors.push("Startmonat außerhalb der Laufzeit");
  if (input.costs.alpha?.distributionMonths !== undefined && input.costs.alpha.distributionMonths < 1) errors.push("α-Verteilungszeitraum muss ≥ 1 Monat sein");
  if (errors.length) throw new CalcInputError(errors.join("; "));
}
