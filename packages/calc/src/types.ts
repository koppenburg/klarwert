/**
 * Typen des Rechenkerns.
 *
 * Konventionen (siehe auch CLAUDE.md):
 * - Zeit wird in Monaten ab Vertragsbeginn gezählt, 0-basiert. Monat 0 ist der erste Vertragsmonat.
 * - Beträge in Euro als Gleitkommazahl, gerundet wird erst in der Darstellung.
 * - Prozentangaben als Prozentzahl (1.5 = 1,5 %), Promille als Promillezahl (40 = 40 ‰).
 * - Renditen sind Jahresrenditen; der Monatszins ist geometrisch: (1 + r)^(1/12) − 1.
 */

export type PaymentFrequency = "monthly" | "quarterly" | "semiannual" | "annual" | "none";

/** Kostenarten, die getrennt ausgewiesen werden. Reihenfolge = Reihenfolge der Effektivkosten-Zerlegung. */
export const COST_KINDS = [
  "alpha",
  "beta",
  "gamma",
  "kappa",
  "fund",
  "guarantee",
  "paidUpFee",
] as const;
export type CostKind = (typeof COST_KINDS)[number];

export const COST_KIND_LABELS: Record<CostKind, string> = {
  alpha: "Abschluss- und Vertriebskosten (α)",
  beta: "Verwaltungskosten auf Beiträge (β)",
  gamma: "Verwaltungskosten auf Guthaben (γ)",
  kappa: "Stückkosten (κ)",
  fund: "Fondskosten (TER abzgl. Rückvergütung)",
  guarantee: "Garantiekosten",
  paidUpFee: "Kosten der Beitragsfreistellung",
};

export interface Dynamics {
  /** jährliche Erhöhung des Beitrags in %, jeweils zum Jahrestag (Monat 12, 24, …) */
  ratePercent: number;
  /** letzte Erhöhung spätestens in diesem Monat (exklusiv: Erhöhungen nur in Monaten < untilMonth) */
  untilMonth?: number;
}

export interface TopUp {
  /** Monat ab Vertragsbeginn (0-basiert) */
  month: number;
  amount: number;
}

export interface ContributionPlan {
  /** Beitrag je Zahlungsperiode (Eigenbeitrag; bei Riester ohne Zulagen) */
  amount: number;
  frequency: PaymentFrequency;
  /** Beitragszahlungsdauer in Monaten ab Vertragsbeginn; Standard: gesamte Ansparphase */
  paymentMonths?: number;
  /** Einmalbeitrag zu Vertragsbeginn (Monat 0) */
  singlePremium?: number;
  dynamics?: Dynamics;
  topUps?: TopUp[];
  /** Beitragsfreistellung ab diesem Monat (ab hier keine Beiträge mehr) */
  paidUpFromMonth?: number;
}

export type AlphaMode =
  /** ‰ der Beitragssumme (Summe der laufenden Beiträge über die Zahlungsdauer), verteilt über distributionMonths */
  | "permille_of_premium_sum"
  /** % jedes laufenden Beitrags, solange der Beitrag in das Verteilungsfenster fällt */
  | "percent_of_premiums";

export type AlphaOnPaidUp =
  /** noch nicht getilgte Abschlusskosten entfallen (Regelfall, § 169 Abs. 3 VVG) */
  | "stop"
  /** Restbetrag wird bei Beitragsfreistellung auf einmal belastet */
  | "charge_remaining"
  /** Raten laufen monatlich aus dem Guthaben weiter */
  | "continue";

export interface AlphaCosts {
  mode: AlphaMode;
  /** ‰ (permille_of_premium_sum) bzw. % (percent_of_premiums) */
  rate: number;
  /** Verteilungszeitraum in Monaten, Standard 60 (5 Jahre); bei kürzerer Zahlungsdauer: Zahlungsdauer */
  distributionMonths?: number;
  /** Basis der Beitragssumme in Monaten (z. B. Kappung auf 35 Jahre); Standard: Zahlungsdauer */
  premiumSumBasisMonths?: number;
  /** α auch auf Dynamikerhöhungen (‰ der zusätzlichen Beitragssumme), Standard: true */
  onDynamics?: boolean;
  /** % jeder Zuzahlung, sofort fällig */
  onTopUpsPercent?: number;
  /** % des Einmalbeitrags, sofort fällig */
  onSinglePremiumPercent?: number;
  /** % jeder Zulage (Riester), sofort fällig */
  onAllowancesPercent?: number;
  onPaidUp?: AlphaOnPaidUp;
}

