"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";

export function GenerateReportButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string[] | null>(null);
  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/report`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; messages?: string[] };
        setError([body.error ?? `Fehler ${res.status}`, ...(body.messages ?? [])]);
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "Klarwert-Analyse.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button onClick={generate} disabled={busy}>
        {busy ? "PDF wird erzeugt …" : "PDF erzeugen"}
      </Button>
      {error && (
        <Notice tone="bad" title={error[0]}>
          <ul className="list-disc pl-5">
            {error.slice(1).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}
