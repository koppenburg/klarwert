/**
 * Tarifselektion: Für ein Kundenprofil (Beitrag, Eintrittsalter, Rentenbeginn, Schicht, Garantiewunsch,
 * Nachhaltigkeit, Risikoprofil, Flexibilität, Hinterbliebenenschutz, Zulagen) werden alle Katalogtarife und
 * das Altersvorsorgedepot unter IDENTISCHEN Annahmen berechnet.
 *
 * - Harte Kriterien (Mindestbeitrag, Eintrittsalter, Garantie, …) führen zu „nicht passend“ mit Begründung.
 * - Nicht erfasste Tarifmerkmale führen nicht zum Ausschluss, sondern zu „offen – bitte prüfen“.
 * - Beitragsstaffeln werden für den konkreten Beitrag aufgelöst, Rentenfaktoren für das Rentenbeginnalter.
 * - Kein Ergebnis wird als „empfohlen“ markiert; sortiert wird nur nach einer gewählten Kennzahl.
 */
import { riesterOld } from "@klarwert/legal-config";
import { paymentsPerYear } from "./accumulation";
import { analyzeContract, type ContractModel } from "./analysis";
import type { AllowancePerson } from "./allowances";
import type { ChildMatchingReading } from "@klarwert/legal-config";
import { depotCosts, type ContractLayer, type DepotAssumptions } from "./scenarios";
import { resolveTieredCosts, tierContext, type DeepTiered } from "./tiers";
import type { CostFactors, PaymentFrequency } from "./types";

export type EsgLevel = "none" | "art8" | "art9";
export const ESG_LABELS: Record<EsgLevel, string> = { none: "keine Vorgabe", art8: "mind. Art. 8 SFDR", art9: "Art. 9 SFDR" };

/** Rahmendaten eines Tarifs (je Generation). `null`/`undefined` = nicht erfasst. */
export interface TariffFeatures {
  minMonthlyPremium?: number | null;
  minEntryAge?: number | null;
  maxEntryAge?: number | null;
  minTermYears?: number | null;
  retirementAgeMin?: number | null;
  retirementAgeMax?: number | null;
  /** angebotene Beitragsgarantien in % (0 = ohne Garantie) */
  guaranteeLevels?: number[] | null;
  dynamicsAvailable?: boolean | null;
  topUpsAvailable?: boolean | null;
  singlePremiumAvailable?: boolean | null;
  /** Kapitalwahlrecht zu Rentenbeginn */
  lumpSumOption?: boolean | null;
  /** höchste verfügbare Nachhaltigkeitsstufe der Fondsauswahl */
  esgLevel?: EsgLevel | null;
  /** Spanne der Risikoklassen (SRI 1–7) der wählbaren Fonds */
  riskClassMin?: number | null;
  riskClassMax?: number | null;
  withdrawalsAllowed?: boolean | null;
  contributionPauseAllowed?: boolean | null;
  /** längste wählbare Rentengarantiezeit in Monaten */
  maxGuaranteePeriodMonths?: number | null;
  deathBenefitBeforeRetirement?: boolean | null;
  /** nur zertifizierte Verträge: Zertifizierung nach altem (bis 2026) oder neuem Recht (ab 2027) */
  certificationLaw?: "alt" | "neu" | null;
}

export interface SelectionCandidate {
  id: string;
  label: string;
  kind: "tariff" | "depot";
  layer: ContractLayer;
  features: TariffFeatures;
  /** Kostenfaktoren; Zahlen dürfen Beitragsstaffeln sein */
  costs: DeepTiered<CostFactors>;
  /** fehlende bzw. unbestätigte Pflicht-Kostenwerte – dann keine Berechnung */
  missingCosts?: string[];
}

export interface SelectionProfile {
  /** Vertragsbeginn */
  startYear: number;
  startMonth: number;
  entryAge: number;
  retirementAge: number;
  contribution: { amount: number; frequency: PaymentFrequency; dynamicsPercent?: number; singlePremium?: number };
  /** gewünschte Schicht oder „any“ */
  layer: ContractLayer | "any";
  /** geforderter Mindest-Beitragserhalt in % */
  guaranteeMinPercent: 0 | 80 | 100;
  esg: EsgLevel;
  /** gewünschte Risikoklasse (SRI 1–7) oder null */
  riskClass: number | null;
  needs: {
    lumpSumOption?: boolean;
    withdrawals?: boolean;
    contributionPause?: boolean;
    /** gewünschte Rentengarantiezeit in Monaten */
    guaranteePeriodMonths?: number | null;
    deathBenefitBeforeRetirement?: boolean;
  };
  person: AllowancePerson;
  childReading?: ChildMatchingReading;
  /** Bruttorendite (Annahme) – für alle Kandidaten gleich */
  grossReturnPercent: number;
  lifeExpectancyAge: number;
  payoutPlanEndAge?: number;
  payoutPlanCostPercent?: number;
}

