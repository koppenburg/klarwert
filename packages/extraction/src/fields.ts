/**
 * Feldkataloge: Vertragsfelder (Erkennung aus Vertragsunterlagen) und Kostenfaktoren (aus dem Bedingungswerk).
 * Die Schlüssel sind stabil und werden so in Supabase gespeichert (case_fields.key, cost_items.key).
 */

export type FieldType = "string" | "number" | "date" | "enum" | "boolean" | "json";

export interface ContractFieldDef {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  options?: readonly string[];
  /** für die Berechnung zwingend */
  requiredForCalc?: boolean;
  help?: string;
}

export const LAYERS = ["riester", "basis", "layer3", "bav"] as const;
export const LAYER_LABELS: Record<(typeof LAYERS)[number], string> = {
  riester: "Riester (Schicht 2, gefördert)",
  basis: "Basisrente (Schicht 1)",
  layer3: "Private Rentenversicherung (Schicht 3)",
  bav: "Betriebliche Altersversorgung",
};

export const FREQUENCIES = ["monthly", "quarterly", "semiannual", "annual", "none"] as const;
export const FREQUENCY_LABELS: Record<(typeof FREQUENCIES)[number], string> = {
  monthly: "monatlich",
  quarterly: "vierteljährlich",
  semiannual: "halbjährlich",
  annual: "jährlich",
  none: "keine laufenden Beiträge",
};

export const CONTRACT_FIELDS: readonly ContractFieldDef[] = [
  { key: "insurer", label: "Versicherer", type: "string", requiredForCalc: true },
  { key: "tariff_name", label: "Tarifname", type: "string", requiredForCalc: true },
  { key: "tariff_code", label: "Tarifkürzel", type: "string" },
  { key: "tariff_generation", label: "Tarifgeneration / Stand", type: "string" },
  { key: "layer", label: "Schicht", type: "enum", options: LAYERS, requiredForCalc: true },
  { key: "product_type", label: "Produktart", type: "enum", options: ["fonds", "klassisch", "hybrid", "index", "sonstige"] },
  { key: "contract_start", label: "Vertragsbeginn", type: "date", requiredForCalc: true },
  { key: "retirement_start", label: "Rentenbeginn", type: "date", requiredForCalc: true },
  { key: "payment_end", label: "Ende der Beitragszahlung", type: "date", help: "leer = bis Rentenbeginn" },
  { key: "contribution_amount", label: "Beitrag je Zahlung", type: "number", unit: "€", requiredForCalc: true },
  { key: "payment_frequency", label: "Zahlweise", type: "enum", options: FREQUENCIES, requiredForCalc: true },
  { key: "single_premium", label: "Einmalbeitrag", type: "number", unit: "€" },
  { key: "dynamics_percent", label: "Dynamik p.a.", type: "number", unit: "%" },
  { key: "top_ups", label: "Zuzahlungen", type: "json", help: "Liste [{date, amount}]" },
  { key: "funds", label: "Fondsauswahl", type: "json", help: "Liste [{name, isin, sharePercent, terPercent}]" },
  { key: "guarantee_level_percent", label: "Garantieniveau (Beitragserhalt)", type: "number", unit: "%" },
  { key: "current_value", label: "aktuelles Guthaben", type: "number", unit: "€" },
  { key: "current_value_date", label: "Stichtag Guthaben", type: "date" },
  { key: "surrender_value", label: "Rückkaufswert", type: "number", unit: "€" },
  { key: "paid_up_from", label: "beitragsfrei seit", type: "date" },
  { key: "pib_effective_costs_pp", label: "Effektivkosten laut PIB", type: "number", unit: "Pp." },
  { key: "pib_return_percent", label: "Wertentwicklungsannahme im PIB", type: "number", unit: "%" },
  { key: "pib_annuity_monthly", label: "mtl. Rente laut PIB/Angebot", type: "number", unit: "€" },
] as const;

export type ContractFieldKey = (typeof CONTRACT_FIELDS)[number]["key"];

export interface CostFieldDef {
  key: string;
  label: string;
  type: "number" | "boolean" | "enum";
  unit?: string;
  options?: readonly string[];
  /** muss für eine Berechnung bestätigt sein (Wert 0 = „keine Kosten dieser Art“) */
  required: boolean;
  /** darf als „im Bedingungswerk nicht angegeben“ (null) bestätigt werden */
  nullable?: boolean;
  group: "alpha" | "beta" | "gamma" | "kappa" | "fund" | "guarantee" | "paidUp" | "surrender" | "payout";
  help?: string;
}

