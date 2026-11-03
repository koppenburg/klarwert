/**
 * Fundstellen-Register für den Report: jede Eingangszahl erhält ein Kürzel (V = Vertragsdaten, K = Kostenfaktoren,
 * A = Annahmen, G = gesetzliche Konstanten). Berechnete Werte verweisen auf diese Kürzel.
 */
import { CONTRACT_FIELDS, COST_FIELDS, type BuiltModel, type Provenance } from "@klarwert/extraction";
import { GROUP_LABELS, listConstants, type LegalConfig } from "@klarwert/legal-config";
import { SETTING_LABELS, type AnalysisSettings } from "@/lib/analysis-settings";
import type { CaseBundle } from "@/lib/data";
import { formatValue } from "@/lib/format";

export interface SourceEntry {
  ref: string;
  group: "V" | "K" | "A" | "G";
  label: string;
  value: string;
  source: string;
  quote?: string | null;
  status?: string;
}

const KIND_LABEL: Record<Provenance["kind"], string> = {
  document: "Vertragsunterlage",
  library: "Bedingungswerk (Bibliothek)",
  websearch: "Bedingungswerk (Websuche, bestätigt)",
  manual: "manuelle Eingabe",
  assumption: "Annahme",
  legal: "Gesetz",
};

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

function settingValue(s: AnalysisSettings, key: string): string {
  const v = getPath(s, key);
  if (key === "person.children") return s.person.children.length ? s.person.children.map((c) => c.birthYear).join(", ") : "keine";
  if (key === "childReading") return s.childReading === "shared" ? "Summe der Kinderzulagen höchstens Eigenbeitrag" : "je Kind 100 % der Beiträge";
  if (key === "depot.guaranteeLevel") return v === 0 ? "ohne Garantie" : `${String(v)} %`;
  if (Array.isArray(v)) return v.map((x) => formatValue(x)).join("; ");
  if (v === null || v === undefined) return "Standard (siehe Hinweis)";
  return formatValue(v, SETTING_LABELS[key]?.unit);
}

export function buildSourceRegister(bundle: CaseBundle, built: BuiltModel, settings: AnalysisSettings, layer: string): SourceEntry[] {
  const out: SourceEntry[] = [];
  let v = 0;
  for (const def of CONTRACT_FIELDS) {
    const f = bundle.fields.find((x) => x.key === def.key);
    if (!f || f.value === null || f.value === undefined || f.value === "") continue;
    const p = built.provenance[`field:${def.key}`];
    out.push({
      ref: `V${++v}`,
      group: "V",
      label: def.label,
      value: def.key === "funds" || def.key === "top_ups" ? summarizeJson(f.value) : formatValue(f.value, def.unit),
      source: p ? `${KIND_LABEL[p.kind]}: ${p.label}` : "ohne Fundstelle",
      quote: p?.quote ?? null,
    });
  }
  let k = 0;
  const confirmedCosts = new Map(bundle.costItems.filter((c) => c.status === "confirmed").map((c) => [c.key, c]));
  for (const c of bundle.costItems.filter((x) => x.status === "confirmed" && x.case_id)) confirmedCosts.set(c.key, c);
  for (const def of COST_FIELDS) {
    const c = confirmedCosts.get(def.key);
    if (!c) continue;
    const p = built.provenance[`cost:${def.key}`];
    out.push({
      ref: `K${++k}`,
      group: "K",
      label: `${def.label}${c.case_id ? " (vertragsindividuell)" : ""}`,
      value: c.value === null ? "im Bedingungswerk nicht angegeben" : formatValue(c.value, def.unit),
      source: p ? `${KIND_LABEL[p.kind]}: ${p.label}` : "ohne Fundstelle",
      quote: p?.quote ?? null,
    });
  }
  let a = 0;
  const riesterOnly = new Set(["person.previousYearIncome", "person.starterBonusYear", "newRuleFromYear", "taxBenefitsReceived", "outgoingFeeEur", "incomingFeeEur"]);
  for (const [key, meta] of Object.entries(SETTING_LABELS)) {
    if (layer !== "riester" && riesterOnly.has(key)) continue;
    out.push({ ref: `A${++a}`, group: "A", label: meta.label, value: settingValue(settings, key), source: `Annahme des Beraters${meta.note ? ` – ${meta.note}` : ""}` });
  }
  let g = 0;
  for (const { group, constant, source } of listConstants()) {
    out.push({
      ref: `G${++g}`,
      group: "G",
      label: `${GROUP_LABELS[group as keyof LegalConfig] ?? group}: ${constant.label}`,
      value: formatValue(Array.isArray(constant.value) ? JSON.stringify(constant.value) : constant.value, constant.unit),
      source: `${constant.norm} · ${source.title} · Stand ${constant.asOf}${constant.note ? ` · ${constant.note}` : ""}`,
      status: constant.status,
    });
  }
  return out;
}

function summarizeJson(v: unknown): string {
  if (!Array.isArray(v)) return formatValue(v);
  return v
    .map((x) => {
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        if ("name" in o) return `${String(o.name)}${o.sharePercent ? ` (${String(o.sharePercent)} %)` : ""}${o.terPercent ? `, TER ${String(o.terPercent)} %` : ""}`;
        if ("date" in o) return `${formatValue(o.date)}: ${formatValue(o.amount, "€")}`;
      }
      return formatValue(x);
    })
    .join("; ");
}

export function refsOf(entries: SourceEntry[], group: SourceEntry["group"]): string {
  const r = entries.filter((e) => e.group === group);
  if (r.length === 0) return "";
  return r.length === 1 ? r[0]!.ref : `${r[0]!.ref}–${r.at(-1)!.ref}`;
}
