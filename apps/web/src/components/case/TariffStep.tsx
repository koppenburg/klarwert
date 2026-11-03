import { matchTariff, MATCH_SUGGEST_THRESHOLD, requestLetter, type Catalog } from "@klarwert/extraction";
import { supabaseServer } from "@/lib/supabase/server";
import type { CaseBundle } from "@/lib/data";
import { env } from "@/lib/env";
import { LibraryDocList } from "../library/LibraryDocList";
import { LibraryUpload } from "../library/LibraryUpload";
import { WebSearchButton } from "../library/WebSearchButton";
import { Badge, Card, Notice, Table } from "../ui";
import { AssignButton } from "./AssignButton";
import { CatalogEntryForm } from "./CatalogEntryForm";

export async function loadCatalog(): Promise<Catalog> {
  const supabase = await supabaseServer();
  const [ins, tar, gen] = await Promise.all([
    supabase.from("insurers").select("id,name,aliases").order("name"),
    supabase.from("tariffs").select("id,insurer_id,name,code,aliases").order("name"),
    supabase.from("tariff_generations").select("id,tariff_id,label,valid_from,valid_to,aliases").order("label"),
  ]);
  return {
    insurers: (ins.data ?? []).map((i) => ({ id: i.id, name: i.name, aliases: i.aliases ?? [] })),
    tariffs: (tar.data ?? []).map((t) => ({ id: t.id, insurerId: t.insurer_id, name: t.name, code: t.code, aliases: t.aliases ?? [] })),
    generations: (gen.data ?? []).map((g) => ({ id: g.id, tariffId: g.tariff_id, label: g.label, validFrom: g.valid_from, validTo: g.valid_to, aliases: g.aliases ?? [] })),
  };
}

export default async function TariffStep({ bundle }: { bundle: CaseBundle }) {
  const catalog = await loadCatalog();
  const v = (k: string) => {
    const x = bundle.fields.find((f) => f.key === k)?.value;
    return typeof x === "string" ? x : undefined;
  };
  const query = { insurer: v("insurer"), tariffName: v("tariff_name"), tariffCode: v("tariff_code"), generation: v("tariff_generation"), contractStart: v("contract_start") };
  const matches = matchTariff(catalog, query).slice(0, 5);
  const nameOf = (m: (typeof matches)[number]) => {
    const t = catalog.tariffs.find((x) => x.id === m.tariffId);
    const i = catalog.insurers.find((x) => x.id === m.insurerId);
    const g = catalog.generations.find((x) => x.id === m.generationId);
    return { insurer: i?.name ?? "", tariff: `${t?.name ?? ""}${t?.code ? ` (${t.code})` : ""}`, generation: g?.label ?? null };
  };
  const gen = bundle.generation;
  const confirmedDocs = bundle.libraryDocs.filter((d) => d.status === "confirmed");
  const letter = gen
    ? requestLetter({ insurer: gen.tariff.insurer.name, tariffName: gen.tariff.name, tariffCode: gen.tariff.code, generation: gen.label, contractStart: v("contract_start") ?? null, caseNumber: bundle.case.case_number })
    : null;
  return (
    <div className="space-y-5">
      <Card title="Erkannter Tarif">
        <p className="text-sm">
          {query.insurer ?? "Versicherer unbekannt"} · {query.tariffName ?? "Tarif unbekannt"}
          {query.tariffCode ? ` · Kürzel ${query.tariffCode}` : ""}
          {query.generation ? ` · Generation ${query.generation}` : ""}
        </p>
        {gen && (
          <Notice tone="ok">
            Zugeordnet: {gen.tariff.insurer.name} · {gen.tariff.name}
            {gen.tariff.code ? ` (${gen.tariff.code})` : ""} · Generation {gen.label}
          </Notice>
        )}
      </Card>
      <Card title="Treffer im Tarifkatalog">
        {matches.length ? (
          <Table>
            <thead>
              <tr>
                <th>Versicherer</th>
                <th>Tarif</th>
                <th>Generation</th>
                <th>Übereinstimmung</th>
                <th className="text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => {
                const n = nameOf(m);
                return (
                  <tr key={`${m.tariffId}-${m.generationId}`}>
                    <td>{n.insurer}</td>
                    <td>{n.tariff}</td>
                    <td>{n.generation ?? <span className="text-muted">keine passende Generation</span>}</td>
                    <td>
                      <Badge tone={m.score >= MATCH_SUGGEST_THRESHOLD ? "ok" : "warn"}>{Math.round(m.score * 100)} %</Badge>
                      <span className="ml-2 text-xs text-muted">{m.reasons.join(" · ")}</span>
                    </td>
                    <td className="text-right">{m.generationId && m.generationId !== gen?.id ? <AssignButton caseId={bundle.case.id} generationId={m.generationId} /> : m.generationId ? <Badge tone="ok">zugeordnet</Badge> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted">Kein Treffer. Lege den Tarif unten im Katalog an – beim nächsten Vertrag desselben Tarifs wird er vorgeschlagen.</p>
        )}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-brand">Neuen Katalogeintrag anlegen (Versicherer → Tarif → Generation)</summary>
          <div className="mt-3">
            <CatalogEntryForm
              caseId={bundle.case.id}
              catalog={{ insurers: catalog.insurers, tariffs: catalog.tariffs }}
              defaults={{ insurer: query.insurer, tariffName: query.tariffName, tariffCode: query.tariffCode, generation: query.generation, layer: v("layer"), productType: v("product_type") }}
            />
          </div>
        </details>
      </Card>
      {gen && (
        <Card title="Bedingungswerk dieser Generation">
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-semibold">Stufe a – Bibliothek</p>
              <LibraryDocList docs={bundle.libraryDocs} caseId={bundle.case.id} />
              {confirmedDocs.length > 0 && <p className="mt-2 text-sm text-ok">{confirmedDocs.length} bestätigtes Bedingungswerk vorhanden – weiter mit Schritt 4 (Kostenfaktoren).</p>}
            </div>
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-sm font-semibold">Bedingungswerk hochladen</p>
              <LibraryUpload generationId={gen.id} />
            </div>
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-sm font-semibold">Stufe b – Websuche</p>
              <p className="mb-2 text-xs text-muted">Gefundene PDFs werden mit Quelle als Kandidat abgelegt und nie automatisch als gültig übernommen.</p>
              <WebSearchButton generationId={gen.id} contractStart={v("contract_start") ?? null} enabled={env.anthropicConfigured()} />
            </div>
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-sm font-semibold">Stufe c – manuelle Erfassung und Anforderung beim Versicherer</p>
              <p className="mb-2 text-sm">Kostenfaktoren können in Schritt 4 manuell mit Freitext-Fundstelle erfasst werden. Für die Anforderung beim Versicherer:</p>
              {letter && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-brand">Anforderungsschreiben (Vorlage mit Platzhaltern)</summary>
                  <p className="mt-2 text-sm font-medium">Betreff: {letter.subject}</p>
                  <pre className="mt-2 whitespace-pre-wrap rounded border border-line bg-bg/60 p-4 text-xs">{letter.body}</pre>
                </details>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