export const COST_FIELDS: readonly CostFieldDef[] = [
  { key: "alpha.mode", label: "α-Bemessung", type: "enum", options: ["permille_of_premium_sum", "percent_of_premiums"], required: true, group: "alpha", help: "‰ der Beitragssumme oder % je Beitrag" },
  { key: "alpha.rate", label: "α-Satz", type: "number", unit: "‰ bzw. %", required: true, group: "alpha" },
  { key: "alpha.distributionMonths", label: "α-Verteilungszeitraum", type: "number", unit: "Monate", required: true, group: "alpha", help: "Altverträge mind. 60 (§ 169 Abs. 3 VVG); neues Recht: gesamte Ansparphase" },
  { key: "alpha.premiumSumBasisMonths", label: "Beitragssumme gekappt auf", type: "number", unit: "Monate", required: false, group: "alpha" },
  { key: "alpha.onDynamics", label: "α auf Dynamikerhöhungen", type: "boolean", required: false, group: "alpha" },
  { key: "alpha.onTopUpsPercent", label: "α auf Zuzahlungen", type: "number", unit: "%", required: false, group: "alpha" },
  { key: "alpha.onSinglePremiumPercent", label: "α auf Einmalbeitrag", type: "number", unit: "%", required: false, group: "alpha" },
  { key: "alpha.onAllowancesPercent", label: "α auf Zulagen", type: "number", unit: "%", required: false, group: "alpha" },
  { key: "beta.percentOfPremium", label: "β Verwaltungskosten je Beitrag", type: "number", unit: "%", required: true, group: "beta" },
  { key: "beta.onTopUpsPercent", label: "β auf Zuzahlungen", type: "number", unit: "%", required: false, group: "beta" },
  { key: "beta.onAllowancesPercent", label: "β auf Zulagen", type: "number", unit: "%", required: false, group: "beta" },
  { key: "gamma.percentOfValue", label: "γ Kosten auf Guthaben p.a.", type: "number", unit: "% p.a.", required: true, group: "gamma" },
  { key: "gamma.percentOfValuePaidUp", label: "γ beitragsfrei", type: "number", unit: "% p.a.", required: false, group: "gamma" },
  { key: "kappa.eurPerYear", label: "κ Stückkosten p.a.", type: "number", unit: "€ p.a.", required: true, group: "kappa" },
  { key: "kappa.eurPerYearPaidUp", label: "κ beitragsfrei", type: "number", unit: "€ p.a.", required: false, group: "kappa" },
  { key: "fund.terPercent", label: "Fondskosten (TER/OGC, gewichtet)", type: "number", unit: "% p.a.", required: true, group: "fund" },
  { key: "fund.kickbackPercent", label: "Rückvergütung an den Vertrag", type: "number", unit: "% p.a.", required: true, group: "fund" },
  { key: "guarantee.percentOfValue", label: "Garantiekosten", type: "number", unit: "% p.a.", required: true, group: "guarantee" },
  { key: "paidUpFeeEur", label: "Kosten Beitragsfreistellung", type: "number", unit: "€", required: true, group: "paidUp" },
  { key: "surrender.percentOfValue", label: "Stornoabzug", type: "number", unit: "% des Guthabens", required: true, group: "surrender" },
  { key: "surrender.fixedEur", label: "Stornoabzug fest", type: "number", unit: "€", required: false, group: "surrender" },
  { key: "surrender.maxEur", label: "Stornoabzug höchstens", type: "number", unit: "€", required: false, group: "surrender" },
  { key: "payout.annuityFactorGuaranteed", label: "Rentenfaktor garantiert (je 10.000 €)", type: "number", unit: "€ Monatsrente", required: true, nullable: true, group: "payout" },
  { key: "payout.annuityFactorCurrent", label: "Rentenfaktor aktuell (je 10.000 €)", type: "number", unit: "€ Monatsrente", required: true, nullable: true, group: "payout" },
  { key: "payout.annuityCostPercent", label: "Verwaltungskosten Rentenphase", type: "number", unit: "% der Rente", required: true, group: "payout" },
  { key: "payout.annuityCostIncludedInFactor", label: "Rentenkosten im Rentenfaktor enthalten", type: "boolean", required: false, group: "payout" },
  { key: "payout.lumpSumCostPercent", label: "Kosten Kapitalabfindung", type: "number", unit: "% des Kapitals", required: false, group: "payout" },
  { key: "payout.guaranteePeriodMonths", label: "Rentengarantiezeit", type: "number", unit: "Monate", required: false, group: "payout" },
] as const;

export const COST_KEYS = COST_FIELDS.map((f) => f.key) as [string, ...string[]];

export function costFieldDef(key: string): CostFieldDef | undefined {
  return COST_FIELDS.find((f) => f.key === key);
}

export function contractFieldDef(key: string): ContractFieldDef | undefined {
  return CONTRACT_FIELDS.find((f) => f.key === key);
}
