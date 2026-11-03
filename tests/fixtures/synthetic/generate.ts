/**
 * Erzeugt die drei synthetischen Abnahmefälle der fiktiven „Musterversicherung AG“:
 *   1 Riester-Fondsvertrag (Police-PDF, Standmitteilung als Screenshot, Tarifbestimmungen 2015)
 *   2 Schicht-3-Fondsvertrag (Maklerportal-Screenshot, Standmitteilung als Textdatei, AVB/Kostenblatt 2018)
 *   3 Angebot mit Produktinformationsblatt (Angebot-PDF, PIB-PDF, Tarifbestimmungen 2026)
 * Alle Personen, Anschriften, Nummern und Bankdaten sind frei erfunden.
 *
 * Aufruf: pnpm fixtures:synthetic   (schreibt die Dateien neben dieses Skript und cases.json)
 */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { effectiveCosts } from "@klarwert/calc";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CASES } from "./cases";

const here = path.dirname(fileURLToPath(import.meta.url));

function fontFamily(): string {
  for (const f of ["DejaVu Sans", "Liberation Sans", "Inter", "FreeSans"]) if (GlobalFonts.has(f)) return f;
  return "sans-serif";
}

// ---------- PDF ----------------------------------------------------------------

interface PdfLine {
  text: string;
  bold?: boolean;
  size?: number;
  gap?: number;
}

async function pdf(pages: PdfLine[][], footer: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(footer);
  doc.setProducer("Klarwert Fixture-Generator");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  pages.forEach((lines, idx) => {
    const page = doc.addPage([595, 842]);
    let y = 790;
    for (const l of lines) {
      const size = l.size ?? 10.5;
      y -= l.gap ?? size * 1.55;
      y = wrap(page, l.text, 56, y, l.bold ? bold : regular, size);
    }
    page.drawText(`${footer} – Seite ${idx + 1} von ${pages.length}`, { x: 56, y: 36, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) });
  });
  return doc.save();
}

function wrap(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number): number {
  const maxWidth = 483;
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      page.drawText(line, { x, y: cy, size, font, color: rgb(0.1, 0.1, 0.15) });
      cy -= size * 1.4;
      line = w;
    } else line = test;
  }
  if (line) page.drawText(line, { x, y: cy, size, font, color: rgb(0.1, 0.1, 0.15) });
  return cy;
}

// ---------- PNG ----------------------------------------------------------------

