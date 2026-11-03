"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "../ui";

export function CostSuggestButton({ docId, title, enabled }: { docId: string; title: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        disabled={busy || !enabled}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await fetch(`/api/library/${docId}/extract-costs`, { method: "POST" });
          const j = (await r.json()) as { error?: string; proposed?: number; skippedConfirmed?: number; notFound?: string[] };
          setBusy(false);
          setMsg(r.ok ? { tone: "ok", text: `${j.proposed} Vorschlag/Vorschläge aus „${title}“. ${j.skippedConfirmed ? `${j.skippedConfirmed} bereits bestätigte Werte unverändert. ` : ""}${j.notFound?.length ? `Nicht gefunden: ${j.notFound.join(", ")}` : ""}` } : { tone: "bad", text: j.error ?? "Fehler" });
          router.refresh();
        }}
      >
        {busy ? "KI liest das Bedingungswerk …" : `Kostenklauseln aus „${title}“ vorschlagen lassen`}
      </Button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
