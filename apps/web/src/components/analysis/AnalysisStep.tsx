import { buildForBundle, settingsForBundle } from "@/lib/analysis";
import type { CaseBundle } from "@/lib/data";
import { AnalysisView } from "./AnalysisView";
import { GateNotice } from "./GateNotice";

export default async function AnalysisStep({ bundle }: { bundle: CaseBundle }) {
  const settings = settingsForBundle(bundle);
  const b = buildForBundle(bundle, settings);
  if (!b.ok) return <GateNotice gate={b.gate} caseId={bundle.case.id} />;
  return <AnalysisView caseId={bundle.case.id} model={b.built.model} hasState={b.built.state !== null} warnings={b.built.warnings} initialSettings={settings} />;
}
