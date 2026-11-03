import { describe, expect, it } from "vitest";
import { detectPii, maskText, type PiiKind } from "../src/index";

function kinds(text: string, knownNames?: string[]): Array<[PiiKind, string]> {
  return detectPii(text, knownNames ? { knownNames } : {}).map((m) => [m.kind, m.text]);
}

function masked(text: string, knownNames?: string[]): string {
  return maskText(text, knownNames ? { knownNames } : {}).text;
}

describe("detectPii – Namen", () => {
  it.each([
    ["Versicherungsnehmer: Erika Mustermann", "Erika Mustermann"],
    ["Versicherte Person: Max Mustermann", "Max Mustermann"],
    ["Name, Vorname: Mustermann, Erika", "Mustermann, Erika"],
    ["Kontoinhaber: ERIKA MUSTERMANN", "ERIKA MUSTERMANN"],
    ["Bezugsberechtigt: Hans-Peter Schmidt", "Hans-Peter Schmidt"],
    ["Beitragszahler Jürgen Weißmüller", "Jürgen Weißmüller"],
    ["Ihr Ansprechpartner ist Thomas Becker.", "Thomas Becker"],
    ["Inhaber: Mehmet Yılmaz", "Mehmet Yılmaz"],
  ])("%s", (line, name) => {
    expect(kinds(line)).toContainEqual(["name", name]);
  });

  it("Anrede Herr/Frau", () => {
    expect(masked("Sehr geehrte Frau Mustermann,")).toBe("Sehr geehrte Frau [NAME],");
    expect(masked("Sehr geehrter Herr Dr. Müller,")).not.toContain("Müller");
    expect(masked("Herrn Karl-Heinz von Berg")).toBe("Herrn [NAME]");
  });

  it("Label mit Wert in der Folgezeile", () => {
    expect(masked("Versicherungsnehmer\nErika Mustermann\nTarif FR70")).toBe("Versicherungsnehmer\n[NAME]\nTarif FR70");
  });

  it("knownNames: Teilnamen, Groß/Klein, Umlaut-Varianten", () => {
    const t = "Vertrag von MUSTERMANN; Kopie an erika; Mustermann-Gabler";
    expect(masked(t, ["Erika Mustermann"])).toBe("Vertrag von [NAME]; Kopie an [NAME]; [NAME]-Gabler");
    expect(masked("Begünstigt: Juergen Mueller", ["Jürgen Müller"])).not.toMatch(/Juergen|Mueller/);
    expect(masked("Zahlung durch Muller", ["Jürgen Müller"])).toBe("Zahlung durch [NAME]");
  });

  it.each([
    "Musterversicherung AG",
    "Victoria Lebensversicherung AG",
    "Max Mustermann GmbH",
    "Alte Leipziger Lebensversicherung a.G.",
    "Sehr geehrte Damen und Herren,",
    "Fondsname: DWS Top Dividende",
    "Tarifname: Klassik Plus",
    "Name des Versicherers: Musterversicherung AG",
  ])("kein Personenname: %s", (line) => {
    expect(kinds(line).filter(([k]) => k === "name")).toEqual([]);
  });
});

describe("detectPii – Anschrift", () => {
  it.each([
    ["Heidestraße 17, 51147 Köln", "Heidestraße 17, 51147 Köln"],
    ["Neue Adresse ab Mai Kurt-Schumacher-Platz 3a laut Mitteilung", "Kurt-Schumacher-Platz 3a"],
    ["Kölner Str. 12", "Kölner Str. 12"],
    ["Am Heidering 5, 51147 Köln", "Am Heidering 5, 51147 Köln"],
    ["Wohnort: Bergisch Gladbach", "Bergisch Gladbach"],
    ["60311 Frankfurt am Main", "60311 Frankfurt am Main"],
    ["HEIDESTRASSE 17", "HEIDESTRASSE 17"],
  ])("%s", (line, value) => {
    expect(kinds(line)).toContainEqual(["address", value]);
  });

  it("Anschrift über mehrere Zeilen", () => {
    expect(masked("Anschrift\nHeidestraße 17\n51147 Köln")).toBe("Anschrift\n[ANSCHRIFT]\n[ANSCHRIFT]");
  });

  it("Firmenadresse des Versicherers darf geschwärzt werden, Firmenname bleibt", () => {
    const out = masked("Musterversicherung AG, Musterallee 1, 10115 Berlin");
    expect(out).toContain("Musterversicherung AG");
    expect(out).not.toContain("10115");
  });

  it.each(["Versicherungssumme 50000 Euro", "Rente im Alter 67", "Im Jahr 2015 wurde der Vertrag geschlossen"])("keine Anschrift: %s", (line) => {
    expect(kinds(line)).toEqual([]);
  });
});

