"use client";

import { useState, useTransition } from "react";
import { confirmField, deleteField, saveField, unconfirmField } from "@/app/(app)/faelle/[id]/actions";
import { dateDe, formatValue } from "@/lib/format";
import { Badge, Button, inputClass } from "../ui";

export interface FieldRowProps {
  caseId: string;
  fieldKey: string;
  label: string;
  type: string;
  unit?: string;
  options?: readonly string[];
  optionLabels?: Record<string, string>;
  required?: boolean;
  value: unknown;
  status: "proposed" | "confirmed" | null;
  confidence: number | null;
  sourceLabel: string | null;
  quote: string | null;
}

function toInput(v: unknown, type: string): string {
  if (v === null || v === undefined) return "";
  if (type === "date" && typeof v === "string") return dateDe(v);
  if (type === "json") return JSON.stringify(v);
  if (typeof v === "number") return v.toLocaleString("de-DE", { maximumFractionDigits: 6, useGrouping: false });
  return String(v);
}

export function FieldRow(p: FieldRowProps) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(toInput(p.value, p.type));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const conf = p.confidence ?? null;
  const save = (confirm: boolean) =>
    start(async () => {
      const r = await saveField(p.caseId, p.fieldKey, val, note || null, confirm);
      if (r.error) setError(r.error);
      else {
        setError(null);
        setEditing(false);
      }
    });
  return (
    <tr className={p.status === "confirmed" ? "bg-green-50/40" : undefined}>
      <td className="align-top">
        <span className="font-medium">{p.label}</span>
        {p.required && <span className="text-bad"> *</span>}
        {p.unit && <span className="text-xs text-muted"> ({p.unit})</span>}
      </td>
      <td className="align-top">
        {editing ? (
          <div className="space-y-2">
            {p.options ? (
              <select value={val} onChange={(e) => setVal(e.target.value)} className={inputClass}>
                <option value="">–</option>
                {p.options.map((o) => (
                  <option key={o} value={o}>
                    {p.optionLabels?.[o] ?? o}
                  </option>
                ))}
              </select>
            ) : (
              <input value={val} onChange={(e) => setVal(e.target.value)} className={inputClass} placeholder={p.type === "date" ? "TT.MM.JJJJ" : undefined} />
            )}
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="Fundstelle / Begründung (z. B. „Standmitteilung S. 2“)" />
            {error && <p className="text-xs text-bad">{error}</p>}
          </div>
        ) : (
          <span className="tabular">{p.value === undefined ? <span className="text-muted">nicht erkannt</span> : formatValue(p.optionLabels && typeof p.value === "string" ? (p.optionLabels[p.value] ?? p.value) : p.value, p.type === "number" ? p.unit : undefined)}</span>
        )}
      </td>
      <td className="align-top text-xs">
        {conf !== null && <Badge tone={conf >= 0.85 ? "ok" : conf >= 0.6 ? "warn" : "bad"}>{Math.round(conf * 100)} %</Badge>}
      </td>
      <td className="max-w-xs align-top text-xs text-muted">
        {p.sourceLabel ?? "–"}
        {p.quote && <q className="mt-1 block italic">{p.quote}</q>}
      </td>
      <td className="align-top">
        <div className="flex flex-wrap justify-end gap-1">
          {editing ? (
            <>
              <Button disabled={pending} onClick={() => save(true)}>
                Speichern & bestätigen
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
            </>
          ) : (
            <>
              {p.status === "proposed" && (
                <Button disabled={pending} onClick={() => start(() => confirmField(p.caseId, p.fieldKey))}>
                  Bestätigen
                </Button>
              )}
              {p.status === "confirmed" && <Badge tone="ok">bestätigt</Badge>}
              <Button variant="secondary" disabled={pending} onClick={() => setEditing(true)}>
                {p.status ? "Korrigieren" : "Erfassen"}
              </Button>
              {p.status === "confirmed" && (
                <Button variant="ghost" disabled={pending} onClick={() => start(() => unconfirmField(p.caseId, p.fieldKey))}>
                  Zurücksetzen
                </Button>
              )}
              {p.status && !p.required && (
                <Button variant="ghost" disabled={pending} onClick={() => start(() => deleteField(p.caseId, p.fieldKey))}>
                  Entfernen
                </Button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
