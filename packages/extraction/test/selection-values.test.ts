import { describe, expect, it } from "vitest";
import { evaluateCandidate } from "@klarwert/calc";
import {
  buildModel,
  buildSelectionCandidate,
  describeValue,
  featureProposals,
  FEATURE_FIELDS,
  parseAnnuityTable,
  parseFeatureValue,
  parseTierInput,
  ValueFormatError,
  type CostRecord,
  type FieldRecord,
} from "../src/index";

describe("Texteingabe Staffeln und Tabellen", () => {
  it("Staffel „0: 5; 100: 4; 250: 3,5“", () => {
    expect(parseTierInput("0: 5; ab 100 €: 4\n250: 3,5", "monthly_premium")).toEqual({
      basis: "monthly_premium",
      tiers: [{ from: 0, value: 5 }, { from: 100, value: 4 }, { from: 250, value: 3.5 }],
    });
    expect(() => parseTierInput("100: 4", "monthly_premium")).toThrow(ValueFormatError);
    expect(() => parseTierInput("0: x", "monthly_premium")).toThrow(ValueFormatError);
    expect(describeValue({ basis: "monthly_premium", tiers: [{ from: 0, value: 5 }, { from: 100, value: 4 }] }, "%")).toBe("Monatsbeitrag: ab 0 € → 5 % · ab 100 € → 4 %");
  });

  it("Rentenfaktor-Tabelle „65: 25,0 / 30,0; 67: 27“", () => {
    expect(parseAnnuityTable("65: 25,0 / 30,0; 67: 27")).toEqual([
      { age: 65, guaranteed: 25, current: 30 },
      { age: 67, guaranteed: 27, current: null },
    ]);
    expect(() => parseAnnuityTable("sechzig: 25")).toThrow(ValueFormatError);
  });

  it("Merkmale: Zahl, ja/nein, Liste, Auswahl", () => {
    const def = (k: string) => FEATURE_FIELDS.find((f) => f.key === k)!;
    expect(parseFeatureValue(def("feature.minMonthlyPremium"), "25,00")).toBe(25);
    expect(parseFeatureValue(def("feature.dynamicsAvailable"), "ja")).toBe(true);
    expect(parseFeatureValue(def("feature.guaranteeLevels"), "80, 100")).toEqual([80, 100]);
    expect(parseFeatureValue(def("feature.esgLevel"), "art8")).toBe("art8");
    expect(parseFeatureValue(def("feature.maxEntryAge"), "")).toBeNull();
    expect(() => parseFeatureValue(def("feature.dynamicsAvailable"), "vielleicht")).toThrow(ValueFormatError);
  });
});

describe("KI-Vorschläge für Merkmale, Staffeln, Tabelle", () => {
  it("setzt Staffeln je Schlüssel zusammen und verwirft Unlesbares", () => {
    const { proposals, rejected } = featureProposals({
      features: [
        { key: "feature.minMonthlyPremium", value: "25", page: 2, quote: "Mindestbeitrag 25 €", confidence: 0.9 },
        { key: "feature.dynamicsAvailable", value: "true", page: 2, quote: "Dynamik", confidence: 0.9 },
        { key: "feature.esgLevel", value: "grün", page: 3, quote: "nachhaltig", confidence: 0.5 },
      ],
      tiers: [
        { key: "beta.percentOfPremium", basis: "monthly_premium", from: 100, value: 4, page: 4, quote: "ab 100 € 4 %" },
        { key: "beta.percentOfPremium", basis: "monthly_premium", from: 0, value: 6, page: 4, quote: "bis 99,99 € 6 %" },
        { key: "kappa.eurPerYear", basis: "annual_premium", from: 600, value: 0, page: 4, quote: "ab 600 € keine Stückkosten" },
      ],
      annuity_table: [{ age: 67, guaranteed: 27, current: 32, page: 5 }, { age: 65, guaranteed: 25, current: 30, page: 5 }],
    });
    const byKey = Object.fromEntries(proposals.map((p) => [p.key, p.value]));
    expect(byKey["feature.minMonthlyPremium"]).toBe(25);
    expect(byKey["feature.dynamicsAvailable"]).toBe(true);
    expect(byKey["beta.percentOfPremium"]).toEqual({ basis: "monthly_premium", tiers: [{ from: 0, value: 6 }, { from: 100, value: 4 }] });
    expect(byKey["payout.annuityFactorTable"]).toEqual([{ age: 65, guaranteed: 25, current: 30 }, { age: 67, guaranteed: 27, current: 32 }]);
    expect(rejected).toHaveLength(2);
  });
});

