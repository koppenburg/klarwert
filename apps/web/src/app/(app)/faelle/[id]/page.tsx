import Link from "next/link";
import { notFound } from "next/navigation";
import { checkGate } from "@klarwert/extraction";
import AnalysisStep from "@/components/analysis/AnalysisStep";
import CostsStep from "@/components/case/CostsStep";
import DocumentsStep from "@/components/case/DocumentsStep";
import ExtractionStep from "@/components/case/ExtractionStep";
import TariffStep from "@/components/case/TariffStep";
import ReportStep from "@/components/report/ReportStep";
import ScenarioStep from "@/components/scenarios/ScenarioStep";
import { Badge, cx } from "@/components/ui";
import { requireTeamMember } from "@/lib/auth";
import { loadCaseBundle, toCostRecords, toFieldRecords } from "@/lib/data";

const STEPS = [
  { id: "dokumente", label: "1 Dokumente" },
  { id: "erkennung", label: "2 Erkennung" },
  { id: "tarif", label: "3 Tarif & Bedingungswerk" },
  { id: "kosten", label: "4 Kostenfaktoren" },
  { id: "analyse", label: "5 Analyse" },
  { id: "szenarien", label: "6 Szenarien & Depot" },
  { id: "report", label: "7 Report" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Fall ${id.slice(0, 8)}` };
}

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ schritt?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireTeamMember();
  const bundle = await loadCaseBundle(supabase, id);
  if (!bundle) notFound();
  const step: StepId = (STEPS.find((s) => s.id === sp.schritt)?.id ?? defaultStep(bundle)) as StepId;
  const gate = checkGate(toFieldRecords(bundle.fields), toCostRecords(bundle.costItems, bundle.libraryDocs));
  const c = bundle.case;
  const g = bundle.generation;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-muted">{c.case_number}</p>
          <h1 className="text-2xl font-semibold">{c.title ?? "Ohne Bezeichnung"}</h1>
          <p className="text-sm text-muted">
            {g ? `${g.tariff.insurer.name} · ${g.tariff.name}${g.tariff.code ? ` (${g.tariff.code})` : ""} · Generation ${g.label}` : "Tarif noch nicht zugeordnet"}
            {c.customer_name ? ` · Kunde: ${c.customer_name} (nur lokal)` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone={c.fields_confirmed_at ? "ok" : "warn"}>{c.fields_confirmed_at ? "Vertragsdaten bestätigt" : "Vertragsdaten offen"}</Badge>
          <Badge tone={gate.ok ? "ok" : "warn"}>{gate.ok ? "Kostenfaktoren vollständig bestätigt" : "Kostenfaktoren offen"}</Badge>
        </div>
      </div>
      <nav className="no-print flex flex-wrap gap-1 border-b border-line">
        {STEPS.map((s) => (
          <Link
            key={s.id}
            href={`/faelle/${id}?schritt=${s.id}`}
            className={cx("-mb-px rounded-t-md border px-3 py-2 text-sm", s.id === step ? "border-line border-b-surface bg-surface font-semibold text-brand" : "border-transparent text-muted hover:text-ink")}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      {step === "dokumente" && <DocumentsStep bundle={bundle} />}
      {step === "erkennung" && <ExtractionStep bundle={bundle} />}
      {step === "tarif" && <TariffStep bundle={bundle} />}
      {step === "kosten" && <CostsStep bundle={bundle} />}
      {step === "analyse" && <AnalysisStep bundle={bundle} />}
      {step === "szenarien" && <ScenarioStep bundle={bundle} />}
      {step === "report" && <ReportStep bundle={bundle} />}
    </div>
  );
}

function defaultStep(b: { documents: unknown[]; fields: unknown[]; case: { generation_id: string | null; costs_confirmed_at: string | null } }): StepId {
  if (b.documents.length === 0) return "dokumente";
  if (b.fields.length === 0) return "erkennung";
  if (!b.case.generation_id) return "tarif";
  if (!b.case.costs_confirmed_at) return "kosten";
  return "analyse";
}
