"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { acceptCandidate, rejectCandidate } from "@/app/(app)/bibliothek/recherche/actions";
import { prioritizeDocuments } from "@/lib/document-priority";
import { LibraryUpload } from "../library/LibraryUpload";
import { BulkUpload } from "./BulkUpload";
import { Badge, Button, Card, inputClass, Notice, Table } from "../ui";

export interface InsurerView {
  id: string;
  name: string;
  aliases: string[];
  last_research_at: string | null;
  last_research_remarks: string | null;
}

export interface CandidateView {
  id: string;
  insurerId: string;
  name: string;
  code: string | null;
  layer: string | null;
  productType: string | null;
  generationLabel: string | null;
  salesStatus: string | null;
  productUrl: string | null;
  documentLinks: Array<{ url: string; title: string; kind: string; fromSearchResults?: boolean }>;
  reason: string | null;
  status: "candidate" | "accepted" | "rejected";
  generationId: string | null;
  libraryDocs: Array<{ id: string; title: string; kind: string; status: string; sourceUrl: string | null }>;
}

const LAYER_LABELS: Record<string, string> = { riester: "gefördert", basis: "Basisrente", layer3: "Schicht 3", bav: "bAV" };

async function postJson(url: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = r.headers.get("content-type")?.includes("json") ? ((await r.json()) as Record<string, unknown>) : { error: `HTTP ${r.status} (Zeitüberschreitung oder Serverfehler)` };
    return { ok: r.ok, data };
  } catch (e) {
    return { ok: false, data: { error: e instanceof Error ? e.message : "Netzwerkfehler" } };
  }
}

interface FetchOutcome {
  text: string;
  failures: string[];
  blocked?: string[];
}

async function fetchDocuments(id: string, search = false): Promise<FetchOutcome> {
  const r = await postJson(`/api/research/candidates/${id}/documents`, { search });
  if (!r.ok) return { text: String(r.data.error), failures: [] };
  const results = (r.data.results as Array<{ url: string; title: string; status: string }> | undefined) ?? [];
  const stored = Number(r.data.stored ?? 0);
  const blocked = (r.data.blockedHosts as string[] | undefined) ?? [];
  return {
    text: `${stored} von ${results.length} Dokument(en) automatisch geladen${r.data.searched ? " (Links über Produktseite/Suche ermittelt)" : ""}${Number(r.data.dropped) ? `, ${r.data.dropped} unbelegte Link(s) verworfen` : ""}.`,
    failures: results.filter((x) => x.status.startsWith("nicht")).map((x) => `${x.title}: ${x.status.replace(/^nicht abrufbar: /, "")}`),
    blocked,
  };
}

