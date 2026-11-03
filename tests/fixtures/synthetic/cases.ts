/**
 * Soll-Werte der drei synthetischen Abnahmefälle (fiktive „Musterversicherung AG“).
 * Dient dem Generator (generate.ts), dem Offline-Pipeline-Test (tests/synthetic-pipeline.test.ts)
 * und dem Live-Abnahmetest gegen die deployte App (tests/e2e/acceptance.ts).
 */

export interface SyntheticDocument {
  file: string;
  role: "police" | "nachtrag" | "standmitteilung" | "screenshot" | "angebot" | "pib" | "sonstiges";
  mime: string;
}

export interface SyntheticCase {
  key: "riester" | "layer3" | "offer";
  dir: string;
  title: string;
  person: { name: string; street: string; zipCity: string; birthdate: string; policyNumber: string; iban?: string; phone?: string; email?: string };
  /** Strings, die nach der Bereinigung nirgends mehr vorkommen dürfen */
  piiStrings: string[];
  documents: SyntheticDocument[];
  library: { file: string; kind: "avb" | "tarifbestimmungen" | "kostenblatt" | "pib"; title: string };
  catalog: { insurer: string; tariffName: string; tariffCode: string; generation: string; layer: "riester" | "layer3"; productType: "fonds" };
  /** erwartete Erkennung (Soll) */
  expectedFields: Record<string, string | number>;
  /** zu bestätigende Kostenfaktoren der Tarifgeneration (Soll laut Bedingungswerk) */
  expectedCosts: Record<string, number | string | boolean | null>;
  /** vertragsindividuelle Abweichungen (Override) */
  caseOverrides: Record<string, number | string | boolean | null>;
}

