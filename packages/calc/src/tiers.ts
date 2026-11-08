/**
 * Beitragsstaffeln und Rentenfaktor-Tabellen.
 *
 * Viele Tarife staffeln Kosten nach der Beitragshöhe (z. B. geringere Abschlusskosten ab 100 € Monatsbeitrag)
 * und nennen Rentenfaktoren je Rentenbeginnalter. Beides wird VOR der Simulation in skalare Werte aufgelöst:
 * Die Simulation selbst bleibt unverändert.
 */
import { paymentsPerYear } from "./accumulation";
import type { ContributionPlan, PaymentFrequency } from "./types";

/** Bezugsgröße einer Staffel. */
export type TierBasis =
  /** laufender Beitrag auf Monat umgerechnet (Beitrag × Zahlungen p.a. / 12) */
  | "monthly_premium"
  /** laufender Jahresbeitrag */
  | "annual_premium"
  /** Beitragssumme über die Zahlungsdauer (ohne Dynamik) */
  | "premium_sum";

export const TIER_BASIS_LABELS: Record<TierBasis, string> = {
  monthly_premium: "Monatsbeitrag",
  annual_premium: "Jahresbeitrag",
  premium_sum: "Beitragssumme",
};

export interface Tier {
  /** gilt ab diesem Wert der Bezugsgröße (inklusive), in € */
  from: number;
  value: number;
}

export interface TieredValue {
  basis: TierBasis;
  /** aufsteigend nach `from`; die erste Stufe sollte bei 0 beginnen */
  tiers: Tier[];
}

export interface TierContext {
  monthlyPremium: number;
  annualPremium: number;
  premiumSum: number;
}

export function isTieredValue(v: unknown): v is TieredValue {
  return (
    typeof v === "object" &&
    v !== null &&
    "basis" in v &&
    "tiers" in v &&
    Array.isArray((v as TieredValue).tiers) &&
    (v as TieredValue).tiers.every((t) => typeof t?.from === "number" && typeof t?.value === "number")
  );
}

export function tierContext(plan: Pick<ContributionPlan, "amount" | "frequency" | "paymentMonths">, termMonths: number): TierContext {
  const perYear = paymentsPerYear(plan.frequency as PaymentFrequency);
  const annual = plan.amount * perYear;
  const paymentYears = Math.min(plan.paymentMonths ?? termMonths, termMonths) / 12;
  return { monthlyPremium: annual / 12, annualPremium: annual, premiumSum: annual * paymentYears };
}

/** Wert der Stufe, deren Untergrenze die Bezugsgröße zuletzt erreicht. Unterhalb der ersten Stufe gilt die erste. */
export function resolveTier(t: TieredValue, ctx: TierContext): number {
  const sorted = [...t.tiers].sort((a, b) => a.from - b.from);
  if (sorted.length === 0) throw new Error("Staffel ohne Stufen");
  const x = t.basis === "monthly_premium" ? ctx.monthlyPremium : t.basis === "annual_premium" ? ctx.annualPremium : ctx.premiumSum;
  let value = (sorted[0] as Tier).value;
  for (const s of sorted) if (x + 1e-9 >= s.from) value = s.value;
  return value;
}

/** Zahl oder Staffel auf eine Zahl auflösen. */
export function resolveNumber(v: unknown, ctx: TierContext): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (isTieredValue(v)) return resolveTier(v, ctx);
  return undefined;
}

export interface AnnuityFactorRow {
  /** Alter bei Rentenbeginn */
  age: number;
  guaranteed?: number | null;
  current?: number | null;
}

/**
 * Rentenfaktor für ein Rentenbeginnalter: exakter Tabellenwert, sonst lineare Interpolation zwischen den
 * benachbarten Altern; außerhalb der Tabelle wird nicht extrapoliert (null).
 */
export function annuityFactorAt(table: AnnuityFactorRow[], age: number, which: "guaranteed" | "current"): number | null {
  const rows = table.filter((r) => typeof r[which] === "number").sort((a, b) => a.age - b.age);
  if (rows.length === 0) return null;
  const exact = rows.find((r) => Math.abs(r.age - age) < 1e-9);
  if (exact) return exact[which] as number;
  const lower = [...rows].reverse().find((r) => r.age < age);
  const upper = rows.find((r) => r.age > age);
  if (!lower || !upper) return null;
  const lv = lower[which] as number;
  const uv = upper[which] as number;
  return lv + ((uv - lv) * (age - lower.age)) / (upper.age - lower.age);
}

/** Kostenfaktoren, in denen jede Zahl auch eine Beitragsstaffel sein darf. */
export type DeepTiered<T> = T extends number
  ? number | TieredValue
  : T extends Array<infer U>
    ? Array<DeepTiered<U>>
    : T extends object
      ? { [K in keyof T]: DeepTiered<T[K]> }
      : T;

/** Ersetzt jede Staffel durch den Wert, der für den konkreten Beitrag gilt. */
export function resolveTieredCosts<T>(value: DeepTiered<T>, ctx: TierContext): T {
  const walk = (v: unknown): unknown => {
    if (isTieredValue(v)) return resolveTier(v, ctx);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** Enthält der Kostensatz irgendwo eine Staffel? */
export function hasTiers(value: unknown): boolean {
  if (isTieredValue(value)) return true;
  if (Array.isArray(value)) return value.some(hasTiers);
  if (value && typeof value === "object") return Object.values(value).some(hasTiers);
  return false;
}
