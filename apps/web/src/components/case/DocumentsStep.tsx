import type { CaseBundle } from "@/lib/data";
import { dateDe } from "@/lib/format";
import { Badge, Card, Notice } from "../ui";
import { DocumentActions } from "./DocumentActions";
import { DocumentUploader } from "./DocumentUploader";
import { PageText } from "./PageText";
import { RedactionCanvas } from "./RedactionCanvas";

const PII_LABELS: Record<string, string> = {
  name: "Namen",
  address: "Anschriften",
  birthdate: "Geburtsdaten",
  policy_number: "Vertrags-/Kundennummern",
  iban: "IBAN/Bankdaten",
  phone: "Telefonnummern",
  email: "E-Mail-Adressen",
  tax_id: "Steuer-/SV-Nummern",
};

export default function DocumentsStep({ bundle }: { bundle: CaseBundle }) {
  const caseId = bundle.case.id;
  return (
    <div className="space-y-5">
      <Card title="Unterlagen hochladen">
        <DocumentUploader caseId={caseId} />
        <p className="mt-4 text-xs text-muted">
          Datenschutz: Originale liegen nur im privaten Speicher und werden lokal per OCR bereinigt. An die KI geht ausschließlich die geschwärzte und maskierte Fassung, die du hier
          prüfst und freigibst. Nach der Erkennung wird das Original gelöscht, sofern du es nicht ausdrücklich behältst.
        </p>
      </Card>
      {bundle.documents.length === 0 && <Notice tone="brand">Noch keine Unterlagen. Lade Police, Standmitteilung, Screenshots, Angebote oder Produktinformationsblätter hoch.</Notice>}
      {bundle.documents.map((d) => (
        <Card
          key={d.id}
          title={
            <span className="flex items-center gap-2">
              {d.file_name}
              <Badge>{d.doc_role}</Badge>
              {d.sanitized_approved_at ? <Badge tone="ok">freigegeben</Badge> : d.sanitized_pages ? <Badge tone="warn">Freigabe offen</Badge> : <Badge tone="bad">nicht bereinigt</Badge>}
              {d.original_path ? <Badge tone="warn">{d.keep_original ? "Original wird behalten" : "Original vorhanden"}</Badge> : <Badge>Original gelöscht {dateDe(d.original_deleted_at)}</Badge>}
              {d.extracted_at && <Badge tone="brand">erkannt</Badge>}
            </span>
          }
        >
          <div className="space-y-4">
            <p className="text-sm">
              Entfernt:{" "}
              {Object.entries(d.pii_summary ?? {}).length
                ? Object.entries(d.pii_summary ?? {})
                    .map(([k, v]) => `${v} × ${PII_LABELS[k] ?? k}`)
                    .join(", ")
                : "keine personenbezogenen Angaben gefunden"}
            </p>
            {(d.sanitize_warnings ?? []).map((w, i) => (
              <Notice key={i}>{w}</Notice>
            ))}
            <div className="grid gap-6 lg:grid-cols-2">
              {(d.sanitized_pages ?? []).map((p) => (
                <div key={p.pageNumber} className="space-y-2">
                  <p className="text-xs font-medium text-muted">
                    Seite {p.pageNumber} · {p.source === "ocr" ? `OCR (Konfidenz ${Math.round(p.ocrConfidence ?? 0)} %), ${p.boxes} Schwärzung(en)` : p.source === "text-layer" ? "Textlayer, nur Text wird übermittelt" : "Text"}
                  </p>
                  {p.imagePath && p.width && p.height ? (
                    <RedactionCanvas documentId={d.id} page={p.pageNumber} width={p.width} height={p.height} src={`/api/documents/${d.id}/pages/${p.pageNumber}?type=image`} />
                  ) : null}
                  <PageText documentId={d.id} page={p.pageNumber} />
                </div>
              ))}
            </div>
            <DocumentActions caseId={caseId} documentId={d.id} approved={!!d.sanitized_approved_at} hasOriginal={!!d.original_path} />
          </div>
        </Card>
      ))}
    </div>
  );
}
