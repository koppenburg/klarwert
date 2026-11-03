/**
 * Zentraler PII-Test: synthetische Dokumente (PNG-Screenshot, PDF mit
 * Textlayer, PDF-Scan-Seite, Textdatei) mit fiktiven Personendaten. Nach
 * sanitizeDocument darf weder ein PII-String noch ein erkennbares Muster
 * übrig sein; vertragsrelevante Werte müssen erhalten bleiben.
 */
import { afterAll, describe, expect, it } from "vitest";
import { detectPii, sanitizeDocument, terminateOcr, verifySanitized, type SanitizedDocument } from "../src/index";
import { makePdf, makePortalScreenshotPng, makeTextFile, PERSON, ROWS, valueRect } from "./fixtures/make-fixtures";
import { expectBoxesBlack, expectContractValues, expectNoPiiStrings, intersects } from "./helpers";

const OCR_TIMEOUT = 120_000;
const known = { knownNames: [PERSON.name] };

afterAll(async () => {
  await terminateOcr();
});

function expectCleanText(doc: SanitizedDocument): void {
  for (const page of doc.pages) {
    expectNoPiiStrings(page.text);
    expect(detectPii(page.text)).toEqual([]);
    expect(detectPii(page.text, known)).toEqual([]);
  }
}

const PII_ROWS = ROWS.map(([label], i) => ({ label, i })).filter(({ i }) => i <= 6);
const CONTRACT_ROWS = ROWS.map(([label], i) => ({ label, i })).filter(({ i }) => i >= 7);

describe("PII-Bereinigung: PNG (Maklerportal-Screenshot)", () => {
  let doc: SanitizedDocument;

  it(
    "OCR, Erkennung, Schwärzung",
    async () => {
      doc = await sanitizeDocument({ data: makePortalScreenshotPng(), mimeType: "image/png", fileName: "portal-screenshot.png" });
      expect(doc.pages).toHaveLength(1);
      const page = doc.pages[0]!;
      expect(page.source).toBe("ocr");
      expect(page.image).toBeInstanceOf(Uint8Array);
      expect(page.width).toBe(1400);
      expect(page.ocrConfidence).toBeGreaterThan(70);

      expectCleanText(doc);
      expectContractValues(page.text);
      expect(page.text).toContain("Versicherungsnehmer: [NAME]");
      expect(page.text).toContain("IBAN: [IBAN]");
      expect(page.text).toContain("E-Mail: [E-MAIL]");

      // alle Arten gefunden – inkl. des Namens in der dunklen Kopfleiste
      const found = new Set(doc.matches.map((m) => m.kind));
      for (const k of ["name", "address", "birthdate", "policy_number", "iban", "phone", "email"] as const) expect(found).toContain(k);
      expect(doc.matches.filter((m) => m.text.includes("Mustermann")).length).toBeGreaterThanOrEqual(2);
    },
    OCR_TIMEOUT,
  );

  it("Pixel in den Boxen sind schwarz, Boxen liegen auf PII-Werten, nicht auf Vertragswerten", async () => {
    const page = doc.pages[0]!;
    expect(page.boxes.length).toBeGreaterThanOrEqual(PII_ROWS.length);
    await expectBoxesBlack(page.image!, page.boxes);
    for (const { label, i } of PII_ROWS) {
      expect(page.boxes.some((b) => intersects(b, valueRect(i))), `Wert von ${label} geschwärzt`).toBe(true);
    }
    for (const { label, i } of CONTRACT_ROWS) {
      expect(page.boxes.some((b) => intersects(b, valueRect(i))), `Wert von ${label} NICHT geschwärzt`).toBe(false);
    }
  });

  it(
    "verifySanitized: erneute OCR des geschwärzten Bildes findet nichts",
    async () => {
      const v = await verifySanitized(doc, known);
      expect(v.findings).toEqual([]);
      expect(v.ok).toBe(true);
    },
    OCR_TIMEOUT,
  );

  it(
    "Re-OCR des Ausgabebildes enthält keine PII-Strings mehr",
    async () => {
      const again = await sanitizeDocument({ data: doc.pages[0]!.image!, mimeType: "image/png", fileName: "out.png", ...known });
      // Schwarze Balken können als einzelne Artefakt-Zeichen gelesen werden – aber nie als Originalwert
      expectNoPiiStrings(again.pages[0]!.text);
      for (const m of again.matches) expectNoPiiStrings(m.text);
      expectContractValues(again.pages[0]!.text);
    },
    OCR_TIMEOUT,
  );
});

