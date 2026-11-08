"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DOC_KIND_LABELS, type DocKind, type MatchResult } from "@/lib/document-match";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { cx, Badge, Button, inputClass, Notice, Table } from "../ui";

interface CandidateOption {
  id: string;
  name: string;
  generationId: string | null;
}

type RowStatus = "lädt hoch" | "wird gelesen" | "bereit" | "wird abgelegt" | "abgelegt" | "verworfen" | "Fehler";

interface Row {
  key: string;
  fileName: string;
  status: RowStatus;
  storagePath?: string;
  candidateId: string;
  kind: DocKind;
  title: string;
  sourceUrl: string | null;
  confidence?: MatchResult["confidence"];
  reason?: string;
  ranking: MatchResult["ranking"];
  duplicate?: { id: string; title: string } | null;
  error?: string;
}

const CONFIDENCE_TONE = { sicher: "ok", wahrscheinlich: "warn", offen: "bad" } as const;
const MAX_BYTES = 40 * 1024 * 1024;

function isPdf(f: File) {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
}

/**
 * Sammel-Upload je Versicherer: der Berater lädt die PDFs, die er im Browser gespeichert hat, auf einmal hoch.
 * Klarwert schlägt je Datei Tarif, Art und Titel vor (ohne KI); abgelegt wird erst nach Bestätigung, immer als Kandidat.
 */
