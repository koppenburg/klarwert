/**
 * Offline-Durchlauf der drei synthetischen Fälle ohne Modellaufruf:
 * Bereinigung (PII-Test), Bibliothekstext, bestätigte Kostenfaktoren → Gate → Rechenmodell → Analyse,
 * Depot-Szenarien, Vergleich und PIB-Abgleich. Der Live-Durchlauf mit KI-Erkennung läuft über tests/e2e.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { analyzeContract, compareContracts, runScenarios } from "@klarwert/calc";
import { buildModel, checkGate, GateError, type CostRecord, type FieldRecord } from "@klarwert/extraction";
import { detectPii, extractPdfText, sanitizeDocument, terminateOcr, verifySanitized } from "@klarwert/privacy";
import { CASES, type SyntheticCase } from "./fixtures/synthetic/cases";

const here = path.dirname(fileURLToPath(import.meta.url));
const dirOf = (c: SyntheticCase) => path.join(here, "fixtures/synthetic", c.dir);
const ALL: SyntheticCase[] = [CASES.riester, CASES.layer3, CASES.offer];

afterAll(async () => {
  await terminateOcr();
});

function fieldsOf(c: SyntheticCase, extra: Record<string, unknown> = {}): FieldRecord[] {
  return Object.entries({ ...c.expectedFields, ...extra }).map(([key, value]) => ({ key, value, status: "confirmed", source: { kind: "document", label: `${c.documents[0]?.file}, S. 1` } }));
}

function costsOf(c: SyntheticCase): CostRecord[] {
  const gen = Object.entries(c.expectedCosts).map(([key, value]) => ({ key, value, status: "confirmed" as const, scope: "generation" as const, source: { kind: "library" as const, label: `${c.library.title}, S. 1` } }));
  const ovr = Object.entries(c.caseOverrides).map(([key, value]) => ({ key, value, status: "confirmed" as const, scope: "case" as const, source: { kind: "document" as const, label: "Fondsauswahl laut Vertragsunterlagen" } }));
  return [...gen, ...ovr];
}

describe.each(ALL)("$title", (c) => {
  const known = { knownNames: [c.person.name] };

  it.each(c.documents)("Bereinigung $file: keine PII mehr, Vertragsdaten erhalten", async (d) => {
    const data = new Uint8Array(readFileSync(path.join(dirOf(c), d.file)));
    const doc = await sanitizeDocument({ data, mimeType: d.mime, fileName: d.file, knownNames: known.knownNames });
    const text = doc.pages.map((p) => p.text).join("\n");
    for (const s of c.piiStrings) expect(text, `PII „${s}“ in ${d.file}`).not.toContain(s);
    // ohne Kenntnis des Namens: Regelwerk allein findet keine Muster mehr
    for (const p of doc.pages) expect(detectPii(p.text)).toEqual([]);
    const v = await verifySanitized(doc, known);
    expect(v.ok, JSON.stringify(v.findings.map((f) => f.kind))).toBe(true);
    expect(text).toContain("Musterversicherung");
  }, 180_000);

  it("Bedingungswerk der Bibliothek ist als Text durchsuchbar", async () => {
    const pages = await extractPdfText(new Uint8Array(readFileSync(path.join(dirOf(c), c.library.file))));
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.map((p) => p.text).join(" ")).toMatch(/Abschluss- und Vertriebskosten/);
  });

  it("Gate, Rechenmodell, Analyse und Szenarien", () => {
    const fields = fieldsOf(c, c.key === "offer" ? { current_value: 0, current_value_date: "2027-01-01" } : {});
    const costs = costsOf(c);
    expect(checkGate(fields, costs).messages).toEqual([]);
    const built = buildModel(fields, costs);
    expect(built.model.layer).toBe(c.catalog.layer);
    const analysis = analyzeContract(built.model, { retirementAge: 67, lifeExpectancyAge: 87, person: { children: [{ birthYear: 2016 }], previousYearIncome: 38_000 } });
    for (const r of analysis.results) {
      expect(r.effectiveCosts.reductionInYieldPp).toBeGreaterThan(0);
      expect(r.simulation.finalValueNet).toBeLessThan(r.simulation.finalValueGross);
    }
    expect(built.state).not.toBeNull();
    const scenarios = runScenarios(built.state!, {
      grossReturnPercent: 4,
      person: { children: [{ birthYear: 2016 }], previousYearIncome: 38_000 },
      depot: { costPercent: 0.3, fundTerPercent: 0.2, kappaEurPerYear: 0, alphaPercentOfPremium: 0, guaranteeLevel: 0, guaranteeCostPercent: 0, isStandardDepot: true },
    });
    expect(scenarios.map((s) => s.id)).toEqual(c.catalog.layer === "riester" ? ["A", "B", "C", "D1", "D2"] : ["L3_CONTINUE", "L3_PAIDUP_DEPOT", "L3_SURRENDER_DEPOT"]);
    for (const s of scenarios) expect(s.endCapital).toBeGreaterThan(0);
    // jede Zahl im Modell hat eine Fundstelle
    for (const [k, v] of Object.entries(built.provenance)) expect(v, k).not.toBeNull();
  });

  it("Gate blockiert, sobald ein Kostenfaktor unbestätigt ist", () => {
    const costs = costsOf(c).map((x, i) => (i === 0 ? { ...x, status: "proposed" as const } : x));
    expect(() => buildModel(fieldsOf(c, { current_value: 0, current_value_date: "2027-01-01" }), costs)).toThrow(GateError);
  });
});

describe("Fall 3: Effektivkosten laut PIB werden reproduziert", () => {
  it("Abweichung höchstens 0,1 Prozentpunkte bei PIB-Annahmen", () => {
    const c = CASES.offer;
    const built = buildModel(fieldsOf(c), costsOf(c));
    const a = analyzeContract(built.model);
    expect(built.model.pib).toEqual({ grossReturnPercent: 3, effectiveCostsPp: 1.04 });
    expect(Math.abs(a.pibDeviationPp ?? Infinity)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(a.pibDeviationPp ?? Infinity)).toBeLessThanOrEqual(0.005);
  });
});

describe("Vergleich unter identischen Annahmen", () => {
  it("Fall 2 und Fall 3 (gleicher Tarif, verschiedene Generationen) sowie Fall 1", () => {
    const rows = compareContracts(
      ALL.map((c) => ({ id: c.key, label: c.title, costs: buildModel(fieldsOf(c, { current_value: 0, current_value_date: "2027-01-01" }), costsOf(c)).model.costs })),
      { mode: "tariff", grossReturnPercent: 4, termMonths: 300, monthlyContribution: 150 },
    );
    expect(rows).toHaveLength(3);
    const ownContributions = new Set(rows.map((r) => r.ownContributions));
    expect(ownContributions.size).toBe(1);
    // Generation 2026 ist günstiger als 2018
    expect(rows[2]!.effectiveCostsPp!).toBeLessThan(rows[1]!.effectiveCostsPp!);
  });
});
