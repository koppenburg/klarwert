/**
 * Gesetzliche Konstanten für Klarwert.
 *
 * Jede Konstante trägt Wert, Norm, Quelle, Abrufdatum und Prüfstatus.
 * - "verifiziert": Wortlaut an der Primärquelle gelesen (BGBl., gesetze-im-internet.de, BT-/BR-Drucksache).
 * - "bitte prüfen": nicht an Primärquelle bestätigt, widersprüchlich oder Auslegungsfrage.
 *
 * Änderungen hier immer mit neuem `asOf`-Datum und Quelle. Siehe README → „Gesetzliche Konstanten pflegen“.
 */

export type VerificationStatus = "verifiziert" | "bitte prüfen";

export interface LegalConstant<T> {
  value: T;
  unit?: string;
  label: string;
  norm: string;
  sourceId: SourceId;
  asOf: string;
  status: VerificationStatus;
  note?: string;
}

export const SOURCES = {
  AVRG: {
    title: "Altersvorsorgereformgesetz vom 26.05.2026, BGBl. 2026 I Nr. 156 (ausgegeben 29.05.2026)",
    url: "https://www.recht.bund.de/bgbl/1/2026/156/regelungstext.pdf?__blob=publicationFile&v=1",
  },
  BT_21_4996: {
    title: "BT-Drs. 21/4996 – Beschlussempfehlung und Bericht des Finanzausschusses (25.03.2026)",
    url: "https://dserver.bundestag.de/btd/21/049/2104996.pdf",
  },
  BT_21_4088: {
    title: "BT-Drs. 21/4088 – Gesetzentwurf der Bundesregierung (11.02.2026)",
    url: "https://dserver.bundestag.de/btd/21/040/2104088.pdf",
  },
  ESTG_AF: {
    title: "EStG §§ 10a, 79, 84, 85, 86 in der Fassung bis 31.12.2026 (gesetze-im-internet.de)",
    url: "https://www.gesetze-im-internet.de/estg/__84.html",
  },
  ALTZERTG_AF: {
    title: "AltZertG §§ 1, 2a, 7, 14 in der Fassung bis 31.12.2026 (gesetze-im-internet.de)",
    url: "https://www.gesetze-im-internet.de/altzertg/__1.html",
  },
  VVG_169: { title: "VVG § 169 (gesetze-im-internet.de)", url: "https://www.gesetze-im-internet.de/vvg_2008/__169.html" },
  VVG_INFOV_2: { title: "VVG-InfoV § 2 (gesetze-im-internet.de)", url: "https://www.gesetze-im-internet.de/vvg-infov/__2.html" },
  DECKRV_2: { title: "DeckRV § 2 (gesetze-im-internet.de)", url: "https://www.gesetze-im-internet.de/deckrv_2016/__2.html" },
} as const;
export type SourceId = keyof typeof SOURCES;

const AS_OF = "2026-11-03";

function c<T>(value: T, label: string, norm: string, sourceId: SourceId, status: VerificationStatus, extra: { unit?: string; note?: string } = {}): LegalConstant<T> {
  return { value, label, norm, sourceId, asOf: AS_OF, status, ...extra };
}

/** Altes Riester-Recht: gilt für Bestandsverträge (Abschluss vor 01.01.2027) fort, § 52 Abs. 50a S. 1 EStG n. F. */
export const riesterOld = {
  basicAllowance: c(175, "Grundzulage", "§ 84 S. 1 EStG a. F.", "ESTG_AF", "verifiziert", { unit: "€ p.a." }),
  starterBonus: c(200, "Berufseinsteigerbonus (einmalig, unter 25)", "§ 84 S. 2, 3 EStG a. F.", "ESTG_AF", "verifiziert", { unit: "€" }),
  childAllowanceBefore2008: c(185, "Kinderzulage, Kind vor 2008 geboren", "§ 85 Abs. 1 S. 1 EStG a. F.", "ESTG_AF", "verifiziert", { unit: "€ p.a." }),
  childAllowanceFrom2008: c(300, "Kinderzulage, Kind ab 01.01.2008 geboren", "§ 85 Abs. 1 S. 2 EStG a. F.", "ESTG_AF", "verifiziert", { unit: "€ p.a." }),
  minContributionPercent: c(4, "Mindesteigenbeitrag in % der beitragspflichtigen Einnahmen des Vorjahres, abzgl. Zulagen", "§ 86 Abs. 1 S. 2 EStG a. F.", "ESTG_AF", "verifiziert", { unit: "%" }),
  minContributionCap: c(2100, "Obergrenze für 4 % (Höchstbetrag § 10a)", "§ 86 Abs. 1 S. 2 i. V. m. § 10a Abs. 1 EStG a. F.", "ESTG_AF", "verifiziert", { unit: "€" }),
  baseAmount: c(60, "Sockelbetrag", "§ 86 Abs. 1 S. 4 EStG a. F.", "ESTG_AF", "verifiziert", { unit: "€ p.a." }),
  specialExpensesCap: c(2100, "Sonderausgabenabzug einschließlich Zulage", "§ 10a Abs. 1 S. 1 EStG a. F.", "ESTG_AF", "verifiziert", { unit: "€ p.a." }),
  proportionalReduction: c(true, "Kürzung der Zulage im Verhältnis Eigenbeitrag/Mindesteigenbeitrag", "§ 86 Abs. 1 S. 6 EStG a. F.", "ESTG_AF", "verifiziert"),
  alphaDistributionMonths: c(60, "Verteilung der Abschlusskosten mindestens auf die ersten 5 Vertragsjahre", "§ 1 Abs. 1 S. 1 Nr. 8 AltZertG a. F.", "ALTZERTG_AF", "verifiziert", { unit: "Monate" }),
  lastNewContractDate: c("2026-12-31", "Vertrieb alter Zertifikate (Neuabschluss) nur bis", "§ 14 Abs. 7 S. 4 AltZertG n. F.", "AVRG", "verifiziert"),
} as const;

