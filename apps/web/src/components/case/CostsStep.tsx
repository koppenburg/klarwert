import { checkGate, COST_FIELDS } from "@klarwert/extraction";
import { costProvenance, toCostRecords, toFieldRecords, type CaseBundle, type CostItemRow } from "@/lib/data";
import { env } from "@/lib/env";
import { Card, Notice, Table } from "../ui";
import { CostRow, type CostItemView } from "./CostRow";
import { CostSuggestButton } from "./CostSuggestButton";
import { FinalizeCostsButton } from "./FinalizeCostsButton";

export default function CostsStep({ bundle }: { bundle: CaseBundle }) {
  const gate = checkGate(toFieldRecords(bundle.fields), toCostRecords(bundle.costItems, bundle.libraryDocs));
  const confirmedDocs = bundle.libraryDocs.filter((d) => d.status === "confirmed");
  const view = (c: CostItemRow | undefined): CostItemView | null =>
    c
      ? {
          id: c.id,
          value: c.value,
          status: c.status,
          sourceLabel: costProvenance(c, bundle.libraryDocs).label,
          quote: c.quote,
          note: c.source_note,
          confidence: c.confidence,
          proposedBy: c.proposed_by,
        }
      : null;
  const remarks = bundle.libraryDocs.flatMap((d) => {
    return (d.cost_remarks?.remarks ?? []).map((x) => ({ doc: d.title, text: x }));
  });
  return (
    <div className="space-y-5">
      {!bundle.generation && <Notice>Noch keine Tarifgeneration zugeordnet (Schritt 3). Bestätigte Kostenfaktoren gehören zur Generation; ohne Zuordnung nur vertragsindividuelle Werte möglich.</Notice>}
      <Card title="Kostenklauseln aus der Bibliothek">
        {confirmedDocs.length ? (
          <div className="space-y-3">
            {confirmedDocs.map((d) => (
              <CostSuggestButton key={d.id} docId={d.id} title={d.title} enabled={env.anthropicConfigured()} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Kein bestätigtes Bedingungswerk für diese Generation. Werte können manuell mit Fundstelle erfasst werden.</p>
        )}
        {remarks.length > 0 && (
          <Notice tone="brand" title="Weitere Kostenposten laut Bedingungswerk (prüfen)">
            <ul className="list-disc pl-5">
              {remarks.map((r, i) => (
                <li key={i}>
                  {r.text} <span className="text-muted">({r.doc})</span>
                </li>
              ))}
            </ul>
          </Notice>
        )}
      </Card>
      <Card title="Kostenfaktoren bestätigen">
        <p className="mb-3 text-sm text-muted">
          Jeder Wert wird einzeln bestätigt, korrigiert oder ergänzt. Tarifwerte gelten für alle Verträge dieser Generation und werden beim nächsten Vertrag vorgeschlagen; Abweichungen
          (z. B. individuelle Fondsauswahl) gelten nur für diesen Vertrag. Pflichtwerte (*) mit 0 bestätigen, wenn es die Kostenart nicht gibt.
        </p>
        <Table>
          <thead>
            <tr>
              <th>Kostenart</th>
              <th>Tarifwert (Generation)</th>
              <th>Abweichung (dieser Vertrag)</th>
              <th>Bearbeiten</th>
            </tr>
          </thead>
          <tbody>
            {COST_FIELDS.map((def) => (
              <CostRow
                key={def.key}
                caseId={bundle.case.id}
                fieldKey={def.key}
                label={def.label}
                unit={def.unit}
                type={def.type}
                options={def.options}
                required={def.required}
                nullable={def.nullable}
                help={def.help}
                generationItem={view(bundle.costItems.find((c) => c.key === def.key && c.generation_id))}
                caseItem={view(bundle.costItems.find((c) => c.key === def.key && c.case_id))}
                docs={confirmedDocs.map((d) => ({ id: d.id, title: d.title }))}
                hasGeneration={!!bundle.generation}
              />
            ))}
          </tbody>
        </Table>
      </Card>
      <Card title="Abschluss">
        {gate.ok ? <Notice tone="ok">Alle Pflichtangaben sind bestätigt.</Notice> : (
          <Notice title="Noch offen – ohne vollständige Bestätigung keine Berechnung und kein Report">
            <ul className="list-disc pl-5">
              {gate.messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </Notice>
        )}
        <div className="mt-3">
          <FinalizeCostsButton caseId={bundle.case.id} ready={gate.ok} done={!!bundle.case.costs_confirmed_at} />
        </div>
      </Card>
    </div>
  );
}
