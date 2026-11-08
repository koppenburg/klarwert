/**
 * Baut aus bestätigten Vertragsfeldern und bestätigten Kostenfaktoren das Rechenmodell – und prüft das Gate:
 * Ohne vollständig bestätigte Kostenfaktoren und Pflichtfelder gibt es keine Berechnung und keinen Report.
 * Jede Zahl behält ihre Fundstelle (provenance), damit der Report sie ausweisen kann.
 */
import {
  isTieredValue,
  resolveTieredCosts,
  tierContext,
  type AnnuityFactorRow,
  type ContractLayer,
  type ContractModel,
  type ContractState,
  type CostFactors,
  type DeepTiered,
  type SelectionCandidate,
  type TieredValue,
} from "@klarwert/calc";
import { CONTRACT_FIELDS, COST_FIELDS, costFieldDef } from "./fields";
import { featuresFromValues, isAnnuityTable } from "./values";

export type SourceKind = "document" | "library" | "websearch" | "manual" | "assumption" | "legal";

export interface Provenance {
  kind: SourceKind;
  /** lesbare Fundstelle, z. B. „AVB FR70 Stand 2019, S. 12“ oder „Standmitteilung 2026.pdf, S. 1“ */
  label: string;
  quote?: string | null;
}

export interface FieldRecord {
  key: string;
  value: unknown;
  status: "proposed" | "confirmed";
  source: Provenance | null;
}

/** gespeicherter Kosten- oder Merkmalswert: Zahl, Wahrheitswert, Auswahl, Liste, Beitragsstaffel oder Rentenfaktor-Tabelle */
export type CostValue = number | boolean | string | null | number[] | TieredValue | AnnuityFactorRow[];

export interface CostRecord {
  key: string;
  value: CostValue;
  status: "proposed" | "confirmed" | "rejected";
  /** "generation" = bestätigter Tarifwert, "case" = vertragsindividueller Override */
  scope: "generation" | "case";
  source: Provenance | null;
}

export interface GateResult {
  ok: boolean;
  missingFields: string[];
  unconfirmedFields: string[];
  missingCosts: string[];
  unconfirmedCosts: string[];
  messages: string[];
}

/** Effektive Kostenwerte: Override (Fall) schlägt Tarifgeneration. Abgelehnte Einträge zählen nicht. */
export function effectiveCostRecords(records: CostRecord[]): Map<string, CostRecord> {
  const out = new Map<string, CostRecord>();
  for (const r of records.filter((x) => x.status !== "rejected" && x.scope === "generation")) out.set(r.key, r);
  for (const r of records.filter((x) => x.status !== "rejected" && x.scope === "case")) out.set(r.key, r);
  return out;
}

export function checkGate(fields: FieldRecord[], costs: CostRecord[]): GateResult {
  const fieldMap = new Map(fields.map((f) => [f.key, f]));
  const missingFields: string[] = [];
  const unconfirmedFields: string[] = [];
  for (const def of CONTRACT_FIELDS.filter((d) => d.requiredForCalc)) {
    const f = fieldMap.get(def.key);
    if (!f || f.value === null || f.value === undefined || f.value === "") missingFields.push(def.key);
    else if (f.status !== "confirmed") unconfirmedFields.push(def.key);
  }
  // auch optionale, aber vorhandene Felder müssen bestätigt sein
  for (const f of fields) {
    if (f.value !== null && f.value !== undefined && f.value !== "" && f.status !== "confirmed" && !unconfirmedFields.includes(f.key)) unconfirmedFields.push(f.key);
  }
  const eff = effectiveCostRecords(costs);
  const missingCosts: string[] = [];
  const unconfirmedCosts: string[] = [];
  for (const def of COST_FIELDS) {
    const r = eff.get(def.key);
    if (!r) {
      if (def.required) missingCosts.push(def.key);
      continue;
    }
    if (r.status !== "confirmed") unconfirmedCosts.push(def.key);
    else if (r.value === null && def.required && !def.nullable) missingCosts.push(def.key);
  }
  // auch Override-Vorschläge, die (noch) nicht bestätigt sind, blockieren
  for (const r of costs) if (r.status === "proposed" && !unconfirmedCosts.includes(r.key)) unconfirmedCosts.push(r.key);
  const messages: string[] = [];
  const label = (k: string) => CONTRACT_FIELDS.find((d) => d.key === k)?.label ?? costFieldDef(k)?.label ?? k;
  if (missingFields.length) messages.push(`Fehlende Vertragsdaten: ${missingFields.map(label).join(", ")}`);
  if (unconfirmedFields.length) messages.push(`Nicht bestätigte Vertragsdaten: ${unconfirmedFields.map(label).join(", ")}`);
  if (missingCosts.length) messages.push(`Fehlende Kostenfaktoren: ${missingCosts.map(label).join(", ")}`);
  if (unconfirmedCosts.length) messages.push(`Nicht bestätigte Kostenfaktoren: ${unconfirmedCosts.map(label).join(", ")}`);
  return { ok: messages.length === 0, missingFields, unconfirmedFields, missingCosts, unconfirmedCosts, messages };
}

