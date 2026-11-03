/**
 * Handgerechnete Referenzfälle Depot-Modul.
 *
 * Grundfall: Riester-Fondsvertrag, Beginn Januar 2020, Rentenbeginn Januar 2050 (360 Monate),
 * Stichtag = Wechsel Januar 2027 (Monat 84), Guthaben 10.000 €, 100 €/Monat, ein Kind (geb. 2015),
 * Vorjahreseinkommen 30.000 €. 0 % Rendite und keine laufenden Kosten, damit Endwerte von Hand
 * nachrechenbar sind:
 *   Eigenbeiträge ab Stichtag: 276 Monate × 100 € = 27.600 € (Jan 2027 – Dez 2049, 23 Beitragsjahre)
 *   Beitragsjahr 2026 (Gutschrift März 2027, nach dem Stichtag): altes Recht 175 + 300 = 475 €
 *   altes Recht 2027–2049: 23 × 175 + 13 × 300 (Kind bis 2039) = 7.925 €
 *   neues Recht 2027–2049: Grundzulage 180 + 0,25 × 840 = 390 € → 23 × 390 = 8.970 €; Kind 13 × min(1.200, 300) = 3.900 €
 */
import { describe, expect, it } from "vitest";
import { runRiesterScenarios, runUnsubsidisedScenarios, scenarioSensitivity, type ContractState, type ScenarioAssumptions } from "../src/index";

const contract: ContractState = {
  label: "Riester Fonds",
  layer: "riester",
  startYear: 2020,
  startMonth: 1,
  termMonths: 360,
  elapsedMonths: 84,
  currentValue: 10_000,
  contributions: { amount: 100, frequency: "monthly" },
  costs: {},
};

const zeroDepot = { costPercent: 0, fundTerPercent: 0, kappaEurPerYear: 0, alphaPercentOfPremium: 0, guaranteeLevel: 0 as const, guaranteeCostPercent: 0 };

const assumptions: ScenarioAssumptions = {
  grossReturnPercent: 0,
  person: { children: [{ birthYear: 2015 }], previousYearIncome: 30_000 },
  childReading: "per_child_full",
  depot: zeroDepot,
};

function byId<T extends { id: string }>(list: T[], id: string): T {
  const x = list.find((r) => r.id === id);
  if (!x) throw new Error(`Szenario ${id} fehlt`);
  return x;
}

