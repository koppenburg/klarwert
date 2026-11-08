import { describe, expect, it } from "vitest";
import { fileStem, guessKind, matchDocument, type MatchCandidate } from "./document-match";

// Drei Tarife eines Versicherers. Gewichte der Namensteile (n = 3, w = ln(1 + n/df)):
// basisrente df 2 → ln 2,5 = 0,916; perspektive df 2 → 0,916; invest df 1 → ln 4 = 1,386; privatrente df 1 → 1,386.
const candidates: MatchCandidate[] = [
  { id: "A", name: "Allianz Basisrente Invest", code: "EVR", documentLinks: [{ url: "https://x.de/docs/BIB_Basisrente_Invest.pdf", title: "Basisinformationsblatt Basisrente Invest", kind: "pib" }] },
  { id: "B", name: "Allianz Basisrente Perspektive", code: null, documentLinks: [] },
  { id: "C", name: "Allianz PrivatRente Perspektive", code: null, documentLinks: [] },
];
const insurerNames = ["Allianz Lebensversicherungs-AG", "Allianz"];

describe("Zuordnung im Sammel-Upload", () => {
  it("Dateiname = Link (Browser-Zusatz „(1)“ entfernt): A = 100 + 60 + 20 = 180, B = 60·0,5 = 30 → sicher, Art und Titel vom Link", () => {
    const r = matchDocument({ fileName: "BIB_Basisrente_Invest (1).pdf", text: "", candidates, insurerNames });
    expect(r.ranking).toEqual([
      { candidateId: "A", score: 180 },
      { candidateId: "B", score: 30 },
    ]);
    expect(r).toMatchObject({ candidateId: "A", confidence: "sicher", kind: "pib", title: "Basisinformationsblatt Basisrente Invest", sourceUrl: "https://x.de/docs/BIB_Basisrente_Invest.pdf" });
  });

  it("nur Text: C = 60 + 20 (Name vollständig) = 80, B = 30 (nur „Perspektive“) → sicher, Art aus dem Seitenkopf", () => {
    const r = matchDocument({ fileName: "dokument.pdf", text: "Basisinformationsblatt Zweck … Produkt: Allianz PrivatRente Perspektive", candidates, insurerNames });
    expect(r.ranking[0]).toEqual({ candidateId: "C", score: 80 });
    expect(r.ranking[1]).toEqual({ candidateId: "B", score: 30 });
    expect(r).toMatchObject({ candidateId: "C", confidence: "sicher", kind: "pib", title: "Basis-/Produktinformationsblatt – Allianz PrivatRente Perspektive", sourceUrl: null });
  });

  it("nur „Basisrente“: B = 30, A = round(60·0,916/2,302) = 24 → offen, Berater wählt", () => {
    const r = matchDocument({ fileName: "avb.pdf", text: "Allgemeine Versicherungsbedingungen für die Basisrente", candidates, insurerNames });
    expect(r.ranking).toEqual([
      { candidateId: "B", score: 30 },
      { candidateId: "A", score: 24 },
    ]);
    expect(r.candidateId).toBeNull();
    expect(r.confidence).toBe("offen");
    expect(r.kind).toBe("avb");
  });

  it("Tarifkürzel allein: A = 40, sonst 0 → wahrscheinlich", () => {
    const r = matchDocument({ fileName: "scan.pdf", text: "Kosteninformation zum Tarif EVR", candidates, insurerNames });
    expect(r).toMatchObject({ candidateId: "A", confidence: "wahrscheinlich", kind: "kostenblatt" });
    expect(r.ranking).toEqual([{ candidateId: "A", score: 40 }]);
  });

  it("kürzeres Kürzel zählt nicht innerhalb eines längeren: „MRI“ trifft nicht in „MRI-R“", () => {
    const c2: MatchCandidate[] = [
      { id: "R", name: "Musterversicherung MusterRiester Invest", code: "MRI-R", documentLinks: [] },
      { id: "F", name: "Musterversicherung MusterRente Invest", code: "MRI", documentLinks: [] },
    ];
    // R: Kürzel 40 + Name (musterriester, invest) vollständig 60 + Wortfolge 20 = 120; F: nur „invest“ (ln 2 von ln 2 + ln 3) → round(60·0,387) = 23
    const r = matchDocument({ fileName: "tb.pdf", text: "Tarifbestimmungen MusterRiester Invest (Tarif MRI-R) – Stand 2015", candidates: c2, insurerNames: ["Musterversicherung AG"] });
    expect(r.ranking).toEqual([
      { candidateId: "R", score: 120 },
      { candidateId: "F", score: 23 },
    ]);
    expect(r.confidence).toBe("sicher");
    const f = matchDocument({ fileName: "tb.pdf", text: "Tarifbestimmungen MusterRente Invest (Tarif MRI) – Generation 2026", candidates: c2, insurerNames: ["Musterversicherung AG"] });
    expect(f.candidateId).toBe("F");
  });

  it("Scan ohne Text und ohne Treffer im Dateinamen", () => {
    const r = matchDocument({ fileName: "123456.pdf", text: "", candidates, insurerNames });
    expect(r.candidateId).toBeNull();
    expect(r.reason).toMatch(/kein Text lesbar/);
  });
});

describe("Dokumentart", () => {
  it("Dateiname hat Vorrang, sonst früheste Fundstelle im Seitenkopf", () => {
    expect(guessKind("Kosteninformation_2026.pdf", "Allgemeine Versicherungsbedingungen")).toBe("kostenblatt");
    expect(guessKind("x.pdf", "Allgemeine Versicherungsbedingungen … siehe Basisinformationsblatt")).toBe("avb");
    expect(guessKind("x.pdf", "Tarifbestimmungen für die fondsgebundene Rentenversicherung")).toBe("tarifbestimmungen");
    expect(guessKind("x.pdf", "Hallo")).toBe("sonstiges");
  });
  it("Dateistamm", () => {
    expect(fileStem("C:\\Downloads\\AVB%20Rente (2).pdf")).toBe("AVB Rente");
  });
});
