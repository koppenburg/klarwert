import { describe, expect, it } from "vitest";
import { listConstants, SOURCES, subsidyNew } from "../src/index";

describe("legal-config", () => {
  it("jede Konstante hat Norm, Quelle, Datum und Status", () => {
    const all = listConstants();
    expect(all.length).toBeGreaterThan(30);
    for (const { key, constant } of all) {
      expect(constant.norm, key).not.toBe("");
      expect(Object.keys(SOURCES), key).toContain(constant.sourceId);
      expect(constant.asOf, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["verifiziert", "bitte prüfen"], key).toContain(constant.status);
    }
  });

  it("maximale Grundzulage ergibt sich aus den Stufen", () => {
    let prev = 0;
    let max = 0;
    for (const t of subsidyNew.tiers.value) {
      max += ((t.upTo - prev) * t.ratePercent) / 100;
      prev = t.upTo;
    }
    expect(max).toBe(subsidyNew.maxBasicAllowance.value);
  });
});
