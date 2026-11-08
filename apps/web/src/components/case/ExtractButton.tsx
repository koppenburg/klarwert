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
    let res: Response;
    let j: { error?: string; fields?: number; costProposals?: number; originalsDeleted?: number; notes?: string[] };
    try {
      res = await fetch(`/api/cases/${caseId}/extract`, { method: "POST" });
      j = res.headers.get("content-type")?.includes("json") ? await res.json() : { error: `Server antwortete mit HTTP ${res.status} (Zeitüberschreitung oder Serverfehler).` };
    } catch (e) {
      setBusy(false);
      setMsg({ tone: "bad", text: `Erkennung fehlgeschlagen: ${e instanceof Error ? e.message : "Netzwerkfehler"}` });
      return;
    }
    setBusy(false);
    if (!res.ok) {
      setMsg({ tone: "bad", text: `Erkennung fehlgeschlagen: ${j.error ?? "unbekannter Fehler"}` });
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
