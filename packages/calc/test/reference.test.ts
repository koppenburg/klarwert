/**
 * Handgerechnete Referenzfälle des Rechenkerns.
 *
 * Jeder Fall nennt die Rechnung, die man mit Taschenrechner nachvollziehen kann. Die erwarteten Werte sind
 * NICHT aus dem Rechenkern übernommen, sondern unabhängig von Hand bzw. per geschlossener Formel ermittelt.
 * Toleranz: 1 Cent (toBeCloseTo(x, 2)) bzw. 0,0001 Prozentpunkte.
 *
 * Konventionen: Beiträge am Monatsanfang, Wertentwicklung (1 + r)^(1/12) je Monat, Guthabenkosten
 * (γ, Fonds, Garantie) am Monatsende auf das Guthaben nach Wertentwicklung, κ/12 am Monatsende.
 */
import { describe, expect, it } from "vitest";
import {
  allowanceNew,
  allowanceOld,
  annuityFromCapital,
  basicAllowanceNew,
  buildAllowanceSchedule,
  comparePayout,
  effectiveCosts,
  irrAnnualPercent,
  simulate,
  surrenderDeduction,
  type SimulationInput,
} from "../src/index";

describe("Referenzfälle Ansparphase", () => {
  it("R1 Einmalbeitrag ohne Kosten: 10.000 € × 1,06 = 10.600,00 €", () => {
    const input: SimulationInput = { termMonths: 12, contributions: { amount: 0, frequency: "none", singlePremium: 10_000 }, costs: {}, grossReturnPercent: 6 };
    const r = simulate(input);
    expect(r.finalValueNet).toBeCloseTo(10_600, 2);
    expect(r.finalValueGross).toBeCloseTo(10_600, 2);
    const ec = effectiveCosts(input);
    expect(ec.netIrrPercent).toBeCloseTo(6, 6);
    expect(ec.reductionInYieldPp).toBeCloseTo(0, 6);
  });

  it("R2 Einmalbeitrag, γ = 1 % p.a., 0 % Rendite: 10.000 × (1 − 0,01/12)^12 = 9.900,46 €", () => {
    const r = simulate({ termMonths: 12, contributions: { amount: 0, frequency: "none", singlePremium: 10_000 }, costs: { gamma: { percentOfValue: 1 } }, grossReturnPercent: 0 });
    expect(r.finalValueNet).toBeCloseTo(9_900.457, 2);
    expect(r.costsTotal.gamma).toBeCloseTo(10_000 - 9_900.457, 2);
  });

  it("R3 100 €/Monat, 12 Monate, β 5 %, κ 12 €/Jahr, 0 %: 12 × 95 − 12 = 1.128,00 €", () => {
    const r = simulate({
      termMonths: 12,
      contributions: { amount: 100, frequency: "monthly" },
      costs: { beta: { percentOfPremium: 5 }, kappa: { eurPerYear: 12 } },
      grossReturnPercent: 0,
    });
    expect(r.finalValueNet).toBeCloseTo(1_128, 2);
    expect(r.costsTotal.beta).toBeCloseTo(60, 2);
    expect(r.costsTotal.kappa).toBeCloseTo(12, 2);
    expect(r.ownPremiumsTotal).toBe(1_200);
  });

  it("R4 1.200 €/Jahr, 5 Jahre, 4 %, α 40 ‰ der Beitragssumme (240 €) auf 5 Jahresbeiträge à 48 €: 1.152 × Σ1,04^k = 6.489,19 €", () => {
    const r = simulate({
      termMonths: 60,
      contributions: { amount: 1_200, frequency: "annual" },
      costs: { alpha: { mode: "permille_of_premium_sum", rate: 40 } },
      grossReturnPercent: 4,
    });
    expect(r.finalValueNet).toBeCloseTo(6_489.19, 2);
    expect(r.finalValueGross).toBeCloseTo(6_759.57, 2);
    expect(r.costsTotal.alpha).toBeCloseTo(240, 2);
  });

  it("R5 100 €/Monat, 10 Jahre, α 25 ‰ von 12.000 € = 300 €, verteilt auf 60 Monate à 5 €: 12.000 − 300 = 11.700 €", () => {
    const r = simulate({
      termMonths: 120,
      contributions: { amount: 100, frequency: "monthly" },
      costs: { alpha: { mode: "permille_of_premium_sum", rate: 25, distributionMonths: 60 } },
      grossReturnPercent: 0,
    });
    expect(r.finalValueNet).toBeCloseTo(11_700, 2);
    expect(r.months[59]?.costs.alpha).toBeCloseTo(5, 6);
    expect(r.months[60]?.costs.alpha).toBe(0);
  });

  it("R6 Dynamik 5 %: 1.200 + 1.260 + 1.323 = 3.783 €; α 30 ‰ inkl. Dynamik: 108 + 3,60 + 1,89 = 113,49 €", () => {
    const base: SimulationInput = {
      termMonths: 36,
      contributions: { amount: 100, frequency: "monthly", dynamics: { ratePercent: 5 } },
      costs: {},
      grossReturnPercent: 0,
    };
    expect(simulate(base).finalValueNet).toBeCloseTo(3_783, 2);
    // α: Grundbeitrag 100 × 36 × 3 % = 108 (auf 36 Monate, da Laufzeit < 60); Erhöhung Monat 12: Δ 5 € × 24 × 3 % = 3,60;
    // Erhöhung Monat 24: Δ 5,25 € × 12 × 3 % = 1,89
    const withAlpha = simulate({ ...base, costs: { alpha: { mode: "permille_of_premium_sum", rate: 30 } } });
    expect(withAlpha.costsTotal.alpha).toBeCloseTo(113.49, 2);
    expect(withAlpha.finalValueNet).toBeCloseTo(3_783 - 113.49, 2);
    const noDyn = simulate({ ...base, costs: { alpha: { mode: "permille_of_premium_sum", rate: 30, onDynamics: false } } });
    expect(noDyn.costsTotal.alpha).toBeCloseTo(108, 2);
  });

  it("R7 Beitragsfreistellung ab Monat 12: α-Raten entfallen, Gebühr 25 €, κ beitragsfrei halbiert → 1.110,20 €", () => {
    // 24 Monate, 100 €/Monat, α 24 ‰ von 2.400 € = 57,60 € auf 24 Monate = 2,40 €/Monat, nach 12 Monaten gestoppt → 28,80 €
    // κ 24 €/Jahr (2 €/Monat) im 1. Jahr = 24 €, beitragsfrei 12 €/Jahr (1 €/Monat) = 12 €
    // 1.200 − 28,80 − 25 − 24 − 12 = 1.110,20 €
    const input: SimulationInput = {
      termMonths: 24,
      contributions: { amount: 100, frequency: "monthly", paidUpFromMonth: 12 },
      costs: {
        alpha: { mode: "permille_of_premium_sum", rate: 24 },
        kappa: { eurPerYear: 24, eurPerYearPaidUp: 12 },
        paidUpFeeEur: 25,
      },
      grossReturnPercent: 0,
    };
    const r = simulate(input);
    expect(r.ownPremiumsTotal).toBe(1_200);
    expect(r.finalValueNet).toBeCloseTo(1_110.2, 2);
    expect(r.costsTotal.paidUpFee).toBe(25);
    // Variante: Restbetrag bei Freistellung sofort belastet → zusätzlich 28,80 €
    const charge = simulate({ ...input, costs: { ...input.costs, alpha: { mode: "permille_of_premium_sum", rate: 24, onPaidUp: "charge_remaining" } } });
    expect(charge.finalValueNet).toBeCloseTo(1_081.4, 2);
  });

  it("R8 Effektivkosten Einmalbeitrag γ 1 %, 4 %, 10 Jahre: RIY = 4 − (1,04 × (1 − 0,01/12)^12 − 1) × 100 = 1,0352 Pp.", () => {
    const input: SimulationInput = { termMonths: 120, contributions: { amount: 0, frequency: "none", singlePremium: 10_000 }, costs: { gamma: { percentOfValue: 1 } }, grossReturnPercent: 4 };
    const ec = effectiveCosts(input);
    expect(ec.reductionInYieldPp).toBeCloseTo(1.035247, 4);
    expect(ec.byKind?.gamma).toBeCloseTo(1.035247, 4);
    expect(ec.grossIrrPercent).toBeCloseTo(4, 8);
  });

  it("R9 Zuzahlung 1.000 € in Monat 6 mit α 2 % und β 1 %: Kosten 30 €", () => {
    const r = simulate({
      termMonths: 12,
      contributions: { amount: 0, frequency: "none", topUps: [{ month: 6, amount: 1_000 }] },
      costs: { alpha: { mode: "percent_of_premiums", rate: 0, onTopUpsPercent: 2 }, beta: { percentOfPremium: 5, onTopUpsPercent: 1 } },
      grossReturnPercent: 0,
    });
    expect(r.finalValueNet).toBeCloseTo(970, 2);
  });

  it("R10 Stornoabzug: Staffel 5 % in Jahr 1–5, danach 1 %, höchstens 500 €", () => {
    const rules = { schedule: [{ fromYear: 1, toYear: 5, percentOfValue: 5 }, { fromYear: 6, percentOfValue: 1 }], maxEur: 500 };
    expect(surrenderDeduction(rules, 4_000, 3)).toBeCloseTo(200, 6);
    expect(surrenderDeduction(rules, 20_000, 3)).toBeCloseTo(500, 6);
    expect(surrenderDeduction(rules, 20_000, 6)).toBeCloseTo(200, 6);
  });

  it("R11 Kontrolle: ohne Kosten ist der interne Zinsfuß gleich der Bruttorendite (laufend + Dynamik + Zuzahlung)", () => {
    for (const r of [0, 2, 4, 6]) {
      const ec = effectiveCosts({
        termMonths: 240,
        contributions: { amount: 150, frequency: "quarterly", dynamics: { ratePercent: 3 }, topUps: [{ month: 50, amount: 2_000 }] },
        costs: {},
        grossReturnPercent: r,
      });
      expect(ec.netIrrPercent).toBeCloseTo(r, 6);
      expect(ec.reductionInYieldPp).toBeCloseTo(0, 6);
    }
  });

  it("R12 Effektivkosten-Zerlegung summiert sich exakt zur Gesamt-Renditeminderung", () => {
    const ec = effectiveCosts({
      termMonths: 360,
      contributions: { amount: 100, frequency: "monthly" },
      costs: {
        alpha: { mode: "permille_of_premium_sum", rate: 25 },
        beta: { percentOfPremium: 8 },
        gamma: { percentOfValue: 0.4 },
        kappa: { eurPerYear: 24 },
        fund: { terPercent: 1.2, kickbackPercent: 0.3 },
      },
      grossReturnPercent: 6,
    });
    const sum = Object.values(ec.byKind ?? {}).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(ec.reductionInYieldPp ?? NaN, 10);
    expect(ec.reductionInYieldPp).toBeGreaterThan(1.5);
  });

  it("R13 IRR: 1.000 € heute, 1.100 € nach 12 Monaten → 10 % p.a.", () => {
    expect(irrAnnualPercent([{ month: 0, amount: -1_000 }, { month: 12, amount: 1_100 }])).toBeCloseTo(10, 8);
  });

  it("R14 Fortschreibung ab Stichtag: bereits getilgte α-Raten werden nicht erneut erhoben", () => {
    // 100 €/Monat, 120 Monate, α 25 ‰ = 300 € auf 60 Monate (5 €/Monat). Stichtag Monat 30, Guthaben 3.000 €, 0 %:
    // ab Monat 30 noch 30 Raten à 5 € = 150 € α; Einzahlungen 90 × 100 = 9.000 € → 3.000 + 9.000 − 150 = 11.850 €
    const r = simulate({
      termMonths: 120,
      contributions: { amount: 100, frequency: "monthly" },
      costs: { alpha: { mode: "permille_of_premium_sum", rate: 25 } },
      grossReturnPercent: 0,
      start: { month: 30, value: 3_000 },
    });
    expect(r.finalValueNet).toBeCloseTo(11_850, 2);
    expect(r.costsTotal.alpha).toBeCloseTo(150, 2);
  });
});