/** Standard-Bruttorendite je Risikoklasse (Annahme, im Tool änderbar). */
export const DEFAULT_RETURN_BY_RISK_CLASS: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4.5, 5: 5.5, 6: 6.5, 7: 7 };

export type SelectionStatus = "passend" | "nicht passend" | "nicht berechenbar";

export interface SelectionResult {
  candidateId: string;
  label: string;
  kind: "tariff" | "depot";
  layer: ContractLayer;
  status: SelectionStatus;
  /** verfehlte harte Kriterien */
  failures: string[];
  /** nicht erfasste Merkmale zu gestellten Anforderungen */
  openPoints: string[];
  effectiveCostsPp: number | null;
  netIrrPercent: number | null;
  endCapital: number | null;
  ownContributions: number | null;
  allowances: number | null;
  costsTotal: number | null;
  monthlyAnnuityGuaranteed: number | null;
  monthlyAnnuityCurrent: number | null;
  payoutPlanMonthly: number | null;
  /** aufgelöste Kostenfaktoren (für Nachvollziehbarkeit) */
  resolvedCosts: CostFactors | null;
}

function lastNewOldLawDate(): { y: number; m: number } {
  const [y, m] = riesterOld.lastNewContractDate.value.split("-").map(Number);
  return { y: y as number, m: m as number };
}

