import Link from "next/link";
import { GateNotice } from "@/components/analysis/GateNotice";
import { Badge, Card, Notice, Table } from "@/components/ui";
import { buildForBundle, settingsForBundle } from "@/lib/analysis";
import { requireTeamMember } from "@/lib/auth";
import type { CaseBundle } from "@/lib/data";
import { dateDe } from "@/lib/format";
import { GenerateReportButton } from "./GenerateReportButton";

interface ReportRow {
  id: string;
  pdf_path: string | null;
  created_at: string;
}

export default async function ReportStep({ bundle }: { bundle: CaseBundle }) {
  const { supabase } = await requireTeamMember();
  const settings = settingsForBundle(bundle);
  const b = buildForBundle(bundle, settings);
  const confirmed = Boolean(bundle.case.fields_confirmed_at && bundle.case.costs_confirmed_at);
  const { data: reports } = await supabase.from("reports").select("id,pdf_path,created_at").eq("case_id", bundle.case.id).order("created_at", { ascending: false }).returns<ReportRow[]>();
  const links = await Promise.all(
    (reports ?? []).map(async (r) => {
      if (!r.pdf_path) return { ...r, url: null as string | null };
      const { data } = await supabase.storage.from("reports").createSignedUrl(r.pdf_path, 600, { download: `Klarwert-Analyse_${bundle.case.case_number}.pdf` });
      return { ...r, url: data?.signedUrl ?? null };
    }),
  );

  return (
    <div className="space-y-5">
      {!b.ok ? (
        <GateNotice gate={b.gate} caseId={bundle.case.id} what="Report-Erzeugung" />
      ) : !confirmed ? (
        <Notice tone="warn" title="Bestätigung fehlt">
          Vertragsdaten und Kostenfaktoren sind vollständig, aber im Fall noch nicht abschließend bestätigt (Schritte Erkennung und Kostenfaktoren: „Alle bestätigen“).
        </Notice>
      ) : (
        <Card title="Klarwert-Analyse erzeugen">
          <p className="mb-4 text-sm text-muted">
            Der Report enthält Vertragssteckbrief, Kostenübersicht, Charts, Szenarien, Annahmen und Fundstellen. Grundlage sind die gespeicherten Annahmen aus den Schritten Analyse und Szenarien. Jede Zahl ist mit Fundstelle belegt oder als Annahme gekennzeichnet.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <GenerateReportButton caseId={bundle.case.id} />
            <Link href={`/report/${bundle.case.id}`} target="_blank" className="text-sm text-brand underline">
              Druckansicht öffnen
            </Link>
          </div>
        </Card>
      )}
      <Card title="Bisherige Reports">
        {links.length === 0 ? (
          <p className="text-sm text-muted">Noch kein Report erzeugt.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Erstellt</th>
                <th>Report-ID</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {links.map((r) => (
                <tr key={r.id}>
                  <td className="tabular">
                    {dateDe(r.created_at)} {new Date(r.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}
                  </td>
                  <td className="font-mono text-xs">{r.id.slice(0, 8)}</td>
                  <td>
                    {r.url ? (
                      <a href={r.url} className="text-brand underline">
                        herunterladen
                      </a>
                    ) : (
                      <Badge tone="warn">kein PDF gespeichert</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
