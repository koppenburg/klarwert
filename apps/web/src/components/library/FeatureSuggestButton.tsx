"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "../ui";

export function FeatureSuggestButton({ docId, title, enabled }: { docId: string; title: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string; list?: string[] } | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        disabled={busy || !enabled}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await fetch(`/api/library/${docId}/extract-features`, { method: "POST" });
            const j = r.headers.get("content-type")?.includes("json") ? ((await r.json()) as { error?: string; proposed?: number; skippedConfirmed?: number; rejected?: string[]; remarks?: string[] }) : { error: `HTTP ${r.status}` };
            setMsg(
              r.ok
                ? { tone: "ok", text: `${j.proposed} Vorschlag/Vorschläge (Merkmale, Staffeln, Rentenfaktoren) aus „${title}“.${j.skippedConfirmed ? ` ${j.skippedConfirmed} bestätigte Werte unverändert.` : ""}`, list: [...(j.rejected ?? []), ...(j.remarks ?? [])] }
                : { tone: "bad", text: j.error ?? "Fehler" },
            );
          } finally {
            setBusy(false);
            router.refresh();
          }
        }}
      >
        {busy ? "KI liest das Bedingungswerk …" : `Merkmale, Staffeln und Rentenfaktoren aus „${title}“ vorschlagen lassen`}
      </Button>
      {msg && (
        <Notice tone={msg.tone}>
          <p>{msg.text}</p>
          {msg.list?.length ? (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {msg.list.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      )}
    </div>
  );
}
