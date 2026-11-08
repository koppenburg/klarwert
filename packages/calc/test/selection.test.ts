/**
 * Handgerechnete Referenzfälle: Beitragsstaffeln, Rentenfaktor-Tabellen, Tarifselektion.
 * Laufzeit 12 Monate und 0 % Rendite, damit die Endwerte von Hand nachrechenbar sind.
 */
import { describe, expect, it } from "vitest";
import {
  annuityFactorAt,
  annuityFromCapital,
  checkCriteria,
  depotCandidate,
  evaluateCandidate,
  resolveTier,
  resolveTieredCosts,
  runSelection,
  sortResults,
  tierContext,
  type CostFactors,
  type DeepTiered,
  type SelectionCandidate,
  type SelectionProfile,
} from "../src/index";

const profile = (monthly: number, over: Partial<SelectionProfile> = {}): SelectionProfile => ({
  startYear: 2027,
  startMonth: 1,
  entryAge: 66,
  retirementAge: 67,
  contribution: { amount: monthly, frequency: "monthly" },
  layer: "any",
  guaranteeMinPercent: 0,
  esg: "none",
  riskClass: null,
  needs: {},
  person: { children: [], eligible: false },
  grossReturnPercent: 0,
  lifeExpectancyAge: 85,
  ...over,
});

const cand = (id: string, costs: DeepTiered<CostFactors>, over: Partial<SelectionCandidate> = {}): SelectionCandidate => ({
  id,
  label: id,
  kind: "tariff",
  layer: "layer3",
  features: {},
  costs,
  ...over,
});

describe("Beitragsstaffeln", () => {
  it("S1 Stufe nach Monatsbeitrag: ab 0 € 5 %, ab 100 € 4 %, ab 250 € 3 %", () => {
    const t = { basis: "monthly_premium" as const, tiers: [{ from: 0, value: 5 }, { from: 100, value: 4 }, { from: 250, value: 3 }] };
    expect(resolveTier(t, { monthlyPremium: 99.99, annualPremium: 0, premiumSum: 0 })).toBe(5);
    expect(resolveTier(t, { monthlyPremium: 100, annualPremium: 0, premiumSum: 0 })).toBe(4);
    expect(resolveTier(t, { monthlyPremium: 300, annualPremium: 0, premiumSum: 0 })).toBe(3);
  });

  it("S2 Bezugsgrößen: Jahresbeitrag 1.200 € und Beitragssumme 150 € × 12 × 30 = 54.000 €", () => {
    const ctx = tierContext({ amount: 150, frequency: "monthly" }, 360);
    expect(ctx).toEqual({ monthlyPremium: 150, annualPremium: 1800, premiumSum: 54_000 });
    expect(resolveTier({ basis: "premium_sum", tiers: [{ from: 0, value: 40 }, { from: 50_000, value: 30 }] }, ctx)).toBe(30);
    // vierteljährlich 300 € = 100 € im Monat
    expect(tierContext({ amount: 300, frequency: "quarterly" }, 120).monthlyPremium).toBe(100);
  });

  it("S3 Staffeln im Kostensatz werden für den konkreten Beitrag aufgelöst", () => {
    const tiered: DeepTiered<CostFactors> = { beta: { percentOfPremium: { basis: "monthly_premium", tiers: [{ from: 0, value: 10 }, { from: 100, value: 5 }] } }, kappa: { eurPerYear: 24 } };
    const at100 = resolveTieredCosts<CostFactors>(tiered, { monthlyPremium: 100, annualPremium: 1200, premiumSum: 1200 });
    expect(at100.beta?.percentOfPremium).toBe(5);
    expect(at100.kappa?.eurPerYear).toBe(24);
  });
});

