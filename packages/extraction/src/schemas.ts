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

export const TopUp = z.object({ date: z.string().describe("YYYY-MM-DD"), amount: z.number() });
export const Fund = z.object({
  name: z.string(),
  isin: z.string().nullable(),
  sharePercent: z.number().nullable(),
  terPercent: z.number().nullable().describe("laufende Kosten (TER/OGC) in % p.a., falls im Dokument genannt"),
});

/** Skalare Vertragsfelder, die das Modell als flache Liste liefert (kompakte Grammatik für strukturierte Ausgabe). */
export const CONTRACT_SCALAR_KEYS = [
  "insurer",
  "tariff_name",
  "tariff_code",
  "tariff_generation",
  "layer",
  "product_type",
  "contract_start",
  "retirement_start",
  "payment_end",
  "contribution_amount",
  "payment_frequency",
  "single_premium",
  "dynamics_percent",
  "guarantee_level_percent",
  "current_value",
  "current_value_date",
  "surrender_value",
  "paid_up_from",
  "pib_effective_costs_pp",
  "pib_return_percent",
  "pib_annuity_monthly",
  "annuity_factor_guaranteed",
  "annuity_factor_current",
] as const;
export type ContractScalarKey = (typeof CONTRACT_SCALAR_KEYS)[number];

const DOC_TYPES = ["police", "nachtrag", "standmitteilung", "screenshot", "angebot", "pib", "sonstiges"] as const;

/** Rohantwort des Modells (flach). */
export const ContractExtractionRaw = z.object({
  document_types: z.array(z.enum(DOC_TYPES)).describe("erkannte Dokumentarten in Reihenfolge der Dateien"),
  fields: z
    .array(
      z.object({
        key: z.enum(CONTRACT_SCALAR_KEYS),
        value: z.string().describe("Wert als Text. Zahlen mit Punkt als Dezimaltrenner, ohne Tausendertrennzeichen und ohne Einheit (1234.56). Datum YYYY-MM-DD. Aufzählungen nur als Schlüssel: layer = riester|basis|layer3|bav; payment_frequency = monthly|quarterly|semiannual|annual|none; product_type = fonds|klassisch|hybrid|index|sonstige."),
        confidence: z.number().describe("0 bis 1"),
        file: z.string().describe("Dateiname"),
        page: z.number().int().nullable(),
        region: z.string().nullable().describe("Bildbereich bzw. Abschnitt"),
        quote: z.string().nullable().describe("wörtliches Zitat, max. 200 Zeichen, Platzhalter statt Personendaten"),
      }),
    )
    .describe("nur Felder, die in den Dokumenten stehen; jedes Feld höchstens einmal"),
  funds: z.array(Fund).describe("Fondsauswahl mit Anteilen, leer wenn nicht genannt"),
  funds_source: z.object({ file: z.string(), page: z.number().int().nullable(), quote: z.string().nullable(), confidence: z.number() }).nullable(),
  top_ups: z.array(TopUp).describe("Zuzahlungen, leer wenn keine"),
  notes: z.array(z.string()).describe("Hinweise auf Unklarheiten, Widersprüche zwischen Dokumenten, fehlende Angaben"),
});
export type ContractExtractionRaw = z.infer<typeof ContractExtractionRaw>;

export interface ExtractedField<T = unknown> {
  value: T | null;
  confidence: number;
  source: SourceRef | null;
}

/** Normalisierte Erkennung: je Feld Wert, Konfidenz und Fundstelle. */
export type ContractExtraction = { document_types: Array<(typeof DOC_TYPES)[number]>; notes: string[]; funds: ExtractedField<Array<z.infer<typeof Fund>>>; top_ups: ExtractedField<Array<z.infer<typeof TopUp>>> } & Record<ContractScalarKey, ExtractedField | undefined>;

const NUMERIC_KEYS = new Set<ContractScalarKey>([
  "contribution_amount",
  "single_premium",
  "dynamics_percent",
  "guarantee_level_percent",
  "current_value",
  "surrender_value",
  "pib_effective_costs_pp",
  "pib_return_percent",
  "pib_annuity_monthly",
  "annuity_factor_guaranteed",
  "annuity_factor_current",
]);
const ENUMS: Partial<Record<ContractScalarKey, readonly string[]>> = { layer: LAYERS, payment_frequency: FREQUENCIES, product_type: ["fonds", "klassisch", "hybrid", "index", "sonstige"] };

/** Wandelt den Textwert eines Feldes in den Zieltyp; ungültige Werte werden verworfen (null) statt geraten. */
export function coerceExtractedValue(key: ContractScalarKey, raw: string): unknown {
  const v = raw.trim();
  if (!v || /^(null|n\/a|unbekannt|-|–)$/i.test(v)) return null;
  if (NUMERIC_KEYS.has(key)) {
    let t = v.replace(/[^0-9,.-]/g, "");
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  const options = ENUMS[key];
  if (options) return options.includes(v) ? v : null;
  if (key.endsWith("_start") || key.endsWith("_date") || key === "payment_end" || key === "paid_up_from") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (iso) return v;
    const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
    return de ? `${de[3]}-${de[2]!.padStart(2, "0")}-${de[1]!.padStart(2, "0")}` : null;
  }
  return v;
}

export function normalizeContractExtraction(raw: ContractExtractionRaw): ContractExtraction {
  const out = { document_types: raw.document_types, notes: [...raw.notes] } as ContractExtraction;
  for (const f of raw.fields) {
    if (out[f.key]) {
      out.notes.push(`Feld ${f.key} mehrfach geliefert – erster Wert übernommen.`);
      continue;
    }
    const value = coerceExtractedValue(f.key, f.value);
    if (value === null) {
      if (f.value.trim()) out.notes.push(`Feld ${f.key}: Wert „${f.value.slice(0, 40)}“ nicht lesbar – bitte manuell prüfen.`);
      continue;
    }
    out[f.key] = { value, confidence: f.confidence, source: { file: f.file, page: f.page, region: f.region, quote: f.quote } };
  }
  const fs = raw.funds_source;
  out.funds = { value: raw.funds.length ? raw.funds : null, confidence: fs?.confidence ?? 0, source: fs ? { file: fs.file, page: fs.page, region: null, quote: fs.quote } : null };
  out.top_ups = { value: raw.top_ups.length ? raw.top_ups : null, confidence: fs?.confidence ?? 0.8, source: null };
  return out;
}

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
