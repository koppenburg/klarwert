"use client";

import { compareContracts, COST_KIND_LABELS, COST_KINDS, type ComparableContract, type CommonAssumptions } from "@klarwert/calc";
import { useMemo, useState, useTransition } from "react";
import { NumInput } from "@/components/analysis/inputs";
import { CompareBars } from "@/components/charts/Charts";
import { AssumptionTag, Button, Card, Field, inputClass, Table } from "@/components/ui";
import { euro, pp } from "@/lib/format";
import { saveComparison } from "./actions";

export interface CompareItem extends ComparableContract {
  caseNumber: string;
  remainingMonths: number | null;
}

export function CompareView({ items }: { items: CompareItem[] }) {
  const hasState = items.every((i) => i.elapsedMonths !== undefined && i.currentValue !== undefined);
  const defaultRemaining = Math.min(...items.map((i) => i.remainingMonths ?? 360));
  const [mode, setMode] = useState<CommonAssumptions["mode"]>("tariff");
  const [grossReturn, setGrossReturn] = useState(4);
  const [termYears, setTermYears] = useState(mode === "tariff" ? 30 : Math.max(1, Math.round(defaultRemaining / 12)));
  const [monthly, setMonthly] = useState(100);
  const [dynamics, setDynamics] = useState(0);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const common: CommonAssumptions = { mode, grossReturnPercent: grossReturn, termMonths: Math.round(termYears * 12), monthlyContribution: monthly, dynamicsPercent: dynamics || undefined };
  const rows = useMemo(() => compareContracts(items, common), [items, mode, grossReturn, termYears, monthly, dynamics]); // eslint-disable-line react-hooks/exhaustive-deps
  const kinds = COST_KINDS.filter((k) => rows.some((r) => Math.abs(r.costsByKind[k]) > 0.005));

  return (
    <div className="space-y-5">
      <Card title="Identische Annahmen für alle Verträge">
        <div className="grid gap-4 md:grid-cols-5">
          <Field label="Modus">
            <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value === "remaining" ? "remaining" : "tariff")}>
              <option value="tariff">Tarifvergleich (Neuabschluss)</option>
              <option value="remaining" disabled={!hasState}>
                Restlaufzeit ab Ist-Guthaben
              </option>
            </select>
          </Field>
          <Field label="Bruttorendite (% p.a.)">
            <NumInput value={grossReturn} onChange={(v) => v !== null && setGrossReturn(v)} />
          </Field>
          <Field label={mode === "tariff" ? "Laufzeit (Jahre)" : "Restlaufzeit (Jahre)"}>
            <NumInput value={termYears} onChange={(v) => v !== null && v > 0 && v <= 60 && setTermYears(v)} />
          </Field>
          <Field label="Monatsbeitrag (€)">
            <NumInput value={monthly} onChange={(v) => v !== null && v >= 0 && setMonthly(v)} />
          </Field>
          <Field label="Dynamik (% p.a.)">
            <NumInput value={dynamics} onChange={(v) => v !== null && setDynamics(v)} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted">
          Alle Werte oben sind Annahmen <AssumptionTag />. Es werden nur die bestätigten Kostenfaktoren der jeweiligen Tarife verwendet.
          {mode === "remaining" ? " Fortschreibung ab Ist-Guthaben; bereits getilgte Abschlusskosten fallen nicht erneut an." : " Jeder Tarif wird so gerechnet, als würde er mit gleichem Beitrag und gleicher Laufzeit neu abgeschlossen."}
        </p>
      </Card>
      <Card title="Ergebnis">
        <Table>
          <thead>
            <tr>
              <th>Kennzahl</th>
              {rows.map((r) => (
                <th key={r.id} className="text-right">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="font-semibold">
              <td>Effektivkosten p.a.</td>
              {rows.map((r) => (
                <td key={r.id} className="tabular text-right">
                  {pp(r.effectiveCostsPp)}
                </td>
              ))}
            </tr>
            <tr>
              <td>Eigenbeiträge</td>
              {rows.map((r) => (
                <td key={r.id} className="tabular text-right">
                  {euro(r.ownContributions)}
                </td>
              ))}
            </tr>
            <tr>
              <td>Endkapital ohne Kosten</td>
              {rows.map((r) => (
                <td key={r.id} className="tabular text-right">
                  {euro(r.endCapitalGross)}
                </td>
              ))}
            </tr>
            <tr className="font-semibold">
              <td>Endkapital nach Kosten</td>
              {rows.map((r) => (
                <td key={r.id} className="tabular text-right">
                  {euro(r.endCapital)}
                </td>
              ))}
            </tr>
            <tr>
              <td>Kosten gesamt</td>
              {rows.map((r) => (
                <td key={r.id} className="tabular text-right">
                  {euro(r.costsTotal)}
                </td>
              ))}
            </tr>
            {kinds.map((k) => (
              <tr key={k} className="text-muted">
                <td className="pl-6">{COST_KIND_LABELS[k]}</td>
                {rows.map((r) => (
                  <td key={r.id} className="tabular text-right">
                    {euro(r.costsByKind[k])} · {pp(r.effectiveCostsByKind?.[k] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="mt-5">
          <CompareBars rows={rows} size={{ height: 260 }} />
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <Field label="Vergleich speichern als">
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Riester alt vs. Angebot" />
          </Field>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await saveComparison(title, items.map((i) => i.id), { ...common });
                setMsg(r.ok ? "Vergleich gespeichert." : `Fehler: ${r.error}`);
              })
            }
          >
            Speichern
          </Button>
          {msg && <span className="text-sm text-muted">{msg}</span>}
        </div>
      </Card>
    </div>
  );
}