export function BulkUpload({ insurerId, candidates }: { insurerId: string; candidates: CandidateOption[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [drag, setDrag] = useState(false);
  const [working, setWorking] = useState(false);

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  async function analyze(files: File[]) {
    const fresh: Row[] = files.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`,
      fileName: f.name,
      status: "lädt hoch",
      candidateId: "",
      kind: "sonstiges",
      title: f.name,
      sourceUrl: null,
      ranking: [],
    }));
    setRows((rs) => [...rs, ...fresh]);
    setWorking(true);
    const storage = supabaseBrowser().storage.from("library");
    for (const [i, f] of files.entries()) {
      const row = fresh[i];
      if (!row) continue;
      if (!isPdf(f)) {
        patch(row.key, { status: "Fehler", error: "keine PDF-Datei" });
        continue;
      }
      if (f.size > MAX_BYTES) {
        patch(row.key, { status: "Fehler", error: "größer als 40 MB" });
        continue;
      }
      const path = `recherche/${insurerId}/${Date.now()}-${i}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const up = await storage.upload(path, f, { contentType: "application/pdf" });
      if (up.error) {
        patch(row.key, { status: "Fehler", error: up.error.message });
        continue;
      }
      patch(row.key, { status: "wird gelesen", storagePath: path });
      try {
        const res = await fetch(`/api/research/insurers/${insurerId}/match`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storagePath: path, fileName: f.name }),
        });
        const j = (await res.json()) as MatchResult & { error?: string; duplicate?: Row["duplicate"] };
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        patch(row.key, {
          status: "bereit",
          candidateId: j.candidateId ?? "",
          kind: j.kind,
          title: j.title,
          sourceUrl: j.sourceUrl,
          confidence: j.confidence,
          reason: j.reason,
          ranking: j.ranking,
          duplicate: j.duplicate ?? null,
        });
      } catch (e) {
        patch(row.key, { status: "Fehler", error: e instanceof Error ? e.message : "Analyse fehlgeschlagen" });
      }
    }
    setWorking(false);
  }

  async function save(r: Row): Promise<boolean> {
    const cand = candidates.find((c) => c.id === r.candidateId);
    if (!cand || !r.storagePath) return false;
    patch(r.key, { status: "wird abgelegt" });
    try {
      const res = await fetch("/api/library/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storagePath: r.storagePath,
          generationId: cand.generationId,
          kind: r.kind,
          title: r.title || r.fileName,
          confirmed: false,
          tariffCandidateId: cand.id,
          sourceUrl: r.sourceUrl,
        }),
      });
      const j = (await res.json()) as { error?: string; duplicateOf?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      patch(r.key, { status: "abgelegt", reason: j.duplicateOf ? "lag bereits in der Bibliothek, dem Tarif zugeordnet" : r.reason });
      return true;
    } catch (e) {
      patch(r.key, { status: "Fehler", error: e instanceof Error ? e.message : "Ablage fehlgeschlagen" });
      return false;
    }
  }

  async function discard(r: Row) {
    if (r.storagePath) await supabaseBrowser().storage.from("library").remove([r.storagePath]);
    patch(r.key, { status: "verworfen" });
  }

  async function saveAll() {
    setWorking(true);
    for (const r of rows.filter((x) => x.status === "bereit" && x.candidateId)) await save(r);
    setWorking(false);
    router.refresh();
  }

  const ready = rows.filter((r) => r.status === "bereit");
  const assignable = ready.filter((r) => r.candidateId);
  const nameOf = (id: string) => candidates.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">
        Links der Vorschläge im Browser öffnen, PDFs speichern (Dateinamen am besten nicht ändern) und dann alle zusammen hier ablegen. Klarwert ordnet jede Datei anhand von
        Dateiname, gefundenen Links und Text der ersten Seiten einem Tarif zu – ohne KI und ohne Kosten. Du prüfst die Zuordnung; abgelegt wird als Kandidat.
      </p>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length) void analyze(files);
        }}
        className={cx("flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center", drag ? "border-brand bg-brand/5" : "border-line")}
      >
        <span className="font-medium">PDFs hierher ziehen oder klicken zum Auswählen</span>
        <span className="text-xs text-muted">mehrere Dateien möglich, je höchstens 40 MB</span>
        <input
          type="file"
          multiple
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void analyze(files);
          }}
        />
      </label>
      {rows.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <th>Datei</th>
                <th>Tarif</th>
                <th>Art</th>
                <th>Titel</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const editable = r.status === "bereit";
                const ranked = [...r.ranking.map((x) => x.candidateId), ...candidates.map((c) => c.id)].filter((id, i, a) => a.indexOf(id) === i);
                return (
                  <tr key={r.key} className={cx("align-top", (r.status === "verworfen" || r.status === "abgelegt") && "opacity-60")}>
                    <td className="max-w-48 break-words text-xs">
                      {r.fileName}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.confidence && editable && <Badge tone={CONFIDENCE_TONE[r.confidence]}>{r.confidence === "offen" ? "bitte zuordnen" : r.confidence}</Badge>}
                        {!editable && <Badge tone={r.status === "abgelegt" ? "ok" : r.status === "Fehler" ? "bad" : "neutral"}>{r.status}</Badge>}
                      </div>
                      {r.reason && <p className="mt-1 text-muted">{r.reason}</p>}
                      {r.duplicate && editable && <p className="mt-1 text-warn">liegt schon in der Bibliothek („{r.duplicate.title}“)</p>}
                      {r.error && <p className="mt-1 text-bad">{r.error}</p>}
                    </td>
                    <td>
                      <select value={r.candidateId} disabled={!editable} onChange={(e) => patch(r.key, { candidateId: e.target.value })} className={inputClass}>
                        <option value="">– bitte wählen –</option>
                        {ranked.map((id) => (
                          <option key={id} value={id}>
                            {nameOf(id)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select value={r.kind} disabled={!editable} onChange={(e) => patch(r.key, { kind: e.target.value as DocKind })} className={inputClass}>
                        {Object.entries(DOC_KIND_LABELS).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input value={r.title} disabled={!editable} onChange={(e) => patch(r.key, { title: e.target.value })} className={inputClass} />
                    </td>
                    <td className="w-32">
                      {editable && (
                        <div className="space-y-1">
                          <Button variant="secondary" disabled={!r.candidateId || working} onClick={async () => (await save(r)) && router.refresh()}>
                            Ablegen
                          </Button>
                          <button type="button" className="block text-xs text-muted underline" onClick={() => discard(r)}>
                            Verwerfen
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={working || assignable.length === 0} onClick={saveAll}>
              {working ? "läuft …" : `Alle zugeordneten ablegen (${assignable.length})`}
            </Button>
            {ready.length > assignable.length && <span className="text-xs text-warn">{ready.length - assignable.length} Datei(en) noch ohne Tarif</span>}
          </div>
          {candidates.length === 0 && <Notice>Für diesen Versicherer gibt es noch keine Vorschläge. Bitte zuerst „Tarife recherchieren“.</Notice>}
        </>
      )}
    </div>
  );
}
