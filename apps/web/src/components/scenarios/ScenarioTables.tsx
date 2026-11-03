import type { ScenarioResult, SensitivityCell } from "@klarwert/calc";
import { Table } from "@/components/ui";
import { euro, pct, pp } from "@/lib/format";

/** Szenario-Tabelle in fester Reihenfolge (keine Sortierung nach Ergebnis). Server- und Client-tauglich. */
export function ScenarioTable({ results, compact = false }: { results: ScenarioResult[]; compact?: boolean }) {
  return (
    <Table className={compact ? "text-xs" : undefined}>
      <thead>
        <tr>
          <th>Szenario</th>
          <th className="text-right">Endkapital</th>
          <th className="text-right">davon Altvertrag</th>
          <th className="text-right">davon Depot</th>
          <th className="text-right">Effektivkosten p.a.</th>
          <th className="text-right">Eigenbeiträge</th>
          <th className="text-right">Förderung</th>
          <th className="text-right">laufende Kosten</th>
          <th className="text-right">Wechselkosten</th>
          <th className="text-right">Storno/Abschlag</th>
          <th className="text-right">Kosten kumuliert</th>
        </tr>
      </thead>
      <tbody>
        {results.map((r) => (
          <tr key={r.id}>
            <td>{r.label}</td>
            <td className="tabular text-right font-semibold">{euro(r.endCapital)}</td>
            <td className="tabular text-right">{euro(r.endCapitalLegacy)}</td>
            <td className="tabular text-right">{euro(r.endCapitalDepot)}</td>
            <td className="tabular text-right">{pp(r.effectiveCostsPp)}</td>
            <td className="tabular text-right">{euro(r.ownContributions)}</td>
            <td className="tabular text-right">{euro(r.allowances)}</td>
            <td className="tabular text-right">{euro(r.costsCumulative - r.switchFees - r.surrenderLoss)}</td>
            <td className="tabular text-right">{euro(r.switchFees)}</td>
            <td className="tabular text-right">{euro(r.surrenderLoss)}</td>
            <td className="tabular text-right">{euro(r.costsCumulative)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function SensitivityTable({ cells, results, compact = false }: { cells: SensitivityCell[]; results: Pick<ScenarioResult, "id" | "label">[]; compact?: boolean }) {
  if (cells.length === 0) return <p className="text-sm text-muted">Keine Sensitivität berechenbar (Restlaufzeit zu kurz).</p>;
  return (
    <Table className={compact ? "text-xs" : undefined}>
      <thead>
        <tr>
          <th>Bruttorendite</th>
          <th>Rentenbeginn</th>
          {results.map((r) => (
            <th key={r.id} className="text-right">
              {r.label.split(" – ")[0]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cells.map((c) => (
          <tr key={`${c.grossReturnPercent}/${c.retirementShiftYears}`}>
            <td className="tabular">{pct(c.grossReturnPercent, 1)}</td>
            <td className="tabular">{c.retirementShiftYears === 0 ? "wie vereinbart" : `${c.retirementShiftYears > 0 ? "+" : ""}${c.retirementShiftYears} Jahre`}</td>
            {results.map((r) => (
              <td key={r.id} className="tabular text-right">
                {euro(c.endCapital[r.id])}
                <span className="block text-[10px] text-muted">{pp(c.effectiveCostsPp[r.id] ?? null)}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
