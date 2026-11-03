"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";

function parseDe(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function show(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v).replace(".", ",");
}

/** Zahleneingabe mit deutschem Komma; meldet nur gültige Werte (null = leer). */
export function NumInput({
  value,
  onChange,
  allowEmpty = false,
  step,
  className,
  ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  allowEmpty?: boolean;
  step?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const [raw, setRaw] = useState(show(value));
  // externen Wert übernehmen, ohne die Eingabe beim Tippen zu überschreiben (Ableitung während des Renderns)
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (parseDe(raw) !== value) setRaw(show(value));
  }
  return (
    <input
      aria-label={ariaLabel}
      inputMode="decimal"
      className={className ?? inputClass}
      value={raw}
      step={step}
      onChange={(e) => {
        setRaw(e.target.value);
        const n = parseDe(e.target.value);
        if (n !== null || (allowEmpty && e.target.value.trim() === "")) onChange(n);
      }}
    />
  );
}

/** Liste von Zahlen, z. B. „2; 4; 6“ oder Geburtsjahre „2012, 2015“. */
export function NumListInput({ value, onChange, ariaLabel }: { value: number[]; onChange: (v: number[]) => void; ariaLabel?: string }) {
  const fmt = (xs: number[]) => xs.map((x) => String(x).replace(".", ",")).join("; ");
  const [raw, setRaw] = useState(fmt(value));
  const [prevKey, setPrevKey] = useState(value.join("|"));
  if (value.join("|") !== prevKey) {
    setPrevKey(value.join("|"));
    const parsed = raw.split(/[;\s]+/).map(parseDe).filter((x): x is number => x !== null);
    if (parsed.join("|") !== value.join("|")) setRaw(fmt(value));
  }
  return (
    <input
      aria-label={ariaLabel}
      className={inputClass}
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        const parsed = e.target.value
          .split(/[;\s]+/)
          .map(parseDe)
          .filter((x): x is number => x !== null);
        onChange(parsed);
      }}
    />
  );
}
