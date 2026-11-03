"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "../ui";

export function WebSearchButton({ generationId, contractStart, enabled }: { generationId: string; contractStart: string | null; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ results?: Array<{ url: string; title: string; status: string }>; remarks?: string | null; error?: string } | null>(null);
  async function run() {
    setBusy(true);
    setRes(null);
    const r = await fetch("/api/library/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ generationId, contractStart }) });
    setRes(await r.json());
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <Button variant="secondary" onClick={run} disabled={busy || !enabled}>
        {busy ? "Suche läuft (bis zu 2 Minuten) …" : "Im Web nach dem Bedingungswerk suchen"}
      </Button>
      {res?.error && <Notice tone="bad">{res.error}</Notice>}
      {res?.results && (
        <Notice tone="brand" title="Ergebnis der Websuche – nur Vorschläge, bitte prüfen">
          <ul className="list-disc space-y-1 pl-5">
            {res.results.map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noreferrer" className="underline">
                  {r.title}
                </a>{" "}
                – {r.status}
              </li>
            ))}
            {res.results.length === 0 && <li>Keine passenden Dokumente gefunden. Weiter mit manueller Erfassung oder Anforderungsschreiben.</li>}
          </ul>
          {res.remarks && <p className="mt-2 text-xs">{res.remarks}</p>}
        </Notice>
      )}
    </div>
  );
}