describe("Rentenfaktoren je Rentenbeginnalter", () => {
  const table = [
    { age: 65, guaranteed: 25, current: 30 },
    { age: 67, guaranteed: 27, current: 32 },
  ];
  it("T1 exakt, interpoliert (66 → 26 bzw. 31), außerhalb keine Extrapolation", () => {
    expect(annuityFactorAt(table, 67, "guaranteed")).toBe(27);
    expect(annuityFactorAt(table, 66, "guaranteed")).toBe(26);
    expect(annuityFactorAt(table, 66, "current")).toBe(31);
    expect(annuityFactorAt(table, 70, "guaranteed")).toBeNull();
  });
  it("T2 Rente aus Tabelle: 100.000 € mit 66 → 26 × 10 = 260 €/Monat", () => {
    expect(annuityFromCapital(100_000, { annuityFactorTable: table }, 66).monthlyGuaranteed).toBeCloseTo(260, 6);
    // skalarer Faktor hat Vorrang vor der Tabelle
    expect(annuityFromCapital(100_000, { annuityFactorGuaranteed: 20, annuityFactorTable: table }, 66).monthlyGuaranteed).toBeCloseTo(200, 6);
  });
});

describe("Selektion: Reihenfolge hängt vom Beitrag ab", () => {
  // A: 10 % Verwaltungskosten je Beitrag; B: 60 € Stückkosten p.a.; C: Staffel 10 % / ab 100 € 5 %
  const A = cand("A", { beta: { percentOfPremium: 10 } });
  const B = cand("B", { kappa: { eurPerYear: 60 } });
  const C = cand("C", { beta: { percentOfPremium: { basis: "monthly_premium", tiers: [{ from: 0, value: 10 }, { from: 100, value: 5 }] } } });

  it("Sel1 25 €/Monat: A 300 × 0,9 = 270 € · B 300 − 60 = 240 € → A günstiger", () => {
    const a = evaluateCandidate(A, profile(25));
    const b = evaluateCandidate(B, profile(25));
    expect(a.endCapital).toBeCloseTo(270, 2);
    expect(b.endCapital).toBeCloseTo(240, 2);
    expect(sortResults([b, a])[0]?.candidateId).toBe("A");
  });

  it("Sel2 50 €/Monat: A 540 € = B 540 €", () => {
    expect(evaluateCandidate(A, profile(50)).endCapital).toBeCloseTo(540, 2);
    expect(evaluateCandidate(B, profile(50)).endCapital).toBeCloseTo(540, 2);
  });

  it("Sel3 100 €/Monat: A 1.080 € · B 1.140 € · C (Staffel 5 %) 1.140 € → B und C günstiger", () => {
    const res = runSelection([A, B, C], profile(100)).suitable;
    const end = Object.fromEntries(res.map((r) => [r.candidateId, r.endCapital]));
    expect(end.A).toBeCloseTo(1080, 2);
    expect(end.B).toBeCloseTo(1140, 2);
    expect(end.C).toBeCloseTo(1140, 2);
    expect(res.at(-1)?.candidateId).toBe("A");
    expect(res.find((r) => r.candidateId === "C")?.resolvedCosts?.beta?.percentOfPremium).toBe(5);
  });

  it("Sel4 kein Ergebnis wird als empfohlen markiert", () => {
    expect(JSON.stringify(runSelection([A, B, C], profile(100)))).not.toMatch(/empfohlen/i);
  });
});