export interface CostFactors {
  alpha?: AlphaCosts;
  beta?: {
    /** % jedes laufenden Beitrags */
    percentOfPremium: number;
    /** % jeder Zuzahlung und des Einmalbeitrags; Standard: wie percentOfPremium */
    onTopUpsPercent?: number;
    /** % jeder Zulage; Standard: wie percentOfPremium */
    onAllowancesPercent?: number;
    /** % jedes Beitrags in der Zahlungsphase nach Ablauf des α-Fensters (falls abweichend) */
    percentOfPremiumAfterAlpha?: number;
  };
  gamma?: {
    /** % p.a. des Guthabens, monatlich anteilig */
    percentOfValue: number;
    /** abweichender Satz nach Beitragsfreistellung */
    percentOfValuePaidUp?: number;
  };
  kappa?: {
    /** € p.a., monatlich anteilig */
    eurPerYear: number;
    eurPerYearPaidUp?: number;
  };
  fund?: {
    /** laufende Kosten (TER/OGC) der Fonds in % p.a., gewichtet */
    terPercent: number;
    /** Rückvergütung an den Vertrag in % p.a. */
    kickbackPercent?: number;
  };
  guarantee?: {
    /** Garantiekosten in % p.a. des Guthabens */
    percentOfValue: number;
  };
  /** einmalige Kosten bei Beitragsfreistellung in € */
  paidUpFeeEur?: number;
  surrender?: SurrenderRules;
  payout?: PayoutTerms;
}

export interface SurrenderRules {
  /** Stornoabzug in % des Guthabens (konstant) */
  percentOfValue?: number;
  /** Stornoabzug nach Vertragsjahr (1-basiert, inklusive), überschreibt percentOfValue im Bereich */
  schedule?: Array<{ fromYear: number; toYear?: number; percentOfValue: number }>;
  /** fester Abzug in € */
  fixedEur?: number;
  /** Obergrenze des Abzugs in € */
  maxEur?: number;
}

export interface PayoutTerms {
  /** garantierter Rentenfaktor: Monatsrente je 10.000 € Kapital */
  annuityFactorGuaranteed?: number;
  /** aktueller (nicht garantierter) Rentenfaktor je 10.000 € Kapital */
  annuityFactorCurrent?: number;
  /** Verwaltungskosten in der Rentenphase in % der Rente */
  annuityCostPercent?: number;
  /** true: Rentenfaktor enthält die Rentenkosten bereits (Regelfall). false: Rente wird um die Kosten gemindert. */
  annuityCostIncludedInFactor?: boolean;
  /** Kosten bei Kapitalabfindung in % des Kapitals */
  lumpSumCostPercent?: number;
  /** Rentengarantiezeit in Monaten */
  guaranteePeriodMonths?: number;
}

export interface CashEvent {
  month: number;
  amount: number;
}

export interface SimulationInput {
  /** Ansparphase in Monaten (Vertragsbeginn bis Rentenbeginn) */
  termMonths: number;
  contributions: ContributionPlan;
  costs: CostFactors;
  /** Bruttowertentwicklung in % p.a. vor allen Kosten */
  grossReturnPercent: number;
  /** Zulagen-Gutschriften (Riester / Altersvorsorgedepot) */
  allowances?: CashEvent[];
  /**
   * Fortschreibung ab einem Stichtag: Simulation beginnt in `month` mit dem Ist-Guthaben `value`.
   * Frühere Monate werden nicht simuliert; bereits getilgte α-Raten werden nicht erneut erhoben.
   */
  start?: { month: number; value: number };
}

export type CostBreakdown = Record<CostKind, number>;

export interface MonthRow {
  month: number;
  premium: number;
  singlePremium: number;
  topUp: number;
  allowance: number;
  costs: CostBreakdown;
  /** Guthaben nach Kosten am Monatsende */
  valueNet: number;
  /** Guthaben ohne jegliche Kosten am Monatsende (gleiche Zahlungen, Bruttorendite) */
  valueGross: number;
  paidUp: boolean;
}

export interface YearRow {
  /** Vertragsjahr, 1-basiert */
  year: number;
  /** Monat am Jahresende (0-basiert, letzter Monat des Jahres) */
  endMonth: number;
  ownPremiums: number;
  allowances: number;
  ownPremiumsCum: number;
  allowancesCum: number;
  costs: CostBreakdown;
  costsCum: CostBreakdown;
  costsTotal: number;
  costsTotalCum: number;
  valueNet: number;
  valueGross: number;
  surrenderDeduction: number;
  surrenderValue: number;
}

export interface SimulationResult {
  input: SimulationInput;
  months: MonthRow[];
  years: YearRow[];
  /** Summe der eigenen Einzahlungen (laufend + einmalig + Zuzahlungen) im simulierten Zeitraum */
  ownPremiumsTotal: number;
  allowancesTotal: number;
  costsTotal: CostBreakdown;
  costsTotalSum: number;
  finalValueNet: number;
  finalValueGross: number;
  /** Cashflows für den internen Zinsfuß: Einzahlungen negativ, Endwert positiv */
  cashflows: CashEvent[];
}

export interface EffectiveCostsResult {
  grossReturnPercent: number;
  /** interner Zinsfuß nach Kosten in % p.a. */
  netIrrPercent: number | null;
  /** interner Zinsfuß ohne Kosten in % p.a. (Kontrolle, entspricht der Bruttorendite) */
  grossIrrPercent: number | null;
  /** Renditeminderung (Reduction in Yield) in Prozentpunkten p.a. */
  reductionInYieldPp: number | null;
  /** sequentielle Zerlegung nach Kostenart (Summe = reductionInYieldPp) */
  byKind: CostBreakdown | null;
}