describe("detectPii – Geburtsdatum", () => {
  it.each([
    ["geb. am 12.03.1980", "12.03.1980"],
    ["Geburtsdatum: 12. März 1980", "12. März 1980"],
    ["Geb.-Datum 12.03.80", "12.03.80"],
    ["Erika Mustermann, geboren 1980-03-12", "1980-03-12"],
    ["Versicherte Person * 12.03.1980", "12.03.1980"],
  ])("%s", (line, value) => {
    expect(kinds(line)).toContainEqual(["birthdate", value]);
  });

  it("Datum in der Folgezeile (Tabellenkopf)", () => {
    expect(masked("Geburtsdatum   Vertragsbeginn\n12.03.1980     01.12.2015")).toBe("Geburtsdatum   Vertragsbeginn\n[GEBURTSDATUM]     01.12.2015");
  });

  it("andere Daten bleiben", () => {
    const t = "Geburtsdatum: 12.03.1980\nVertragsbeginn: 01.12.2015\nRentenbeginn: 01.01.2047\nStand 31.12.2024";
    expect(masked(t)).toBe("Geburtsdatum: [GEBURTSDATUM]\nVertragsbeginn: 01.12.2015\nRentenbeginn: 01.01.2047\nStand 31.12.2024");
  });
});

describe("detectPii – Vertrags-/Versicherungsnummern", () => {
  it.each([
    ["Vers.-Nr.: 123/456789-0", "123/456789-0"],
    ["Versicherungsnummer 12 345 678", "12 345 678"],
    ["Kundennummer: K-4711-0815", "K-4711-0815"],
    ["Police Nr. AB12345", "AB12345"],
    ["Vertragsnummer\nLV-2015-4711083", "LV-2015-4711083"],
    ["Zulagenummer: 123456Z789", "123456Z789"],
    ["Sozialversicherungsnummer 65 170839 J 003", "65 170839 J 003"],
    ["Aktenzeichen: 2024/0815", "2024/0815"],
  ])("Label: %s", (line, value) => {
    expect(kinds(line)).toContainEqual(["policy_number", value]);
  });

  it("generische Nummernkette ≥ 6 Ziffern", () => {
    expect(kinds("Ihr Vertrag 987654321 wurde umgestellt")).toEqual([["policy_number", "987654321"]]);
    expect(kinds("Bezug: 12 345 678 90")).toEqual([["policy_number", "12 345 678 90"]]);
  });

  it.each([
    "Vertragsbeginn 01.12.2015",
    "Tarif FR70",
    "Monatlicher Beitrag: 1.234,56 €",
    "Fondsguthaben 123.456,78 EUR",
    "Versicherungssumme 150.000 €",
    "Todesfallleistung 1.500.000 EUR",
    "ISIN DE0008474503",
    "Fonds: DWS Top Dividende (DE0009848119)",
    "Garantiezins 0,9 %",
    "Verwaltungskosten 2,5 ‰ des Guthabens",
    "Stand 12/2024, Laufzeit 2015/2045",
    "Ablauf 01.12.2015-01.12.2045",
    "Rentenfaktor 28,50 € je 10.000 € Guthaben",
    "Fondsanteile 1234,567890",
    "Produktinformationsblatt gemäß § 4 VVG-InfoV",
    "Effektivkosten 1,23 % p.a. bis zum Rentenbeginn 2047",
    "WKN 847450",
  ])("keine PII: %s", (line) => {
    expect(kinds(line)).toEqual([]);
  });
});

