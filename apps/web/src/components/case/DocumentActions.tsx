"use client";

import { useTransition } from "react";
import { approveSanitized, deleteDocument, deleteOriginalNow } from "@/app/(app)/faelle/[id]/actions";
import { Button } from "../ui";

export function DocumentActions({ caseId, documentId, approved, hasOriginal, sanitized }: { caseId: string; documentId: string; approved: boolean; hasOriginal: boolean; sanitized: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {sanitized && !approved && (
        <Button disabled={pending} onClick={() => start(() => approveSanitized(caseId, documentId))}>
          Bereinigte Fassung geprüft – freigeben
        </Button>
      )}
      {hasOriginal && (
        <Button variant="secondary" disabled={pending} onClick={() => start(() => deleteOriginalNow(caseId, documentId))}>
          Original jetzt löschen
        </Button>
      )}
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (confirm("Dokument mit allen bereinigten Seiten löschen?")) start(() => deleteDocument(caseId, documentId));
        }}
      >
        Dokument löschen
      </Button>
    </div>
  );
}
