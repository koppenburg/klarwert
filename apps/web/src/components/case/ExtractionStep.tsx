import { CONTRACT_FIELDS, FREQUENCY_LABELS, LAYER_LABELS } from "@klarwert/extraction";
import { fieldProvenance, type CaseBundle } from "@/lib/data";
import { env } from "@/lib/env";
import { Card, Notice, Table } from "../ui";
import { ExtractButton } from "./ExtractButton";
import { FieldRow } from "./FieldRow";

const OPTION_LABELS: Record<string, Record<string, string>> = {
  layer: LAYER_LABELS,
  payment_frequency: FREQUENCY_LABELS,
  product_type: { fonds: "Fondsgebunden", klassisch: "Klassisch", hybrid: "Hybrid", index: "Indexpolice", sonstige: "Sonstige" },
};

export default function ExtractionStep({ bundle }: { bundle: CaseBundle }) {
  const docs = bundle.documents.filter((d) => d.sanitized_pages?.length);
  const unapproved = docs.filter((d) => !d.sanitized_approved_at);
  const fieldMap = new Map(bundle.fields.map((f) => [f.key, f]));
  const confirmed = bundle.fields.filter((f) => f.status === "confirmed").length;
  return (
    <div className="space-y-5">
      <Card title="Erkennung durch die KI">
        <div className="space-y-3 text-sm">
          <p>
            Die KI liest nur die freigegebenen, bereinigten Fassungen ({docs.length - unapproved.length} von {docs.length}) und liefert Rohdaten mit Konfidenz und Fundstelle. Sie rechnet
            nicht. Unmittelbar vor dem Aufruf wird die Bereinigung erneut geprüft.
          </p>
          {!env.anthropicConfigured() && <Notice tone="bad">ANTHROPIC_API_KEY ist nicht gesetzt – Erkennung nicht verfügbar. Felder können manuell erfasst werden.</Notice>}
          {unapproved.length > 0 && <Notice>Noch nicht freigegeben: {unapproved.map((d) => d.file_name).join(", ")}</Notice>}
          <ExtractButton caseId={bundle.case.id} disabled={docs.length === 0 || unapproved.length > 0 || !env.anthropicConfigured()} label={bundle.fields.length ? "Erkennung erneut ausführen" : "Erkennung starten"} />
        </div>
      </Card>
      <Card title={`Vertragsdaten prüfen (${confirmed} bestätigt)`}>
        <p className="mb-3 text-sm text-muted">Jeder Wert wird vom Berater bestätigt oder korrigiert. Pflichtfelder für die Berechnung sind mit * markiert.</p>
        <Table>
          <thead>
            <tr>
              <th>Feld</th>
              <th>Wert</th>
              <th>Konfidenz</th>
              <th>Fundstelle</th>
              <th className="text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {CONTRACT_FIELDS.map((def) => {
              const f = fieldMap.get(def.key);
              const prov = f ? fieldProvenance(f) : null;
              return (
                <FieldRow
                  key={def.key}
                  caseId={bundle.case.id}
                  fieldKey={def.key}
                  label={def.label}
                  type={def.type}
                  unit={def.unit}
                  options={def.options}
                  optionLabels={OPTION_LABELS[def.key]}
                  required={def.requiredForCalc}
                  value={f?.value}
                  status={f?.status ?? null}
                  confidence={f?.confidence ?? null}
                  sourceLabel={prov?.label ?? null}
                  quote={prov?.quote ?? null}
                />
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
