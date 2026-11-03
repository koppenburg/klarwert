"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type PointerEvent } from "react";
import { Button, Notice } from "../ui";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Vorschau der geschwärzten Seite; der Berater kann zusätzliche Bereiche markieren und nachschwärzen. */
export function RedactionCanvas({ documentId, page, width, height, src }: { documentId: string; page: number; width: number; height: number; src: string }) {
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [draft, setDraft] = useState<Box | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  function toImage(e: PointerEvent<HTMLDivElement>) {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * height };
  }

  async function apply() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/documents/${documentId}/redact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ boxes: { [page]: boxes.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) })) } }),
    });
    const j = (await res.json()) as { mode?: string; error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg(j.error ?? "Nachschwärzen fehlgeschlagen");
      return;
    }
    setBoxes([]);
    setVersion((v) => v + 1);
    setMsg(`Nachgeschwärzt (${j.mode}). Bitte Vorschau erneut prüfen und freigeben.`);
    router.refresh();
  }

  const style = (b: Box) => ({ left: `${(b.x / width) * 100}%`, top: `${(b.y / height) * 100}%`, width: `${(b.width / width) * 100}%`, height: `${(b.height / height) * 100}%` });

  return (
    <div className="space-y-2">
      <div
        ref={wrap}
        className="relative cursor-crosshair select-none overflow-hidden rounded border border-line"
        onPointerDown={(e) => {
          const p = toImage(e);
          setStart(p);
          setDraft({ ...p, width: 0, height: 0 });
        }}
        onPointerMove={(e) => {
          if (!start) return;
          const p = toImage(e);
          setDraft({ x: Math.min(p.x, start.x), y: Math.min(p.y, start.y), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y) });
        }}
        onPointerUp={() => {
          if (draft && draft.width > 4 && draft.height > 4) setBoxes((b) => [...b, draft]);
          setDraft(null);
          setStart(null);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${src}&v=${version}`} alt={`Bereinigte Seite ${page}`} className="pointer-events-none block w-full" draggable={false} />
        {[...boxes, ...(draft ? [draft] : [])].map((b, i) => (
          <div key={i} className="absolute border-2 border-bad bg-black/70" style={style(b)} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={!boxes.length || busy} onClick={apply}>
          {busy ? "Wird geschwärzt …" : `${boxes.length} Bereich(e) nachschwärzen`}
        </Button>
        {boxes.length > 0 && (
          <Button variant="ghost" onClick={() => setBoxes([])}>
            Markierung verwerfen
          </Button>
        )}
        <span className="text-xs text-muted">Bereiche mit der Maus aufziehen.</span>
      </div>
      {msg && <Notice tone="brand">{msg}</Notice>}
    </div>
  );
}
