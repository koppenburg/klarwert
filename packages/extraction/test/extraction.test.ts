import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import {
  buildModel,
  checkGate,
  COST_FIELDS,
  ContractExtractionRaw,
  normalizeContractExtraction,
  CostExtraction,
  downloadPdf,
  extractContract,
  GateError,
  LETTER_PLACEHOLDERS,
  matchTariff,
  MATCH_SUGGEST_THRESHOLD,
  PrivacyGuardError,
  requestLetter,
  SearchCandidates,
  type Catalog,
  type CostRecord,
  type FieldRecord,
} from "../src/index";

const catalog: Catalog = {
  insurers: [
    { id: "i1", name: "Alte Leipziger Lebensversicherung a.G.", aliases: ["Alte Leipziger", "ARLP"] },
    { id: "i2", name: "Musterversicherung AG", aliases: ["Muster"] },
  ],
  tariffs: [
    { id: "t1", insurerId: "i1", name: "FondsRente", code: "FR70", aliases: ["AL FondsRente"] },
    { id: "t2", insurerId: "i1", name: "FondsRente Riester", code: "RF70", aliases: [] },
    { id: "t3", insurerId: "i2", name: "MusterRente Invest", code: "MRI", aliases: [] },
  ],
  generations: [
    { id: "g1", tariffId: "t1", label: "2019", validFrom: "2019-01-01", validTo: "2020-12-31", aliases: ["Stand 01.2019"] },
    { id: "g2", tariffId: "t1", label: "2021", validFrom: "2021-01-01", validTo: null, aliases: [] },
  ],
};

describe("Tarif-Matching", () => {
  it("„ARLP FR70“ und „Alte Leipziger FondsRente FR70“ treffen denselben Eintrag", () => {
    const a = matchTariff(catalog, { freeText: "ARLP FR70" })[0];
    const b = matchTariff(catalog, { insurer: "Alte Leipziger Lebensversicherung a.G.", tariffName: "Alte Leipziger FondsRente FR70" })[0];
    expect(a?.tariffId).toBe("t1");
    expect(b?.tariffId).toBe("t1");
    expect(a?.score).toBeGreaterThanOrEqual(MATCH_SUGGEST_THRESHOLD);
    expect(b?.score).toBeGreaterThanOrEqual(MATCH_SUGGEST_THRESHOLD);
  });

  it("Generation über Vertragsbeginn", () => {
    const r = matchTariff(catalog, { insurer: "Alte Leipziger", tariffCode: "FR70", tariffName: "FondsRente", contractStart: "2022-03-01" })[0];
    expect(r?.generationId).toBe("g2");
  });

  it("fremder Versicherer ergibt keinen Treffer", () => {
    expect(matchTariff(catalog, { insurer: "Unbekannte Leben AG", tariffName: "Irgendwas" })).toEqual([]);
  });
});

const fields: FieldRecord[] = [
  { key: "insurer", value: "Musterversicherung AG", status: "confirmed", source: { kind: "document", label: "Police.pdf, S. 1" } },
  { key: "tariff_name", value: "MusterRente Invest", status: "confirmed", source: { kind: "document", label: "Police.pdf, S. 1" } },
  { key: "layer", value: "layer3", status: "confirmed", source: { kind: "document", label: "Police.pdf, S. 1" } },
  { key: "contract_start", value: "2015-12-01", status: "confirmed", source: { kind: "document", label: "Police.pdf, S. 1" } },
  { key: "retirement_start", value: "2050-12-01", status: "confirmed", source: { kind: "document", label: "Police.pdf, S. 1" } },
  { key: "contribution_amount", value: 100, status: "confirmed", source: { kind: "document", label: "Police.pdf, S. 1" } },
  { key: "payment_frequency", value: "monthly", status: "confirmed", source: { kind: "document", label: "Police.pdf, S. 1" } },
  { key: "current_value", value: 12000, status: "confirmed", source: { kind: "document", label: "Standmitteilung.pdf, S. 1" } },
  { key: "current_value_date", value: "2026-12-01", status: "confirmed", source: { kind: "document", label: "Standmitteilung.pdf, S. 1" } },
];

function allCosts(status: CostRecord["status"] = "confirmed"): CostRecord[] {
  const values: Record<string, number | string | null> = {
    "alpha.mode": "permille_of_premium_sum",
    "alpha.rate": 25,
    "alpha.distributionMonths": 60,
    "beta.percentOfPremium": 5,
    "gamma.percentOfValue": 0.3,
    "kappa.eurPerYear": 18,
    "fund.terPercent": 0.9,
    "fund.kickbackPercent": 0,
    "guarantee.percentOfValue": 0,
    paidUpFeeEur: 0,
    "surrender.percentOfValue": 2,
    "payout.annuityFactorGuaranteed": 22,
    "payout.annuityFactorCurrent": null,
    "payout.annuityCostPercent": 1.5,
  };
  return Object.entries(values).map(([key, value]) => ({ key, value, status, scope: "generation", source: { kind: "library", label: "AVB S. 3" } }));
}