export class GateError extends Error {
  constructor(public readonly gate: GateResult) {
    super(gate.messages.join(" · ") || "Gate nicht erfüllt");
  }
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Zahl oder Beitragsstaffel */
function numOrTier(v: unknown): number | TieredValue | undefined {
  if (isTieredValue(v)) return v;
  return num(v);
}

function bool(v: unknown): boolean | undefined {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return undefined;
}

function parseDate(v: unknown): { y: number; m: number } | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^(\d{4})-(\d{2})/.exec(v);
  if (!m) return undefined;
  return { y: Number(m[1]), m: Number(m[2]) };
}

export function monthsBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) throw new Error("Datum ungültig");
  return (b.y - a.y) * 12 + (b.m - a.m);
}

/**
 * Kostenfaktoren aus Schlüssel-Wert-Paaren (bestätigt) zusammensetzen. Staffelbare Werte können Beitragsstaffeln
 * sein; sie werden mit `resolveTieredCosts` für den konkreten Beitrag aufgelöst.
 */
export function buildCostFactors(values: Map<string, unknown>): DeepTiered<CostFactors> {
  const g = (k: string) => values.get(k);
  const costs: DeepTiered<CostFactors> = {};
  const alphaRate = numOrTier(g("alpha.rate"));
  if (alphaRate !== undefined) {
    costs.alpha = {
      mode: g("alpha.mode") === "percent_of_premiums" ? "percent_of_premiums" : "permille_of_premium_sum",
      rate: alphaRate,
      distributionMonths: num(g("alpha.distributionMonths")),
      premiumSumBasisMonths: num(g("alpha.premiumSumBasisMonths")),
      onDynamics: bool(g("alpha.onDynamics")),
      onTopUpsPercent: numOrTier(g("alpha.onTopUpsPercent")),
      onSinglePremiumPercent: numOrTier(g("alpha.onSinglePremiumPercent")),
      onAllowancesPercent: num(g("alpha.onAllowancesPercent")),
    };
  }
  const beta = numOrTier(g("beta.percentOfPremium"));
  if (beta !== undefined) costs.beta = { percentOfPremium: beta, onTopUpsPercent: num(g("beta.onTopUpsPercent")), onAllowancesPercent: num(g("beta.onAllowancesPercent")) };
  const gamma = numOrTier(g("gamma.percentOfValue"));
  if (gamma !== undefined) costs.gamma = { percentOfValue: gamma, percentOfValuePaidUp: num(g("gamma.percentOfValuePaidUp")) };
  const kappa = numOrTier(g("kappa.eurPerYear"));
  if (kappa !== undefined) costs.kappa = { eurPerYear: kappa, eurPerYearPaidUp: num(g("kappa.eurPerYearPaidUp")) };
  const ter = num(g("fund.terPercent"));
  if (ter !== undefined) costs.fund = { terPercent: ter, kickbackPercent: num(g("fund.kickbackPercent")) };
  const guarantee = num(g("guarantee.percentOfValue"));
  if (guarantee !== undefined) costs.guarantee = { percentOfValue: guarantee };
  costs.paidUpFeeEur = num(g("paidUpFeeEur"));
  const sp = num(g("surrender.percentOfValue"));
  const sf = num(g("surrender.fixedEur"));
  if (sp !== undefined || sf !== undefined) costs.surrender = { percentOfValue: sp, fixedEur: sf, maxEur: num(g("surrender.maxEur")) };
  costs.payout = {
    annuityFactorGuaranteed: num(g("payout.annuityFactorGuaranteed")),
    annuityFactorCurrent: num(g("payout.annuityFactorCurrent")),
    annuityCostPercent: num(g("payout.annuityCostPercent")),
    annuityCostIncludedInFactor: bool(g("payout.annuityCostIncludedInFactor")),
    lumpSumCostPercent: num(g("payout.lumpSumCostPercent")),
    guaranteePeriodMonths: num(g("payout.guaranteePeriodMonths")),
    annuityFactorTable: isAnnuityTable(g("payout.annuityFactorTable")) ? (g("payout.annuityFactorTable") as AnnuityFactorRow[]) : undefined,
  };
  return costs;
}

export interface BuiltModel {
  model: ContractModel;
  /** Fortschreibungszustand am Stichtag, falls Guthaben bekannt */
  state: ContractState | null;
  provenance: Record<string, Provenance | null>;
  warnings: string[];
}

/**
 * Rechenmodell aus bestätigten Daten. Wirft GateError, wenn das Gate nicht erfüllt ist.
 * `valuationDate` (YYYY-MM-DD) ist der Stichtag für Fortschreibungen, Standard: Stichtag des Guthabens.
 */
