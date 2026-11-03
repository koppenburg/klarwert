import { GROUP_LABELS, listConstants, SOURCES, type LegalConfig } from "@klarwert/legal-config";
import { Badge, Card, Table } from "@/components/ui";
import { formatValue } from "@/lib/format";

export const metadata = { title: "Gesetzliche Grundlagen" };

export default function LegalPage() {
  const all = listConstants();
  const groups = [...new Set(all.map((c) => c.group))] as Array<keyof LegalConfig>;
  return (
    <div className="space-y-5">
      <Card title="Gesetzliche Konstanten">
        <p className="text-sm text-muted">
          Alle Werte stammen aus packages/legal-config mit Norm, Quelle, Abrufdatum und Prüfstatus. „bitte prüfen“ kennzeichnet Auslegungsfragen oder nicht an der Primärquelle bestätigte
          Werte; bei unterschiedlichen Lesarten rechnet das Tool beide Varianten.
        </p>
      </Card>
      {groups.map((g) => (
        <Card key={g} title={GROUP_LABELS[g]}>
          <Table>
            <thead>
              <tr>
                <th>Konstante</th>
                <th>Wert</th>
                <th>Norm</th>
                <th>Stand</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {all
                .filter((c) => c.group === g)
                .map(({ key, constant, source }) => (
                  <tr key={key}>
                    <td>
                      {constant.label}
                      {constant.note && <span className="mt-1 block text-xs text-muted">{constant.note}</span>}
                    </td>
                    <td className="tabular">{Array.isArray(constant.value) ? JSON.stringify(constant.value) : formatValue(constant.value, constant.unit)}</td>
                    <td className="text-xs">
                      {constant.norm}
                      <a href={source.url} target="_blank" rel="noreferrer" className="block text-brand underline">
                        {source.title}
                      </a>
                    </td>
                    <td className="tabular text-xs">{constant.asOf}</td>
                    <td>{constant.status === "verifiziert" ? <Badge tone="ok">verifiziert</Badge> : <Badge tone="warn">bitte prüfen</Badge>}</td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </Card>
      ))}
      <p className="text-xs text-muted">Quellen: {Object.values(SOURCES).map((s) => s.title).join(" · ")}</p>
    </div>
  );
}
