/**
 * Server-seitige Zusammenführung: Gate prüfen, Modell bauen, Vertragsanalyse, Depot-Szenarien, Sensitivität.
 * Einstellungen und clientseitige Helfer liegen in ./analysis-settings.
 */
import { analyzeContract, type ContractAnalysis } from "@klarwert/calc";
import { buildModel, checkGate, GateError, type BuiltModel, type GateResult } from "@klarwert/extraction";
import { analysisAssumptions, computeScenarios, settingsForBundle, type AnalysisSettings, type ScenarioBundle } from "./analysis-settings";
import { toCostRecords, toFieldRecords, type CaseBundle } from "./data";

export * from "./analysis-settings";

export type FullAnalysis =
  | { ok: false; gate: GateResult; settings: AnalysisSettings; error?: string }
  | {
      ok: true;
      gate: GateResult;
      settings: AnalysisSettings;
      built: BuiltModel;
      analysis: ContractAnalysis;
      scenarios: ScenarioBundle | null;
    };

/** Gate prüfen, Modell bauen und alles rechnen. Bei nicht erfülltem Gate: keine Zahlen. */
export function buildForBundle(bundle: CaseBundle, settings: AnalysisSettings): { ok: true; gate: GateResult; built: BuiltModel } | { ok: false; gate: GateResult; error?: string } {
  const fields = toFieldRecords(bundle.fields);
  const costs = toCostRecords(bundle.costItems, bundle.libraryDocs);
  const gate = checkGate(fields, costs);
  if (!gate.ok) return { ok: false, gate };
  try {
    const built = buildModel(fields, costs, { label: bundle.case.title ?? undefined, valuationDate: settings.valuationDate ?? undefined });
    return { ok: true, gate, built };
  } catch (e) {
    if (e instanceof GateError) return { ok: false, gate: e.gate };
    return { ok: false, gate: { ...gate, ok: false, messages: [...gate.messages, e instanceof Error ? e.message : String(e)] }, error: e instanceof Error ? e.message : String(e) };
  }
}

export function runFullAnalysis(bundle: CaseBundle, settings: AnalysisSettings = settingsForBundle(bundle)): FullAnalysis {
  const b = buildForBundle(bundle, settings);
  if (!b.ok) return { ok: false, gate: b.gate, settings, error: b.error };
  const analysis = analyzeContract(b.built.model, analysisAssumptions(b.built.model, settings));
  const scenarios = b.built.state ? computeScenarios(b.built.state, settings) : null;
  return { ok: true, gate: b.gate, settings, built: b.built, analysis, scenarios };
}