/** Neues Förderrecht (Altersvorsorgedepot und Verträge im neuen Recht) ab Beitragsjahr 2027. */
export const subsidyNew = {
  effectiveFrom: c("2027-01-01", "Inkrafttreten der Kernreform", "Art. 14 Abs. 2 AVRG", "AVRG", "verifiziert"),
  tiers: c(
    [
      { upTo: 360, ratePercent: 50 },
      { upTo: 1800, ratePercent: 25 },
    ] as ReadonlyArray<{ upTo: number; ratePercent: number }>,
    "Grundzulage: 50 % der Beiträge bis 360 €, 25 % der Beiträge von 360,01 € bis 1.800 €",
    "§ 84 S. 1 Nr. 1, 2 EStG n. F.",
    "AVRG",
    "verifiziert",
    { note: "Regierungsentwurf sah 30/20 % (max. 480 €) vor; durch Finanzausschuss ersetzt (BT-Drs. 21/4996)." },
  ),
  maxBasicAllowance: c(540, "maximale Grundzulage", "errechnet aus § 84 S. 1 EStG n. F.", "AVRG", "verifiziert", { unit: "€ p.a." }),
  childMatchPercent: c(100, "Kinderzulage: 100 % der Beiträge je Kind", "§ 85 Abs. 1 S. 1 EStG n. F.", "AVRG", "verifiziert", { unit: "%" }),
  childMaxPerChild: c(300, "Kinderzulage höchstens je Kind", "§ 85 Abs. 1 S. 1 EStG n. F.", "AVRG", "verifiziert", { unit: "€ p.a." }),
  childMultipleReading: c(
    "per_child_full" as ChildMatchingReading,
    "Mehrere Kinder: zählen dieselben Beiträge für jedes Kind voll?",
    "§ 85 Abs. 1 S. 1 EStG n. F. („für jedes Kind“)",
    "AVRG",
    "bitte prüfen",
    { note: "Auslegungsfrage ohne BMF-Schreiben. Beide Lesarten im Tool wählbar: per_child_full (jedes Kind 100 % der Beiträge, je max. 300 €) und shared (Summe der Kinderzulagen höchstens Eigenbeitrag)." },
  ),
  starterBonus: c(200, "Berufseinsteigerbonus einmalig (unter 25 zu Beginn des Beitragsjahres)", "§ 84 S. 2 EStG n. F.", "AVRG", "verifiziert", { unit: "€" }),
  indirectSpouseMax: c(175, "Grundzulage mittelbar berechtigter Ehegatte höchstens", "§ 84 S. 3, 4 EStG n. F.", "AVRG", "verifiziert", { unit: "€ p.a." }),
  indirectSpouseMinOwn: c(120, "Eigenbeitrag mittelbar Berechtigter mindestens", "§ 79 S. 2 Nr. 4 EStG n. F.", "AVRG", "verifiziert", { unit: "€ p.a." }),
  minOwnContribution: c(120, "Mindesteigenbeitrag (darunter keine Zulage, keine anteilige Kürzung)", "§ 86 EStG n. F.", "AVRG", "verifiziert", { unit: "€ p.a." }),
  specialExpensesCap: c(1800, "Sonderausgabenabzug: 1.800 € Altersvorsorgebeiträge zuzüglich Zulage", "§ 10a Abs. 1 S. 1 EStG n. F.", "AVRG", "verifiziert", { unit: "€ p.a." }),
  annualContributionCap: c(6840, "Einzahlungsgrenze je Vertrag und Jahr (ohne Zulagen, Erträge, Übertragungen)", "§ 1 Abs. 1 S. 1 Nr. 5 AltZertG n. F.", "AVRG", "verifiziert", { unit: "€ p.a." }),
  maxSubsidisedNewContracts: c(2, "geförderte Neuverträge je Person (ab dem dritten keine Förderung)", "§ 82 Abs. 5 EStG n. F.", "AVRG", "verifiziert"),
  selfEmployedEligible: c(true, "Selbstständige unter 67 mit Einkünften § 15 / § 18 Abs. 1 Nr. 1–3 EStG und Steuererklärung förderberechtigt", "§ 10a Abs. 1 S. 5 EStG n. F.", "AVRG", "verifiziert"),
  alphaDistribution: c("savings_phase", "Abschlusskosten gleichmäßig auf die vereinbarte Ansparphase (soweit nicht % der Beiträge)", "§ 1 Abs. 1 S. 1 Nr. 8 AltZertG n. F.", "AVRG", "verifiziert"),
} as const;

