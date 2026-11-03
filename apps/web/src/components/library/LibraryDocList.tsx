"use client";

import { useTransition } from "react";
import { confirmLibraryDocument, libraryDocumentUrl, rejectLibraryDocument } from "@/app/(app)/bibliothek/actions";
import type { LibraryDocumentRow } from "@/lib/data";
import { dateDe } from "@/lib/format";
import { Badge, Button, Table } from "../ui";

export function LibraryDocList({ docs, caseId }: { docs: LibraryDocumentRow[]; caseId?: string }) {
  const [pending, start] = useTransition();
  if (docs.length === 0) return <p className="text-sm text-muted">Noch keine Dokumente für diese Generation.</p>;
  return (
    <Table>
      <thead>
        <tr>
          <th>Titel</th>
          <th>Art</th>
          <th>Herkunft</th>
          <th>Seiten</th>
          <th>Status</th>
          <th className="text-right">Aktion</th>
        </tr>
      </thead>
      <tbody>
        {docs.map((d) => (
          <tr key={d.id}>
            <td>{d.title}</td>
            <td>{d.kind}</td>
            <td className="text-xs">
              {d.source_kind === "websearch" ? "Websuche" : d.source_kind === "upload" ? "Upload" : "manuell"}
              {d.source_url && (
                <a href={d.source_url} target="_blank" rel="noreferrer" className="ml-1 block max-w-xs truncate text-brand underline">
                  {d.source_url}
                </a>
              )}
            </td>
            <td className="tabular">{d.page_count ?? "–"}</td>
            <td>
              {d.status === "confirmed" ? <Badge tone="ok">gültig, bestätigt {dateDe(d.confirmed_at)}</Badge> : d.status === "candidate" ? <Badge tone="warn">Kandidat – prüfen</Badge> : <Badge tone="bad">verworfen</Badge>}
            </td>
            <td>
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const url = await libraryDocumentUrl(d.id);
                    if (url) window.open(url, "_blank");
                  }}
                >
                  Öffnen
                </Button>
                {d.status === "candidate" && (
                  <>
                    <Button disabled={pending} onClick={() => start(() => confirmLibraryDocument(d.id, caseId))}>
                      Als gültig bestätigen
                    </Button>
                    <Button variant="danger" disabled={pending} onClick={() => start(() => rejectLibraryDocument(d.id, caseId))}>
                      Verwerfen
                    </Button>
                  </>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