/** Harte Kriterien prüfen. */
export function checkCriteria(c: SelectionCandidate, p: SelectionProfile): { failures: string[]; openPoints: string[] } {
  const f = c.features;
  const failures: string[] = [];
  const open: string[] = [];
  const monthly = (p.contribution.amount * paymentsPerYear(p.contribution.frequency)) / 12;
  const termYears = p.retirementAge - p.entryAge;
  const req = (cond: boolean | null | undefined, failText: string, openText: string) => {
    if (cond === null || cond === undefined) open.push(openText);
    else if (!cond) failures.push(failText);
  };
  const known = (v: unknown) => v !== null && v !== undefined;

  if (c.kind === "tariff" && p.layer !== "any" && c.layer !== p.layer) failures.push("andere Schicht als gewünscht");
  if (c.kind === "tariff" && c.layer === "riester") {
    const last = lastNewOldLawDate();
    const afterOld = p.startYear * 12 + p.startMonth > last.y * 12 + last.m;
    if (afterOld) req(f.certificationLaw === undefined || f.certificationLaw === null ? null : f.certificationLaw === "neu", "Riester-Neuabschluss nach altem Recht nur bis 31.12.2026", "Zertifizierung (altes/neues Recht) nicht erfasst");
    else if (f.certificationLaw === "neu") failures.push("Produkt nach neuem Recht erst ab 01.01.2027 abschließbar");
  }
  if (known(f.minMonthlyPremium)) {
    if (monthly + 1e-9 < (f.minMonthlyPremium as number)) failures.push(`Mindestbeitrag ${f.minMonthlyPremium} € mtl. nicht erreicht`);
  } else if (c.kind === "tariff") open.push("Mindestbeitrag nicht erfasst");
  if (known(f.minEntryAge) && p.entryAge < (f.minEntryAge as number)) failures.push(`Mindesteintrittsalter ${f.minEntryAge}`);
  if (known(f.maxEntryAge) && p.entryAge > (f.maxEntryAge as number)) failures.push(`Höchsteintrittsalter ${f.maxEntryAge} überschritten`);
  if (!known(f.maxEntryAge) && c.kind === "tariff") open.push("Höchsteintrittsalter nicht erfasst");
  if (known(f.minTermYears) && termYears < (f.minTermYears as number)) failures.push(`Mindestlaufzeit ${f.minTermYears} Jahre unterschritten`);
  if (known(f.retirementAgeMin) && p.retirementAge < (f.retirementAgeMin as number)) failures.push(`Rentenbeginn frühestens mit ${f.retirementAgeMin}`);
  if (known(f.retirementAgeMax) && p.retirementAge > (f.retirementAgeMax as number)) failures.push(`Rentenbeginn spätestens mit ${f.retirementAgeMax}`);
  if (p.guaranteeMinPercent > 0) {
    req(known(f.guaranteeLevels) ? (f.guaranteeLevels as number[]).some((g) => g >= p.guaranteeMinPercent) : null, `kein Beitragserhalt von ${p.guaranteeMinPercent} % wählbar`, "Garantieniveaus nicht erfasst");
  }
  if ((p.contribution.dynamicsPercent ?? 0) > 0) req(f.dynamicsAvailable, "keine Dynamik möglich", "Dynamik-Möglichkeit nicht erfasst");
  if ((p.contribution.singlePremium ?? 0) > 0) req(f.singlePremiumAvailable, "kein Einmalbeitrag möglich", "Einmalbeitrag-Möglichkeit nicht erfasst");
  if (p.esg !== "none") {
    req(known(f.esgLevel) ? f.esgLevel === "art9" || (p.esg === "art8" && f.esgLevel === "art8") : null, `keine Fonds nach ${ESG_LABELS[p.esg]}`, "Nachhaltigkeit der Fondsauswahl nicht erfasst");
  }
  if (p.riskClass !== null) {
    const lo = f.riskClassMin;
    const hi = f.riskClassMax;
    req(known(lo) && known(hi) ? p.riskClass >= (lo as number) && p.riskClass <= (hi as number) : null, `Risikoklasse ${p.riskClass} nicht in der Fondsauswahl (${lo}–${hi})`, "Risikoklassen der Fondsauswahl nicht erfasst");
  }
  if (p.needs.lumpSumOption) req(f.lumpSumOption, "kein Kapitalwahlrecht", "Kapitalwahlrecht nicht erfasst");
  if (p.needs.withdrawals) req(f.withdrawalsAllowed, "keine Entnahmen möglich", "Entnahmemöglichkeit nicht erfasst");
  if (p.needs.contributionPause) req(f.contributionPauseAllowed, "keine Beitragspause möglich", "Beitragspause nicht erfasst");
  if (p.needs.guaranteePeriodMonths) {
    req(known(f.maxGuaranteePeriodMonths) ? (f.maxGuaranteePeriodMonths as number) >= p.needs.guaranteePeriodMonths : null, `Rentengarantiezeit von ${p.needs.guaranteePeriodMonths / 12} Jahren nicht wählbar`, "Rentengarantiezeit nicht erfasst");
  }
  if (p.needs.deathBenefitBeforeRetirement) req(f.deathBenefitBeforeRetirement, "keine Todesfallleistung vor Rentenbeginn", "Todesfallleistung nicht erfasst");
  return { failures, openPoints: open };
}

/** Kandidat für das Altersvorsorgedepot aus den Depot-Annahmen (Vergleichsmaßstab). */
export function depotCandidate(d: DepotAssumptions, features: TariffFeatures = {}): SelectionCandidate {
  return {
    id: "altersvorsorgedepot",
    label: d.label ?? (d.isStandardDepot ? "Altersvorsorgedepot – Standarddepot (Annahme)" : "Altersvorsorgedepot (Annahme)"),
    kind: "depot",
    layer: "riester",
    features: {
      guaranteeLevels: [d.guaranteeLevel],
      dynamicsAvailable: true,
      topUpsAvailable: true,
      singlePremiumAvailable: true,
      lumpSumOption: true,
      certificationLaw: "neu",
      ...features,
    },
    costs: depotCosts(d, true),
  };
}

