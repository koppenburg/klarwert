/**
 * Zulagenberechnung nach altem Riester-Recht (Bestandsverträge) und neuem Förderrecht ab 2027.
 * Alle gesetzlichen Werte kommen aus @klarwert/legal-config. Steuerliche Effekte (Günstigerprüfung,
 * Sonderausgabenabzug) werden nicht gerechnet.
 */
import { riesterOld, subsidyNew, type ChildMatchingReading } from "@klarwert/legal-config";
import type { CashEvent } from "./types";

export interface Child {
  birthYear: number;
  /** letztes Beitragsjahr mit Kindergeldanspruch (Standard: Geburtsjahr + 24) */
  lastAllowanceYear?: number;
}

export interface AllowancePerson {
  children: Child[];
  /** beitragspflichtige Einnahmen des Vorjahres (für die 4-%-Regel im alten Recht) */
  previousYearIncome?: number;
  /** Anspruch auf Berufseinsteigerbonus im angegebenen Jahr (einmalig) */
  starterBonusYear?: number;
  /** unmittelbar zulageberechtigt (Standard: true). false = keine Förderung */
  eligible?: boolean;
}

export interface AllowanceBreakdown {
  year: number;
  rule: "old" | "new";
  ownContribution: number;
  basic: number;
  children: number;
  starterBonus: number;
  /** Mindesteigenbeitrag (alt: 4-%-Regel; neu: 120 €) */
  minOwnContribution: number;
  /** Kürzungsfaktor (alt: Verhältnis; neu: 0 oder 1) */
  reductionFactor: number;
  total: number;
}

function activeChildren(children: Child[], year: number): Child[] {
  return children.filter((c) => year >= c.birthYear && year <= (c.lastAllowanceYear ?? c.birthYear + 24));
}

/** Altes Recht: 175 € Grundzulage, 185/300 € Kinderzulage, 4-%-Regel mit anteiliger Kürzung (§ 86 EStG a. F.). */
export function allowanceOld(year: number, ownContribution: number, person: AllowancePerson): AllowanceBreakdown {
  if (person.eligible === false || ownContribution <= 0) {
    return { year, rule: "old", ownContribution, basic: 0, children: 0, starterBonus: 0, minOwnContribution: 0, reductionFactor: 0, total: 0 };
  }
  const basicFull = riesterOld.basicAllowance.value;
  const childFull = activeChildren(person.children, year).reduce(
    (s, c) => s + (c.birthYear >= 2008 ? riesterOld.childAllowanceFrom2008.value : riesterOld.childAllowanceBefore2008.value),
    0,
  );
  const bonusFull = person.starterBonusYear === year ? riesterOld.starterBonus.value : 0;
  const allowancesFull = basicFull + childFull + bonusFull;
  const income = person.previousYearIncome ?? 0;
  const fourPercent = Math.min((riesterOld.minContributionPercent.value / 100) * income, riesterOld.minContributionCap.value);
  const minOwn = Math.max(fourPercent - allowancesFull, riesterOld.baseAmount.value);
  const factor = ownContribution >= minOwn ? 1 : ownContribution / minOwn;
  return {
    year,
    rule: "old",
    ownContribution,
    basic: basicFull * factor,
    children: childFull * factor,
    starterBonus: bonusFull * factor,
    minOwnContribution: minOwn,
    reductionFactor: factor,
    total: allowancesFull * factor,
  };
}

/** Neue Grundzulage nach Stufen (50 % bis 360 €, 25 % bis 1.800 €). */
export function basicAllowanceNew(ownContribution: number): number {
  let prev = 0;
  let total = 0;
  for (const t of subsidyNew.tiers.value) {
    const portion = Math.max(0, Math.min(ownContribution, t.upTo) - prev);
    total += (portion * t.ratePercent) / 100;
    prev = t.upTo;
  }
  return total;
}

/**
 * Neues Recht ab 2027: Grundzulage nach Stufen, Kinderzulage 100 % der Beiträge je Kind (max. 300 €),
 * Mindesteigenbeitrag 120 € als Alles-oder-nichts-Schwelle.
 * Lesart mehrerer Kinder („bitte prüfen“): per_child_full = jedes Kind 100 % derselben Beiträge;
 * shared = Summe der Kinderzulagen höchstens die geförderten Beiträge.
 */