describe("Referenzfälle Zulagen", () => {
  const person = { children: [{ birthYear: 2010 }, { birthYear: 2005 }], previousYearIncome: 30_000 };

  it("Z1 altes Recht 2026: 175 + 300 + 185 = 660 €; Mindesteigenbeitrag 4 % × 30.000 − 660 = 540 €", () => {
    const full = allowanceOld(2026, 540, person);
    expect(full.total).toBeCloseTo(660, 6);
    expect(full.minOwnContribution).toBeCloseTo(540, 6);
    const half = allowanceOld(2026, 270, person);
    expect(half.reductionFactor).toBeCloseTo(0.5, 6);
    expect(half.total).toBeCloseTo(330, 6);
  });

  it("Z2 altes Recht: Sockelbetrag 60 € bei geringem Einkommen", () => {
    const b = allowanceOld(2026, 60, { children: [], previousYearIncome: 3_000 });
    expect(b.minOwnContribution).toBe(60);
    expect(b.total).toBe(175);
  });

  it("Z3 altes Recht: Kind über 24 (Standard) erhält keine Kinderzulage mehr", () => {
    expect(allowanceOld(2031, 2_000, person).children).toBe(300);
  });

  it("Z4 neues Recht: 1.800 € → 180 + 360 = 540 € Grundzulage; 2 Kinder je 300 €", () => {
    expect(basicAllowanceNew(1_800)).toBe(540);
    expect(basicAllowanceNew(5_000)).toBe(540);
    expect(basicAllowanceNew(600)).toBe(240);
    const b = allowanceNew(2027, 1_800, person, "per_child_full");
    expect(b.total).toBe(540 + 600);
  });

  it("Z5 neues Recht, 200 € Eigenbeitrag, 2 Kinder: Lesart je Kind voll 2 × 200 = 400 €, Lesart geteilt 200 €", () => {
    expect(allowanceNew(2027, 200, person, "per_child_full").children).toBe(400);
    expect(allowanceNew(2027, 200, person, "shared").children).toBe(200);
    expect(allowanceNew(2027, 200, person, "per_child_full").basic).toBe(100);
  });

  it("Z6 neues Recht: unter 120 € Mindesteigenbeitrag keine Zulage (keine anteilige Kürzung)", () => {
    expect(allowanceNew(2027, 119, person).total).toBe(0);
    expect(allowanceNew(2027, 120, { children: [] }).total).toBe(60);
  });

  it("Z7 Gutschriftsplan: Beitragsjahr 2026 wird im März 2027 gutgeschrieben", () => {
    // Vertragsbeginn Januar 2026 → Monat 0 = Jan 2026; Dezember 2026 = Monat 11; + 3 = Monat 14 (März 2027)
    const s = buildAllowanceSchedule({
      contractStartYear: 2026,
      contractStartCalendarMonth: 1,
      ownContributions: Array.from({ length: 12 }, (_, m) => ({ month: m, amount: 45 })),
      person: { children: [], previousYearIncome: 10_000 },
      ruleForYear: () => "old",
      termMonths: 120,
    });
    // Mindesteigenbeitrag 400 − 175 = 225 €; Eigenbeitrag 540 ≥ 225 → volle 175 €
    expect(s.events).toEqual([{ month: 14, amount: 175 }]);
  });
});

