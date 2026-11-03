import type { FullAnalysis } from "@/lib/analysis";
import type { CaseBundle } from "@/lib/data";
import { buildSourceRegister } from "./sources";

/** Unveränderlicher Stand aller Report-Zahlen mit Quellen (Tabelle reports.snapshot). Keine Kundennamen. */
export function buildSnapshot(bundle: CaseBundle, full: Extract<FullAnalysis, { ok: true }>) {
  const { built, analysis, scenarios, settings } = full;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    caseNumber: bundle.case.case_number,
    generation: bundle.generation ? { id: bundle.generation.id, label: bundle.generation.label, tariff: bundle.generation.tariff.name, insurer: bundle.generation.tariff.insurer.name } : null,
    model: built.model,
    state: built.state,
    settings,
    pibDeviationPp: analysis.pibDeviationPp,
    results: analysis.results.map((r) => ({
      grossReturnPercent: r.grossReturnPercent,
      isPib: r.isPib,
      effectiveCosts: r.effectiveCosts,
      ownPremiumsTotal: r.simulation.ownPremiumsTotal,
      allowancesTotal: r.simulation.allowancesTotal,
      costsTotal: r.simulation.costsTotal,
      costsTotalSum: r.simulation.costsTotalSum,
      finalValueNet: r.simulation.finalValueNet,
      finalValueGross: r.simulation.finalValueGross,
      annuity: r.annuity,
      payoutComparison: r.payoutComparison,
      breakEvenYear: r.breakEvenYear,
    })),
    scenarios: scenarios
      ? {
          results: scenarios.results.map(({ years: _years, ...rest }) => rest),
          sensitivity: scenarios.sensitivity,
        }
      : null,
    sources: buildSourceRegister(bundle, built, settings, built.model.layer),
  };
}