describe("detectPii – IBAN, Telefon, E-Mail, Steuer-ID", () => {
  it.each([
    ["IBAN: DE89 3704 0044 0532 0130 00", "iban", "DE89 3704 0044 0532 0130 00"],
    ["Konto DE89370400440532013000 belastet", "iban", "DE89370400440532013000"],
    ["AT61 1904 3002 3457 3201", "iban", "AT61 1904 3002 3457 3201"],
    ["IBAN DE89 37O4 0044 0532 0130 00 (OCR-Fehler)", "iban", "DE89 37O4 0044 0532 0130 00"],
    ["BIC: COBADEFFXXX", "iban", "COBADEFFXXX"],
    ["Tel.: 0221/98765-43", "phone", "0221/98765-43"],
    ["Mobil +49 171 1234567", "phone", "+49 171 1234567"],
    ["Rückfragen unter +49 (0) 221 123 45 67", "phone", "+49 (0) 221 123 45 67"],
    ["Fax 0221 1234 567", "phone", "0221 1234 567"],
    ["E-Mail: erika.mustermann@example.de", "email", "erika.mustermann@example.de"],
    ["Steuer-ID: 12 345 678 901", "tax_id", "12 345 678 901"],
    ["Steuerliche Identifikationsnummer 12345678901", "tax_id", "12345678901"],
    ["IdNr. 12345678901", "tax_id", "12345678901"],
    ["RV-Nr. lt. Bescheid: 65 170839 J 003", "tax_id", "65 170839 J 003"],
  ])("%s", (line, kind, value) => {
    expect(kinds(line)).toContainEqual([kind, value]);
  });

  it("IBAN und BIC in einer Zeile", () => {
    expect(masked("IBAN: DE89 3704 0044 0532 0130 00 BIC: COBADEFFXXX")).toBe("IBAN: [IBAN] BIC: [IBAN]");
  });
});

describe("maskText", () => {
  const doc = [
    "Musterversicherung AG · Standmitteilung zum 31.12.2024",
    "Versicherungsnehmer: Erika Mustermann, geb. 12.03.1980",
    "Anschrift: Heidestraße 17, 51147 Köln",
    "Vertragsnummer: LV-2015-4711083   Tarif: FR70",
    "IBAN: DE89 3704 0044 0532 0130 00",
    "Telefon: 0221 98765432 · E-Mail: erika.mustermann@example.de",
    "Vertragsbeginn: 01.12.2015   Monatlicher Beitrag: 150,00 €",
    "Fonds: DekaFonds CF (DE0008474503), Kostenquote 1,05 %",
  ].join("\n");

  it("ersetzt PII durch Platzhalter, Vertragsinhalte bleiben", () => {
    const { text, matches } = maskText(doc);
    expect(text).toBe(
      [
        "Musterversicherung AG · Standmitteilung zum 31.12.2024",
        "Versicherungsnehmer: [NAME], geb. [GEBURTSDATUM]",
        "Anschrift: [ANSCHRIFT]",
        "Vertragsnummer: [VERTRAGSNR]   Tarif: FR70",
        "IBAN: [IBAN]",
        "Telefon: [TELEFON] · E-Mail: [E-MAIL]",
        "Vertragsbeginn: 01.12.2015   Monatlicher Beitrag: 150,00 €",
        "Fonds: DekaFonds CF (DE0008474503), Kostenquote 1,05 %",
      ].join("\n"),
    );
    expect(matches.map((m) => m.kind).sort()).toEqual(["address", "birthdate", "email", "iban", "name", "phone", "policy_number"]);
    for (const m of matches) expect(doc.slice(m.start, m.end)).toBe(m.text);
  });

  it("Ergebnis ist stabil: erneute Prüfung findet nichts", () => {
    const { text } = maskText(doc, { knownNames: ["Erika Mustermann"] });
    expect(detectPii(text, { knownNames: ["Erika Mustermann"] })).toEqual([]);
    expect(maskText(text).text).toBe(text);
  });

  it("Treffer überlappen nicht und sind sortiert", () => {
    const ms = detectPii(doc, { knownNames: ["Erika Mustermann"] });
    for (let i = 1; i < ms.length; i++) expect(ms[i]!.start).toBeGreaterThanOrEqual(ms[i - 1]!.end);
  });
});
