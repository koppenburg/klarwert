import { describe, expect, it } from "vitest";
import { computeScenarios, DEFAULT_SETTINGS, mergeSettings } from "./analysis-settings";

describe("analysis-settings", () => {
  it("füllt fehlende/ungültige Werte mit Standardwerten auf", () => {
    const s = mergeSettings({ returns: [3], retirementAge: "x", depot: { costPercent: 0.5, guaranteeLevel: 50 }, person: { children: [{ birthYear: 2015 }, { foo: 1 }] } });
    expect(s.returns).toEqual([3]);
    expect(s.retirementAge).toBe(DEFAULT_SETTINGS.retirementAge);
    expect(s.depot.costPercent).toBe(0.5);
    expect(s.depot.guaranteeLevel).toBe(0);
    expect(s.person.children).toEqual([{ birthYear: 2015 }]);
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("rechnet Szenarien mit Standardannahmen", () => {
    const r = computeScenarios(
      { label: "x", layer: "riester", startYear: 2018, startMonth: 1, termMonths: 360, elapsedMonths: 108, currentValue: 12_000, contributions: { amount: 100, frequency: "monthly" }, costs: { gamma: { percentOfValue: 0.5 } } },
      { ...DEFAULT_SETTINGS, sensitivityReturns: [4], sensitivityShiftsYears: [0] },
    );
    expect(r.results.map((x) => x.id)).toEqual(["A", "B", "C", "D1", "D2"]);
    expect(r.sensitivity).toHaveLength(1);
  });
});