/** Einen Kandidaten für ein Profil berechnen. */
export function evaluateCandidate(c: SelectionCandidate, p: SelectionProfile): SelectionResult {
  const { failures, openPoints } = checkCriteria(c, p);
  const base: SelectionResult = {
    candidateId: c.id,
    label: c.label,
    kind: c.kind,
    layer: c.layer,
    status: failures.length ? "nicht passend" : "passend",
    failures,
    openPoints,
    effectiveCostsPp: null,
    netIrrPercent: null,
    endCapital: null,
    ownContributions: null,
    allowances: null,
    costsTotal: null,
    monthlyAnnuityGuaranteed: null,
    monthlyAnnuityCurrent: null,
    payoutPlanMonthly: null,
    resolvedCosts: null,
  };
  if (c.missingCosts?.length) {
    return { ...base, status: failures.length ? "nicht passend" : "nicht berechenbar", openPoints: [...openPoints, `Kostenfaktoren unvollständig: ${c.missingCosts.join(", ")}`] };
  }
  const termMonths = (p.retirementAge - p.entryAge) * 12;
  if (termMonths <= 0) return { ...base, status: "nicht berechenbar", failures: [...failures, "Rentenbeginn liegt nicht nach dem Eintrittsalter"] };
  const plan = {
    amount: p.contribution.frequency === "none" ? 0 : p.contribution.amount,
    frequency: p.contribution.frequency,
    paymentMonths: termMonths,
    dynamics: p.contribution.dynamicsPercent ? { ratePercent: p.contribution.dynamicsPercent } : undefined,
    singlePremium: p.contribution.singlePremium || undefined,
  };
  const costs = resolveTieredCosts<CostFactors>(c.costs, tierContext(plan, termMonths));
  const model: ContractModel = { label: c.label, layer: c.layer, startYear: p.startYear, startMonth: p.startMonth, termMonths, contributions: plan, costs };
  const subsidised = c.layer === "riester" && p.person.eligible !== false;
  const analysis = analyzeContract(model, {
    returns: [p.grossReturnPercent],
    person: subsidised ? p.person : undefined,
    // Depot und Verträge nach neuem Recht: neues Förderrecht ab Beginn; Altverträge: altes Recht bis 2026
    newRuleFromYear: c.kind === "depot" || c.features.certificationLaw === "neu" ? p.startYear : 2027,
    retirementAge: p.retirementAge,
    lifeExpectancyAge: p.lifeExpectancyAge,
    payoutPlanEndAge: p.payoutPlanEndAge ?? 85,
    payoutPlanCostPercent: p.payoutPlanCostPercent ?? 0,
  });
  const r = analysis.results[0];
  if (!r) return { ...base, status: "nicht berechenbar" };
  return {
    ...base,
    effectiveCostsPp: r.effectiveCosts.reductionInYieldPp,
    netIrrPercent: r.effectiveCosts.netIrrPercent,
    endCapital: r.simulation.finalValueNet,
    ownContributions: r.simulation.ownPremiumsTotal,
    allowances: r.simulation.allowancesTotal,
    costsTotal: r.simulation.costsTotalSum,
    monthlyAnnuityGuaranteed: r.annuity.monthlyGuaranteed,
    monthlyAnnuityCurrent: r.annuity.monthlyCurrent,
    payoutPlanMonthly: r.payoutComparison?.payoutPlanMonthly ?? null,
    resolvedCosts: costs,
  };
}

export type SelectionSortKey = "effectiveCostsPp" | "endCapital" | "monthlyAnnuityGuaranteed" | "monthlyAnnuityCurrent" | "label";

/**
 * Sortierung nach einer Kennzahl. Effektivkosten aufsteigend, Endkapital und Renten absteigend, Name alphabetisch.
 * Fehlende Werte stehen am Ende. Keine Gewichtung, keine Empfehlung.
 */
export function sortResults(results: SelectionResult[], key: SelectionSortKey = "effectiveCostsPp"): SelectionResult[] {
  const dir = key === "effectiveCostsPp" || key === "label" ? 1 : -1;
  return [...results].sort((a, b) => {
    if (key === "label") return a.label.localeCompare(b.label, "de");
    const x = a[key];
    const y = b[key];
    if (x === null && y === null) return a.label.localeCompare(b.label, "de");
    if (x === null) return 1;
    if (y === null) return -1;
    return dir * (x - y) || a.label.localeCompare(b.label, "de");
  });
}

/** Alle Kandidaten berechnen und nach Status gruppieren. */
export function runSelection(candidates: SelectionCandidate[], profile: SelectionProfile, sortKey: SelectionSortKey = "effectiveCostsPp") {
  const results = candidates.map((c) => evaluateCandidate(c, profile));
  return {
    suitable: sortResults(results.filter((r) => r.status === "passend"), sortKey),
    notComputable: sortResults(results.filter((r) => r.status === "nicht berechenbar"), "label"),
    unsuitable: sortResults(results.filter((r) => r.status === "nicht passend"), "label"),
  };
}
