"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "../ui";

export function ExtractButton({ caseId, disabled, label = "Erkennung starten" }: { caseId: string; disabled?: boolean; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string; notes?: string[] } | null>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/cases/${caseId}/extract`, { method: "POST" });
    const j = (await res.json()) as { error?: string; fields?: number; costProposals?: number; originalsDeleted?: number; notes?: string[] };
    setBusy(false);
    if (!res.ok) {
      setMsg({ tone: "bad", text: j.error ?? "Erkennung fehlgeschlagen" });
      return;
    }
    setMsg({ tone: "ok", text: `${j.fields} Feld(er) erkannt, ${j.costProposals} Kostenvorschlag/-vorschläge aus den Unterlagen, ${j.originalsDeleted} Original(e) gelöscht.`, notes: j.notes });
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <Button onClick={run} disabled={busy || disabled}>
        {busy ? "KI liest die bereinigten Unterlagen …" : label}
      </Button>
      {msg && (
        <Notice tone={msg.tone}>
          <p>{msg.text}</p>
          {msg.notes?.length ? (
            <ul className="mt-2 list-disc pl-5">
              {msg.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      )}
    </div>
  );
}
