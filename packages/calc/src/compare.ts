/**
 * Vergleich von 2–3 Verträgen unter identischen Annahmen (Bruttorendite, Laufzeit, Beitrag).
 * mode "tariff": jeder Tarif wird so gerechnet, als würde er heute mit gleichem Beitrag und gleicher
 *                Laufzeit neu abgeschlossen (reiner Tarif-Kostenvergleich).
 * mode "remaining": Fortschreibung ab Ist-Guthaben über die gemeinsame Restlaufzeit mit gleichem Beitrag;
 *                bereits getilgte Abschlusskosten fallen nicht erneut an.
 */
import { simulate } from "./accumulation";
import { effectiveCosts } from "./effective-costs";
import type { ContributionPlan, CostBreakdown, CostFactors } from "./types";

export interface ComparableContract {
  id: string;
  label: string;
  costs: CostFactors;
  /** für mode "remaining" */
  elapsedMonths?: number;
  currentValue?: number;
}

export interface CommonAssumptions {
  mode: "tariff" | "remaining";
  grossReturnPercent: number;
  /** Laufzeit (tariff) bzw. Restlaufzeit (remaining) in Monaten */
  termMonths: number;
  monthlyContribution: number;
  dynamicsPercent?: number;
}

export interface ComparisonRow {
  id: string;
  label: string;
  endCapital: number;
  endCapitalGross: number;
  ownContributions: number;
  costsTotal: number;
  costsByKind: CostBreakdown;
  effectiveCostsPp: number | null;
  effectiveCostsByKind: CostBreakdown | null;
}

export function compareContracts(contracts: ComparableContract[], common: CommonAssumptions): ComparisonRow[] {
  if (contracts.length < 1 || contracts.length > 3) throw new Error("Vergleich erwartet 1 bis 3 Verträge");
  return contracts.map((c) => {
    const elapsed = common.mode === "remaining" ? (c.elapsedMonths ?? 0) : 0;
    const plan: ContributionPlan = {
      amount: common.monthlyContribution,
      frequency: "monthly",
      paymentMonths: elapsed + common.termMonths,
      dynamics: common.dynamicsPercent ? { ratePercent: common.dynamicsPercent } : undefined,
    };
    const input = {
      termMonths: elapsed + common.termMonths,
      contributions: plan,
      costs: c.costs,
      grossReturnPercent: common.grossReturnPercent,
      start: common.mode === "remaining" ? { month: elapsed, value: c.currentValue ?? 0 } : undefined,
    };
    const sim = simulate(input);
    const ec = effectiveCosts(input);
    return {
      id: c.id,
      label: c.label,
      endCapital: sim.finalValueNet,
      endCapitalGross: sim.finalValueGross,
      ownContributions: sim.ownPremiumsTotal,
      costsTotal: sim.costsTotalSum,
      costsByKind: sim.costsTotal,
      effectiveCostsPp: ec.reductionInYieldPp,
      effectiveCostsByKind: ec.byKind,
    };
  });
}