function screenshot(title: string, subtitle: string, rows: Array<[string, string]>, accent = "#2d5f8b"): Buffer {
  const W = 1400;
  const rowH = 46;
  const H = 170 + rows.length * rowH + 60;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const font = fontFamily();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 70);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 26px "${font}"`;
  ctx.fillText(title, 32, 45);
  ctx.fillStyle = "#1d2330";
  ctx.font = `bold 24px "${font}"`;
  ctx.fillText(subtitle, 32, 120);
  ctx.font = `22px "${font}"`;
  rows.forEach(([label, value], i) => {
    const y = 175 + i * rowH;
    if (i % 2 === 0) {
      ctx.fillStyle = "#f3f6fa";
      ctx.fillRect(24, y - 30, W - 48, rowH);
    }
    ctx.fillStyle = "#4a5568";
    ctx.fillText(label, 40, y);
    ctx.fillStyle = "#111827";
    ctx.fillText(value, 460, y);
  });
  return canvas.toBuffer("image/png");
}

// ---------- ISIN mit gültiger Prüfziffer (fiktive Fonds) ---------------------

export function isinWithCheckDigit(body11: string): string {
  const digits = body11
    .toUpperCase()
    .split("")
    .map((ch) => (/[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch))
    .join("");
  let sum = 0;
  const rev = digits.split("").reverse();
  rev.forEach((d, i) => {
    let n = Number(d);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  });
  return `${body11}${(10 - (sum % 10)) % 10}`;
}

const de = (n: number, digits = 2) => n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

async function main() {
  const out: Record<string, unknown> = {};
  const fundA = isinWithCheckDigit("DE000MV0001");
  const fundB = isinWithCheckDigit("DE000MV0002");
  const fundC = isinWithCheckDigit("IE00MVETF01");

  // ===== Fall 1: Riester-Fondsvertrag ============================================
  {
    const c = CASES.riester;
    const dir = path.join(here, c.dir);
    mkdirSync(dir, { recursive: true });
    const p = c.person;
    const police = await pdf(
      [
        [
          { text: "Musterversicherung AG", bold: true, size: 16 },
          { text: "Versicherungsschein zur fondsgebundenen Rentenversicherung", bold: true, size: 13 },
          { text: "Zertifizierter Altersvorsorgevertrag nach dem Altersvorsorgeverträge-Zertifizierungsgesetz (AltZertG) – Riester-Rente", gap: 22 },
          { text: `Versicherungsnehmer: ${p.name}`, gap: 26 },
          { text: `Anschrift: ${p.street}, ${p.zipCity}` },
          { text: `Geburtsdatum: ${p.birthdate}` },
          { text: `Vertragsnummer: ${p.policyNumber}` },
          { text: "Vertragsdaten", bold: true, size: 12, gap: 28 },
          { text: "Tarif: MusterRiester Invest (Tarifkürzel MRI-R), Tarifgeneration 2015" },
          { text: "Vertragsbeginn: 01.01.2015" },
          { text: "Rentenbeginn: 01.01.2048" },
          { text: "Beitragszahlungsdauer: bis 31.12.2047" },
          { text: "Monatlicher Eigenbeitrag: 100,00 € (zuzüglich staatlicher Zulagen)" },
          { text: "Zahlweise: monatlich" },
          { text: "Beitragsdynamik: keine" },
          { text: "Beitragserhaltungszusage: 100 % der eingezahlten Beiträge und Zulagen zu Beginn der Auszahlungsphase" },
          { text: `Fondsauswahl: Muster Aktien Global (ISIN ${fundA}) 100 %, laufende Kosten (TER) 1,10 % p.a.` },
        ],
        [
          { text: "Leistungen in der Rentenphase", bold: true, size: 12 },
          { text: "Garantierter Rentenfaktor: 22,50 € monatliche Rente je 10.000 € Kapital zu Rentenbeginn." },
          { text: "Rentengarantiezeit: keine." },
          { text: "Beitragseinzug", bold: true, size: 12, gap: 28 },
          { text: `Die Beiträge werden per Lastschrift vom Konto IBAN ${p.iban} eingezogen.` },
          { text: `Telefon für Rückfragen der versicherten Person: ${p.phone}` },
          { text: "Hinweis: Grundlage des Vertrags sind die Tarifbestimmungen MusterRiester Invest, Stand 2015.", gap: 28 },
        ],
      ],
      "Musterversicherung AG · Versicherungsschein",
    );
    writeFileSync(path.join(dir, "police-mri-r-2015.pdf"), police);
    writeFileSync(
      path.join(dir, "standmitteilung-2026.png"),
      screenshot("Musterversicherung AG – Kundenportal", "Jährliche Standmitteilung zum 01.10.2026", [
        ["Versicherungsnehmer:", p.name],
        ["Geburtsdatum:", p.birthdate],
        ["Vertragsnummer:", p.policyNumber],
        ["Tarif:", "MusterRiester Invest (MRI-R)"],
        ["Stichtag:", "01.10.2026"],
        ["Vertragsguthaben:", "16.482,35 €"],
        ["Rückkaufswert:", "16.482,35 €"],
        ["Eingezahlte Eigenbeiträge:", "14.100,00 €"],
        ["Gutgeschriebene Zulagen:", "2.875,00 €"],
        ["Aktueller Rentenfaktor:", "27,10 € je 10.000 €"],
      ]),
    );
    const tb = await pdf(
      [
        [
          { text: "Musterversicherung AG", bold: true, size: 16 },
          { text: "Tarifbestimmungen MusterRiester Invest (Tarif MRI-R) – Stand 2015", bold: true, size: 13 },
          { text: "§ 1 Gegenstand", bold: true, gap: 26 },
          { text: "Diese Tarifbestimmungen gelten für zertifizierte fondsgebundene Rentenversicherungen nach dem AltZertG der Tarifgeneration 2015." },
          { text: "§ 2 Abschluss- und Vertriebskosten", bold: true, gap: 22 },
          { text: "(1) Die Abschluss- und Vertriebskosten betragen 4,0 % der Summe der für die gesamte Beitragszahlungsdauer vereinbarten Beiträge (40 Promille der Beitragssumme)." },
          { text: "(2) Sie werden gleichmäßig auf die ersten fünf Vertragsjahre (60 Monate) verteilt und den laufenden Beiträgen entnommen." },
          { text: "(3) Auf Zulagen werden keine Abschluss- und Vertriebskosten erhoben. Bei einer Beitragsfreistellung werden noch nicht getilgte Abschlusskosten nicht weiter erhoben." },
          { text: "§ 3 Verwaltungskosten", bold: true, gap: 22 },
          { text: "(1) Von jedem Beitrag und jeder Zulage werden Verwaltungskosten in Höhe von 6,0 % einbehalten." },
          { text: "(2) Laufend werden Verwaltungskosten in Höhe von 0,40 % p.a. des Fondsguthabens in monatlichen Teilbeträgen entnommen." },
          { text: "(3) Zusätzlich werden Stückkosten von 24,00 € jährlich in monatlichen Teilbeträgen erhoben." },
        ],
        [
          { text: "§ 4 Kosten der Beitragserhaltungszusage", bold: true },
          { text: "Für die Absicherung der Beitragserhaltungszusage werden 0,30 % p.a. des Guthabens in monatlichen Teilbeträgen entnommen." },
          { text: "§ 5 Fondskosten und Rückvergütungen", bold: true, gap: 22 },
          { text: "Die laufenden Kosten der Fonds werden von den Kapitalverwaltungsgesellschaften erhoben und sind im Fondsvermögen berücksichtigt. Rückvergütungen werden nicht an den Vertrag weitergegeben." },
          { text: "§ 6 Beitragsfreistellung, Kündigung, Anbieterwechsel", bold: true, gap: 22 },
          { text: "(1) Für die Beitragsfreistellung werden keine Kosten erhoben." },
          { text: "(2) Bei Kündigung oder Übertragung wird kein Stornoabzug vorgenommen. Für die Übertragung auf einen anderen Anbieter erheben wir einmalig 150 €." },
          { text: "§ 7 Rentenphase", bold: true, gap: 22 },
          { text: "(1) Der garantierte Rentenfaktor beträgt 22,50 € monatliche Rente je 10.000 € Kapital." },
          { text: "(2) In der Rentenphase fallen Verwaltungskosten von 1,5 % jeder Rentenzahlung an; sie sind im Rentenfaktor berücksichtigt." },
        ],
      ],
      "Tarifbestimmungen MRI-R 2015",
    );
    writeFileSync(path.join(dir, "bibliothek-tarifbestimmungen-mri-r-2015.pdf"), tb);
    out.riester = { ...c, fundIsin: fundA };
  }

  // ===== Fall 2: Schicht-3-Fondsvertrag =========================================
  {
    const c = CASES.layer3;
    const dir = path.join(here, c.dir);
    mkdirSync(dir, { recursive: true });
    const p = c.person;
    writeFileSync(
      path.join(dir, "maklerportal-vertrag.png"),
      screenshot(
        "Maklerportal – Vertragsübersicht",
        "Vertragsdetails",
        [
          ["Kunde:", p.name],
          ["Geburtsdatum:", p.birthdate],
          ["Anschrift:", `${p.street}, ${p.zipCity}`],
          ["Vertrags-Nr.:", p.policyNumber],
          ["Gesellschaft:", "Musterversicherung AG"],
          ["Produkt:", "MV MRI 2018 FondsRente (Schicht 3)"],
          ["Tarif:", "MRI, Generation 2018"],
          ["Beginn:", "01.12.2018"],
          ["Rentenbeginn:", "01.12.2055"],
          ["Beitrag:", "150,00 € monatlich"],
          ["Dynamik:", "3 % jährlich"],
          ["Zuzahlung:", "2.000,00 € am 01.06.2022"],
          ["Fonds 1:", "Muster Aktien Global 60 % (TER 0,95 %)"],
          ["Fonds 2:", "Muster Renten Euro 40 % (TER 0,70 %)"],
        ],
        "#3a4a5c",
      ),
    );
    writeFileSync(
      path.join(dir, "standmitteilung-2026.txt"),
      [
        "Musterversicherung AG",
        "Standmitteilung zu Ihrer fondsgebundenen Rentenversicherung",
        "",
        `Versicherungsnehmerin: ${p.name}`,
        `Anschrift: ${p.street}, ${p.zipCity}`,
        `Vertragsnummer: ${p.policyNumber}`,
        `E-Mail: ${p.email}`,
        "",
        "Tarif: MusterRente Invest (MRI), Tarifgeneration 2018",
        "Stichtag: 01.10.2026",
        "Vertragsguthaben: 21.315,80 €",
        "Rückkaufswert: 20.676,33 €",
        "Garantierter Rentenfaktor: 24,00 € je 10.000 € Kapital",
        "",
        "Diese Mitteilung wurde maschinell erstellt.",
      ].join("\n"),
      "utf8",
    );
    const avb = await pdf(
      [
        [
          { text: "Musterversicherung AG", bold: true, size: 16 },
          { text: "Allgemeine Versicherungsbedingungen und Kostenblatt MusterRente Invest (Tarif MRI) – Generation 2018", bold: true, size: 13 },
          { text: "Teil A – Kosten", bold: true, size: 12, gap: 26 },
          { text: "A.1 Abschluss- und Vertriebskosten: 2,5 % der Beitragssumme (25 Promille), gleichmäßig verteilt auf die ersten 60 Monate. Bei Dynamikerhöhungen werden auf die zusätzliche Beitragssumme ebenfalls 2,5 % erhoben und über 60 Monate ab der Erhöhung verteilt." },
          { text: "A.2 Auf Zuzahlungen werden 2,0 % Abschluss- und Vertriebskosten sowie 1,0 % Verwaltungskosten sofort entnommen." },
          { text: "A.3 Verwaltungskosten auf laufende Beiträge: 8,0 % jedes Beitrags." },
          { text: "A.4 Verwaltungskosten auf das Fondsguthaben: 0,35 % p.a., monatlich anteilig." },
          { text: "A.5 Stückkosten: 36,00 € pro Jahr, monatlich anteilig. Im beitragsfreien Zustand 24,00 € pro Jahr." },
          { text: "A.6 Rückvergütungen der Fondsgesellschaften in Höhe von 0,20 % p.a. werden dem Vertrag gutgeschrieben." },
          { text: "A.7 Für Garantien fallen keine gesonderten Kosten an (keine Beitragsgarantie)." },
        ],
        [
          { text: "Teil B – Beitragsfreistellung und Kündigung", bold: true, size: 12 },
          { text: "B.1 Für die Beitragsfreistellung berechnen wir einmalig 25,00 €." },
          { text: "B.2 Bei Kündigung ziehen wir vom Fondsguthaben einen Stornoabzug von 3,0 % ab, höchstens jedoch 1.000 €." },
          { text: "Teil C – Rentenphase", bold: true, size: 12, gap: 26 },
          { text: "C.1 Der garantierte Rentenfaktor beträgt 24,00 € monatliche Rente je 10.000 € Kapital. Ein aktueller Rentenfaktor wird erst bei Rentenbeginn festgelegt." },
          { text: "C.2 Verwaltungskosten in der Rentenphase: 2,0 % jeder Rente; sie sind im Rentenfaktor enthalten." },
          { text: "C.3 Bei Kapitalabfindung fallen keine Kosten an. Die Rentengarantiezeit beträgt 10 Jahre." },
        ],
      ],
      "AVB/Kostenblatt MRI 2018",
    );
    writeFileSync(path.join(dir, "bibliothek-avb-kostenblatt-mri-2018.pdf"), avb);
    out.layer3 = { ...c, fundIsins: [fundA, fundB] };
  }

  // ===== Fall 3: Angebot mit PIB ===============================================
  {
    const c = CASES.offer;
    const dir = path.join(here, c.dir);
    mkdirSync(dir, { recursive: true });
    const p = c.person;
    // Effektivkosten laut PIB aus den dokumentierten Kostenparametern (Rechenkern, PIB-Annahme 3,0 %)
    const ec = effectiveCosts({
      termMonths: 420,
      contributions: { amount: 200, frequency: "monthly" },
      costs: {
        alpha: { mode: "permille_of_premium_sum", rate: 25, distributionMonths: 60 },
        beta: { percentOfPremium: 5 },
        gamma: { percentOfValue: 0.3 },
        kappa: { eurPerYear: 30 },
        fund: { terPercent: 0.2 },
      },
      grossReturnPercent: 3,
    });
    const pibCosts = Math.round((ec.reductionInYieldPp ?? 0) * 100) / 100;
    const angebot = await pdf(
      [
        [
          { text: "Musterversicherung AG", bold: true, size: 16 },
          { text: "Ihr persönliches Angebot – fondsgebundene Rentenversicherung MusterRente Invest", bold: true, size: 13 },
          { text: `Angebot für: ${p.name}`, gap: 26 },
          { text: `Anschrift: ${p.street}, ${p.zipCity}` },
          { text: `Geburtsdatum: ${p.birthdate}` },
          { text: `Angebotsnummer: ${p.policyNumber}` },
          { text: "Tarifdaten", bold: true, size: 12, gap: 26 },
          { text: "Tarif: MusterRente Invest (Tarif MRI), Tarifgeneration 2026 – private Rentenversicherung (Schicht 3)" },
          { text: "Versicherungsbeginn: 01.01.2027" },
          { text: "Rentenbeginn: 01.01.2062" },
          { text: "Monatlicher Beitrag: 200,00 €, Beitragszahlung bis Rentenbeginn" },
          { text: "Dynamik: keine" },
          { text: `Fonds: Muster ETF Welt (ISIN ${fundC}) 100 %, laufende Kosten 0,20 % p.a.` },
        ],
        [
          { text: "Rentenphase", bold: true, size: 12 },
          { text: "Garantierter Rentenfaktor: 21,00 € monatliche Rente je 10.000 € Kapital." },
          { text: "Aktueller (nicht garantierter) Rentenfaktor: 26,40 € je 10.000 €." },
          { text: "Ihr Berater: Koppenburg GmbH, unabhängiger Versicherungsmakler", gap: 26 },
          { text: "Dieses Angebot ist unverbindlich. Maßgeblich sind die Tarifbestimmungen MusterRente Invest, Generation 2026, und das Produktinformationsblatt." },
        ],
      ],
      "Angebot MusterRente Invest 2026",
    );
    writeFileSync(path.join(dir, "angebot-mri-2026.pdf"), angebot);
    const pib = await pdf(
      [
        [
          { text: "Produktinformationsblatt", bold: true, size: 16 },
          { text: "Musterversicherung AG – MusterRente Invest (Tarif MRI), Tarifgeneration 2026", bold: true, size: 12 },
          { text: `Musterfall für: ${p.name}`, gap: 24 },
          { text: "Beginn 01.01.2027, Rentenbeginn 01.01.2062, Beitrag 200,00 € monatlich, Beitragssumme 84.000,00 €" },
          { text: "Kosten", bold: true, size: 12, gap: 24 },
          { text: "Abschluss- und Vertriebskosten: 2.100,00 € (2,5 % der Beitragssumme), verteilt auf die ersten 5 Jahre." },
          { text: "Verwaltungskosten: 5,0 % jedes Beitrags; 0,30 % p.a. des Fondsguthabens; 30,00 € pro Jahr." },
          { text: "Laufende Kosten des Fonds: 0,20 % p.a." },
          { text: "Effektivkosten", bold: true, size: 12, gap: 24 },
          { text: `Die Kosten mindern die Wertentwicklung bis zum Beginn der Auszahlungsphase um ${de(pibCosts)} Prozentpunkte pro Jahr (Effektivkosten). Annahme: Wertentwicklung vor Kosten 3,0 % p.a.` },
        ],
      ],
      "PIB MRI 2026",
    );
    writeFileSync(path.join(dir, "pib-mri-2026.pdf"), pib);
    const tb = await pdf(
      [
        [
          { text: "Musterversicherung AG", bold: true, size: 16 },
          { text: "Tarifbestimmungen MusterRente Invest (Tarif MRI) – Generation 2026", bold: true, size: 13 },
          { text: "§ 1 Abschluss- und Vertriebskosten", bold: true, gap: 26 },
          { text: "Die Abschluss- und Vertriebskosten betragen 25 Promille der Beitragssumme und werden gleichmäßig auf die ersten 60 Monate der Beitragszahlung verteilt. Auf Dynamikerhöhungen und Zuzahlungen fallen ebenfalls 25 Promille bzw. 2,5 % an." },
          { text: "§ 2 Verwaltungskosten", bold: true, gap: 22 },
          { text: "(1) 5,0 % jedes laufenden Beitrags. (2) 0,30 % p.a. des Fondsguthabens, monatlich anteilig. (3) Stückkosten 30,00 € jährlich." },
          { text: "§ 3 Fonds", bold: true, gap: 22 },
          { text: "Rückvergütungen werden nicht gewährt. Garantiekosten fallen nicht an." },
          { text: "§ 4 Beitragsfreistellung und Kündigung", bold: true, gap: 22 },
          { text: "Für die Beitragsfreistellung fallen keine Kosten an. Ein Stornoabzug wird nicht erhoben." },
          { text: "§ 5 Rentenphase", bold: true, gap: 22 },
          { text: "Garantierter Rentenfaktor 21,00 € je 10.000 €. Verwaltungskosten in der Rentenphase 1,5 % der Rente, im Rentenfaktor berücksichtigt." },
        ],
      ],
      "Tarifbestimmungen MRI 2026",
    );
    writeFileSync(path.join(dir, "bibliothek-tarifbestimmungen-mri-2026.pdf"), tb);
    out.offer = { ...c, fundIsin: fundC, pibEffectiveCostsPp: pibCosts, pibEffectiveCostsUnrounded: ec.reductionInYieldPp };
  }

  writeFileSync(path.join(here, "cases.generated.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("Synthetische Fälle erzeugt:", Object.keys(out).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
