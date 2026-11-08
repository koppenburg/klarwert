/**
 * Vertragsanalyse: bündelt Simulation, Effektivkosten, Rückkaufswertverlauf und Rentenphase
 * für mehrere Bruttorenditen (Standard 2/4/6 % plus PIB-Satz).
 */
import { simulate } from "./accumulation";
import { buildAllowanceSchedule, type AllowancePerson } from "./allowances";
import { effectiveCosts } from "./effective-costs";
import { annuityFromCapital, comparePayout, type AnnuityResult, type PayoutComparisonResult } from "./payout";
import type { ContractLayer } from "./scenarios";
import type { CashEvent, ContributionPlan, CostFactors, EffectiveCostsResult, SimulationInput, SimulationResult } from "./types";

export const DEFAULT_RETURNS = [2, 4, 6] as const;

export interface ContractModel {
  label: string;
  layer: ContractLayer;
  startYear: number;
  startMonth: number;
  termMonths: number;
  contributions: ContributionPlan;
  costs: CostFactors;
  /** im PIB ausgewiesene Werte (Plausibilitätsanker) */
  pib?: { grossReturnPercent: number; effectiveCostsPp: number };
}

export interface AnalysisAssumptions {
  returns?: number[];
  /** Zulagenberechnung (nur Riester): Person; ohne Angabe keine Zulagen */
  person?: AllowancePerson;
  /** Zulagen ab diesem Kalenderjahr nach neuem Recht (Standard: nie) */
  newRuleFromYear?: number;
  retirementAge?: number;
  lifeExpectancyAge?: number;
  payoutPlanEndAge?: number;
  payoutGrossReturnPercent?: number;
  payoutPlanCostPercent?: number;
  /** bei geförderten Verträgen: erhaltene Steuervorteile, die bei schädlicher Verwendung zurückzuzahlen sind (Annahme, nicht berechnet) */
  taxBenefitsReceived?: number;
}

export interface SurrenderPoint {
  year: number;
  ownContributionsCum: number;
  allowancesCum: number;
  valueNet: number;
  surrenderValue: number;
  /** Nettoauszahlung bei geförderten Verträgen nach Rückzahlung der Förderung (Zulagen + angegebene Steuervorteile) */
  netAfterSubsidyRepayment: number | null;
}

export interface ReturnAnalysis {
  grossReturnPercent: number;
  isPib: boolean;
  simulation: SimulationResult;
  effectiveCosts: EffectiveCostsResult;
  annuity: AnnuityResult;
  payoutComparison: PayoutComparisonResult | null;
  surrenderCurve: SurrenderPoint[];
  /** erstes Vertragsjahr, in dem der Rückkaufswert die Summe der Eigenbeiträge erreicht */
  breakEvenYear: number | null;
}

export interface ContractAnalysis {
  model: ContractModel;
  allowanceSchedule: CashEvent[];
  results: ReturnAnalysis[];
  /** Abweichung berechnete − ausgewiesene Effektivkosten bei PIB-Annahme (Prozentpunkte) */
  pibDeviationPp: number | null;
}

export function contractAllowances(model: ContractModel, a: AnalysisAssumptions): CashEvent[] {
  if (model.layer !== "riester" || !a.person) return [];
  // Eigenbeiträge laut Plan (ohne Kosten) aus einem kostenfreien Lauf
  const base = simulate({ termMonths: model.termMonths, contributions: model.contributions, costs: {}, grossReturnPercent: 0 });
  const own = base.months.map((m) => ({ month: m.month, amount: m.premium + m.singlePremium + m.topUp })).filter((e) => e.amount > 0);
  return buildAllowanceSchedule({
    contractStartYear: model.startYear,
    contractStartCalendarMonth: model.startMonth,
    ownContributions: own,
    person: a.person,
    ruleForYear: (y) => (a.newRuleFromYear !== undefined && y >= a.newRuleFromYear ? "new" : "old"),
    termMonths: model.termMonths,
  }).events;
}

export function analyzeContract(model: ContractModel, a: AnalysisAssumptions = {}): ContractAnalysis {
  const allowances = contractAllowances(model, a);
  const returns = [...(a.returns ?? DEFAULT_RETURNS)];
  const pibReturn = model.pib?.grossReturnPercent;
  if (pibReturn !== undefined && !returns.includes(pibReturn)) returns.push(pibReturn);
  returns.sort((x, y) => x - y);

  const results: ReturnAnalysis[] = returns.map((r) => {
    const input: SimulationInput = { termMonths: model.termMonths, contributions: model.contributions, costs: model.costs, grossReturnPercent: r, allowances };
    const simulation = simulate(input);
    const ec = effectiveCosts(input);
    const annuity = annuityFromCapital(simulation.finalValueNet, model.costs.payout, a.retirementAge);
    const monthly = annuity.monthlyCurrent ?? annuity.monthlyGuaranteed;
    const payoutComparison =
      monthly !== null && a.retirementAge !== undefined && a.lifeExpectancyAge !== undefined
        ? comparePayout({
            capital: simulation.finalValueNet,
            monthlyAnnuity: monthly,
            guaranteePeriodMonths: model.costs.payout?.guaranteePeriodMonths,
            retirementAge: a.retirementAge,
            lifeExpectancyAge: a.lifeExpectancyAge,
            payoutPlanEndAge: a.payoutPlanEndAge ?? 85,
            payoutGrossReturnPercent: a.payoutGrossReturnPercent ?? r,
            payoutPlanCostPercent: a.payoutPlanCostPercent ?? 0,
          })
        : null;
    const subsidised = model.layer === "riester";
    const surrenderCurve: SurrenderPoint[] = simulation.years.map((y) => ({
      year: y.year,
      ownContributionsCum: y.ownPremiumsCum,
      allowancesCum: y.allowancesCum,
      valueNet: y.valueNet,
      surrenderValue: y.surrenderValue,
      netAfterSubsidyRepayment: subsidised ? y.surrenderValue - y.allowancesCum - (a.taxBenefitsReceived ?? 0) : null,
    }));
    const be = surrenderCurve.find((p) => p.ownContributionsCum > 0 && (p.netAfterSubsidyRepayment ?? p.surrenderValue) >= p.ownContributionsCum);
    return {
      grossReturnPercent: r,
      isPib: r === pibReturn,
      simulation,
      effectiveCosts: ec,
      annuity,
      payoutComparison,
      surrenderCurve,
      breakEvenYear: be?.year ?? null,
    };
  });
  const pibResult = results.find((x) => x.isPib);
  const pibDeviationPp =
    model.pib && pibResult?.effectiveCosts.reductionInYieldPp != null ? pibResult.effectiveCosts.reductionInYieldPp - model.pib.effectiveCostsPp : null;
  return { model, allowanceSchedule: allowances, results, pibDeviationPp };
}
