import { describe, expect, it } from "vitest";
import { analyzeContract, compareContracts, effectiveCosts, type ContractModel } from "../src/index";

const model: ContractModel = {
  label: "Test",
  layer: "layer3",
  startYear: 2026,
  startMonth: 1,
  termMonths: 360,
  contributions: { amount: 100, frequency: "monthly" },
  costs: {
    alpha: { mode: "permille_of_premium_sum", rate: 25 },
    beta: { percentOfPremium: 5 },
    fund: { terPercent: 0.8 },
    surrender: { percentOfValue: 3 },
    payout: { annuityFactorCurrent: 30, annuityFactorGuaranteed: 24 },
  },
  pib: { grossReturnPercent: 3, effectiveCostsPp: 0 },
};

describe("analyzeContract", () => {
  it("rechnet 2/4/6 % plus PIB-Satz und markiert den PIB-Lauf", () => {
    const a = analyzeContract(model, { retirementAge: 67, lifeExpectancyAge: 87 });
    expect(a.results.map((r) => r.grossReturnPercent)).toEqual([2, 3, 4, 6]);
    expect(a.results.find((r) => r.isPib)?.grossReturnPercent).toBe(3);
    const pibRun = a.results.find((r) => r.isPib);
    expect(a.pibDeviationPp).toBeCloseTo(pibRun?.effectiveCosts.reductionInYieldPp ?? NaN, 10);
    expect(pibRun?.payoutComparison?.payoutPlanMonthly).toBeGreaterThan(0);
  });

  it("Break-even: Rückkaufswert erreicht die Eigenbeiträge erst nach den ersten Jahren", () => {
    const r4 = analyzeContract(model).results.find((r) => r.grossReturnPercent === 4);
    expect(r4?.breakEvenYear).toBeGreaterThan(1);
    expect(r4?.breakEvenYear).toBeLessThan(15);
  });

  it("Riester: Nettoauszahlung bei schädlicher Verwendung zieht Zulagen ab", () => {
    const riester = analyzeContract({ ...model, layer: "riester" }, { person: { children: [], previousYearIncome: 20_000 } });
    const p = riester.results[0]?.surrenderCurve.at(-1);
    expect(p?.allowancesCum).toBeGreaterThan(0);
    expect(p?.netAfterSubsidyRepayment).toBeCloseTo((p?.surrenderValue ?? 0) - (p?.allowancesCum ?? 0), 6);
  });
});

describe("compareContracts", () => {
  it("gleiche Annahmen: der teurere Tarif hat höhere Effektivkosten und geringeres Endkapital", () => {
    const rows = compareContracts(
      [
        { id: "a", label: "günstig", costs: { fund: { terPercent: 0.2 } } },
        { id: "b", label: "teuer", costs: { fund: { terPercent: 1.5 }, beta: { percentOfPremium: 8 } } },
      ],
      { mode: "tariff", grossReturnPercent: 5, termMonths: 300, monthlyContribution: 150 },
    );
    expect(rows[0]?.ownContributions).toBe(rows[1]?.ownContributions);
    expect(rows[1]?.effectiveCostsPp ?? 0).toBeGreaterThan(rows[0]?.effectiveCostsPp ?? Infinity);
    expect(rows[1]?.endCapital ?? Infinity).toBeLessThan(rows[0]?.endCapital ?? 0);
    expect(() => compareContracts([], { mode: "tariff", grossReturnPercent: 5, termMonths: 12, monthlyContribution: 1 })).toThrow();
  });

  it("Fondskosten 1 % auf laufende Beiträge: Renditeminderung ≈ 1 % × (1 + r)", () => {
    const ec = effectiveCosts({ termMonths: 360, contributions: { amount: 100, frequency: "monthly" }, costs: { fund: { terPercent: 1 } }, grossReturnPercent: 5 });
    // Monatsfaktor (1,05)^(1/12) × (1 − 0,01/12) → Jahresfaktor 1,05 × 0,990045 → RIY = 5 − 3,9547 = 1,0453 Pp.
    expect(ec.reductionInYieldPp).toBeCloseTo(5 - (1.05 * Math.pow(1 - 0.01 / 12, 12) - 1) * 100, 4);
  });
});
