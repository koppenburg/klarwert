/**
 * Zod-Schemas für die strukturierte Ausgabe des Modells. Das Modell rechnet nie – es liefert Rohdaten
 * mit Konfidenz und Fundstelle (Datei, Seite/Bildbereich, Zitat).
 */
import { z } from "zod";
import { COST_KEYS, FREQUENCIES, LAYERS } from "./fields";

export const SourceRef = z.object({
  file: z.string().describe("Dateiname, wie im Eingang angegeben"),
  page: z.number().int().nullable().describe("Seitennummer (1-basiert), bei Bildern 1"),
  region: z.string().nullable().describe("Bildbereich bzw. Abschnitt, z. B. 'oben rechts, Tabelle Vertragsdaten'"),
  quote: z.string().nullable().describe("wörtliches Zitat der Fundstelle, max. 200 Zeichen, nur maskierte Platzhalter statt Personendaten"),
});
export type SourceRef = z.infer<typeof SourceRef>;

function field<T extends z.ZodType>(value: T, description: string) {
  return z
    .object({
      value: value.nullable(),
      confidence: z.number().describe("0 bis 1"),
      source: SourceRef.nullable(),
    })
    .describe(description);
}

export const TopUp = z.object({ date: z.string().describe("YYYY-MM-DD"), amount: z.number() });
export const Fund = z.object({
  name: z.string(),
  isin: z.string().nullable(),
  sharePercent: z.number().nullable(),
  terPercent: z.number().nullable().describe("laufende Kosten (TER/OGC) in % p.a., falls im Dokument genannt"),
});

export const ContractExtraction = z.object({
  document_types: z.array(z.enum(["police", "nachtrag", "standmitteilung", "screenshot", "angebot", "pib", "sonstiges"])).describe("erkannte Dokumentarten in Reihenfolge der Dateien"),
  insurer: field(z.string(), "Versicherer (vollständiger Name)"),
  tariff_name: field(z.string(), "Tarifname / Produktname"),
  tariff_code: field(z.string(), "Tarifkürzel, z. B. 'FR70'"),
  tariff_generation: field(z.string(), "Tarifgeneration bzw. Bedingungsstand, z. B. 'Stand 01.2019'"),
  layer: field(z.enum(LAYERS), "Schicht: riester (zertifiziert, gefördert), basis (Rürup), layer3 (private RV), bav"),
  product_type: field(z.enum(["fonds", "klassisch", "hybrid", "index", "sonstige"]), "Produktart"),
  contract_start: field(z.string(), "Vertragsbeginn YYYY-MM-DD"),
  retirement_start: field(z.string(), "Rentenbeginn bzw. Ablauf der Ansparphase YYYY-MM-DD"),
  payment_end: field(z.string(), "Ende der Beitragszahlung YYYY-MM-DD, falls abweichend vom Rentenbeginn"),
  contribution_amount: field(z.number(), "Beitrag je Zahlungsperiode in € (aktueller Beitrag)"),
  payment_frequency: field(z.enum(FREQUENCIES), "Zahlweise"),
  single_premium: field(z.number(), "Einmalbeitrag in €"),
  dynamics_percent: field(z.number(), "jährliche Dynamik in %"),
  top_ups: field(z.array(TopUp), "Zuzahlungen"),
  funds: field(z.array(Fund), "Fondsauswahl mit Anteilen"),
  guarantee_level_percent: field(z.number(), "Beitragserhalt / Garantieniveau in % der Beiträge"),
  current_value: field(z.number(), "aktuelles Vertragsguthaben in €"),
  current_value_date: field(z.string(), "Stichtag des Guthabens YYYY-MM-DD"),
  surrender_value: field(z.number(), "Rückkaufswert in €"),
  paid_up_from: field(z.string(), "beitragsfrei seit YYYY-MM-DD"),
  pib_effective_costs_pp: field(z.number(), "im Produktinformationsblatt ausgewiesene Effektivkosten in Prozentpunkten"),
  pib_return_percent: field(z.number(), "im PIB genannte Wertentwicklungsannahme vor Kosten in % p.a., die den Effektivkosten zugrunde liegt"),
  pib_annuity_monthly: field(z.number(), "im Angebot/PIB genannte monatliche Rente in €"),
  annuity_factor_guaranteed: field(z.number(), "garantierter Rentenfaktor (€ Monatsrente je 10.000 € Kapital)"),
  annuity_factor_current: field(z.number(), "aktueller Rentenfaktor je 10.000 €"),
  notes: z.array(z.string()).describe("Hinweise auf Unklarheiten, Widersprüche zwischen Dokumenten, fehlende Angaben"),
});
export type ContractExtraction = z.infer<typeof ContractExtraction>;

export const CostItemProposal = z.object({
  key: z.enum(COST_KEYS).describe("Schlüssel aus dem Kostenkatalog"),
  value_number: z.number().nullable().describe("Zahlenwert in der Einheit des Katalogs; 0 wenn ausdrücklich keine Kosten dieser Art"),
  value_text: z.string().nullable().describe("für Aufzählungen/Wahrheitswerte: z. B. 'permille_of_premium_sum', 'true'"),
  page: z.number().int().nullable().describe("Seite im Bedingungswerk (1-basiert)"),
  quote: z.string().describe("wörtliches Zitat der Kostenklausel, max. 300 Zeichen"),
  confidence: z.number().describe("0 bis 1"),
  note: z.string().nullable().describe("Umrechnung oder Annahme, z. B. '2,5 % der Beitragssumme = 25 ‰'"),
});

export const CostExtraction = z.object({
  items: z.array(CostItemProposal),
  not_found: z.array(z.enum(COST_KEYS)).describe("Schlüssel, zu denen das Bedingungswerk nichts enthält"),
  remarks: z.array(z.string()).describe("weitere Kostenposten, die nicht in den Katalog passen (z. B. Kosten bei Fondswechsel, Kosten auf Zulagen), mit Fundstelle"),
});
export type CostExtraction = z.infer<typeof CostExtraction>;
export type CostItemProposal = z.infer<typeof CostItemProposal>;

export const SearchCandidates = z.object({
  candidates: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      kind: z.enum(["avb", "tarifbestimmungen", "pib", "kostenblatt", "sonstiges"]),
      matches_generation: z.enum(["ja", "unklar", "nein"]),
      reason: z.string().describe("warum dieses Dokument zum Tarif und zur Generation passt"),
    }),
  ),
  remarks: z.string().nullable(),
});
export type SearchCandidates = z.infer<typeof SearchCandidates>;