export const CASES = {
  riester: {
    key: "riester",
    dir: "fall-1-riester",
    title: "Synthetik 1 – Riester-Fondsvertrag",
    person: {
      name: "Max Beispielmann",
      street: "Lindenweg 4",
      zipCity: "66663 Merzig",
      birthdate: "14.05.1986",
      policyNumber: "RV-7734-55812",
      iban: "DE02 1203 0000 0000 2020 51",
      phone: "06861 123456",
    },
    piiStrings: ["Beispielmann", "Lindenweg", "66663", "14.05.1986", "7734-55812", "DE02 1203", "2020 51", "123456"],
    documents: [
      { file: "police-mri-r-2015.pdf", role: "police", mime: "application/pdf" },
      { file: "standmitteilung-2026.png", role: "standmitteilung", mime: "image/png" },
    ],
    library: { file: "bibliothek-tarifbestimmungen-mri-r-2015.pdf", kind: "tarifbestimmungen", title: "Tarifbestimmungen MusterRiester Invest (MRI-R) Stand 2015" },
    catalog: { insurer: "Musterversicherung AG", tariffName: "MusterRiester Invest", tariffCode: "MRI-R", generation: "2015", layer: "riester", productType: "fonds" },
    expectedFields: {
      insurer: "Musterversicherung AG",
      tariff_name: "MusterRiester Invest",
      tariff_code: "MRI-R",
      tariff_generation: "2015",
      layer: "riester",
      contract_start: "2015-01-01",
      retirement_start: "2048-01-01",
      contribution_amount: 100,
      payment_frequency: "monthly",
      current_value: 16482.35,
      current_value_date: "2026-10-01",
      surrender_value: 16482.35,
      guarantee_level_percent: 100,
    },
    expectedCosts: {
      "alpha.mode": "permille_of_premium_sum",
      "alpha.rate": 40,
      "alpha.distributionMonths": 60,
      "alpha.onAllowancesPercent": 0,
      "beta.percentOfPremium": 6,
      "beta.onAllowancesPercent": 6,
      "gamma.percentOfValue": 0.4,
      "kappa.eurPerYear": 24,
      "fund.kickbackPercent": 0,
      "guarantee.percentOfValue": 0.3,
      paidUpFeeEur: 0,
      "surrender.percentOfValue": 0,
      "payout.annuityFactorGuaranteed": 22.5,
      "payout.annuityCostPercent": 1.5,
      "payout.annuityCostIncludedInFactor": true,
    },
    caseOverrides: { "fund.terPercent": 1.1, "payout.annuityFactorCurrent": 27.1 },
  },
  layer3: {
    key: "layer3",
    dir: "fall-2-schicht3",
    title: "Synthetik 2 – Schicht-3-Fondsvertrag",
    person: {
      name: "Sabine Probst",
      street: "Am Markt 12",
      zipCity: "66679 Losheim am See",
      birthdate: "02.09.1979",
      policyNumber: "MV-2018-998877",
      email: "sabine.probst@example.org",
    },
    piiStrings: ["Probst", "Am Markt 12", "66679", "02.09.1979", "998877", "sabine.probst", "example.org"],
    documents: [
      { file: "maklerportal-vertrag.png", role: "screenshot", mime: "image/png" },
      { file: "standmitteilung-2026.txt", role: "standmitteilung", mime: "text/plain" },
    ],
    library: { file: "bibliothek-avb-kostenblatt-mri-2018.pdf", kind: "kostenblatt", title: "AVB und Kostenblatt MusterRente Invest (MRI) Generation 2018" },
    catalog: { insurer: "Musterversicherung AG", tariffName: "MusterRente Invest", tariffCode: "MRI", generation: "2018", layer: "layer3", productType: "fonds" },
    expectedFields: {
      insurer: "Musterversicherung AG",
      tariff_name: "MusterRente Invest",
      tariff_code: "MRI",
      tariff_generation: "2018",
      layer: "layer3",
      contract_start: "2018-12-01",
      retirement_start: "2055-12-01",
      contribution_amount: 150,
      payment_frequency: "monthly",
      dynamics_percent: 3,
      current_value: 21315.8,
      current_value_date: "2026-10-01",
      surrender_value: 20676.33,
    },
    expectedCosts: {
      "alpha.mode": "permille_of_premium_sum",
      "alpha.rate": 25,
      "alpha.distributionMonths": 60,
      "alpha.onDynamics": true,
      "alpha.onTopUpsPercent": 2,
      "beta.percentOfPremium": 8,
      "beta.onTopUpsPercent": 1,
      "gamma.percentOfValue": 0.35,
      "kappa.eurPerYear": 36,
      "kappa.eurPerYearPaidUp": 24,
      "fund.kickbackPercent": 0.2,
      "guarantee.percentOfValue": 0,
      paidUpFeeEur: 25,
      "surrender.percentOfValue": 3,
      "surrender.maxEur": 1000,
      "payout.annuityFactorGuaranteed": 24,
      "payout.annuityFactorCurrent": null,
      "payout.annuityCostPercent": 2,
      "payout.annuityCostIncludedInFactor": true,
      "payout.lumpSumCostPercent": 0,
      "payout.guaranteePeriodMonths": 120,
    },
    caseOverrides: { "fund.terPercent": 0.85 },
  },
  offer: {
    key: "offer",
    dir: "fall-3-angebot-pib",
    title: "Synthetik 3 – Angebot mit PIB",
    person: {
      name: "Jonas Testmann",
      street: "Bahnhofstraße 8",
      zipCity: "66663 Merzig",
      birthdate: "23.11.1995",
      policyNumber: "AN-2026-102938",
    },
    piiStrings: ["Testmann", "Bahnhofstraße 8", "66663", "23.11.1995", "102938"],
    documents: [
      { file: "angebot-mri-2026.pdf", role: "angebot", mime: "application/pdf" },
      { file: "pib-mri-2026.pdf", role: "pib", mime: "application/pdf" },
    ],
    library: { file: "bibliothek-tarifbestimmungen-mri-2026.pdf", kind: "tarifbestimmungen", title: "Tarifbestimmungen MusterRente Invest (MRI) Generation 2026" },
    catalog: { insurer: "Musterversicherung AG", tariffName: "MusterRente Invest", tariffCode: "MRI", generation: "2026", layer: "layer3", productType: "fonds" },
    expectedFields: {
      insurer: "Musterversicherung AG",
      tariff_name: "MusterRente Invest",
      tariff_code: "MRI",
      tariff_generation: "2026",
      layer: "layer3",
      contract_start: "2027-01-01",
      retirement_start: "2062-01-01",
      contribution_amount: 200,
      payment_frequency: "monthly",
      pib_return_percent: 3,
      pib_effective_costs_pp: 1.04,
    },
    expectedCosts: {
      "alpha.mode": "permille_of_premium_sum",
      "alpha.rate": 25,
      "alpha.distributionMonths": 60,
      "beta.percentOfPremium": 5,
      "gamma.percentOfValue": 0.3,
      "kappa.eurPerYear": 30,
      "fund.kickbackPercent": 0,
      "guarantee.percentOfValue": 0,
      paidUpFeeEur: 0,
      "surrender.percentOfValue": 0,
      "payout.annuityFactorGuaranteed": 21,
      "payout.annuityCostPercent": 1.5,
      "payout.annuityCostIncludedInFactor": true,
    },
    caseOverrides: { "fund.terPercent": 0.2, "payout.annuityFactorCurrent": 26.4 },
  },
} as const satisfies Record<string, SyntheticCase>;
