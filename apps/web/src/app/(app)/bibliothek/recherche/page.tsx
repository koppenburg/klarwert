import { ResearchPanel, type CandidateView, type InsurerView } from "@/components/research/ResearchPanel";
import { requireTeamMember } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Tarifrecherche" };

export default async function ResearchPage() {
  const { supabase } = await requireTeamMember();
  const [{ data: insurers }, { data: candidates }, { data: docs }] = await Promise.all([
    supabase.from("insurers").select("id,name,aliases,last_research_at,last_research_remarks").order("name"),
    supabase.from("tariff_candidates").select("*").neq("status", "rejected").order("name"),
    supabase.from("library_documents").select("id,title,kind,status,source_url,tariff_candidate_id").not("tariff_candidate_id", "is", null),
  ]);
  const cands: CandidateView[] = (candidates ?? []).map((c) => ({
    id: c.id,
    insurerId: c.insurer_id,
    name: c.name,
    code: c.code,
    layer: c.layer,
    productType: c.product_type,
    generationLabel: c.generation_label,
    salesStatus: c.sales_status,
    productUrl: c.product_url,
    documentLinks: (c.documents ?? []) as CandidateView["documentLinks"],
    reason: c.reason,
    status: c.status,
    generationId: c.generation_id,
    libraryDocs: (docs ?? []).filter((d) => d.tariff_candidate_id === c.id).map((d) => ({ id: d.id, title: d.title, kind: d.kind, status: d.status, sourceUrl: d.source_url })),
  }));
  return (
    <ResearchPanel
      insurers={(insurers ?? []) as InsurerView[]}
      candidates={cands}
      enabled={env.anthropicConfigured()}
    />
  );
}
