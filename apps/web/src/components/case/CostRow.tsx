"use client";

import { useState, useTransition } from "react";
import { confirmCostItem, rejectCostItem, saveCostItem } from "@/app/(app)/faelle/[id]/actions";
import { describeValue } from "@klarwert/extraction/values";
import { initialEditorState, ValueEditor, type ValueEditorState } from "../catalog/ValueEditor";
import { Badge, Button, inputClass } from "../ui";

export interface CostItemView {
  id: string;
  value: unknown;
  status: "proposed" | "confirmed" | "rejected";
  sourceLabel: string;
  quote: string | null;
  note: string | null;
  confidence: number | null;
  proposedBy: "model" | "user";
}

export interface CostRowProps {
  caseId: string;
  fieldKey: string;
  label: string;
  unit?: string;
  type: "number" | "boolean" | "enum" | "table";
  options?: readonly string[];
  tierable?: boolean;
  required: boolean;
  nullable?: boolean;
  help?: string;
  generationItem: CostItemView | null;
  caseItem: CostItemView | null;
  docs: Array<{ id: string; title: string }>;
  hasGeneration: boolean;
}

const OPTION_LABELS: Record<string, string> = { permille_of_premium_sum: "‰ der Beitragssumme", percent_of_premiums: "% je Beitrag" };

function ItemCell({ item, caseId, label, unit }: { item: CostItemView | null; caseId: string; label: string; unit?: string }) {
  const [pending, start] = useTransition();
  if (!item) return <span className="text-xs text-muted">–</span>;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular font-medium">{typeof item.value === "string" ? (OPTION_LABELS[item.value] ?? item.value) : describeValue(item.value, unit)}</span>
        {item.status === "confirmed" ? <Badge tone="ok">bestätigt</Badge> : <Badge tone="warn">Vorschlag{item.proposedBy === "model" ? " (KI)" : ""}</Badge>}
        {item.confidence !== null && item.status !== "confirmed" && <span className="text-xs text-muted">{Math.round(item.confidence * 100)} %</span>}
      </div>
      <p className="text-xs text-muted">{item.sourceLabel}</p>
      {item.quote && <q className="block text-xs italic text-muted">{item.quote}</q>}
      {item.note && item.note !== item.sourceLabel && <p className="text-xs text-muted">Hinweis: {item.note}</p>}
      {item.status === "proposed" && (
        <div className="flex gap-1 pt-1">
          <Button disabled={pending} onClick={() => start(() => confirmCostItem(caseId, item.id))}>
            {label} bestätigen
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => start(() => rejectCostItem(caseId, item.id))}>
            Verwerfen
          </Button>
        </div>
      )}
    </div>
  );
}

export function CostRow(p: CostRowProps) {
  const [editing, setEditing] = useState(false);
  const current = p.caseItem ?? p.generationItem;
  const [editor, setEditor] = useState<ValueEditorState>(() => initialEditorState(p.type, current?.value));
  const [scope, setScope] = useState<"generation" | "case">(p.hasGeneration ? "generation" : "case");
  const [note, setNote] = useState("");
  const [page, setPage] = useState("");
  const [docId, setDocId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const effectiveConfirmed = current?.status === "confirmed";
  return (
    <tr className={effectiveConfirmed ? "bg-green-50/40" : !current && p.required ? "bg-amber-50/40" : undefined}>
      <td className="align-top">
        <span className="font-medium">{p.label}</span>
        {p.required && <span className="text-bad"> *</span>}
        {p.unit && <span className="block text-xs text-muted">{p.unit}</span>}
        {p.help && <span className="block text-xs text-muted">{p.help}</span>}
      </td>
      <td className="align-top">
        <ItemCell item={p.generationItem} caseId={p.caseId} label="Tarifwert" unit={p.unit} />
      </td>
      <td className="align-top">
        <ItemCell item={p.caseItem} caseId={p.caseId} label="Abweichung" unit={p.unit} />
      </td>
      <td className="w-80 align-top">
        {editing ? (
          <div className="space-y-2">
            <ValueEditor type={p.type} tierable={p.tierable} nullable={p.nullable} options={p.options} optionLabels={OPTION_LABELS} initial={current?.value} onChange={setEditor} />
            <select value={scope} onChange={(e) => setScope(e.target.value as "generation" | "case")} className={inputClass}>
              {p.hasGeneration && <option value="generation">gilt für die Tarifgeneration</option>}
              <option value="case">nur dieser Vertrag (Override)</option>
            </select>
            <select value={docId} onChange={(e) => setDocId(e.target.value)} className={inputClass}>
              <option value="">Fundstelle: Freitext</option>
              {p.docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
            {docId && <input value={page} onChange={(e) => setPage(e.target.value)} className={inputClass} placeholder="Seite" inputMode="numeric" />}
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder={docId ? "Abschnitt/Zitat (optional)" : "Fundstelle, z. B. „Kostenblatt S. 2, Ziff. 3“"} />
            {error && <p className="text-xs text-bad">{error}</p>}
            <div className="flex gap-1">
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await saveCostItem(p.caseId, { key: p.fieldKey, rawValue: editor.raw, valueMode: editor.mode, tierBasis: editor.tierBasis, scope, sourceNote: note, page: page ? Number(page) : null, sourceDocumentId: docId || null, confirm: true });
                    if (r.error) setError(r.error);
                    else {
                      setError(null);
                      setEditing(false);
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
            {current ? "Korrigieren / ergänzen" : "Erfassen"}
          </Button>
        )}
      </td>
    </tr>
  );
}