export function buildModel(fields: FieldRecord[], costs: CostRecord[], opts: { label?: string; valuationDate?: string } = {}): BuiltModel {
  const gate = checkGate(fields, costs);
  if (!gate.ok) throw new GateError(gate);
  const f = new Map(fields.map((x) => [x.key, x.value]));
  const eff = effectiveCostRecords(costs);
  const warnings: string[] = [];
  const start = String(f.get("contract_start"));
  const retirement = String(f.get("retirement_start"));
  const startD = parseDate(start);
  if (!startD) throw new Error("Vertragsbeginn ungültig");
  const termMonths = monthsBetween(start, retirement);
  if (termMonths <= 0) throw new Error("Rentenbeginn liegt vor dem Vertragsbeginn");
  const paymentEnd = f.get("payment_end");
  const paidUpFrom = f.get("paid_up_from");
  const topUps = Array.isArray(f.get("top_ups"))
    ? (f.get("top_ups") as Array<{ date: string; amount: number }>).map((t) => ({ month: monthsBetween(start, t.date), amount: Number(t.amount) }))
    : undefined;
  const frequency = String(f.get("payment_frequency")) as ContractModel["contributions"]["frequency"];
  const tieredCosts = buildCostFactors(new Map([...eff.entries()].map(([k, r]) => [k, r.value])));
  const amount = frequency === "none" ? 0 : (num(f.get("contribution_amount")) ?? 0);
  const paymentMonths = typeof paymentEnd === "string" && paymentEnd ? monthsBetween(start, paymentEnd) : undefined;
  // Beitragsstaffeln für den vertraglichen Beitrag auflösen
  const costFactors = resolveTieredCosts<CostFactors>(tieredCosts, tierContext({ amount, frequency, paymentMonths }, termMonths));
  const pibCosts = num(f.get("pib_effective_costs_pp"));
  const pibReturn = num(f.get("pib_return_percent"));
  const model: ContractModel = {
    label: opts.label ?? `${String(f.get("insurer"))} – ${String(f.get("tariff_name"))}`,
    layer: String(f.get("layer")) as ContractModel["layer"],
    startYear: startD.y,
    startMonth: startD.m,
    termMonths,
    contributions: {
      amount,
      frequency,
      paymentMonths,
      singlePremium: num(f.get("single_premium")),
      dynamics: num(f.get("dynamics_percent")) ? { ratePercent: num(f.get("dynamics_percent")) as number } : undefined,
      topUps,
      paidUpFromMonth: typeof paidUpFrom === "string" && paidUpFrom ? monthsBetween(start, paidUpFrom) : undefined,
    },
    costs: costFactors,
    pib: pibCosts !== undefined && pibReturn !== undefined ? { grossReturnPercent: pibReturn, effectiveCostsPp: pibCosts } : undefined,
  };
  let state: ContractState | null = null;
  const currentValue = num(f.get("current_value"));
  const valuation = opts.valuationDate ?? (typeof f.get("current_value_date") === "string" ? String(f.get("current_value_date")) : undefined);
  if (currentValue !== undefined && valuation) {
    const elapsed = Math.max(0, Math.min(termMonths - 1, monthsBetween(start, valuation)));
    state = {
      label: model.label,
      layer: model.layer,
      startYear: model.startYear,
      startMonth: model.startMonth,
      termMonths,
      elapsedMonths: elapsed,
      currentValue,
      surrenderValue: num(f.get("surrender_value")),
      contributions: model.contributions,
      costs: costFactors,
    };
  } else {
    warnings.push("Kein aktuelles Guthaben mit Stichtag – Depot-Szenarien und Fortschreibung nicht möglich.");
  }
  const provenance: Record<string, Provenance | null> = {};
  for (const x of fields) provenance[`field:${x.key}`] = x.source;
  for (const [k, r] of eff) provenance[`cost:${k}`] = r.source;
  return { model, state, provenance, warnings };
}

/**
 * Selektionskandidat aus den Einträgen einer Tarifgeneration. Nur BESTÄTIGTE Werte zählen; fehlende
 * Pflicht-Kostenwerte machen den Tarif „nicht berechenbar“. Fondskosten dürfen per Annahme ergänzt werden,
 * weil sie meist von der individuellen Fondsauswahl abhängen.
 */
export function buildSelectionCandidate(
  meta: { id: string; label: string; layer: ContractLayer },
  generationRecords: Array<Pick<CostRecord, "key" | "value" | "status">>,
  opts: { fallbackFundTerPercent?: number | null } = {},
): SelectionCandidate & { usedFundFallback: boolean } {
  const confirmed = new Map(generationRecords.filter((r) => r.status === "confirmed").map((r) => [r.key, r.value]));
  let usedFundFallback = false;
  if (!confirmed.has("fund.terPercent") && opts.fallbackFundTerPercent !== undefined && opts.fallbackFundTerPercent !== null) {
    confirmed.set("fund.terPercent", opts.fallbackFundTerPercent);
    usedFundFallback = true;
  }
  const missingCosts: string[] = [];
  for (const def of COST_FIELDS.filter((d) => d.required)) {
    if (!confirmed.has(def.key) || (confirmed.get(def.key) === null && !def.nullable)) missingCosts.push(def.label);
  }
  return {
    ...meta,
    kind: "tariff",
    features: featuresFromValues(confirmed),
    costs: buildCostFactors(confirmed),
    missingCosts,
    usedFundFallback,
  };
}