const confirmed = (values: Record<string, unknown>): CostRecord[] =>
  Object.entries(values).map(([key, value]) => ({ key, value: value as CostRecord["value"], status: "confirmed", scope: "generation", source: { kind: "library", label: "AVB S. 1" } }));

const BASE_COSTS = {
  "alpha.mode": "permille_of_premium_sum",
  "alpha.rate": 0,
  "alpha.distributionMonths": 60,
  "beta.percentOfPremium": { basis: "monthly_premium", tiers: [{ from: 0, value: 10 }, { from: 100, value: 5 }] },
  "gamma.percentOfValue": 0,
  "kappa.eurPerYear": 0,
  "fund.terPercent": 0,
  "fund.kickbackPercent": 0,
  "guarantee.percentOfValue": 0,
  paidUpFeeEur: 0,
  "surrender.percentOfValue": 0,
  "payout.annuityFactorGuaranteed": null,
  "payout.annuityFactorCurrent": null,
  "payout.annuityCostPercent": 0,
  "payout.annuityFactorTable": [{ age: 65, guaranteed: 25, current: null }, { age: 67, guaranteed: 27, current: null }],
};

describe("Staffeln im Vertragsmodell und in der Selektion", () => {
  it("buildModel löst die Staffel mit dem Vertragsbeitrag auf (120 €/Monat → 5 %)", () => {
    const fields: FieldRecord[] = Object.entries({
      insurer: "X",
      tariff_name: "Y",
      layer: "layer3",
      contract_start: "2027-01-01",
      retirement_start: "2057-01-01",
      contribution_amount: 120,
      payment_frequency: "monthly",
    }).map(([key, value]) => ({ key, value, status: "confirmed", source: { kind: "document", label: "Police S. 1" } }));
    const m = buildModel(fields, confirmed(BASE_COSTS));
    expect(m.model.costs.beta?.percentOfPremium).toBe(5);
    expect(m.model.costs.payout?.annuityFactorTable).toHaveLength(2);
  });

  it("Selektionskandidat: nur bestätigte Werte, fehlende Pflichtwerte gemeldet, Fondskosten-Annahme möglich", () => {
    const records = confirmed({ ...BASE_COSTS, "feature.minMonthlyPremium": 50 }).filter((r) => r.key !== "fund.terPercent");
    records.push({ key: "kappa.eurPerYear", value: 99, status: "proposed", scope: "generation", source: null });
    const c = buildSelectionCandidate({ id: "g1", label: "Tarif Y 2026", layer: "layer3" }, records);
    expect(c.missingCosts).toEqual(["Fondskosten (TER/OGC, gewichtet)"]);
    expect(c.features.minMonthlyPremium).toBe(50);
    const withFallback = buildSelectionCandidate({ id: "g1", label: "Tarif Y 2026", layer: "layer3" }, records, { fallbackFundTerPercent: 0 });
    expect(withFallback.missingCosts).toEqual([]);
    expect(withFallback.usedFundFallback).toBe(true);
    // 12 Monate, 0 %: 100 €/Monat mit Staffel 5 % → 1.140 €; Rente mit 67 aus Tabelle: 27 je 10.000 €
    const r = evaluateCandidate(withFallback, {
      startYear: 2027, startMonth: 1, entryAge: 66, retirementAge: 67, contribution: { amount: 100, frequency: "monthly" }, layer: "any",
      guaranteeMinPercent: 0, esg: "none", riskClass: null, needs: {}, person: { children: [], eligible: false }, grossReturnPercent: 0, lifeExpectancyAge: 85,
    });
    expect(r.endCapital).toBeCloseTo(1140, 2);
    expect(r.monthlyAnnuityGuaranteed).toBeCloseTo(1140 / 10_000 * 27, 6);
  });
});