describe("Referenzfälle Rentenphase", () => {
  it("P1 Rentenfaktor 30 € je 10.000 €: 100.000 € → 300 €/Monat; Rentenkosten 2 % enthalten → 73,47 € p.a.; Kapitalabfindung 1 %", () => {
    const a = annuityFromCapital(100_000, { annuityFactorCurrent: 30, annuityFactorGuaranteed: 25, annuityCostPercent: 2, lumpSumCostPercent: 1 });
    expect(a.monthlyCurrent).toBeCloseTo(300, 6);
    expect(a.monthlyGuaranteed).toBeCloseTo(250, 6);
    expect(a.annualAnnuityCosts).toBeCloseTo(73.469, 2);
    expect(a.lumpSumNet).toBeCloseTo(99_000, 6);
    const notIncluded = annuityFromCapital(100_000, { annuityFactorCurrent: 30, annuityCostPercent: 2, annuityCostIncludedInFactor: false });
    expect(notIncluded.monthlyCurrent).toBeCloseTo(294, 6);
  });

  it("P2 Auszahlplan 0 % Rendite, 67 bis 85: 100.000 / 216 = 462,96 €/Monat; Rente 300 € amortisiert mit 94,83 Jahren", () => {
    const c = comparePayout({
      capital: 100_000,
      monthlyAnnuity: 300,
      retirementAge: 67,
      lifeExpectancyAge: 85,
      payoutPlanEndAge: 85,
      payoutGrossReturnPercent: 0,
      payoutPlanCostPercent: 0,
    });
    expect(c.payoutPlanMonthly).toBeCloseTo(462.963, 2);
    expect(c.annuityTotalToLifeExpectancy).toBeCloseTo(64_800, 6);
    expect(c.payoutPlanTotalToLifeExpectancy).toBeCloseTo(100_000, 2);
    expect(c.annuityBreakEvenAge).toBeCloseTo(94.8333, 3);
  });

  it("P3 Rentengarantiezeit: Tod vor Ablauf der Garantiezeit → Garantiezeit wird gezahlt", () => {
    const c = comparePayout({
      capital: 100_000,
      monthlyAnnuity: 300,
      guaranteePeriodMonths: 240,
      retirementAge: 67,
      lifeExpectancyAge: 80,
      payoutPlanEndAge: 85,
      payoutGrossReturnPercent: 0,
      payoutPlanCostPercent: 0,
    });
    expect(c.annuityTotalToLifeExpectancy).toBeCloseTo(300 * 240, 6);
    // Auszahlplan: 156 Monate × 462,96 = 72.222,22 € entnommen, Rest 27.777,78 € an Erben
    expect(c.payoutPlanResidualAtLifeExpectancy).toBeCloseTo(27_777.78, 2);
  });
});
