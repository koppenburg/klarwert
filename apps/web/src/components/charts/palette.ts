import type { CostKind } from "@klarwert/calc";

/**
 * Kategoriale Reihenfolge laut dataviz-Referenzpalette (hell), feste Zuordnung je Entität – nie nach Rang.
 * Validiert für benachbarte Paare (Stapel, Balken, Linien). Text nutzt nie die Serienfarbe.
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"] as const;

export const COST_COLORS: Record<CostKind, string> = {
  alpha: SERIES[0],
  beta: SERIES[1],
  gamma: SERIES[2],
  kappa: SERIES[3],
  fund: SERIES[4],
  guarantee: SERIES[5],
  paidUpFee: SERIES[6],
};

export const INK = { primary: "#1d2330", secondary: "#5b6475", grid: "#e6e9ee", axis: "#c9ced6", surface: "#ffffff" } as const;

/** neutrale Einheitsfarbe für Szenarien (kein Szenario hervorgehoben) */
export const SCENARIO_COLOR = SERIES[0];

export const SHORT_COST_LABELS: Record<CostKind, string> = {
  alpha: "Abschluss (α)",
  beta: "Verwaltung Beitrag (β)",
  gamma: "Verwaltung Guthaben (γ)",
  kappa: "Stückkosten (κ)",
  fund: "Fondskosten",
  guarantee: "Garantie",
  paidUpFee: "Beitragsfreistellung",
};
