import { COST_FIELDS, FEATURE_FIELDS } from "@klarwert/extraction";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GenerationItemRow, type GenerationItemView } from "@/components/catalog/GenerationItemRow";
import { CostSuggestButton } from "@/components/case/CostSuggestButton";
import { FeatureSuggestButton } from "@/components/library/FeatureSuggestButton";
import { LibraryDocList } from "@/components/library/LibraryDocList";
import { LibraryUpload } from "@/components/library/LibraryUpload";
import { Badge, Card, Notice, Table } from "@/components/ui";
import { requireTeamMember } from "@/lib/auth";
import { costProvenance, type CostItemRow, type GenerationInfo, type LibraryDocumentRow } from "@/lib/data";
import { env } from "@/lib/env";

export const metadata = { title: "Tarifdetails" };

const COST_OPTION_LABELS: Record<string, string> = { permille_of_premium_sum: "‰ der Beitragssumme", percent_of_premiums: "% je Beitrag" };

export default async function GenerationPage({ params }: { params: Promise<{ generationId: string }> }) {
  const { generationId } = await params;
  const { supabase } = await requireTeamMember();
  const { data: gen } = await supabase
    .from("tariff_generations")
    .select("id,label,valid_from,valid_to,tariff:tariffs(id,name,code,layer,insurer:insurers(id,name))")
    .eq("id", generationId)
    .maybeSingle<GenerationInfo>();
  if (!gen) notFound();
  const [{ data: docs }, { data: items }] = await Promise.all([
    supabase.from("library_documents").select("*").eq("generation_id", generationId).order("created_at").returns<LibraryDocumentRow[]>(),
    supabase.from("cost_items").select("*").eq("generation_id", generationId).neq("status", "rejected").returns<CostItemRow[]>(),
  ]);
  const libraryDocs = docs ?? [];
  const confirmedDocs = libraryDocs.filter((d) => d.status === "confirmed");
  const view = (key: string): GenerationItemView | null => {
    const c = (items ?? []).find((i) => i.key === key);
    if (!c) return null;
    return { id: c.id, value: c.value, status: c.status, sourceLabel: costProvenance(c, libraryDocs).label, quote: c.quote, note: c.source_note, confidence: c.confidence, proposedBy: c.proposed_by };
  };
  const confirmedKeys = new Set((items ?? []).filter((i) => i.status === "confirmed").map((i) => i.key));
  const missing = COST_FIELDS.filter((d) => d.required && !confirmedKeys.has(d.key)).map((d) => d.label);
  const featuresCaptured = FEATURE_FIELDS.filter((f) => confirmedKeys.has(f.key)).length;
  const openProposals = (items ?? []).filter((i) => i.status === "proposed").length;
  const docOptions = confirmedDocs.map((d) => ({ id: d.id, title: d.title }));
  return (
    <div className="space-y-5">
      <div>
        <Link href="/bibliothek" className="text-sm text-brand">
          ← Tarifkatalog
        </Link>
        <h1 className="text-2xl font-semibold">
          {gen.tariff.name}
          {gen.tariff.code ? ` (${gen.tariff.code})` : ""} · Generation {gen.label}
        </h1>
        <p className="text-sm text-muted">
          {gen.tariff.insurer.name} · {gen.tariff.layer}
        </p>
      </div>
      <Card title="Stand für die Tarifauswahl">
        <div className="flex flex-wrap gap-2">
          {missing.length === 0 ? <Badge tone="ok">Kostenfaktoren vollständig bestätigt</Badge> : <Badge tone="warn">{missing.length} Pflicht-Kostenwert(e) offen</Badge>}
          <Badge tone={featuresCaptured >= 6 ? "ok" : "warn"}>
            {featuresCaptured} von {FEATURE_FIELDS.length} Tarifmerkmalen erfasst
          </Badge>
          {openProposals > 0 && <Badge tone="warn">{openProposals} Vorschlag/Vorschläge zu prüfen</Badge>}
        </div>
        {missing.length > 0 && <p className="mt-2 text-xs text-muted">Offen: {missing.join(", ")}. Ohne diese Werte erscheint der Tarif in der Tarifauswahl als „nicht berechenbar“.</p>}
        <p className="mt-2 text-xs text-muted">
          Nicht erfasste Merkmale schließen einen Tarif nicht aus; die Tarifauswahl zeigt sie als „offen – bitte prüfen“. Fondskosten hängen meist von der Fondsauswahl ab. Ist hier kein Wert bestätigt,
          setzt die Tarifauswahl eine einheitliche Annahme.
        </p>
      </Card>
      <Card title="Bedingungswerke">
        <LibraryDocList docs={libraryDocs} />
        <div className="mt-4 space-y-3">
          {confirmedDocs.map((d) => (
            <div key={d.id} className="space-y-2">
              <CostSuggestButton docId={d.id} title={d.title} enabled={env.anthropicConfigured()} />
              <FeatureSuggestButton docId={d.id} title={d.title} enabled={env.anthropicConfigured()} />
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <LibraryUpload generationId={generationId} />
        </div>
      </Card>
      <Card title="Tarifmerkmale (harte Kriterien der Tarifauswahl)">
        <Table>
          <thead>
            <tr>
              <th>Merkmal</th>
              <th>Wert und Fundstelle</th>
              <th>Bearbeiten</th>
            </tr>
          </thead>
          <tbody>
            {FEATURE_FIELDS.map((f) => (
              <GenerationItemRow
                key={f.key}
                generationId={generationId}
                fieldKey={f.key}
                label={f.label}
                unit={f.unit}
                help={f.help}
                type={f.type}
                options={f.options}
                optionLabels={f.optionLabels}
                nullable
                item={view(f.key)}
                docs={docOptions}
              />
            ))}
          </tbody>
        </Table>
      </Card>
      <Card title="Kostenfaktoren der Generation">
        {openProposals > 0 && <Notice>Vorschläge der KI werden erst nach Bestätigung in Berechnung und Tarifauswahl verwendet.</Notice>}
        <Table>
          <thead>
            <tr>
              <th>Kostenart</th>
              <th>Wert und Fundstelle</th>
              <th>Bearbeiten</th>
            </tr>
          </thead>
          <tbody>
            {COST_FIELDS.map((d) => (
              <GenerationItemRow
                key={d.key}
                generationId={generationId}
                fieldKey={d.key}
                label={d.label}
                unit={d.unit}
                help={d.help}
                required={d.required}
                type={d.type}
                tierable={d.tierable}
                nullable={d.nullable}
                options={d.options}
                optionLabels={COST_OPTION_LABELS}
                item={view(d.key)}
                docs={docOptions}
              />
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
