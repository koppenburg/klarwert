/**
 * Rentenphase: Rente aus Rentenfaktor, Rentenkosten, Rentengarantiezeit, Kapitalabfindung
 * sowie Vergleich Rente gegen Auszahlplan bei eingegebener Lebenserwartung.
 * Steuern und Sozialabgaben werden nicht gerechnet.
 */
import { monthlyRate } from "./accumulation";
import { annuityFactorAt } from "./tiers";
import type { PayoutTerms } from "./types";

export interface AnnuityResult {
  capital: number;
  /** Monatsrente garantiert (nach Rentenkosten) */
  monthlyGuaranteed: number | null;
  /** Monatsrente mit aktuellem Rentenfaktor (nach Rentenkosten, nicht garantiert) */
  monthlyCurrent: number | null;
  /** Rentenkosten in € p.a. bezogen auf die aktuelle (sonst garantierte) Rente */
  annualAnnuityCosts: number;
  lumpSumNet: number;
  lumpSumCosts: number;
}

/** `retirementAge`: nötig, wenn die Rentenfaktoren als Tabelle je Rentenbeginnalter vorliegen. */
export function annuityFromCapital(capital: number, terms: PayoutTerms | undefined, retirementAge?: number): AnnuityResult {
  const base = terms ?? {};
  const table = base.annuityFactorTable ?? [];
  const t: PayoutTerms = {
    ...base,
    annuityFactorGuaranteed: base.annuityFactorGuaranteed ?? (retirementAge !== undefined ? (annuityFactorAt(table, retirementAge, "guaranteed") ?? undefined) : undefined),
    annuityFactorCurrent: base.annuityFactorCurrent ?? (retirementAge !== undefined ? (annuityFactorAt(table, retirementAge, "current") ?? undefined) : undefined),
  };
  const costPct = (t.annuityCostPercent ?? 0) / 100;
  const included = t.annuityCostIncludedInFactor ?? true;
  const fromFactor = (factor: number | undefined): number | null => {
    if (factor === undefined) return null;
    const raw = (capital / 10_000) * factor;
    return included ? raw : raw * (1 - costPct);
  };
  const g = fromFactor(t.annuityFactorGuaranteed);
  const cur = fromFactor(t.annuityFactorCurrent);
  const ref = cur ?? g ?? 0;
  // Bei enthaltenen Kosten: Bruttorente = Nettorente / (1 − k); Kosten = Differenz
  const grossRef = costPct < 1 ? ref / (1 - costPct) : ref;
  const annualAnnuityCosts = (grossRef - ref) * 12;
  const lumpSumCosts = capital * ((t.lumpSumCostPercent ?? 0) / 100);
  return { capital, monthlyGuaranteed: g, monthlyCurrent: cur, annualAnnuityCosts, lumpSumNet: capital - lumpSumCosts, lumpSumCosts };
}

export interface PayoutComparisonInput {
  capital: number;
  monthlyAnnuity: number;
  guaranteePeriodMonths?: number;
  retirementAge: number;
  /** eingegebene Lebenserwartung (Alter) */
  lifeExpectancyAge: number;
  /** Auszahlplan: Endalter (gesetzlich mindestens 85 beim Altersvorsorgedepot) */
  payoutPlanEndAge: number;
  /** Bruttorendite während der Auszahlphase in % p.a. */
  payoutGrossReturnPercent: number;
  /** laufende Kosten des Auszahlplans in % p.a. des Restkapitals */
  payoutPlanCostPercent: number;
}

export interface PayoutComparisonResult {
  /** Monatliche Entnahme des Auszahlplans (konstant, Kapital am Endalter aufgebraucht) */
  payoutPlanMonthly: number;
  /** Summe der Rentenzahlungen bis zur Lebenserwartung (mind. Garantiezeit, Rest an Erben) */
  annuityTotalToLifeExpectancy: number;
  /** Summe der Entnahmen bis zur Lebenserwartung plus Restkapital (an Erben), falls vor Endalter */
  payoutPlanTotalToLifeExpectancy: number;
  payoutPlanResidualAtLifeExpectancy: number;
  /** Alter, ab dem die Summe der Renten das Kapital übersteigt */
  annuityBreakEvenAge: number | null;
  /** Monate ohne Einkommen aus dem Auszahlplan, falls Lebenserwartung > Endalter */
  payoutPlanGapMonths: number;
}

export function comparePayout(input: PayoutComparisonInput): PayoutComparisonResult {
  const planMonths = Math.max(0, Math.round((input.payoutPlanEndAge - input.retirementAge) * 12));
  const lifeMonths = Math.max(0, Math.round((input.lifeExpectancyAge - input.retirementAge) * 12));
  const i = monthlyRate(input.payoutGrossReturnPercent);
  const cost = input.payoutPlanCostPercent / 100 / 12;
  // effektiver Monatsfaktor: Wachstum, dann Kosten auf das Restkapital (Konvention wie Ansparphase)
  const growth = (1 + i) * (1 - cost);
  // Entnahme am Monatsanfang, Kapital nach planMonths aufgebraucht
  let payoutPlanMonthly = 0;
  if (planMonths > 0) {
    const g = growth;
    const annuityDue = Math.abs(g - 1) < 1e-12 ? planMonths : ((1 - Math.pow(g, -planMonths)) / (1 - 1 / g)) ;
    payoutPlanMonthly = input.capital / annuityDue;
  }
  let residual = input.capital;
  let planTotal = 0;
  const horizon = Math.min(lifeMonths, planMonths);
  for (let m = 0; m < horizon; m++) {
    residual -= payoutPlanMonthly;
    planTotal += payoutPlanMonthly;
    residual *= growth;
  }
  const residualAtLife = lifeMonths < planMonths ? Math.max(residual, 0) : 0;
  const annuityMonths = Math.max(lifeMonths, input.guaranteePeriodMonths ?? 0);
  const annuityTotal = input.monthlyAnnuity * annuityMonths;
  const breakEvenMonths = input.monthlyAnnuity > 0 ? Math.ceil(input.capital / input.monthlyAnnuity) : null;
  return {
    payoutPlanMonthly,
    annuityTotalToLifeExpectancy: annuityTotal,
    payoutPlanTotalToLifeExpectancy: planTotal + residualAtLife,
    payoutPlanResidualAtLifeExpectancy: residualAtLife,
    annuityBreakEvenAge: breakEvenMonths === null ? null : input.retirementAge + breakEvenMonths / 12,
    payoutPlanGapMonths: Math.max(0, lifeMonths - planMonths),
  };
}
