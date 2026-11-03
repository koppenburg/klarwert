import Link from "next/link";
import { Badge, Button, Card, Field, inputClass, Table } from "@/components/ui";
import { requireTeamMember } from "@/lib/auth";
import type { CaseRow } from "@/lib/data";
import { dateDe } from "@/lib/format";
import { createCase } from "./actions";

export const metadata = { title: "Fälle" };

const STATUS: Record<string, { label: string; tone: "neutral" | "brand" | "ok" | "warn" }> = {
  neu: { label: "neu", tone: "neutral" },
  erkannt: { label: "erkannt", tone: "brand" },
  tarif_zugeordnet: { label: "Tarif zugeordnet", tone: "brand" },
  kosten_bestaetigt: { label: "Kosten bestätigt", tone: "ok" },
  analysiert: { label: "analysiert", tone: "ok" },
};

export default async function CasesPage() {
  const { supabase } = await requireTeamMember();
  const { data: cases } = await supabase.from("cases").select("*").order("updated_at", { ascending: false }).limit(200).returns<CaseRow[]>();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card title="Fälle">
        {cases && cases.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Fallnummer</th>
                <th>Bezeichnung</th>
                <th>Kunde (nur lokal)</th>
                <th>Status</th>
                <th>Zuletzt geändert</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="hover:bg-brand-soft/40">
                  <td className="font-mono text-xs">
                    <Link href={`/faelle/${c.id}`} className="text-brand underline-offset-2 hover:underline">
                      {c.case_number}
                    </Link>
                  </td>
                  <td>{c.title ?? "–"}</td>
                  <td className="text-muted">{c.customer_name ?? "–"}</td>
                  <td>
                    <Badge tone={STATUS[c.status]?.tone ?? "neutral"}>{STATUS[c.status]?.label ?? c.status}</Badge>
                  </td>
                  <td className="tabular text-muted">{dateDe(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted">Noch keine Fälle. Lege rechts den ersten Fall an.</p>
        )}
      </Card>
      <Card title="Neuer Fall">
        <form action={createCase} className="space-y-4">
          <Field label="Bezeichnung" hint="z. B. „Riester Fonds 2015“ – ohne Kundendaten">
            <input name="title" className={inputClass} />
          </Field>
          <Field label="Kundenname (freiwillig)" hint="Bleibt nur in der Datenbank, geht nie an die KI. Wird zusätzlich zum Schwärzen genutzt.">
            <input name="customer_name" className={inputClass} />
          </Field>
          <Button type="submit">Fall anlegen</Button>
        </form>
      </Card>
    </div>
  );
}