describe("PII-Bereinigung: PDF", () => {
  it(
    "Seite mit Textlayer → nur maskierter Text, kein Bild; Scan-Seite → OCR + geschwärztes Bild",
    async () => {
      const doc = await sanitizeDocument({ data: await makePdf({ withScanPage: true }), mimeType: "application/pdf", fileName: "standmitteilung.pdf" });
      expect(doc.pages).toHaveLength(2);
      const [textPage, scanPage] = doc.pages;

      expect(textPage!.source).toBe("text-layer");
      expect(textPage!.image).toBeUndefined();
      expect(textPage!.boxes).toEqual([]);
      expectContractValues(textPage!.text);
      expect(textPage!.text).toContain("Sehr geehrte Frau [NAME],");

      expect(scanPage!.source).toBe("ocr");
      expect(scanPage!.image).toBeInstanceOf(Uint8Array);
      expect(scanPage!.width).toBeGreaterThan(1000);
      expectContractValues(scanPage!.text);
      await expectBoxesBlack(scanPage!.image!, scanPage!.boxes);

      expectCleanText(doc);
      expect(doc.matches.some((m) => m.pageNumber === 1 && m.kind === "iban")).toBe(true);
      expect(doc.matches.some((m) => m.pageNumber === 2 && m.kind === "iban")).toBe(true);

      const v = await verifySanitized(doc, known);
      expect(v.findings).toEqual([]);
      expect(v.ok).toBe(true);
    },
    OCR_TIMEOUT,
  );

  it("PDF nur mit Textlayer: keine Bilder, keine Warnungen", async () => {
    const doc = await sanitizeDocument({ data: await makePdf(), mimeType: "application/pdf", fileName: "police.pdf", ...known });
    expect(doc.pages.map((p) => p.source)).toEqual(["text-layer"]);
    expect(doc.pages[0]!.image).toBeUndefined();
    expect(doc.warnings).toEqual([]);
    expectCleanText(doc);
    expectContractValues(doc.pages[0]!.text);
    expect((await verifySanitized(doc, known)).ok).toBe(true);
  });
});

describe("PII-Bereinigung: Textdatei", () => {
  it("maskierter Text, Quelle text", async () => {
    const doc = await sanitizeDocument({ data: makeTextFile(), mimeType: "text/plain", fileName: "notiz.txt" });
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]!.source).toBe("text");
    expect(doc.pages[0]!.image).toBeUndefined();
    expectCleanText(doc);
    expectContractValues(doc.pages[0]!.text);
    expect((await verifySanitized(doc, known)).ok).toBe(true);
  });

  it("Dateityp über Endung, Dateiname wird bereinigt", async () => {
    const doc = await sanitizeDocument({ data: makeTextFile(), mimeType: "application/octet-stream", fileName: "Notiz_Erika_Mustermann.md", ...known });
    expect(doc.pages[0]!.source).toBe("text");
    expect(doc.fileName).not.toMatch(/Erika|Mustermann/);
    expect(doc.warnings.some((w) => w.includes("Dateiname"))).toBe(true);
  });

  it("Unbekannter Dateityp wird abgelehnt", async () => {
    await expect(sanitizeDocument({ data: new Uint8Array([1, 2, 3]), mimeType: "application/zip", fileName: "x.zip" })).rejects.toThrow(/Nicht unterstützt/);
  });
});
