import { GateNotice } from "@/components/analysis/GateNotice";
import { Notice } from "@/components/ui";
import { buildForBundle, settingsForBundle } from "@/lib/analysis";
import type { CaseBundle } from "@/lib/data";
import { ScenarioView } from "./ScenarioView";

export default async function ScenarioStep({ bundle }: { bundle: CaseBundle }) {
  const settings = settingsForBundle(bundle);
  const b = buildForBundle(bundle, settings);
  if (!b.ok) return <GateNotice gate={b.gate} caseId={bundle.case.id} what="Szenarienrechnung" />;
  if (!b.built.state) {
    return (
      <Notice tone="warn" title="Depot-Szenarien brauchen ein aktuelles Guthaben">
        Bitte im Schritt „Erkennung“ das aktuelle Guthaben und dessen Stichtag erfassen und bestätigen (z. B. aus der Standmitteilung).
      </Notice>
    );
  }
  return <ScenarioView caseId={bundle.case.id} state={b.built.state} initialSettings={settings} />;
}