describe("Selektion: harte Kriterien und offene Punkte", () => {
  const free = cand("X", {});

  it("K1 Mindestbeitrag, Eintrittsalter, Mindestlaufzeit", () => {
    const c = cand("X", {}, { features: { minMonthlyPremium: 100, maxEntryAge: 60, minTermYears: 5 } });
    const r = checkCriteria(c, profile(50));
    expect(r.failures).toEqual(["Mindestbeitrag 100 € mtl. nicht erreicht", "Höchsteintrittsalter 60 überschritten", "Mindestlaufzeit 5 Jahre unterschritten"]);
  });

  it("K2 Garantie: 100 % gefordert, nur 0/80 % wählbar → nicht passend; Garantieniveau unbekannt → offen", () => {
    const p = profile(100, { guaranteeMinPercent: 100 });
    expect(checkCriteria(cand("X", {}, { features: { guaranteeLevels: [0, 80] } }), p).failures).toContain("kein Beitragserhalt von 100 % wählbar");
    const open = checkCriteria(free, p);
    expect(open.failures).toEqual([]);
    expect(open.openPoints).toContain("Garantieniveaus nicht erfasst");
  });

  it("K3 Nachhaltigkeit, Risikoklasse, Flexibilität, Hinterbliebenenschutz", () => {
    const p = profile(100, { esg: "art9", riskClass: 6, needs: { withdrawals: true, contributionPause: true, guaranteePeriodMonths: 240, deathBenefitBeforeRetirement: true, lumpSumOption: true } });
    const c = cand("X", {}, {
      features: { esgLevel: "art8", riskClassMin: 1, riskClassMax: 5, withdrawalsAllowed: true, contributionPauseAllowed: false, maxGuaranteePeriodMonths: 120, deathBenefitBeforeRetirement: true, lumpSumOption: true },
    });
    expect(checkCriteria(c, p).failures).toEqual([
      "keine Fonds nach Art. 9 SFDR",
      "Risikoklasse 6 nicht in der Fondsauswahl (1–5)",
      "keine Beitragspause möglich",
      "Rentengarantiezeit von 20 Jahren nicht wählbar",
    ]);
  });

  it("K4 Riester nach altem Recht: Neuabschluss ab 2027 ausgeschlossen, Dezember 2026 möglich", () => {
    const old = cand("R", {}, { layer: "riester", features: { certificationLaw: "alt" } });
    expect(checkCriteria(old, profile(100, { startYear: 2027, startMonth: 1 })).failures).toContain("Riester-Neuabschluss nach altem Recht nur bis 31.12.2026");
    expect(checkCriteria(old, profile(100, { startYear: 2026, startMonth: 12 })).failures).toEqual([]);
    const neu = cand("N", {}, { layer: "riester", features: { certificationLaw: "neu" } });
    expect(checkCriteria(neu, profile(100, { startYear: 2026, startMonth: 12 })).failures).toContain("Produkt nach neuem Recht erst ab 01.01.2027 abschließbar");
  });

  it("K5 gewünschte Schicht filtert Tarife, das Depot bleibt als Vergleichsmaßstab", () => {
    const p = profile(100, { layer: "basis" });
    expect(checkCriteria(free, p).failures).toContain("andere Schicht als gewünscht");
    const depot = depotCandidate({ costPercent: 0, fundTerPercent: 0, kappaEurPerYear: 0, alphaPercentOfPremium: 0, guaranteeLevel: 0, guaranteeCostPercent: 0 });
    expect(checkCriteria(depot, p).failures).toEqual([]);
  });

  it("K6 unvollständige Kostenfaktoren → nicht berechenbar, keine Zahlen", () => {
    const r = evaluateCandidate(cand("X", {}, { missingCosts: ["κ Stückkosten p.a."] }), profile(100));
    expect(r.status).toBe("nicht berechenbar");
    expect(r.effectiveCostsPp).toBeNull();
  });
});

describe("Selektion: Altersvorsorgedepot mit Zulage", () => {
  it("D1 100 €/Monat in 2027, 0 % Rendite, keine Kosten: 1.200 € + Grundzulage 180 + 0,25 × 840 = 390 € → 1.590 €", () => {
    const depot = depotCandidate({ costPercent: 0, fundTerPercent: 0, kappaEurPerYear: 0, alphaPercentOfPremium: 0, guaranteeLevel: 0, guaranteeCostPercent: 0 });
    const r = evaluateCandidate(depot, profile(100, { person: { children: [] } }));
    expect(r.allowances).toBeCloseTo(390, 6);
    expect(r.endCapital).toBeCloseTo(1590, 2);
    expect(r.effectiveCostsPp).toBeCloseTo(0, 6);
  });
});
