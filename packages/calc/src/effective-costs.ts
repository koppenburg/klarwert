/**
 * Effektivkosten = Renditeminderung p.a. (Reduction in Yield):
 *   interner Zinsfuß der Zahlungsströme ohne Kosten − interner Zinsfuß mit allen Kosten,
 * jeweils bis zum Beginn der Auszahlungsphase (§ 2 Abs. 1 Nr. 9 VVG-InfoV).
 *
 * Zerlegung nach Kostenart: sequentiell in der Reihenfolge COST_KINDS (α, β, γ, κ, Fonds, Garantie,
 * Beitragsfreistellung). Jede Kostenart erhält die zusätzliche Renditeminderung, die beim Hinzuschalten
 * entsteht. Die Summe entspricht exakt den gesamten Effektivkosten; die Aufteilung hängt (gering) von
 * der Reihenfolge ab und ist als Näherung gekennzeichnet.
 */
import { buildCashflows, emptyBreakdown, simulateMonths, validateInput } from "./accumulation";
import { irrAnnualPercent } from "./irr";
import { COST_KINDS, type CostKind, type EffectiveCostsResult, type SimulationInput } from "./types";

function irrWith(input: SimulationInput, enabled: ReadonlySet<CostKind>): number | null {
  const months = simulateMonths(input, enabled);
  const final = months.at(-1)?.valueNet ?? input.start?.value ?? 0;
  return irrAnnualPercent(buildCashflows(input, months, final));
}

export function effectiveCosts(input: SimulationInput, opts: { breakdown?: boolean } = {}): EffectiveCostsResult {
  validateInput(input);
  const gross = irrWith(input, new Set());
  const net = irrWith(input, new Set(COST_KINDS));
  const riy = gross !== null && net !== null ? gross - net : null;
  let byKind: EffectiveCostsResult["byKind"] = null;
  if (opts.breakdown !== false && gross !== null && net !== null) {
    byKind = emptyBreakdown();
    const enabled = new Set<CostKind>();
    let prev = gross;
    for (const k of COST_KINDS) {
      enabled.add(k);
      const cur = irrWith(input, enabled);
      if (cur === null) {
        byKind = null;
        break;
      }
      byKind[k] = prev - cur;
      prev = cur;
    }
  }
  return {
    grossReturnPercent: input.grossReturnPercent,
    grossIrrPercent: gross,
    netIrrPercent: net,
    reductionInYieldPp: riy,
    byKind,
  };
}
