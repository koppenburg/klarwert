import "server-only";
import { costFieldDef, featureFieldDef, parseAnnuityTable, parseFeatureValue, parseTierInput, ValueFormatError, type CostValue } from "@klarwert/extraction";
import type { TierBasis } from "@klarwert/calc";

export type ValueMode = "plain" | "tier" | "table";

export interface ValueInput {
  key: string;
  raw: string;
  mode?: ValueMode;
  tierBasis?: TierBasis;
}

/** Eingabe des Beraters (Text) in den gespeicherten Kosten- oder Merkmalswert umwandeln. Wirft ValueFormatError. */
export function coerceCatalogValue(input: ValueInput): CostValue {
  const feature = featureFieldDef(input.key);
  if (feature) return parseFeatureValue(feature, input.raw);
  const def = costFieldDef(input.key);
  if (!def) throw new ValueFormatError("Unbekannter Schlüssel");
  const v = input.raw.trim();
  if (input.mode === "tier") {
    if (!def.tierable) throw new ValueFormatError(`${def.label}: keine Staffel vorgesehen`);
    return parseTierInput(v, input.tierBasis ?? "monthly_premium");
  }
  if (def.type === "table" || input.mode === "table") {
    if (v === "") return null;
    return parseAnnuityTable(v);
  }
  if (v === "" || v === "–") {
    if (def.nullable) return null;
    throw new ValueFormatError(`${def.label}: Wert erforderlich (0, falls keine Kosten dieser Art)`);
  }
  if (def.type === "boolean") {
    if (/^(ja|true|1|x)$/i.test(v)) return true;
    if (/^(nein|false|0)$/i.test(v)) return false;
    throw new ValueFormatError(`${def.label}: „ja“ oder „nein“`);
  }
  if (def.type === "enum") {
    if (!def.options?.includes(v)) throw new ValueFormatError(`${def.label}: ungültige Auswahl`);
    return v;
  }
  const n = Number(v.replace(/\s|€|%|‰/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw new ValueFormatError(`${def.label}: keine gültige Zahl`);
  return n;
}