export type ChildMatchingReading = "per_child_full" | "shared";

/** Altersvorsorgedepot und Produktregeln ab 01.01.2027. */
export const avDepot = {
  standardDepotCostCapPercent: c(1.0, "Kostendeckel Standarddepot: Effektivkosten höchstens", "§ 2a Abs. 2 S. 1 AltZertG n. F.", "AVRG", "verifiziert", { unit: "% p.a.", note: "Gilt nur für das Standarddepot (§ 1 Abs. 1c), nicht für andere Depots oder Garantieprodukte. RegE: 1,5 %." }),
  guaranteeLevels: c([80, 100] as ReadonlyArray<number>, "Garantieprodukte: Mindestkapital in % der Beiträge inkl. Zulagen", "§ 1 Abs. 1 S. 1 Nr. 3 lit. a AltZertG n. F.", "AVRG", "verifiziert", { unit: "%" }),
  payoutStartAgeMin: c(65, "Auszahlungsbeginn frühestens", "§ 1 Abs. 1 S. 1 Nr. 2 lit. a AltZertG n. F.", "AVRG", "verifiziert", { unit: "Jahre" }),
  payoutStartAgeMax: c(70, "Auszahlungsbeginn spätestens", "§ 1 Abs. 1 S. 1 Nr. 2 lit. a AltZertG n. F.", "AVRG", "verifiziert", { unit: "Jahre" }),
  payoutPlanMinEndAge: c(85, "Auszahlplan mindestens bis Vollendung des", "§ 1 Abs. 1 S. 1 Nr. 4 lit. b AltZertG n. F.", "AVRG", "verifiziert", { unit: "Lebensjahr" }),
  partialLumpSumMaxPercent: c(30, "Teilkapitalauszahlung zu Beginn der Auszahlungsphase höchstens", "§ 1 Abs. 1 S. 1 Nr. 4 AltZertG n. F.", "AVRG", "verifiziert", { unit: "%" }),
  riskClassMax: c(5, "Depot ohne Garantie: Fonds bis PRIIPs-Risikoklasse", "§ 1 Abs. 1b AltZertG n. F.", "AVRG", "verifiziert"),
} as const;

