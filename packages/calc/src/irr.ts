import type { CashEvent } from "./types";

/** Barwert der Zahlungen zum monatlichen Zins r, bezogen auf den ersten Zahlungsmonat. */
export function npv(flows: CashEvent[], monthlyRate: number): number {
  if (flows.length === 0) return 0;
  const t0 = Math.min(...flows.map((f) => f.month));
  let s = 0;
  for (const f of flows) s += f.amount / Math.pow(1 + monthlyRate, f.month - t0);
  return s;
}

/**
 * Interner Zinsfuß (monatlich) per Bisektion mit Newton-Verfeinerung.
 * Erwartet Einzahlungen negativ und einen positiven Endwert; liefert null, wenn keine Lösung im Bereich existiert.
 */
export function irrMonthly(flows: CashEvent[]): number | null {
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;
  let lo = -0.5;
  let hi = 0.5;
  let fLo = npv(flows, lo);
  let fHi = npv(flows, hi);
  if (Number.isNaN(fLo) || Number.isNaN(fHi) || fLo * fHi > 0) {
    // Bereich erweitern (sehr hohe/niedrige Renditen)
    lo = -0.9999;
    hi = 5;
    fLo = npv(flows, lo);
    fHi = npv(flows, hi);
    if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  }
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(flows, mid);
    if (Math.abs(fMid) < 1e-10 || hi - lo < 1e-15) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/** Interner Zinsfuß in % p.a. (geometrisch annualisiert). */
export function irrAnnualPercent(flows: CashEvent[]): number | null {
  const m = irrMonthly(flows);
  if (m === null) return null;
  return (Math.pow(1 + m, 12) - 1) * 100;
}
