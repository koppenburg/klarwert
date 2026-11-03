import { COST_KIND_LABELS, COST_KINDS, type ReturnAnalysis } from "@klarwert/calc";
import { LAYER_LABELS, FREQUENCY_LABELS } from "@klarwert/extraction";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ReportCostChart, ReportReady, ReportScenarioChart, ReportSurrenderChart, ReportValueChart } from "@/components/report/ReportCharts";
import { buildSourceRegister, refsOf, type SourceEntry } from "@/components/report/sources";
import { ScenarioTable, SensitivityTable } from "@/components/scenarios/ScenarioTables";
import { runFullAnalysis } from "@/lib/analysis";
import { requireTeamMember } from "@/lib/auth";
import { branding } from "@/lib/branding";
import { loadCaseBundle } from "@/lib/data";
import { dateDe, euro, pct, pp } from "@/lib/format";

export const metadata = { title: "Klarwert-Analyse" };

const DISCLAIMER = "Darstellung je nach Tarif und Bedingungswerk; Entscheidungshilfe, keine Rechts- oder Steuerberatung.";

function Section({ title, children, breakBefore = false }: { title: string; children: ReactNode; breakBefore?: boolean }) {
  return (
    <section className={`mb-7 ${breakBefore ? "break-before-page" : ""}`}>
      <h2 className="mb-3 border-b-2 pb-1 text-[15px] font-semibold" style={{ borderColor: branding.colors.primary, color: branding.colors.primary }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Calc({ refs }: { refs: string }) {
  return <p className="mt-1 text-[10px] text-[#5b6475]">Berechnung aus {refs} (siehe Anhang Fundstellen und Annahmen).</p>;
}

const tableCls =
  "w-full border-collapse text-[11px] [&_td]:border-b [&_td]:border-[#d9dee6] [&_td]:px-2 [&_td]:py-1 [&_th]:border-b [&_th]:border-[#9aa3b2] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ caseId: string }>; searchParams: Promise<{ reportId?: string }> }) {
  const { caseId } = await params;
  const { reportId } = await searchParams;
  const { supabase } = await requireTeamMember();
  const bundle = await loadCaseBundle(supabase, caseId);
  if (!bundle) notFound();
  const full = runFullAnalysis(bundle);
  const c = bundle.case;
  const g = bundle.generation;

  if (!full.ok) {
    return (
      <main className="mx-auto max-w-[190mm] bg-white p-8 text-[#1d2330]">
        <h1 className="text-xl font-semibold">Klarwert-Analyse nicht möglich</h1>
        <p className="mt-2 text-sm">Ein Report kann erst erzeugt werden, wenn Vertragsdaten und alle Kostenfaktoren bestätigt sind:</p>
        <ul className="mt-2 list-disc pl-6 text-sm">
          {full.gate.messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <span data-report-ready="false" data-report-blocked="true" hidden />
      </main>
    );
  }

  const { built, analysis, scenarios, settings } = full;
  const model = built.model;
  const sources = buildSourceRegister(bundle, built, settings, model.layer);
  const calcRefs = [refsOf(sources, "V"), refsOf(sources, "K"), refsOf(sources, "A"), refsOf(sources, "G")].filter(Boolean).join(", ");
  const main: ReturnAnalysis | undefined = analysis.results.find((r) => r.isPib) ?? analysis.results.find((r) => r.grossReturnPercent === 4) ?? analysis.results[0];
  const refOf = (label: string) => sources.find((s) => s.group === "V" && s.label === label)?.ref;
  const fieldVal = (key: string) => bundle.fields.find((f) => f.key === key)?.value;
  const today = new Date().toISOString().slice(0, 10);
  const freq = String(fieldVal("payment_frequency") ?? "") as keyof typeof FREQUENCY_LABELS;

  return (
    <main className="mx-auto max-w-[190mm] bg-white px-2 py-4 text-[#1d2330] print:max-w-none print:p-0">
      <style>{`@page { size: A4; margin: 16mm 14mm 18mm 14mm; } body { background: #fff; } .break-before-page { break-before: page; } figure { break-inside: avoid; } tr { break-inside: avoid; } h2, h3, h4 { break-after: avoid-page; } table { font-size: 11px; } th, td { padding-left: 6px !important; padding-right: 6px !important; }`}</style>
      <header className="mb-6 flex items-start justify-between border-b pb-4" style={{ borderColor: branding.colors.primary }}>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-[#5b6475]">Klarwert-Analyse</p>
          <h1 className="text-2xl font-semibold" style={{ color: branding.colors.primary }}>
            {c.title ?? "Vertragsanalyse"}
          </h1>
          <p className="text-[12px] text-[#5b6475]">
            Fall {c.case_number} · erstellt am {dateDe(today)}
            {reportId ? ` · Report-ID ${reportId.slice(0, 8)}` : ""}
          </p>
        </div>
        <div className="text-right text-[10px] text-[#5b6475]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.logoPath} alt={branding.companyName} className="mb-1 ml-auto h-9" />
          <p>{branding.companyName}</p>
          <p>{branding.contact.line1}</p>
          <p>{branding.contact.line2}</p>
          <p>
            {branding.contact.phone} · {branding.contact.email}
          </p>
        </div>
      </header>

      <p className="mb-6 rounded border border-[#d9dee6] bg-[#f5f7fa] px-3 py-2 text-[11px]">
        {DISCLAIMER} Die Analyse liefert Entscheidungsgrundlagen, keine Empfehlung; die Produktentscheidung trifft der Berater gemeinsam mit dem Kunden. Steuerliche Effekte sind nicht gerechnet – bitte steuerliche Beratung einbeziehen.
      </p>

      <Section title="1 Vertragssteckbrief">
        <table className={tableCls}>
          <tbody>
            <Row label="Versicherer" value={g?.tariff.insurer.name ?? String(fieldVal("insurer") ?? "–")} refId={refOf("Versicherer")} />
            <Row label="Tarif" value={`${String(fieldVal("tariff_name") ?? g?.tariff.name ?? "–")}${fieldVal("tariff_code") ? ` (${String(fieldVal("tariff_code"))})` : ""}`} refId={refOf("Tarifname")} />
            <Row label="Tarifgeneration" value={g?.label ?? String(fieldVal("tariff_generation") ?? "–")} refId={refOf("Tarifgeneration / Stand")} />
            <Row label="Schicht" value={LAYER_LABELS[model.layer]} refId={refOf("Schicht")} />
            <Row label="Vertragsbeginn / Rentenbeginn" value={`${dateDe(String(fieldVal("contract_start")))} / ${dateDe(String(fieldVal("retirement_start")))} (${(model.termMonths / 12).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Jahre)`} refId={[refOf("Vertragsbeginn"), refOf("Rentenbeginn")].filter(Boolean).join(", ")} />
            <Row label="Beitrag" value={model.contributions.frequency === "none" ? "keine laufenden Beiträge" : `${euro(model.contributions.amount, true)} ${FREQUENCY_LABELS[freq] ?? ""}`} refId={[refOf("Beitrag je Zahlung"), refOf("Zahlweise")].filter(Boolean).join(", ")} />
            {model.contributions.singlePremium ? <Row label="Einmalbeitrag" value={euro(model.contributions.singlePremium, true)} refId={refOf("Einmalbeitrag")} /> : null}
            {model.contributions.dynamics ? <Row label="Dynamik" value={pct(model.contributions.dynamics.ratePercent, 1)} refId={refOf("Dynamik p.a.")} /> : null}
            {built.state ? <Row label="Guthaben am Stichtag" value={`${euro(built.state.currentValue, true)} (${dateDe(settings.valuationDate)})`} refId={[refOf("aktuelles Guthaben"), refOf("Stichtag Guthaben")].filter(Boolean).join(", ")} /> : null}
            {built.state?.surrenderValue !== undefined ? <Row label="Rückkaufswert" value={euro(built.state.surrenderValue, true)} refId={refOf("Rückkaufswert")} /> : null}
            {model.pib ? <Row label="Effektivkosten laut PIB" value={`${pp(model.pib.effectiveCostsPp)} bei ${pct(model.pib.grossReturnPercent, 1)} Wertentwicklung`} refId={[refOf("Effektivkosten laut PIB"), refOf("Wertentwicklungsannahme im PIB")].filter(Boolean).join(", ")} /> : null}
          </tbody>
        </table>
      </Section>

      <Section title="2 Kostenübersicht und Effektivkosten">
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Bruttorendite</th>
              <th className="text-right">Effektivkosten p.a.</th>
              <th className="text-right">Rendite nach Kosten</th>
              <th className="text-right">Einzahlungen</th>
              <th className="text-right">Kosten gesamt</th>
              <th className="text-right">Endkapital brutto</th>
              <th className="text-right">Endkapital netto</th>
              <th className="text-right">Rente garantiert</th>
              <th className="text-right">Rente aktuell</th>
            </tr>
          </thead>
          <tbody>
            {analysis.results.map((r) => (
              <tr key={r.grossReturnPercent}>
                <td>
                  {pct(r.grossReturnPercent, 1)}
                  {r.isPib ? " (PIB)" : ""}
                </td>
                <td className="text-right font-semibold">{pp(r.effectiveCosts.reductionInYieldPp)}</td>
                <td className="text-right">{pct(r.effectiveCosts.netIrrPercent)}</td>
                <td className="text-right">{euro(r.simulation.ownPremiumsTotal + r.simulation.allowancesTotal)}</td>
                <td className="text-right">{euro(r.simulation.costsTotalSum)}</td>
                <td className="text-right">{euro(r.simulation.finalValueGross)}</td>
                <td className="text-right">{euro(r.simulation.finalValueNet)}</td>
                <td className="text-right">{r.annuity.monthlyGuaranteed === null ? "–" : euro(r.annuity.monthlyGuaranteed)}</td>
                <td className="text-right">{r.annuity.monthlyCurrent === null ? "–" : euro(r.annuity.monthlyCurrent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Calc refs={calcRefs} />
        {model.pib && (
          <p className="mt-2 text-[11px]">
            <strong>Plausibilitätsabgleich PIB:</strong> ausgewiesen {pp(model.pib.effectiveCostsPp)}, berechnet {analysis.pibDeviationPp === null ? "–" : pp(model.pib.effectiveCostsPp + analysis.pibDeviationPp)}, Abweichung{" "}
            {analysis.pibDeviationPp === null ? "–" : pp(analysis.pibDeviationPp)}
            {analysis.pibDeviationPp !== null && Math.abs(analysis.pibDeviationPp) > 0.1 ? " – Abweichung über 0,1 Pp., Annahmen des PIB weichen ab." : "."}
          </p>
        )}
        {main && (
          <>
            <h3 className="mb-1 mt-4 text-[12px] font-semibold">Kosten je Art bei {pct(main.grossReturnPercent, 1)} Bruttorendite</h3>
            <table className={tableCls}>
              <thead>
                <tr>
                  <th>Kostenart</th>
                  <th className="text-right">Summe</th>
                  <th className="text-right">in % der Einzahlungen</th>
                  <th className="text-right">Anteil Effektivkosten (Näherung)</th>
                </tr>
              </thead>
              <tbody>
                {COST_KINDS.filter((k) => Math.abs(main.simulation.costsTotal[k]) > 0.005).map((k) => {
                  const paid = main.simulation.ownPremiumsTotal + main.simulation.allowancesTotal;
                  return (
                    <tr key={k}>
                      <td>{COST_KIND_LABELS[k]}</td>
                      <td className="text-right">{euro(main.simulation.costsTotal[k])}</td>
                      <td className="text-right">{paid > 0 ? pct((main.simulation.costsTotal[k] / paid) * 100) : "–"}</td>
                      <td className="text-right">{main.effectiveCosts.byKind ? pp(main.effectiveCosts.byKind[k]) : "–"}</td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td>Summe</td>
                  <td className="text-right">{euro(main.simulation.costsTotalSum)}</td>
                  <td />
                  <td className="text-right">{pp(main.effectiveCosts.reductionInYieldPp)}</td>
                </tr>
              </tbody>
            </table>
            <Calc refs={calcRefs} />
          </>
        )}
      </Section>

      {main && (
        <Section title="3 Verlauf" breakBefore>
          <Figure title={`Kosten je Art pro Jahr (${pct(main.grossReturnPercent, 1)} Bruttorendite)`}>
            <ReportCostChart years={main.simulation.years} startYear={model.startYear} startMonth={model.startMonth} />
          </Figure>
          <Figure title="Brutto- und Nettoguthaben">
            <ReportValueChart years={main.simulation.years} startYear={model.startYear} startMonth={model.startMonth} />
          </Figure>
          <Figure title={`Rückkaufswert${main.breakEvenYear ? ` – Break-even ${model.startYear + Math.floor((model.startMonth - 1 + (main.breakEvenYear - 1) * 12) / 12)}` : " – kein Break-even in der Laufzeit"}`}>
            <ReportSurrenderChart curve={main.surrenderCurve} breakEvenYear={main.breakEvenYear} startYear={model.startYear} startMonth={model.startMonth} />
          </Figure>
          <Calc refs={calcRefs} />
          {main.payoutComparison && (
            <p className="mt-2 text-[11px]">
              <strong>Rente gegen Auszahlplan:</strong> Monatsrente {euro(main.annuity.monthlyCurrent ?? main.annuity.monthlyGuaranteed)} lebenslang gegenüber Auszahlplan bis {settings.payoutPlanEndAge} mit {euro(main.payoutComparison.payoutPlanMonthly)} monatlich. Bis
              zur angenommenen Lebenserwartung von {settings.lifeExpectancyAge} Jahren: Rente {euro(main.payoutComparison.annuityTotalToLifeExpectancy)}, Auszahlplan {euro(main.payoutComparison.payoutPlanTotalToLifeExpectancy)} (inkl. Restkapital).
            </p>
          )}
        </Section>
      )}

      {scenarios && (
        <Section title="4 Szenarien und Altersvorsorgedepot" breakBefore>
          <p className="mb-2 text-[11px]">
            Gleiche Ausgangsbasis für alle Szenarien: Guthaben am Stichtag, gleiche Eigenbeiträge, {pct(settings.scenarioReturnPercent, 1)} Bruttorendite, gleicher Rentenbeginn. Reihenfolge fest, kein Szenario wird empfohlen.
          </p>
          <ScenarioTable results={scenarios.results} compact />
          <Calc refs={calcRefs} />
          <Figure title="Endkapital je Szenario">
            <ReportScenarioChart scenarios={scenarios.results} />
          </Figure>
          <div className="mt-2 space-y-2 text-[10.5px]">
            {scenarios.results.map((r) => (
              <div key={r.id} className="break-inside-avoid">
                <p className="font-semibold">{r.label}</p>
                <p>{r.description}</p>
                {r.guaranteeNote && <p className="text-[#a86b00]">Garantie: {r.guaranteeNote}</p>}
                <ul className="list-disc pl-5 text-[#5b6475]">
                  {r.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <h3 className="mb-1 mt-4 text-[12px] font-semibold">Sensitivität: Endkapital (darunter Effektivkosten) nach Bruttorendite und Rentenbeginn</h3>
          <SensitivityTable cells={scenarios.sensitivity} results={scenarios.results} compact />
          <Calc refs={calcRefs} />
        </Section>
      )}

      <Section title="5 Annahmen" breakBefore>
        <SourceTable entries={sources.filter((s) => s.group === "A")} />
      </Section>

      <Section title="Anhang A – Fundstellen Vertragsdaten">
        <SourceTable entries={sources.filter((s) => s.group === "V")} />
      </Section>
      <Section title="Anhang B – Fundstellen Kostenfaktoren (bestätigt)">
        <SourceTable entries={sources.filter((s) => s.group === "K")} />
      </Section>
      <Section title="Anhang C – Gesetzliche Konstanten">
        <SourceTable entries={sources.filter((s) => s.group === "G")} showStatus />
      </Section>
      <Section title="Anhang D – Methodik">
        <ul className="list-disc space-y-1 pl-5 text-[10.5px]">
          <li>Monatsgenaue Simulation: Beiträge am Monatsanfang, Wertentwicklung (1 + r)^(1/12) je Monat, Kosten auf das Guthaben (γ, Fonds, Garantie) monatlich anteilig am Monatsende, Stückkosten κ/12 monatlich.</li>
          <li>Effektivkosten = Renditeminderung p.a. bis Rentenbeginn: interner Zinsfuß ohne Kosten minus interner Zinsfuß mit allen Kosten (§ 2 Abs. 1 Nr. 9 VVG-InfoV). Zerlegung je Kostenart sequentiell (Näherung).</li>
          <li>Szenarien: Effektivkosten aus allen Zahlungen ab Stichtag (Guthaben als Anfangsbetrag); Wechselkosten und Stornoabzüge zählen als Kosten. Steuern nicht gerechnet.</li>
        </ul>
      </Section>

      <footer className="mt-8 border-t border-[#d9dee6] pt-2 text-[9.5px] text-[#5b6475]">
        {DISCLAIMER} {branding.companyName} · {branding.register} · {branding.claim}
      </footer>
      <ReportReady />
    </main>
  );
}

function Row({ label, value, refId }: { label: string; value: string; refId?: string }) {
  return (
    <tr>
      <td className="w-[38%] text-[#5b6475]">{label}</td>
      <td>
        {value}
        {refId ? <sup className="ml-1 text-[9px] text-[#5b6475]">[{refId}]</sup> : null}
      </td>
    </tr>
  );
}

function Figure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="mb-4">
      <figcaption className="mb-1 text-[11.5px] font-semibold">{title}</figcaption>
      {children}
    </figure>
  );
}

function SourceTable({ entries, showStatus = false }: { entries: SourceEntry[]; showStatus?: boolean }) {
  if (entries.length === 0) return <p className="text-[11px] text-[#5b6475]">keine Einträge</p>;
  return (
    <table className={tableCls}>
      <thead>
        <tr>
          <th className="w-10">Nr.</th>
          <th>Angabe</th>
          <th>Wert</th>
          <th>Fundstelle / Kennzeichnung</th>
          {showStatus && <th>Status</th>}
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.ref}>
            <td className="font-mono">{e.ref}</td>
            <td>{e.label}</td>
            <td>{e.value}</td>
            <td>
              {e.group === "A" ? <strong className="mr-1 text-[#7a5d16]">Annahme</strong> : null}
              {e.source}
              {e.quote ? <span className="block italic text-[#5b6475]">„{e.quote}“</span> : null}
            </td>
            {showStatus && <td className={e.status === "verifiziert" ? "text-[#2f7d4f]" : "text-[#a86b00]"}>{e.status}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
