"use client";

import { describeValue } from "@klarwert/extraction/values";
import { useState, useTransition } from "react";
import { confirmGenerationItem, rejectGenerationItem, saveGenerationItem } from "@/app/(app)/bibliothek/[generationId]/actions";
import { Badge, Button, inputClass } from "../ui";
import { initialEditorState, ValueEditor, type ValueEditorProps, type ValueEditorState } from "./ValueEditor";

export interface GenerationItemView {
  id: string;
  value: unknown;
  status: "proposed" | "confirmed" | "rejected";
  sourceLabel: string;
  quote: string | null;
  note: string | null;
  confidence: number | null;
  proposedBy: "model" | "user";
}

export interface GenerationItemRowProps {
  generationId: string;
  fieldKey: string;
  label: string;
  unit?: string;
  help?: string;
  required?: boolean;
  type: ValueEditorProps["type"];
  tierable?: boolean;
  nullable?: boolean;
  options?: readonly string[];
  optionLabels?: Record<string, string>;
  item: GenerationItemView | null;
  docs: Array<{ id: string; title: string }>;
}

/** Tarifwert oder Tarifmerkmal einer Generation: anzeigen, bestätigen, verwerfen, erfassen (mit Fundstelle). */
export function GenerationItemRow(p: GenerationItemRowProps) {
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<ValueEditorState>(() => initialEditorState(p.type, p.item?.value));
  const [note, setNote] = useState("");
  const [page, setPage] = useState("");
  const [docId, setDocId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const it = p.item;
  const shown = it ? (typeof it.value === "string" && p.optionLabels?.[it.value] ? p.optionLabels[it.value] : describeValue(it.value, p.unit)) : null;
  return (
    <tr className={it?.status === "confirmed" ? "bg-green-50/40" : !it && p.required ? "bg-amber-50/40" : undefined}>
      <td className="align-top">
        <span className="font-medium">{p.label}</span>
        {p.required && <span className="text-bad"> *</span>}
        {p.unit && <span className="block text-xs text-muted">{p.unit}</span>}
        {p.help && <span className="block text-xs text-muted">{p.help}</span>}
      </td>
      <td className="align-top">
        {it ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular font-medium">{shown}</span>
              {it.status === "confirmed" ? <Badge tone="ok">bestätigt</Badge> : <Badge tone="warn">Vorschlag{it.proposedBy === "model" ? " (KI)" : ""}</Badge>}
              {it.confidence !== null && it.status !== "confirmed" && <span className="text-xs text-muted">{Math.round(it.confidence * 100)} %</span>}
            </div>
            <p className="text-xs text-muted">{it.sourceLabel}</p>
            {it.quote && <q className="block text-xs italic text-muted">{it.quote}</q>}
            {it.note && it.note !== it.sourceLabel && <p className="text-xs text-muted">Hinweis: {it.note}</p>}
            {it.status === "proposed" && (
              <div className="flex gap-1 pt-1">
                <Button disabled={pending} onClick={() => start(() => confirmGenerationItem(p.generationId, it.id))}>
                  Bestätigen
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => start(() => rejectGenerationItem(p.generationId, it.id))}>
                  Verwerfen
                </Button>
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted">nicht erfasst</span>
        )}
        {info && <p className="mt-1 text-xs text-warn">{info}</p>}
      </td>
      <td className="w-96 align-top">
        {editing ? (
          <div className="space-y-2">
            <ValueEditor type={p.type} tierable={p.tierable} nullable={p.nullable ?? true} options={p.options} optionLabels={p.optionLabels} initial={it?.value} onChange={setEditor} />
            <select value={docId} onChange={(e) => setDocId(e.target.value)} className={inputClass}>
              <option value="">Fundstelle: Freitext</option>
              {p.docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
            {docId && <input value={page} onChange={(e) => setPage(e.target.value)} className={inputClass} placeholder="Seite" inputMode="numeric" />}
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder={docId ? "Abschnitt/Zitat (optional)" : "Fundstelle, z. B. „Tarifbestimmungen § 4, S. 3“"} />
            {error && <p className="text-xs text-bad">{error}</p>}
            <div className="flex gap-1">
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await saveGenerationItem(p.generationId, {
                      key: p.fieldKey,
                      rawValue: editor.raw,
                      valueMode: editor.mode,
                      tierBasis: editor.tierBasis,
                      sourceNote: note,
                      page: page ? Number(page) : null,
                      sourceDocumentId: docId || null,
                      confirm: true,
                    });
                    if (r.error) setError(r.error);
                    else {
                      setError(null);
                      setEditing(false);
                      setInfo(r.invalidatedCases ? `${r.invalidatedCases} Fall/Fälle dieser Generation müssen die Kostenfaktoren neu abschließen.` : null);
                    }
                  })
                }
              >
                Speichern & bestätigen
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {it ? "Korrigieren / ergänzen" : "Erfassen"}
          </Button>
        )}
      </td>
    </tr>
  );
}
