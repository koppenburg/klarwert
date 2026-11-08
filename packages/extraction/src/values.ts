/**
 * Ein- und Ausgabe von Staffeln, Rentenfaktor-Tabellen und Tarifmerkmalen als Text für Berater,
 * z. B. „0: 5; 100: 4; 250: 3“ oder „65: 25,0 / 30,0; 67: 27,0 / 32,0“.
 */
import { TIER_BASIS_LABELS, isTieredValue, type AnnuityFactorRow, type TariffFeatures, type TierBasis, type TieredValue } from "@klarwert/calc";
import { FEATURE_FIELDS, type FeatureFieldDef } from "./fields";

export class ValueFormatError extends Error {}

function parseDecimal(raw: string): number {
  const t = raw.trim().replace(/\s|€|%|‰/g, "");
  // deutsches Format: Tausenderpunkt + Dezimalkomma
  const norm = /,\d+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(norm);
  if (!Number.isFinite(n) || t === "") throw new ValueFormatError(`„${raw.trim()}“ ist keine Zahl`);
  return n;
}

/** „0: 5; 100: 4; 250: 3“ (auch zeilenweise, „ab 100 €: 4“) → Staffel. */
export function parseTierInput(text: string, basis: TierBasis): TieredValue {
  const parts = text
    .split(/[;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 1) throw new ValueFormatError("Staffel ohne Stufen");
  const tiers = parts.map((p) => {
    const m = /^(?:ab\s*)?([\d.,\s]+?)\s*(?:€)?\s*[:=→]\s*([-\d.,\s]+?)\s*(?:%|‰|€)?$/i.exec(p);
    if (!m) throw new ValueFormatError(`Stufe „${p}“ nicht lesbar – Format „ab-Wert: Kostenwert“, z. B. „100: 4“`);
    return { from: parseDecimal(m[1] as string), value: parseDecimal(m[2] as string) };
  });
  tiers.sort((a, b) => a.from - b.from);
  if (tiers[0]?.from !== 0) throw new ValueFormatError("Die erste Stufe muss bei 0 beginnen.");
  for (let i = 1; i < tiers.length; i++) if (tiers[i]?.from === tiers[i - 1]?.from) throw new ValueFormatError("Stufen doppelt vergeben.");
  return { basis, tiers };
}

const de = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 4 });

export function formatTiered(v: TieredValue, unit?: string): string {
  return `${TIER_BASIS_LABELS[v.basis]}: ${v.tiers.map((t) => `ab ${de(t.from)} € → ${de(t.value)}${unit ? ` ${unit}` : ""}`).join(" · ")}`;
}

export function tierToInput(v: TieredValue): string {
  return v.tiers.map((t) => `${de(t.from)}: ${de(t.value)}`).join("; ");
}

