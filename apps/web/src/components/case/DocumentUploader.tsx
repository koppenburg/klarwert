"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button, Field, inputClass, Notice } from "../ui";

const ROLES = [
  ["police", "Police / Versicherungsschein"],
  ["nachtrag", "Nachtrag"],
  ["standmitteilung", "Standmitteilung"],
  ["screenshot", "Maklerportal-Screenshot"],
  ["angebot", "Angebot"],
  ["pib", "Produktinformationsblatt"],
  ["sonstiges", "Sonstiges"],
] as const;

export function DocumentUploader({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [role, setRole] = useState<string>("police");
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setLog([]);
    const supabase = supabaseBrowser();
    try {
      for (const file of files) {
        setLog((l) => [...l, `${file.name}: wird angelegt …`]);
        const res = await fetch(`/api/cases/${caseId}/documents`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size, role, keepOriginal: keep }),
        });
        const created = (await res.json()) as { documentId?: string; originalPath?: string; mimeType?: string; error?: string };
        if (!res.ok || !created.documentId || !created.originalPath) throw new Error(created.error ?? "Anlegen fehlgeschlagen");
        const up = await supabase.storage.from("originals").upload(created.originalPath, file, { contentType: created.mimeType, upsert: true });
        if (up.error) throw new Error(`Upload: ${up.error.message}`);
        setLog((l) => [...l, `${file.name}: lokal bereinigen (OCR, Schwärzung) …`]);
        const pr = await fetch(`/api/documents/${created.documentId}/process`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ originalFileName: file.name }),
        });
        const processed = (await pr.json()) as { pages?: unknown[]; piiSummary?: Record<string, number>; error?: string };
        if (!pr.ok) throw new Error(processed.error ?? "Bereinigung fehlgeschlagen");
        const total = Object.values(processed.piiSummary ?? {}).reduce((a, b) => a + b, 0);
        setLog((l) => [...l, `${file.name}: ${processed.pages?.length ?? 0} Seite(n), ${total} personenbezogene Angabe(n) entfernt.`]);
      }
      setFiles([]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Upload");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Dateien" hint="PDF, PNG, JPG oder TXT – mehrere Dateien gehören zu diesem Vertrag">
          <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv" onChange={(e) => setFiles([...(e.target.files ?? [])])} className={inputClass} />
        </Field>
        <Field label="Dokumentart">
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
            {ROLES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Original" hint="Standard: Original wird nach der Erkennung gelöscht.">
          <label className="flex items-center gap-2 py-2">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            Original ausdrücklich behalten
          </label>
        </Field>
      </div>
      <Button onClick={run} disabled={busy || files.length === 0}>
        {busy ? "Verarbeitung läuft …" : `${files.length || ""} Datei(en) hochladen und bereinigen`}
      </Button>
      {log.length > 0 && (
        <ul className="space-y-1 text-xs text-muted">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}
