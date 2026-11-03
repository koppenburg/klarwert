/**
 * Analyse-Einstellungen (gespeichert in cases.analysis_assumptions) und clientseitig nutzbare Rechen-Helfer.
 * Bewusst ohne Abhängigkeit von @klarwert/extraction (kein Anthropic-SDK im Browser-Bundle).
 */
import {
  runScenarios,
  scenarioSensitivity,
  type AnalysisAssumptions,
  type ContractModel,
  type ContractState,
  type DepotAssumptions,
  type ScenarioAssumptions,
  type ScenarioResult,
  type SensitivityCell,
} from "@klarwert/calc";
import type { ChildMatchingReading } from "@klarwert/legal-config";
import type { CaseBundle } from "./data";

export interface AnalysisSettings {
  /** Bruttorenditen in % p.a. (der PIB-Satz kommt automatisch hinzu) */
  returns: number[];
  /** Stichtag für Fortschreibung und Szenarien (YYYY-MM-DD); null = Stichtag des Guthabens */
  valuationDate: string | null;
  retirementAge: number;
  lifeExpectancyAge: number;
  payoutPlanEndAge: number;
  payoutPlanCostPercent: number;
  /** Bruttorendite in der Auszahlphase; null = wie Ansparphase */
  payoutGrossReturnPercent: number | null;
  /** erhaltene Steuervorteile (Riester), bei schädlicher Verwendung zurückzuzahlen */
  taxBenefitsReceived: number;
  person: {
    children: Array<{ birthYear: number }>;
    previousYearIncome: number;
    eligible: boolean;
    starterBonusYear: number | null;
  };
  childReading: ChildMatchingReading;
  /** Zulagen im Vertrag ab diesem Jahr nach neuem Recht (Analyse); null = altes Recht */
  newRuleFromYear: number | null;
  /** Bruttorendite der Depot-Szenarien */
  scenarioReturnPercent: number;
  depot: DepotAssumptions;
  /** Übertragungswert; null = Rückkaufswert */
  transferValue: number | null;
  outgoingFeeEur: number | null;
  incomingFeeEur: number | null;
  sensitivityReturns: number[];
  sensitivityShiftsYears: number[];
}

export const DEFAULT_SETTINGS: AnalysisSettings = {
  returns: [2, 4, 6],
  valuationDate: null,
  retirementAge: 67,
  lifeExpectancyAge: 87,
  payoutPlanEndAge: 85,
  payoutPlanCostPercent: 0.5,
  payoutGrossReturnPercent: null,
  taxBenefitsReceived: 0,
  person: { children: [], previousYearIncome: 40_000, eligible: true, starterBonusYear: null },
  childReading: "per_child_full",
  newRuleFromYear: null,
  scenarioReturnPercent: 4,
  depot: {
    label: "Altersvorsorgedepot (Annahme)",
    costPercent: 0.3,
    fundTerPercent: 0.2,
    kappaEurPerYear: 0,
    alphaPercentOfPremium: 0,
    guaranteeLevel: 0,
    guaranteeCostPercent: 0,
    isStandardDepot: false,
  },
  transferValue: null,
  outgoingFeeEur: null,
  incomingFeeEur: null,
  sensitivityReturns: [2, 4, 6],
  sensitivityShiftsYears: [-5, 0, 5],
};

export interface SettingLabel {
  label: string;
  unit?: string;
  /** im Report als Annahme gekennzeichnet */
  assumption: true;
  note?: string;
}