/** „65: 25,0 / 30,0; 67: 27“ → Tabelle (garantiert / aktuell; aktuell optional). */
export function parseAnnuityTable(text: string): AnnuityFactorRow[] {
  const parts = text
    .split(/[;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const rows = parts.map((p) => {
    const m = /^(\d{2})\s*[:=]\s*([\d.,]*)\s*(?:\/\s*([\d.,]+))?$/.exec(p);
    if (!m) throw new ValueFormatError(`Zeile „${p}“ nicht lesbar – Format „Alter: garantiert / aktuell“, z. B. „67: 27,0 / 32,0“`);
    const g = m[2] ? parseDecimal(m[2]) : null;
    const c = m[3] ? parseDecimal(m[3]) : null;
    if (g === null && c === null) throw new ValueFormatError(`Zeile „${p}“ ohne Rentenfaktor`);
    return { age: Number(m[1]), guaranteed: g, current: c };
  });
  rows.sort((a, b) => a.age - b.age);
  return rows;
}

export function isAnnuityTable(v: unknown): v is AnnuityFactorRow[] {
  return Array.isArray(v) && v.every((r) => typeof r === "object" && r !== null && typeof (r as AnnuityFactorRow).age === "number");
}

export function formatAnnuityTable(rows: AnnuityFactorRow[]): string {
  return rows.map((r) => `${r.age}: ${r.guaranteed !== null && r.guaranteed !== undefined ? de(r.guaranteed) : ""}${r.current !== null && r.current !== undefined ? ` / ${de(r.current)}` : ""}`).join("; ");
}

/** Anzeige eines gespeicherten Kosten- oder Merkmalswerts. */
export function describeValue(v: unknown, unit?: string): string {
  if (v === null || v === undefined) return "nicht angegeben";
  if (isTieredValue(v)) return formatTiered(v, unit);
  if (isAnnuityTable(v)) return `Tabelle ${formatAnnuityTable(v)}`;
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "ja" : "nein";
  if (typeof v === "number") return `${de(v)}${unit ? ` ${unit}` : ""}`;
  return String(v);
}

/** Textwert eines Tarifmerkmals in den gespeicherten Wert umwandeln. Leer = „im Bedingungswerk nicht geregelt“ (null). */
export function parseFeatureValue(def: FeatureFieldDef, raw: string): number | boolean | string | number[] | null {
  const v = raw.trim();
  if (v === "" || v === "–") return null;
  switch (def.type) {
    case "number":
      return parseDecimal(v);
    case "boolean":
      if (/^(ja|true|1|x|yes)$/i.test(v)) return true;
      if (/^(nein|false|0|no)$/i.test(v)) return false;
      throw new ValueFormatError(`${def.label}: „ja“ oder „nein“ eingeben`);
    case "enum":
      if (!def.options?.includes(v)) throw new ValueFormatError(`${def.label}: ungültige Auswahl`);
      return v;
    case "list":
      return v
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map(parseDecimal);
  }
}

/** Bestätigte Merkmalswerte (Schlüssel → Wert) in TariffFeatures übersetzen. */
export function featuresFromValues(values: Map<string, unknown>): TariffFeatures {
  const out: Record<string, unknown> = {};
  for (const def of FEATURE_FIELDS) {
    if (!values.has(def.key)) continue;
    out[def.path] = values.get(def.key);
  }
  return out as TariffFeatures;
}

export interface ValueProposal {
  key: string;
  value: unknown;
  page: number | null;
  quote: string | null;
  confidence: number | null;
  note: string | null;
}

/**
 * KI-Antwort (Merkmale, Staffeln, Tabelle) in Vorschläge je Schlüssel übersetzen. Ungültige Werte werden
 * verworfen und gemeldet, nie geraten.
 */
export function featureProposals(data: {
  features: Array<{ key: string; value: string; page: number | null; quote: string; confidence: number }>;
  tiers: Array<{ key: string; basis: TierBasis; from: number; value: number; page: number | null; quote: string }>;
  annuity_table: Array<{ age: number; guaranteed: number | null; current: number | null; page: number | null }>;
}): { proposals: ValueProposal[]; rejected: string[] } {
  const proposals: ValueProposal[] = [];
  const rejected: string[] = [];
  for (const f of data.features) {
    const def = FEATURE_FIELDS.find((d) => d.key === f.key);
    if (!def) continue;
    try {
      const raw = def.type === "boolean" ? f.value.replace(/^true$/i, "ja").replace(/^false$/i, "nein") : f.value;
      proposals.push({ key: f.key, value: parseFeatureValue(def, raw), page: f.page, quote: f.quote, confidence: f.confidence, note: null });
    } catch (e) {
      rejected.push(`${def.label}: ${e instanceof Error ? e.message : "nicht lesbar"}`);
    }
  }
  const byKey = new Map<string, typeof data.tiers>();
  for (const t of data.tiers) byKey.set(t.key, [...(byKey.get(t.key) ?? []), t]);
  for (const [key, list] of byKey) {
    const basis = list[0]?.basis ?? "monthly_premium";
    if (list.some((t) => t.basis !== basis)) {
      rejected.push(`${key}: Staffel mit unterschiedlichen Bezugsgrößen`);
      continue;
    }
    const tiers = [...list].sort((a, b) => a.from - b.from).map((t) => ({ from: t.from, value: t.value }));
    if (tiers[0]?.from !== 0) {
      rejected.push(`${key}: Staffel beginnt nicht bei 0 – bitte manuell erfassen`);
      continue;
    }
    proposals.push({
      key,
      value: { basis, tiers },
      page: list[0]?.page ?? null,
      quote: list.map((t) => t.quote).filter(Boolean).join(" … ").slice(0, 500),
      confidence: 0.8,
      note: `Staffel nach ${TIER_BASIS_LABELS[basis]}`,
    });
  }
  if (data.annuity_table.length) {
    const rows = [...data.annuity_table].sort((a, b) => a.age - b.age).map((r) => ({ age: r.age, guaranteed: r.guaranteed, current: r.current }));
    proposals.push({ key: "payout.annuityFactorTable", value: rows, page: data.annuity_table[0]?.page ?? null, quote: null, confidence: 0.8, note: `${rows.length} Alter tabelliert` });
  }
  return { proposals, rejected };
}
