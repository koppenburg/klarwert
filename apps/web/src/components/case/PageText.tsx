"use client";

import { useEffect, useState } from "react";

/** Maskierter Text einer Seite – genau so geht er an die KI. */
export function PageText({ documentId, page }: { documentId: string; page: number }) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || text !== null) return;
    fetch(`/api/documents/${documentId}/pages/${page}?type=text`)
      .then((r) => r.text())
      .then(setText)
      .catch(() => setText("(Text konnte nicht geladen werden)"));
  }, [open, text, documentId, page]);
  return (
    <details className="rounded border border-line bg-bg/50" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-muted">Übermittelter Text (maskiert)</summary>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-3 py-2 text-xs">{text ?? "lädt …"}</pre>
    </details>
  );
}