function Outcome({ o }: { o: FetchOutcome }) {
  return (
    <div className="mt-1 text-muted">
      <p>{o.text}</p>
      {o.blocked && o.blocked.length > 0 && (
        <p className="text-warn">
          {o.blocked.join(", ")} sperrt automatische Abrufe. Bitte die Dokumente im Browser öffnen, speichern und über den Sammel-Upload des Versicherers (oder hier einzeln) hochladen.
        </p>
      )}
      {o.failures.length > 0 && (
        <details>
          <summary className="cursor-pointer text-warn">{o.failures.length} nicht geladen – Gründe</summary>
          <ul className="list-disc pl-4">
            {o.failures.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function LinkList({ links }: { links: CandidateView["documentLinks"] }) {
  const [all, setAll] = useState(false);
  const top = prioritizeDocuments(links, 8);
  const shown = all ? links : top;
  return (
    <div className="mt-1">
      <p className="font-medium text-ink">Gefundene Dokumente ({links.length}):</p>
      <ul className="space-y-0.5">
        {shown.map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noreferrer" className="text-brand underline">
              {l.title}
            </a>{" "}
            <span className="text-muted">({l.kind})</span>
          </li>
        ))}
      </ul>
      {links.length > top.length && (
        <button type="button" className="text-xs text-brand" onClick={() => setAll(!all)}>
          {all ? "nur wichtigste anzeigen" : `alle ${links.length} anzeigen`}
        </button>
      )}
    </div>
  );
}

function CandidateRow({ c, enabled, bulkMsg }: { c: CandidateView; enabled: boolean; bulkMsg?: FetchOutcome }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<FetchOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState(c.generationLabel ?? "");
  const [pending, start] = useTransition();
  return (
    <tr className="align-top">
      <td>
        <span className="font-medium">{c.name}</span>
        {c.code && <span className="text-muted"> ({c.code})</span>}
        <div className="mt-1 flex flex-wrap gap-1">
          {c.layer && <Badge>{LAYER_LABELS[c.layer] ?? c.layer}</Badge>}
          {c.productType && <Badge>{c.productType}</Badge>}
          {c.salesStatus && <Badge tone={c.salesStatus === "im Vertrieb" ? "ok" : c.salesStatus === "unklar" ? "warn" : "neutral"}>{c.salesStatus}</Badge>}
          {c.status === "accepted" && <Badge tone="brand">im Katalog</Badge>}
        </div>
        {c.reason && <p className="mt-1 text-xs text-muted">{c.reason}</p>}
        {c.productUrl && (
          <a href={c.productUrl} target="_blank" rel="noreferrer" className="mt-1 block max-w-xs truncate text-xs text-brand underline">
            {c.productUrl}
          </a>
        )}
      </td>
      <td className="text-xs">
        {c.libraryDocs.length > 0 ? (
          <ul className="space-y-1">
            {c.libraryDocs.map((d) => (
              <li key={d.id}>
                {d.title} <Badge tone={d.status === "confirmed" ? "ok" : "warn"}>{d.status === "confirmed" ? "bestätigt" : "Kandidat"}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted">{c.documentLinks.length ? "noch nicht in der Bibliothek" : "noch keine Dokumente – „Dokumente holen“ ermittelt die Links über die Produktseite"}</span>
        )}
        {c.documentLinks.length > 0 && <LinkList links={c.documentLinks} />}
        {(msg ?? bulkMsg) && <Outcome o={(msg ?? bulkMsg) as FetchOutcome} />}
        <details className="mt-2">
          <summary className="cursor-pointer text-brand">PDF aus dem Browser hochladen</summary>
          <div className="mt-2">
            <LibraryUpload generationId={c.generationId} tariffCandidateId={c.id} defaultTitle={c.name} compact />
          </div>
        </details>
        {error && <p className="mt-1 text-bad">{error}</p>}
      </td>
      <td className="w-64">
        <div className="space-y-2">
          <Button
            variant="secondary"
            disabled={busy || (!enabled && c.documentLinks.length === 0)}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              setMsg(await fetchDocuments(c.id));
              setBusy(false);
              router.refresh();
            }}
          >
            {busy ? "lädt …" : "Dokumente holen"}
          </Button>
          {c.documentLinks.length > 0 && (
            <button
              type="button"
              disabled={busy || !enabled}
              className="block text-xs text-brand underline disabled:opacity-50"
              onClick={async () => {
                setBusy(true);
                setMsg(await fetchDocuments(c.id, true));
                setBusy(false);
                router.refresh();
              }}
            >
              Links neu suchen (KI)
            </button>
          )}
          {c.status === "candidate" ? (
            <>
              <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} placeholder="Generation/Stand, z. B. 01.2026" />
              <div className="flex gap-1">
                <Button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await acceptCandidate(c.id, label);
                      if (r.error) setError(r.error);
                      else router.push(`/bibliothek/${r.generationId}`);
                    })
                  }
                >
                  In Katalog übernehmen
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => start(() => rejectCandidate(c.id))}>
                  Verwerfen
                </Button>
              </div>
            </>
          ) : c.generationId ? (
            <Link href={`/bibliothek/${c.generationId}`} className="text-sm text-brand underline">
              Tarifdetails öffnen
            </Link>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function ResearchPanel({ insurers, candidates, enabled }: { insurers: InsurerView[]; candidates: CandidateView[]; enabled: boolean }) {
  const router = useRouter();
  const [layers, setLayers] = useState<string[]>(["riester", "basis", "layer3", "bav"]);
  const [running, setRunning] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [bulk, setBulk] = useState<Record<string, FetchOutcome>>({});
  const stop = useRef(false);

  async function documentsForAll(ins: InsurerView) {
    stop.current = false;
    setRunning(ins.id);
    const list = candidates.filter((c) => c.insurerId === ins.id && c.status !== "rejected" && c.libraryDocs.length === 0);
    for (const [i, c] of list.entries()) {
      if (stop.current) break;
      setBulk((b) => ({ ...b, [c.id]: { text: `lädt … (${i + 1}/${list.length})`, failures: [] } }));
      const m = await fetchDocuments(c.id);
      setBulk((b) => ({ ...b, [c.id]: m }));
    }
    setLog((l) => [...l, `${ins.name}: Dokumentsuche für ${list.length} Vorschlag/Vorschläge abgeschlossen.`]);
    setRunning(null);
    router.refresh();
  }

  async function research(ins: InsurerView): Promise<void> {
    setRunning(ins.id);
    const r = await postJson(`/api/research/insurers/${ins.id}`, { layers });
    setLog((l) => [
      ...l,
      r.ok ? `${ins.name}: ${r.data.found} Tarif(e) gefunden, ${r.data.created} neu, ${r.data.updated} aktualisiert${r.data.inCatalog ? `, ${r.data.inCatalog} bereits im Katalog` : ""}.` : `${ins.name}: ${String(r.data.error)}`,
    ]);
    setRunning(null);
    router.refresh();
  }

  async function researchAll(onlyNew: boolean) {
    stop.current = false;
    for (const ins of insurers.filter((i) => !onlyNew || !i.last_research_at)) {
      if (stop.current) break;
      await research(ins);
    }
  }

  const toggle = (l: string) => setLayers((x) => (x.includes(l) ? x.filter((y) => y !== l) : [...x, l]));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/bibliothek" className="text-sm text-brand">
          ← Tarifkatalog
        </Link>
        <h1 className="text-2xl font-semibold">Tarifrecherche</h1>
        <p className="text-sm text-muted">
          Die KI sucht je Versicherer auf dessen Website nach aktuellen Altersvorsorgetarifen und den zugehörigen Dokumenten. Alles hier sind Vorschläge mit Quelle: Tarife werden erst nach
          „In Katalog übernehmen“ angelegt, Dokumente und Kostenwerte erst nach deiner Bestätigung verwendet.
        </p>
      </div>
      {!enabled && <Notice tone="bad">ANTHROPIC_API_KEY ist nicht gesetzt – Recherche nicht verfügbar.</Notice>}
      {insurers.length === 0 && <Notice>Noch keine Versicherer im Katalog. Unter „Tarifkatalog & Bibliothek“ die Startliste laden.</Notice>}
      <Card title="Recherche starten">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="font-medium">Schichten:</span>
          {Object.entries(LAYER_LABELS).map(([k, l]) => (
            <label key={k} className="flex items-center gap-1">
              <input type="checkbox" checked={layers.includes(k)} onChange={() => toggle(k)} /> {l}
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={!enabled || running !== null} onClick={() => researchAll(true)}>
            Alle noch nicht recherchierten Versicherer nacheinander
          </Button>
          <Button variant="secondary" disabled={!enabled || running !== null} onClick={() => researchAll(false)}>
            Alle Versicherer erneut
          </Button>
          {running && (
            <Button variant="danger" onClick={() => (stop.current = true)}>
              Nach dem laufenden Versicherer anhalten
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          Je Versicherer etwa 1–2 Minuten und einige Websuchen auf dem Anthropic-Konto; „Dokumente holen“ öffnet je Vorschlag die Produktseite (etwa 1–2 Minuten je Vorschlag). Laufende Vorgänge lassen sich nach dem aktuellen Schritt anhalten.
        </p>
        {log.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </Card>
      {insurers.map((ins) => {
        const list = candidates.filter((c) => c.insurerId === ins.id);
        return (
          <Card
            key={ins.id}
            title={
              <span className="flex items-center gap-2">
                {ins.name}
                {ins.last_research_at ? <Badge>zuletzt {new Date(ins.last_research_at).toLocaleDateString("de-DE")}</Badge> : <Badge tone="warn">noch nicht recherchiert</Badge>}
                {list.length > 0 && <Badge tone="brand">{list.length} Tarif(e)</Badge>}
              </span>
            }
            actions={
              <span className="flex gap-2">
                {list.some((c) => c.libraryDocs.length === 0) && (
                  <Button variant="secondary" disabled={!enabled || running !== null} onClick={() => documentsForAll(ins)}>
                    Dokumente für alle Vorschläge holen
                  </Button>
                )}
                <Button variant="secondary" disabled={!enabled || running !== null} onClick={() => research(ins)}>
                  {running === ins.id ? "läuft …" : "Tarife recherchieren"}
                </Button>
              </span>
            }
          >
            {ins.last_research_remarks && <p className="mb-2 text-xs text-muted">Hinweis der Recherche: {ins.last_research_remarks}</p>}
            {list.length > 0 && (
              <details className="mb-3 rounded-md border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium text-brand">Sammel-Upload: im Browser gespeicherte PDFs auf einmal zuordnen</summary>
                <div className="mt-3">
                  <BulkUpload insurerId={ins.id} candidates={list.map((c) => ({ id: c.id, name: c.name, generationId: c.generationId }))} />
                </div>
              </details>
            )}
            {list.length ? (
              <Table>
                <thead>
                  <tr>
                    <th>Tarif (Vorschlag)</th>
                    <th>Dokumente</th>
                    <th>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <CandidateRow key={c.id} c={c} enabled={enabled} bulkMsg={bulk[c.id]} />
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-muted">Keine Vorschläge.</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
