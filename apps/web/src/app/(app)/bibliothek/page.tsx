import Link from "next/link";
import { CatalogEntryForm } from "@/components/case/CatalogEntryForm";
import { LibraryDocList } from "@/components/library/LibraryDocList";
import { LibraryUpload } from "@/components/library/LibraryUpload";
import { AliasEditor, SeedButton } from "@/components/library/CatalogControls";
import { Badge, Card, Field, inputClass, Table } from "@/components/ui";
import { requireTeamMember } from "@/lib/auth";
import type { LibraryDocumentRow } from "@/lib/data";

export const metadata = { title: "Tarifkatalog & Bibliothek" };

interface Gen {
  id: string;
  label: string;
  valid_from: string | null;
  valid_to: string | null;
  aliases: string[];
}
interface Tar {
  id: string;
  name: string;
  code: string | null;
  layer: string;
  aliases: string[];
  tariff_generations: Gen[];
}
interface Ins {
  id: string;
  name: string;
  aliases: string[];
  tariffs: Tar[];
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; g?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireTeamMember();
  const { data: insurers } = await supabase
    .from("insurers")
    .select("id,name,aliases,tariffs(id,name,code,layer,aliases,tariff_generations(id,label,valid_from,valid_to,aliases))")
    .order("name")
    .returns<Ins[]>();
  const { data: costCounts } = await supabase.from("cost_items").select("generation_id,status").not("generation_id", "is", null).neq("status", "rejected");
  const counts = new Map<string, { confirmed: number; proposed: number }>();
  for (const c of costCounts ?? []) {
    const e = counts.get(c.generation_id as string) ?? { confirmed: 0, proposed: 0 };
    if (c.status === "confirmed") e.confirmed++;
    else e.proposed++;
    counts.set(c.generation_id as string, e);
  }
  const selected = sp.g ?? null;
  const { data: docs } = selected ? await supabase.from("library_documents").select("*").eq("generation_id", selected).order("created_at").returns<LibraryDocumentRow[]>() : { data: null };
  const hits = sp.q ? (await supabase.rpc("search_library", { q: sp.q, max_results: 30 })).data as Array<{ document_id: string; page_number: number; title: string; kind: string; snippet: string }> | null : null;
  const flatTariffs = (insurers ?? []).flatMap((i) => i.tariffs.map((t) => ({ id: t.id, insurerId: i.id, name: t.name, code: t.code })));
  return (
    <div className="space-y-5">
      <Card title="Volltextsuche in Bedingungswerken">
        <form className="flex gap-2">
          <input name="q" defaultValue={sp.q} placeholder="z. B. Abschlusskosten Beitragssumme" className={inputClass} />
          <button className="rounded-md bg-brand px-4 text-sm text-white">Suchen</button>
        </form>
        {hits && (
          <ul className="mt-4 space-y-3 text-sm">
            {hits.length === 0 && <li className="text-muted">Keine Treffer.</li>}
            {hits.map((h, i) => (
              <li key={i}>
                <span className="font-medium">{h.title}</span>, S. {h.page_number} <Badge>{h.kind}</Badge>
                <p className="text-xs text-muted" dangerouslySetInnerHTML={{ __html: h.snippet.replace(/<(?!\/?b>)[^>]*>/g, "") }} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Tarifkatalog" actions={<SeedButton />}>
        <Table>
          <thead>
            <tr>
              <th>Versicherer</th>
              <th>Tarif</th>
              <th>Generationen</th>
            </tr>
          </thead>
          <tbody>
            {(insurers ?? []).map((i) => (
              <tr key={i.id}>
                <td className="align-top">
                  <span className="font-medium">{i.name}</span>
                  <AliasEditor table="insurers" id={i.id} aliases={i.aliases} />
                </td>
                <td className="align-top" colSpan={2}>
                  {i.tariffs.length === 0 && <span className="text-xs text-muted">noch keine Tarife</span>}
                  {i.tariffs.map((t) => (
                    <div key={t.id} className="mb-3 grid grid-cols-2 gap-3">
                      <div>
                        {t.name}
                        {t.code && <span className="text-muted"> ({t.code})</span>} <Badge>{t.layer}</Badge>
                        <AliasEditor table="tariffs" id={t.id} aliases={t.aliases} />
                      </div>
                      <div className="space-y-1">
                        {t.tariff_generations.map((g) => {
                          const cc = counts.get(g.id);
                          return (
                            <div key={g.id}>
                              <Link href={`/bibliothek/${g.id}`} className="text-brand underline-offset-2 hover:underline">
                                {g.label}
                              </Link>{" "}
                              {cc && <Badge tone={cc.proposed ? "warn" : "ok"}>{cc.confirmed} bestätigt{cc.proposed ? `, ${cc.proposed} offen` : ""}</Badge>}
                              <AliasEditor table="tariff_generations" id={g.id} aliases={g.aliases} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {selected && (
        <Card title="Bedingungswerke der gewählten Generation">
          <LibraryDocList docs={docs ?? []} />
          <div className="mt-4 border-t border-line pt-4">
            <LibraryUpload generationId={selected} />
          </div>
        </Card>
      )}
      <Card title="Neuer Katalogeintrag">
        <CatalogEntryForm caseId={null} catalog={{ insurers: (insurers ?? []).map((i) => ({ id: i.id, name: i.name })), tariffs: flatTariffs }} defaults={{}} />
      </Card>
      <Field label="Hinweis">
        <p className="text-xs text-muted">Bestätigte Kostenfaktoren gehören zur Tarifgeneration und werden bei jedem weiteren Vertrag derselben Generation vorgeschlagen.</p>
      </Field>
    </div>
  );
}