/** Beschriftung jeder Einstellung für UI und Report-Anhang (alle Einstellungen sind Annahmen des Beraters). */
export const SETTING_LABELS: Record<string, SettingLabel> = {
  returns: { label: "Bruttowertentwicklung vor Kosten", unit: "% p.a.", assumption: true, note: "zusätzlich der im PIB genannte Satz" },
  valuationDate: { label: "Stichtag der Fortschreibung", assumption: true },
  retirementAge: { label: "Alter bei Rentenbeginn", unit: "Jahre", assumption: true },
  lifeExpectancyAge: { label: "angenommene Lebenserwartung", unit: "Jahre", assumption: true },
  payoutPlanEndAge: { label: "Endalter Auszahlplan", unit: "Jahre", assumption: true, note: "Altersvorsorgedepot: mindestens 85 (§ 1 Abs. 1 S. 1 Nr. 4 lit. b AltZertG n. F.)" },
  payoutPlanCostPercent: { label: "Kosten Auszahlplan", unit: "% p.a.", assumption: true },
  payoutGrossReturnPercent: { label: "Bruttorendite in der Auszahlphase", unit: "% p.a.", assumption: true, note: "leer = wie Ansparphase" },
  taxBenefitsReceived: { label: "erhaltene Steuervorteile (Rückzahlung bei Kündigung)", unit: "€", assumption: true },
  "person.children": { label: "Kinder (Geburtsjahre) für die Kinderzulage", assumption: true },
  "person.previousYearIncome": { label: "beitragspflichtiges Vorjahreseinkommen (4-%-Regel, altes Recht)", unit: "€", assumption: true },
  "person.eligible": { label: "unmittelbar zulageberechtigt", assumption: true },
  "person.starterBonusYear": { label: "Berufseinsteigerbonus im Jahr", assumption: true },
  childReading: { label: "Lesart Kinderzulage bei mehreren Kindern (bitte prüfen)", assumption: true },
  newRuleFromYear: { label: "neues Förderrecht im Vertrag ab", assumption: true },
  scenarioReturnPercent: { label: "Bruttorendite der Szenarien", unit: "% p.a.", assumption: true },
  "depot.costPercent": { label: "Depot: Verwaltungskosten", unit: "% p.a.", assumption: true, note: "produktabhängig, vor Marktstart unbekannt" },
  "depot.fundTerPercent": { label: "Depot: laufende Fondskosten", unit: "% p.a.", assumption: true },
  "depot.kappaEurPerYear": { label: "Depot: feste Kosten", unit: "€ p.a.", assumption: true },
  "depot.alphaPercentOfPremium": { label: "Depot: Abschlusskosten auf neue Beiträge", unit: "% je Beitrag", assumption: true },
  "depot.guaranteeLevel": { label: "Depot: Beitragserhalt", unit: "%", assumption: true },
  "depot.guaranteeCostPercent": { label: "Depot: Garantiekosten", unit: "% p.a.", assumption: true },
  transferValue: { label: "Übertragungswert", unit: "€", assumption: true, note: "leer = Rückkaufswert" },
  outgoingFeeEur: { label: "Wechselkosten abgebender Anbieter", unit: "€", assumption: true, note: "leer = gesetzliches Maximum 150 €" },
  incomingFeeEur: { label: "Pauschale aufnehmender Anbieter", unit: "€", assumption: true, note: "leer = gesetzliches Maximum 150 €" },
  sensitivityReturns: { label: "Sensitivität: Bruttorenditen", unit: "% p.a.", assumption: true },
  sensitivityShiftsYears: { label: "Sensitivität: Verschiebung Rentenbeginn", unit: "Jahre", assumption: true },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function numOrNull(v: unknown, fallback: number | null): number | null {
  if (v === null) return null;
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function numArr(v: unknown, fallback: number[]): number[] {
  return Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? (v as number[]) : fallback;
}

/** Gespeicherte (ggf. unvollständige/alte) Einstellungen mit Standardwerten zusammenführen. */
export function mergeSettings(stored: unknown, base: AnalysisSettings = DEFAULT_SETTINGS): AnalysisSettings {
  if (!isRecord(stored)) return structuredClone(base);
  const person = isRecord(stored.person) ? stored.person : {};
  const depot = isRecord(stored.depot) ? stored.depot : {};
  const children = Array.isArray(person.children)
    ? (person.children as unknown[]).filter((c): c is { birthYear: number } => isRecord(c) && typeof c.birthYear === "number").map((c) => ({ birthYear: c.birthYear }))
    : base.person.children;
  const guarantee = depot.guaranteeLevel;
  return {
    returns: numArr(stored.returns, base.returns),
    valuationDate: typeof stored.valuationDate === "string" ? stored.valuationDate : stored.valuationDate === null ? null : base.valuationDate,
    retirementAge: numOr(stored.retirementAge, base.retirementAge),
    lifeExpectancyAge: numOr(stored.lifeExpectancyAge, base.lifeExpectancyAge),
    payoutPlanEndAge: numOr(stored.payoutPlanEndAge, base.payoutPlanEndAge),
    payoutPlanCostPercent: numOr(stored.payoutPlanCostPercent, base.payoutPlanCostPercent),
    payoutGrossReturnPercent: numOrNull(stored.payoutGrossReturnPercent, base.payoutGrossReturnPercent),
    taxBenefitsReceived: numOr(stored.taxBenefitsReceived, base.taxBenefitsReceived),
    person: {
      children,
      previousYearIncome: numOr(person.previousYearIncome, base.person.previousYearIncome),
      eligible: typeof person.eligible === "boolean" ? person.eligible : base.person.eligible,
      starterBonusYear: numOrNull(person.starterBonusYear, base.person.starterBonusYear),
    },
    childReading: stored.childReading === "shared" || stored.childReading === "per_child_full" ? stored.childReading : base.childReading,
    newRuleFromYear: numOrNull(stored.newRuleFromYear, base.newRuleFromYear),
    scenarioReturnPercent: numOr(stored.scenarioReturnPercent, base.scenarioReturnPercent),
    depot: {
      label: typeof depot.label === "string" ? depot.label : base.depot.label,
      costPercent: numOr(depot.costPercent, base.depot.costPercent),
      fundTerPercent: numOr(depot.fundTerPercent, base.depot.fundTerPercent),
      kappaEurPerYear: numOr(depot.kappaEurPerYear, base.depot.kappaEurPerYear),
      alphaPercentOfPremium: numOr(depot.alphaPercentOfPremium, base.depot.alphaPercentOfPremium),
      guaranteeLevel: guarantee === 0 || guarantee === 80 || guarantee === 100 ? guarantee : base.depot.guaranteeLevel,
      guaranteeCostPercent: numOr(depot.guaranteeCostPercent, base.depot.guaranteeCostPercent),
      isStandardDepot: typeof depot.isStandardDepot === "boolean" ? depot.isStandardDepot : base.depot.isStandardDepot,
    },
    transferValue: numOrNull(stored.transferValue, base.transferValue),
    outgoingFeeEur: numOrNull(stored.outgoingFeeEur, base.outgoingFeeEur),
    incomingFeeEur: numOrNull(stored.incomingFeeEur, base.incomingFeeEur),
    sensitivityReturns: numArr(stored.sensitivityReturns, base.sensitivityReturns),
    sensitivityShiftsYears: numArr(stored.sensitivityShiftsYears, base.sensitivityShiftsYears),
  };
}

/** Einstellungen aus einem Bundle (gespeichert oder Standard; Stichtag aus dem Guthaben). */
export function settingsForBundle(bundle: CaseBundle): AnalysisSettings {
  const s = mergeSettings(bundle.case.analysis_assumptions);
  if (!s.valuationDate) {
    const d = bundle.fields.find((f) => f.key === "current_value_date")?.value;
    if (typeof d === "string") s.valuationDate = d;
  }
  return s;
}

export function analysisAssumptions(model: ContractModel, s: AnalysisSettings): AnalysisAssumptions {
  return {
    returns: s.returns,
    person: model.layer === "riester" ? { ...s.person, starterBonusYear: s.person.starterBonusYear ?? undefined } : undefined,
    newRuleFromYear: s.newRuleFromYear ?? undefined,
    retirementAge: s.retirementAge,
    lifeExpectancyAge: s.lifeExpectancyAge,
    payoutPlanEndAge: s.payoutPlanEndAge,
    payoutGrossReturnPercent: s.payoutGrossReturnPercent ?? undefined,
    payoutPlanCostPercent: s.payoutPlanCostPercent,
    taxBenefitsReceived: s.taxBenefitsReceived,
  };
}

export function scenarioAssumptions(s: AnalysisSettings): ScenarioAssumptions {
  return {
    grossReturnPercent: s.scenarioReturnPercent,
    person: { ...s.person, starterBonusYear: s.person.starterBonusYear ?? undefined },
    childReading: s.childReading,
    depot: s.depot,
    transferValue: s.transferValue ?? undefined,
    outgoingFeeEur: s.outgoingFeeEur ?? undefined,
    incomingFeeEur: s.incomingFeeEur ?? undefined,
  };
}

export interface ScenarioBundle {
  results: ScenarioResult[];
  sensitivity: SensitivityCell[];
}

export function computeScenarios(state: ContractState, s: AnalysisSettings): ScenarioBundle {
  const a = scenarioAssumptions(s);
  return { results: runScenarios(state, a), sensitivity: scenarioSensitivity(state, a, s.sensitivityReturns, s.sensitivityShiftsYears) };
}

/** Kalenderjahr eines Vertragsjahres (1-basiert) für Achsenbeschriftungen. */
export function calendarYearOf(model: Pick<ContractModel, "startYear" | "startMonth">, contractYear: number): number {
  return model.startYear + Math.floor((model.startMonth - 1 + (contractYear - 1) * 12) / 12);
}