describe("Gate: keine Berechnung ohne vollständige Bestätigung", () => {
  it("alle Pflichtwerte bestätigt → ok, Override schlägt Tarifwert", () => {
    const costs = [...allCosts(), { key: "fund.terPercent", value: 1.4, status: "confirmed", scope: "case", source: { kind: "manual", label: "Fondsfactsheet" } } satisfies CostRecord];
    expect(checkGate(fields, costs).ok).toBe(true);
    const built = buildModel(fields, costs);
    expect(built.model.costs.fund?.terPercent).toBe(1.4);
    expect(built.model.termMonths).toBe(420);
    expect(built.state?.elapsedMonths).toBe(132);
    expect(built.provenance["cost:fund.terPercent"]?.label).toBe("Fondsfactsheet");
  });

  it("ein unbestätigter Kostenfaktor blockiert", () => {
    const costs = allCosts();
    costs[3] = { ...costs[3]!, status: "proposed" };
    const g = checkGate(fields, costs);
    expect(g.ok).toBe(false);
    expect(g.unconfirmedCosts).toContain(costs[3]!.key);
    expect(() => buildModel(fields, costs)).toThrow(GateError);
  });

  it("ein unbestätigter Override-Vorschlag blockiert ebenfalls", () => {
    const costs = [...allCosts(), { key: "kappa.eurPerYear", value: 30, status: "proposed", scope: "case", source: null } satisfies CostRecord];
    expect(checkGate(fields, costs).ok).toBe(false);
  });

  it("fehlender Pflicht-Kostenfaktor blockiert; null nur bei Rentenfaktoren zulässig", () => {
    const costs = allCosts().filter((c) => c.key !== "kappa.eurPerYear");
    expect(checkGate(fields, costs).missingCosts).toContain("kappa.eurPerYear");
    const nullGamma = allCosts().map((c) => (c.key === "gamma.percentOfValue" ? { ...c, value: null } : c));
    expect(checkGate(fields, nullGamma).missingCosts).toContain("gamma.percentOfValue");
  });

  it("unbestätigtes Vertragsfeld blockiert", () => {
    const f = fields.map((x) => (x.key === "contribution_amount" ? { ...x, status: "proposed" as const } : x));
    expect(checkGate(f, allCosts()).unconfirmedFields).toContain("contribution_amount");
  });

  it("Katalog: jede Pflicht-Kostenart ist im Testfall belegt", () => {
    const keys = new Set(allCosts().map((c) => c.key));
    for (const f of COST_FIELDS.filter((x) => x.required)) expect(keys.has(f.key), f.key).toBe(true);
  });
});

describe("Datenschutz-Sperre", () => {
  it("ohne geprüfte Bereinigung kein Modellaufruf", async () => {
    await expect(extractContract({ pages: [{ fileName: "a.png", pageNumber: 1, text: "x" }], verification: { ok: false } as never })).rejects.toThrow(PrivacyGuardError);
  });
});

describe("Schemas", () => {
  it("lassen sich in das strukturierte Ausgabeformat übersetzen", () => {
    for (const s of [ContractExtractionRaw, CostExtraction, SearchCandidates]) expect(() => betaZodOutputFormat(s)).not.toThrow();
  });
});

describe("Anforderungsschreiben", () => {
  it("enthält Platzhalter statt personenbezogener Daten und verweist auf die Maklervollmacht", () => {
    const { body } = requestLetter({ insurer: "Musterversicherung AG", tariffName: "MusterRente Invest", tariffCode: "MRI", generation: "2015", caseNumber: "KW-2026-0001", date: "2026-11-03" });
    for (const p of ["[Vertragsnummer]", "[Name Versicherungsnehmer/in]", "[Datum der Maklervollmacht]"]) expect(body).toContain(p);
    expect(LETTER_PLACEHOLDERS.length).toBeGreaterThan(3);
    expect(body).toMatch(/Maklervollmacht/);
    expect(body).toContain("03.11.2026");
  });
});

describe("Download", () => {
  it("lehnt interne und nicht-https-Adressen ab", async () => {
    await expect(downloadPdf("http://example.com/a.pdf")).rejects.toThrow(/https/);
    await expect(downloadPdf("https://127.0.0.1/a.pdf")).rejects.toThrow();
    await expect(downloadPdf("https://localhost/a.pdf")).rejects.toThrow();
  });

  it("prüft die PDF-Signatur", async () => {
    const fake = (async () => new Response("<html></html>", { status: 200 })) as unknown as typeof fetch;
    await expect(downloadPdf("https://example.com/a.pdf", { fetchImpl: fake })).rejects.toThrow(/Keine PDF/);
    const ok = (async () => new Response("%PDF-1.7 test", { status: 200 })) as unknown as typeof fetch;
    expect((await downloadPdf("https://example.com/a.pdf", { fetchImpl: ok })).sizeBytes).toBe(13);
  });
});

describe("Normalisierung der Erkennung", () => {
  it("wandelt Textwerte typgerecht und verwirft Unlesbares", () => {
    const n = normalizeContractExtraction({
      document_types: ["police"],
      fields: [
        { key: "contribution_amount", value: "1.234,56", confidence: 0.9, file: "a.pdf", page: 1, region: null, quote: "1.234,56 €" },
        { key: "current_value", value: "16482.35", confidence: 0.9, file: "a.pdf", page: 1, region: null, quote: null },
        { key: "contract_start", value: "01.01.2015", confidence: 0.9, file: "a.pdf", page: 1, region: null, quote: null },
        { key: "layer", value: "riester", confidence: 0.9, file: "a.pdf", page: 1, region: null, quote: null },
        { key: "payment_frequency", value: "monatlich", confidence: 0.5, file: "a.pdf", page: 1, region: null, quote: null },
      ],
      funds: [],
      funds_source: null,
      top_ups: [],
      notes: [],
    });
    expect(n.contribution_amount?.value).toBe(1234.56);
    expect(n.current_value?.value).toBe(16482.35);
    expect(n.contract_start?.value).toBe("2015-01-01");
    expect(n.layer?.value).toBe("riester");
    expect(n.payment_frequency).toBeUndefined();
    expect(n.notes.join(" ")).toMatch(/payment_frequency/);
    expect(n.contribution_amount?.source?.file).toBe("a.pdf");
  });
});
