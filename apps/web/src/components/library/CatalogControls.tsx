"use client";

import { useState, useTransition } from "react";
import { seedInsurers, updateAliases } from "@/app/(app)/bibliothek/actions";
import { Button, inputClass } from "../ui";

export function SeedButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted">{msg}</span>}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await seedInsurers();
            setMsg(`${r.added} Versicherer ergänzt`);
          })
        }
      >
        Startliste Versicherer laden
      </Button>
    </span>
  );
}

export function AliasEditor({ table, id, aliases }: { table: "insurers" | "tariffs" | "tariff_generations"; id: string; aliases: string[] }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(aliases.join(", "));
  const [pending, start] = useTransition();
  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="block text-left text-xs text-muted hover:text-brand">
        Aliase: {aliases.length ? aliases.join(", ") : "–"} ✎
      </button>
    );
  return (
    <span className="mt-1 flex gap-1">
      <input value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
      <Button disabled={pending} onClick={() => start(async () => { await updateAliases(table, id, value); setEditing(false); })}>
        OK
      </Button>
    </span>
  );
}
