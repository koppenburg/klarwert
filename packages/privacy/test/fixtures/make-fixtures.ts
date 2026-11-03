/**
 * Synthetische Testdokumente mit FIKTIVEN Personendaten (Erika Mustermann).
 * Werden zur Laufzeit erzeugt – keine echten Kundendaten im Repository.
 */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export const PERSON = {
  name: "Erika Mustermann",
  firstName: "Erika",
  lastName: "Mustermann",
  street: "Heidestraße 17",
  zipCity: "51147 Köln",
  birthdate: "12.03.1980",
  policyNumber: "LV-2015-4711083",
  iban: "DE89 3704 0044 0532 0130 00",
  phone: "0221 98765432",
  email: "erika.mustermann@example.de",
} as const;

/** Strings, die nach der Bereinigung nirgends mehr vorkommen dürfen. */
export const PII_STRINGS = [
  "Erika",
  "Mustermann",
  "Heidestraße",
  "51147",
  "Köln",
  "12.03.1980",
  "4711083",
  "LV-2015",
  "DE89",
  "3704 0044",
  "0532",
  "98765432",
  "erika.mustermann",
  "example.de",
  "@",
] as const;

/** Vertragsrelevante Werte, die erhalten bleiben müssen. */
export const CONTRACT_VALUES = ["Musterversicherung AG", "FR70", "01.12.2015", "150,00", "12.345,67", "DE0008474503", "2,15"] as const;

export const ROWS: ReadonlyArray<readonly [string, string]> = [
  ["Versicherungsnehmer:", PERSON.name],
  ["Anschrift:", `${PERSON.street}, ${PERSON.zipCity}`],
  ["Geburtsdatum:", PERSON.birthdate],
  ["Vertragsnummer:", PERSON.policyNumber],
  ["IBAN:", PERSON.iban],
  ["Telefon:", PERSON.phone],
  ["E-Mail:", PERSON.email],
  ["Tarif:", "FR70 Fondsgebundene Rentenversicherung"],
  ["Vertragsbeginn:", "01.12.2015"],
  ["Monatlicher Beitrag:", "150,00 €"],
  ["Fondsguthaben:", "12.345,67 €"],
  ["Fonds:", "DekaFonds CF (DE0008474503)"],
  ["Effektivkosten:", "2,15 % p.a."],
];

export const HEADER = "Musterversicherung AG - Standmitteilung zum 31.12.2024";

function fontFamily(): string {
  for (const f of ["DejaVu Sans", "Liberation Sans", "Inter", "FreeSans"]) if (GlobalFonts.has(f)) return f;
  return "sans-serif";
}

/** Geometrie des Screenshots (für Pixelprüfungen im Test). */
export const LAYOUT = { width: 1400, valueX: 380, firstBaseline: 175, rowH: 46, fontPx: 22 } as const;

/** Bereich des Werts in Tabellenzeile `i` (Pixel). */
export function valueRect(i: number): { x: number; y: number; width: number; height: number } {
  const baseline = LAYOUT.firstBaseline + i * LAYOUT.rowH;
  return { x: LAYOUT.valueX, y: baseline - LAYOUT.fontPx, width: 200, height: LAYOUT.fontPx + 4 };
}

/** „Maklerportal-Screenshot": Kopfzeile, zweispaltige Label/Wert-Tabelle. */
export function makePortalScreenshotPng(): Buffer {
  const W = LAYOUT.width;
  const rowH = LAYOUT.rowH;
  const H = 150 + ROWS.length * rowH + 60;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const font = fontFamily();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  // Kopfzeile
  ctx.fillStyle = "#1d3c78";
  ctx.fillRect(0, 0, W, 70);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 26px "${font}"`;
  ctx.fillText(`Maklerportal - Vertragsdetails - Kunde: ${PERSON.name}`, 30, 45);
  ctx.fillStyle = "#111111";
  ctx.font = `bold 24px "${font}"`;
  ctx.fillText(HEADER, 30, 120);
  ctx.font = `${LAYOUT.fontPx}px "${font}"`;
  ROWS.forEach(([label, value], i) => {
    const y = LAYOUT.firstBaseline + i * rowH;
    if (i % 2 === 0) {
      ctx.fillStyle = "#f2f4f8";
      ctx.fillRect(20, y - 30, W - 40, rowH);
    }
    ctx.fillStyle = "#444444";
    ctx.fillText(label, 40, y);
    ctx.fillStyle = "#000000";
    ctx.fillText(value, LAYOUT.valueX, y);
  });
  return canvas.toBuffer("image/png");
}

/** Gleicher Inhalt als Fließtext (für Text-/PDF-Fixtures). */
export function contractLines(): string[] {
  return [HEADER, "", `Sehr geehrte Frau ${PERSON.lastName},`, "", ...ROWS.map(([l, v]) => `${l} ${v}`)];
}

export function makeTextFile(): Uint8Array {
  return new TextEncoder().encode(contractLines().join("\n") + "\n");
}

/** PDF mit Textlayer (Seite 1) und optional einer Scan-Seite (Bild ohne Text, Seite 2). */
export async function makePdf(opts: { withScanPage?: boolean } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  let y = 790;
  for (const line of contractLines()) {
    if (line.length > 0) page.drawText(line, { x: 50, y, size: 11, font, color: rgb(0, 0, 0) });
    y -= 18;
  }
  if (opts.withScanPage) {
    const png = await doc.embedPng(makePortalScreenshotPng());
    const scan = doc.addPage([595, 842]);
    const w = 545;
    const h = (png.height / png.width) * w;
    scan.drawImage(png, { x: 25, y: 842 - 40 - h, width: w, height: h });
  }
  doc.setTitle("Standmitteilung");
  return doc.save();
}