export function allowanceNew(
  year: number,
  ownContribution: number,
  person: AllowancePerson,
  reading: ChildMatchingReading = subsidyNew.childMultipleReading.value,
): AllowanceBreakdown {
  const minOwn = subsidyNew.minOwnContribution.value;
  if (person.eligible === false || ownContribution < minOwn) {
    return { year, rule: "new", ownContribution, basic: 0, children: 0, starterBonus: 0, minOwnContribution: minOwn, reductionFactor: 0, total: 0 };
  }
  const subsidised = Math.min(ownContribution, subsidyNew.tiers.value.at(-1)?.upTo ?? 1800);
  const basic = basicAllowanceNew(ownContribution);
  const n = activeChildren(person.children, year).length;
  const perChildCap = subsidyNew.childMaxPerChild.value;
  const match = subsidyNew.childMatchPercent.value / 100;
  let children: number;
  if (reading === "per_child_full") {
    children = n * Math.min(subsidised * match, perChildCap);
  } else {
    children = Math.min(n * perChildCap, subsidised * match);
  }
  const starterBonus = person.starterBonusYear === year ? subsidyNew.starterBonus.value : 0;
  return {
    year,
    rule: "new",
    ownContribution,
    basic,
    children,
    starterBonus,
    minOwnContribution: minOwn,
    reductionFactor: 1,
    total: basic + children + starterBonus,
  };
}

export interface AllowanceScheduleInput {
  /** Kalenderjahr, in dem Vertragsmonat 0 liegt */
  contractStartYear: number;
  /** Kalendermonat (1–12) von Vertragsmonat 0 */
  contractStartCalendarMonth: number;
  /** Eigenbeiträge je Vertragsmonat (Monat → Betrag), z. B. aus der Simulation ohne Zulagen */
  ownContributions: CashEvent[];
  person: AllowancePerson;
  /** Regel je Kalenderjahr */
  ruleForYear: (calendarYear: number) => "old" | "new" | "none";
  childReading?: ChildMatchingReading;
  /** Gutschrift im Folgejahr: Monate nach Ende des Beitragsjahres (Standard 3 → März des Folgejahres) */
  creditLagMonths?: number;
  /** Vertragsmonate ≥ termMonths werden nicht gutgeschrieben */
  termMonths: number;
  /** nur Beitragsjahre ab diesem Kalenderjahr berücksichtigen */
  fromCalendarYear?: number;
}

export interface AllowanceSchedule {
  events: CashEvent[];
  byYear: AllowanceBreakdown[];
}

/** Monat (vertragsbezogen) des Kalenderdatums Jahr/Monat. */
export function contractMonthOf(input: Pick<AllowanceScheduleInput, "contractStartYear" | "contractStartCalendarMonth">, year: number, calendarMonth: number): number {
  return (year - input.contractStartYear) * 12 + (calendarMonth - input.contractStartCalendarMonth);
}

/**
 * Baut den Zulagen-Gutschriftsplan: Eigenbeiträge je Kalenderjahr summieren, Zulage nach der Regel des
 * Jahres berechnen und im Folgejahr gutschreiben (Standard: März). Je Beitragsjahr gilt genau eine Regel
 * (keine Doppelförderung im Wechseljahr).
 */
export function buildAllowanceSchedule(input: AllowanceScheduleInput): AllowanceSchedule {
  const perYear = new Map<number, number>();
  for (const e of input.ownContributions) {
    const absolute = input.contractStartCalendarMonth - 1 + e.month;
    const year = input.contractStartYear + Math.floor(absolute / 12);
    perYear.set(year, (perYear.get(year) ?? 0) + e.amount);
  }
  const lag = input.creditLagMonths ?? 3;
  const events: CashEvent[] = [];
  const byYear: AllowanceBreakdown[] = [];
  for (const [year, own] of [...perYear.entries()].sort((a, b) => a[0] - b[0])) {
    if (input.fromCalendarYear !== undefined && year < input.fromCalendarYear) continue;
    const rule = input.ruleForYear(year);
    if (rule === "none") continue;
    const b = rule === "old" ? allowanceOld(year, own, input.person) : allowanceNew(year, own, input.person, input.childReading);
    byYear.push(b);
    // Gutschrift: Dezember des Beitragsjahres + lag Monate; nach Ende der Ansparphase fällige Zulagen
    // werden vereinfachend im letzten Ansparmonat gutgeschrieben (Förderung geht nicht verloren).
    const month = Math.min(contractMonthOf(input, year, 12) + lag, input.termMonths - 1);
    if (b.total > 0 && month >= 0) events.push({ month, amount: b.total });
  }
  return { events, byYear };
}