/** Übertragung (Anbieterwechsel) von Riester-Bestandsverträgen ins Altersvorsorgedepot. */
export const transfer = {
  outgoingFeeMax: c(150, "abgebender Anbieter: Wechselkosten höchstens", "§ 1 Abs. 1 S. 3 AltZertG (a. F. und n. F.)", "AVRG", "verifiziert", { unit: "€" }),
  outgoingFreeAfterYears: c(5, "abgebender Anbieter n. F.: kostenfrei nach Ablauf von … Jahren seit Vertragsabschluss", "§ 1 Abs. 1 S. 3 AltZertG n. F.", "AVRG", "verifiziert", { unit: "Jahre" }),
  outgoingReadingForLegacy: c(
    "both_options",
    "Gilt die 5-Jahres-Regel (danach kostenfrei) auch für abgebende Bestandsverträge?",
    "§ 14 Abs. 7 S. 7, Abs. 8 AltZertG n. F.",
    "AVRG",
    "bitte prüfen",
    { note: "Uneinheitliche Lesart. Das Tool rechnet beide Varianten: D1 (max. 150 € ohne Frist, a. F.) und D2 (nach 5 Jahren kostenfrei, n. F.)." },
  ),
  incomingFeeMax: c(150, "aufnehmender Anbieter: einmalige Verwaltungspauschale höchstens", "§ 1 Abs. 1 S. 4 AltZertG n. F.", "AVRG", "verifiziert", { unit: "€" }),
  incomingNoAlphaOnTransferred: c(true, "aufnehmender Anbieter: keine Abschluss- und Vertriebskosten auf übertragenes Kapital", "§ 1 Abs. 1 S. 4 AltZertG n. F.", "AVRG", "verifiziert"),
  noDoubleSubsidyInSwitchYear: c(true, "Keine Doppelförderung im Wechseljahr (altes und neues Recht nicht nebeneinander)", "Auslegung § 52 Abs. 50a S. 4–6 EStG n. F.", "AVRG", "bitte prüfen", { note: "Keine ausdrückliche Norm; Ergebnis der Auslegung. Im Tool als Hinweis, Zulage je Beitragsjahr nur nach einem Recht." }),
  optInIrrevocableAllContracts: c(true, "Erklärung auf neues Förderrecht: unwiderruflich, einheitlich für alle Bestandsverträge, ab Beitragsjahr der Erklärung", "§ 52 Abs. 50a S. 4, 5 EStG n. F.", "AVRG", "verifiziert"),
  newContractSwitchesAll: c(true, "Neuabschluss ab 01.01.2027 überführt alle Bestandsverträge ins neue Recht", "§ 52 Abs. 50a S. 6 EStG n. F.", "AVRG", "verifiziert"),
  legacyNotTransferable: c(
    true,
    "Ungeförderte Verträge (Schicht 3) und Basisrenten können nicht ins Altersvorsorgedepot übertragen werden",
    "§ 1 Abs. 1 S. 1 Nr. 10 lit. b AltZertG n. F. (Übertragung nur zwischen zertifizierten Verträgen)",
    "AVRG",
    "bitte prüfen",
    { note: "Vorgabe des Auftraggebers; Übertragungsweg nur für zertifizierte Altersvorsorgeverträge vorgesehen." },
  ),
} as const;

/** Allgemeine Kosten- und Informationsregeln. */
export const costRules = {
  vvgAlphaDistributionMonths: c(60, "Rückkaufswert: Abschlusskosten mindestens gleichmäßig auf die ersten 5 Vertragsjahre verteilt", "§ 169 Abs. 3 S. 1 VVG", "VVG_169", "verifiziert", { unit: "Monate" }),
  vvgInfoEffectiveCosts: c("Minderung der Wertentwicklung durch Kosten in Prozentpunkten bis zum Beginn der Auszahlungsphase", "Effektivkosten (Lebens-/Rentenversicherung)", "§ 2 Abs. 1 Nr. 9 VVG-InfoV", "VVG_INFOV_2", "verifiziert"),
  altzertgEffectiveCosts: c("Effektivkosten wie Gesamtkostenindikator nach Anhang VI DelVO (EU) 2017/653", "Effektivkosten (zertifizierte Verträge, n. F.)", "§ 2a Abs. 1 S. 2 AltZertG n. F.", "AVRG", "verifiziert"),
  maxTechnicalInterestPercent: c(1.0, "Höchstrechnungszins (Verträge ab 01.01.2025)", "§ 2 Abs. 1 S. 1 DeckRV", "DECKRV_2", "verifiziert", { unit: "%" }),
  priipsKidForRiesterInsurance: c("unklar", "PRIIPs-Basisinformationsblatt für Riester-Versicherungen", "Art. 2 Abs. 2 VO (EU) 1286/2014", "AVRG", "bitte prüfen", { note: "Ausnahme für nationale Altersvorsorgeprodukte nicht an der Primärquelle geprüft." }),
} as const;

export const legalConfig = { riesterOld, subsidyNew, avDepot, transfer, costRules } as const;
export type LegalConfig = typeof legalConfig;

export interface FlatConstant {
  group: string;
  key: string;
  constant: LegalConstant<unknown>;
  source: (typeof SOURCES)[SourceId];
}

/** Flache Liste aller Konstanten, z. B. für die Anzeige im Tool und den Report-Anhang. */
export function listConstants(): FlatConstant[] {
  const out: FlatConstant[] = [];
  for (const [group, entries] of Object.entries(legalConfig)) {
    for (const [key, constant] of Object.entries(entries as Record<string, LegalConstant<unknown>>)) {
      out.push({ group, key, constant, source: SOURCES[constant.sourceId] });
    }
  }
  return out;
}

export const GROUP_LABELS: Record<keyof LegalConfig, string> = {
  riesterOld: "Riester – altes Recht (Bestandsverträge)",
  subsidyNew: "Förderung – neues Recht ab 2027",
  avDepot: "Altersvorsorgedepot – Produktregeln",
  transfer: "Übertragung und Rechtswechsel",
  costRules: "Kosten- und Informationsregeln",
};