describe("Riester-Szenarien A–D", () => {
  const res = runRiesterScenarios(contract, assumptions);

  it("liefert A, B, C, D1, D2 – ohne Empfehlungskennzeichen", () => {
    expect(res.map((r) => r.id)).toEqual(["A", "B", "C", "D1", "D2"]);
    for (const r of res) expect(JSON.stringify(r)).not.toMatch(/empfohlen/i);
  });

  it("A: 10.000 + 27.600 + 475 + 7.925 = 46.000 €", () => {
    const a = byId(res, "A");
    expect(a.allowances).toBeCloseTo(8_400, 6);
    expect(a.ownContributions).toBeCloseTo(27_600, 6);
    expect(a.endCapital).toBeCloseTo(46_000, 2);
    expect(a.effectiveCostsPp).toBeCloseTo(0, 6);
  });

  it("B: neues Recht ab 2027 → Zulagen 475 + 8.970 + 3.900 = 13.345 €, Endkapital 50.945 €", () => {
    const b = byId(res, "B");
    expect(b.allowances).toBeCloseTo(13_345, 6);
    expect(b.endCapital).toBeCloseTo(50_945, 2);
  });

  it("C: beitragsfrei + Depot, ohne Kosten gleiches Endkapital wie B (50.945 €)", () => {
    const c = byId(res, "C");
    expect(c.endCapitalLegacy).toBeCloseTo(10_000 + 475, 2);
    expect(c.endCapital).toBeCloseTo(50_945, 2);
  });

  it("D1: Übertragung mit 150 € abgebend + 150 € aufnehmend → 50.945 − 300 = 50.645 €", () => {
    const d1 = byId(res, "D1");
    expect(d1.switchFees).toBe(300);
    expect(d1.endCapitalLegacy).toBe(0);
    expect(d1.endCapital).toBeCloseTo(50_645, 2);
    expect(d1.effectiveCostsPp).toBeGreaterThan(0);
  });

  it("D2: nach 7 Jahren Laufzeit abgebend kostenfrei → 50.945 − 150 = 50.795 €", () => {
    const d2 = byId(res, "D2");
    expect(d2.switchFees).toBe(150);
    expect(d2.endCapital).toBeCloseTo(50_795, 2);
  });

  it("D: keine Abschlusskosten auf übertragenes Kapital – α 5 % nur auf neue Beiträge (5 % × 27.600 = 1.380 €)", () => {
    const withAlpha = runRiesterScenarios(contract, { ...assumptions, depot: { ...zeroDepot, alphaPercentOfPremium: 5 } });
    expect(byId(withAlpha, "D1").costsByKind.alpha).toBeCloseTo(1_380, 2);
  });

  it("D: Rückkaufswert mit Stornoabzug 2 % → Übertragungswert 9.800 €, Verlust 200 €", () => {
    const res2 = runRiesterScenarios({ ...contract, costs: { surrender: { percentOfValue: 2 } } }, assumptions);
    const d1 = byId(res2, "D1");
    expect(d1.surrenderLoss).toBeCloseTo(200, 6);
    expect(d1.endCapital).toBeCloseTo(50_645 - 200, 2);
    expect(d1.costsCumulative).toBeCloseTo(500, 6);
  });

  it("Lesart Kinderzulage „geteilt“ ändert bei einem Kind nichts", () => {
    const shared = runRiesterScenarios(contract, { ...assumptions, childReading: "shared" });
    expect(byId(shared, "B").allowances).toBeCloseTo(13_345, 6);
  });

  it("Garantiehinweis bei Depot ohne Beitragsgarantie", () => {
    expect(byId(res, "D1").guaranteeNote).toMatch(/Beiträge und Zulagen/);
    expect(byId(res, "A").guaranteeNote).toBeUndefined();
  });

  it("Kosten im Altvertrag wirken sich in A aus, nicht auf das übertragene Kapital in D", () => {
    const costly = { ...contract, costs: { gamma: { percentOfValue: 1 }, fund: { terPercent: 1 } } };
    const r = runRiesterScenarios(costly, { ...assumptions, grossReturnPercent: 4, depot: { ...zeroDepot, costPercent: 0.2, fundTerPercent: 0.2 } });
    expect(byId(r, "D2").endCapital).toBeGreaterThan(byId(r, "B").endCapital);
    expect(byId(r, "A").effectiveCostsPp).toBeGreaterThan(byId(r, "D2").effectiveCostsPp ?? Infinity);
  });
});

describe("Ungeförderte Verträge", () => {
  const l3: ContractState = { ...contract, layer: "layer3", costs: { surrender: { percentOfValue: 5 } } };

  it("Weiterführen / Beitragsfreistellung + Depot / Kündigung + Depot, ohne Zulagen (nicht förderberechtigt)", () => {
    const res = runUnsubsidisedScenarios(l3, { ...assumptions, person: { children: [], eligible: false } });
    expect(res.map((r) => r.id)).toEqual(["L3_CONTINUE", "L3_PAIDUP_DEPOT", "L3_SURRENDER_DEPOT"]);
    expect(byId(res, "L3_CONTINUE").endCapital).toBeCloseTo(37_600, 2);
    expect(byId(res, "L3_PAIDUP_DEPOT").endCapital).toBeCloseTo(37_600, 2);
    const s = byId(res, "L3_SURRENDER_DEPOT");
    expect(s.surrenderLoss).toBeCloseTo(500, 6);
    expect(s.endCapital).toBeCloseTo(37_100, 2);
    expect(s.notes.join(" ")).toMatch(/nicht vorgesehen/);
  });

  it("mit Förderberechtigung erhält nur das Depot Zulagen nach neuem Recht", () => {
    const res = runUnsubsidisedScenarios(l3, { ...assumptions, person: { children: [] } });
    expect(byId(res, "L3_CONTINUE").allowances).toBe(0);
    expect(byId(res, "L3_PAIDUP_DEPOT").allowances).toBeCloseTo(8_970, 6);
  });
});

describe("Sensitivität", () => {
  it("Raster Bruttorendite × Rentenbeginn; höhere Rendite → höheres Endkapital", () => {
    const grid = scenarioSensitivity(contract, assumptions, [2, 6], [-5, 0, 5]);
    expect(grid).toHaveLength(6);
    const low = grid.find((g) => g.grossReturnPercent === 2 && g.retirementShiftYears === 0);
    const high = grid.find((g) => g.grossReturnPercent === 6 && g.retirementShiftYears === 0);
    expect(high?.endCapital.A ?? 0).toBeGreaterThan(low?.endCapital.A ?? Infinity);
  });
});
