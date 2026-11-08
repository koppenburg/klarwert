"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button, Field, inputClass, Notice } from "../ui";

const KINDS = [
  ["avb", "Allgemeine Versicherungsbedingungen"],
  ["tarifbestimmungen", "Tarifbestimmungen"],
  ["kostenblatt", "Kosteninformation / Kostenblatt"],
  ["pib", "Produktinformationsblatt"],
  ["sonstiges", "Sonstiges"],
] as const;

/** Bedingungswerk als PDF in die Bibliothek laden (direkt in den privaten Bucket, dann Texterfassung). */
export function LibraryUpload({ generationId, tariffCandidateId = null, defaultTitle = "", compact = false }: { generationId: string | null; tariffCandidateId?: string | null; defaultTitle?: string; compact?: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState("avb");
  const [title, setTitle] = useState(defaultTitle);
  const [confirmed, setConfirmed] = useState(!tariffCandidateId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function run() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const path = `${generationId ?? "ohne-generation"}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const up = await supabaseBrowser().storage.from("library").upload(path, file, { contentType: "application/pdf" });
      if (up.error) throw new Error(up.error.message);
      const res = await fetch("/api/library/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storagePath: path, generationId, kind, title: title || file.name, confirmed, tariffCandidateId }),
      });
      const j = (await res.json()) as { error?: string; pageCount?: number; duplicateOf?: string };
      if (!res.ok) throw new Error(j.error ?? "Fehler");
      setMsg({ tone: "ok", text: j.duplicateOf ? "Dieses Dokument liegt bereits in der Bibliothek." : `Abgelegt, ${j.pageCount} Seiten durchsuchbar.` });
      setFile(null);
      setTitle(defaultTitle);
      router.refresh();
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "Upload fehlgeschlagen" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className={compact ? "grid gap-2" : "grid gap-3 md:grid-cols-3"}>
        <Field label="PDF">
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={inputClass} />
        </Field>
        <Field label="Art">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Titel">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="z. B. AVB FondsRente Stand 01/2019" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Ich bestätige, dass dies das gültige Bedingungswerk dieser Tarifgeneration ist.
      </label>
      <Button onClick={run} disabled={!file || busy}>
        {busy ? "Wird abgelegt …" : "In Bibliothek ablegen"}
      </Button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
