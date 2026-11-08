"use client";

import { TIER_BASIS_LABELS, isTieredValue, type TierBasis } from "@klarwert/calc";
import { formatAnnuityTable, isAnnuityTable, tierToInput } from "@klarwert/extraction/values";
import { useState } from "react";
import { inputClass } from "../ui";

export type ValueMode = "plain" | "tier" | "table";

export interface ValueEditorState {
  raw: string;
  mode: ValueMode;
  tierBasis: TierBasis;
}

export interface ValueEditorProps {
  type: "number" | "boolean" | "enum" | "table" | "list";
  tierable?: boolean;
  nullable?: boolean;
  options?: readonly string[];
  optionLabels?: Record<string, string>;
  initial: unknown;
  onChange: (s: ValueEditorState) => void;
}

function initialRaw(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (isTieredValue(v)) return tierToInput(v);
  if (isAnnuityTable(v)) return formatAnnuityTable(v);
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return v.toLocaleString("de-DE", { maximumFractionDigits: 6, useGrouping: false });
  return String(v);
}

/** Startzustand des Editors aus einem gespeicherten Wert (auch für Aufrufer, die nur die Fundstelle ändern). */
export function initialEditorState(type: ValueEditorProps["type"], initial: unknown): ValueEditorState {
  return {
    raw: initialRaw(initial),
    mode: type === "table" ? "table" : isTieredValue(initial) ? "tier" : "plain",
    tierBasis: isTieredValue(initial) ? initial.basis : "monthly_premium",
  };
}

/** Eingabe für Kostenwerte und Tarifmerkmale: Einzelwert, Beitragsstaffel oder Rentenfaktor-Tabelle. */
export function ValueEditor(p: ValueEditorProps) {
  const [state, setState] = useState<ValueEditorState>(() => initialEditorState(p.type, p.initial));
  const update = (patch: Partial<ValueEditorState>) => {
    const next = { ...state, ...patch };
    setState(next);
    p.onChange(next);
  };
  if (p.type === "table") {
    return (
      <div className="space-y-1">
        <textarea value={state.raw} onChange={(e) => update({ raw: e.target.value, mode: "table" })} rows={3} className={inputClass} placeholder="65: 25,0 / 30,0; 67: 27,0 / 32,0" />
        <p className="text-xs text-muted">Je Zeile oder mit „;“ getrennt: Alter: garantiert / aktuell (aktuell optional).</p>
      </div>
    );
  }
  if (p.type === "enum" || p.type === "boolean") {
    const opts = p.type === "boolean" ? ["true", "false"] : (p.options ?? []);
    const labels = p.type === "boolean" ? { true: "ja", false: "nein" } : (p.optionLabels ?? {});
    return (
      <select value={state.raw} onChange={(e) => update({ raw: e.target.value })} className={inputClass}>
        <option value="">{p.nullable || p.type === "boolean" ? "– nicht geregelt –" : "–"}</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {(labels as Record<string, string>)[o] ?? o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div className="space-y-1">
      {p.tierable && (
        <div className="flex gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input type="radio" checked={state.mode === "plain"} onChange={() => update({ mode: "plain" })} /> ein Wert
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={state.mode === "tier"} onChange={() => update({ mode: "tier" })} /> Staffel nach Beitrag
          </label>
        </div>
      )}
      {state.mode === "tier" ? (
        <>
          <select value={state.tierBasis} onChange={(e) => update({ tierBasis: e.target.value as TierBasis })} className={inputClass}>
            {(Object.keys(TIER_BASIS_LABELS) as TierBasis[]).map((b) => (
              <option key={b} value={b}>
                Bezugsgröße: {TIER_BASIS_LABELS[b]}
              </option>
            ))}
          </select>
          <textarea value={state.raw} onChange={(e) => update({ raw: e.target.value })} rows={3} className={inputClass} placeholder="0: 6; 100: 5; 250: 4" />
          <p className="text-xs text-muted">„ab-Betrag in €: Wert“, getrennt mit „;“ oder Zeilenumbruch. Die erste Stufe beginnt bei 0.</p>
        </>
      ) : (
        <input
          value={state.raw}
          onChange={(e) => update({ raw: e.target.value })}
          className={inputClass}
          placeholder={p.type === "list" ? "z. B. 0, 80, 100" : p.nullable ? "leer = nicht angegeben" : "0 = keine Kosten dieser Art"}
        />
      )}
    </div>
  );
}
