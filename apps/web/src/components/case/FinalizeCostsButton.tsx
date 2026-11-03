"use client";

import { useState, useTransition } from "react";
import { finalizeCosts } from "@/app/(app)/faelle/[id]/actions";
import { Button, Notice } from "../ui";

export function FinalizeCostsButton({ caseId, ready, done }: { caseId: string; ready: boolean; done: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        disabled={pending || !ready}
        onClick={() =>
          start(async () => {
            const r = await finalizeCosts(caseId);
            setError(r.error ?? null);
          })
        }
      >
        {done ? "Erneut abschließen" : "Kostenfaktoren abschließen – Berechnung freigeben"}
      </Button>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}
