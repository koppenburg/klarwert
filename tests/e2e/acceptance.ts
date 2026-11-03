/**
 * Abnahme-Durchlauf der drei synthetischen Fälle durch die echte Oberfläche (Playwright).
 *
 *   KW_BASE_URL=https://klarwert.koppenburg.info KW_EMAIL=… KW_PASSWORD=… KW_MODE=live pnpm e2e:acceptance
 *
 * KW_MODE=live    Erkennung und Kostenvorschläge durch die KI; Abweichungen zum Soll werden korrigiert und protokolliert.
 * KW_MODE=offline ohne KI: Vertragsdaten und Kostenfaktoren werden manuell mit Fundstelle erfasst.
 * Ergebnis: tests/output/acceptance-<zeit>/ mit Screenshots, PDF-Reports und protokoll.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Locator, type Page } from "playwright-core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CASES, type SyntheticCase } from "../fixtures/synthetic/cases";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.KW_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const EMAIL = process.env.KW_EMAIL ?? "";
const PASSWORD = process.env.KW_PASSWORD ?? "";
const MODE = (process.env.KW_MODE ?? "offline") as "live" | "offline";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://mxakiqfyagaeejldnqaw.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const OUT = path.join(here, "../output", `acceptance-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(OUT, { recursive: true });

interface Deviation {
  case: string;
  kind: "field" | "cost";
  key: string;
  expected: unknown;
  recognized: unknown;
}
const protocol: { mode: string; base: string; startedAt: string; cases: Record<string, unknown>; deviations: Deviation[]; steps: string[] } = {
  mode: MODE,
  base: BASE,
  startedAt: new Date().toISOString(),
  cases: {},
  deviations: [],
  steps: [],
};
const log = (s: string) => {
  protocol.steps.push(`${new Date().toISOString()} ${s}`);
  console.log(s);
};

const FIELD_LABELS: Record<string, string> = {
  insurer: "Versicherer",
  tariff_name: "Tarifname",
  tariff_code: "Tarifkürzel",
  tariff_generation: "Tarifgeneration / Stand",
  layer: "Schicht",
  contract_start: "Vertragsbeginn",
  retirement_start: "Rentenbeginn",
  contribution_amount: "Beitrag je Zahlung",
  payment_frequency: "Zahlweise",
  dynamics_percent: "Dynamik p.a.",
  current_value: "aktuelles Guthaben",
  current_value_date: "Stichtag Guthaben",
  surrender_value: "Rückkaufswert",
  guarantee_level_percent: "Garantieniveau (Beitragserhalt)",
  pib_effective_costs_pp: "Effektivkosten laut PIB",
  pib_return_percent: "Wertentwicklungsannahme im PIB",
};

const COST_LABELS: Record<string, string> = {
  "alpha.mode": "α-Bemessung",
  "alpha.rate": "α-Satz",
  "alpha.distributionMonths": "α-Verteilungszeitraum",
  "alpha.onDynamics": "α auf Dynamikerhöhungen",
  "alpha.onTopUpsPercent": "α auf Zuzahlungen",
  "alpha.onAllowancesPercent": "α auf Zulagen",
  "beta.percentOfPremium": "β Verwaltungskosten je Beitrag",
  "beta.onTopUpsPercent": "β auf Zuzahlungen",
  "beta.onAllowancesPercent": "β auf Zulagen",
  "gamma.percentOfValue": "γ Kosten auf Guthaben p.a.",
  "kappa.eurPerYear": "κ Stückkosten p.a.",
  "kappa.eurPerYearPaidUp": "κ beitragsfrei",
  "fund.terPercent": "Fondskosten (TER/OGC, gewichtet)",
  "fund.kickbackPercent": "Rückvergütung an den Vertrag",
  "guarantee.percentOfValue": "Garantiekosten",
  paidUpFeeEur: "Kosten Beitragsfreistellung",
  "surrender.percentOfValue": "Stornoabzug",
  "surrender.maxEur": "Stornoabzug höchstens",
  "payout.annuityFactorGuaranteed": "Rentenfaktor garantiert (je 10.000 €)",
  "payout.annuityFactorCurrent": "Rentenfaktor aktuell (je 10.000 €)",
  "payout.annuityCostPercent": "Verwaltungskosten Rentenphase",
  "payout.annuityCostIncludedInFactor": "Rentenkosten im Rentenfaktor enthalten",
  "payout.lumpSumCostPercent": "Kosten Kapitalabfindung",
  "payout.guaranteePeriodMonths": "Rentengarantiezeit",
};

const ENUM_FIELDS = new Set(["layer", "payment_frequency"]);
const DATE_FIELDS = new Set(["contract_start", "retirement_start", "current_value_date"]);

function toInput(key: string, v: unknown): string {
  if (DATE_FIELDS.has(key) && typeof v === "string") {
    const [y, m, d] = v.split("-");
    return `${d}.${m}.${y}`;
  }
  if (typeof v === "number") return String(v).replace(".", ",");
  if (v === null) return "";
  return String(v);
}

function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" || typeof b === "number") return Math.abs(Number(a) - Number(b)) < 1e-6;
  if (typeof a === "string" && typeof b === "string") return a.trim().toLowerCase() === b.trim().toLowerCase();
  return a === b;
}

function rowByLabel(page: Page, label: string): Locator {
  return page.locator("tr").filter({ has: page.locator("td:first-child > span.font-medium", { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) }).first();
}

/** wartet, bis die Zeile gespeichert ist (Bearbeiten-Modus geschlossen) und meldet Validierungsfehler */
async function waitSaved(row: Locator, what: string) {
  const save = row.getByRole("button", { name: "Speichern & bestätigen" });
  for (let i = 0; i < 60; i++) {
    if ((await save.count()) === 0) return;
    const err = row.locator("p.text-bad");
    if (await err.count()) throw new Error(`${what}: ${await err.first().textContent()}`);
    await row.page().waitForTimeout(500);
  }
  throw new Error(`${what}: Speichern nicht abgeschlossen`);
}

async function waitConfirmed(row: Locator, what: string) {
  for (let i = 0; i < 60; i++) {
    if (await row.getByText("bestätigt", { exact: true }).count()) return;
    await row.page().waitForTimeout(500);
  }
  throw new Error(`${what}: Bestätigung nicht sichtbar`);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

async function waitIdle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function step(page: Page, caseId: string, s: string) {
  await page.goto(`${BASE}/faelle/${caseId}?schritt=${s}`);
  await waitIdle(page);
}

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill("input[name=email]", EMAIL);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/`, { timeout: 30_000 });
  log("Login erfolgreich");
}

async function createCase(page: Page, c: SyntheticCase): Promise<string> {
  await page.goto(`${BASE}/`);
  await page.fill("input[name=title]", `${c.title} (${MODE}, ${new Date().toISOString().slice(0, 16)})`);
  await page.fill("input[name=customer_name]", c.person.name);
  await page.click("text=Fall anlegen");
  await page.waitForURL(/\/faelle\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const id = /\/faelle\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (!id) throw new Error("Fall-ID nicht gefunden");
  log(`${c.key}: Fall angelegt ${id}`);
  return id;
}

async function uploadDocuments(page: Page, caseId: string, c: SyntheticCase) {
  await step(page, caseId, "dokumente");
  for (const d of c.documents) {
    await page.locator('select:near(:text("Dokumentart"))').first().selectOption(d.role);
    await page.setInputFiles('input[type=file][multiple]', path.join(here, "../fixtures/synthetic", c.dir, d.file));
    await page.getByRole("button", { name: /hochladen und bereinigen/ }).click();
    await page.getByText(/personenbezogene Angabe\(n\) entfernt|Fehler|fehlgeschlagen/).last().waitFor({ timeout: 280_000 });
    const txt = await page.locator("ul.text-xs li").allTextContents();
    log(`${c.key}: ${txt.at(-1)}`);
    if (txt.join(" ").match(/Fehler|fehlgeschlagen/)) throw new Error(`Upload ${d.file} fehlgeschlagen`);
  }
  await page.reload();
  await waitIdle(page);
  await shot(page, `${c.key}-1-dokumente-bereinigt`);
  // Freigabe der bereinigten Fassung
  for (;;) {
    const btn = page.getByRole("button", { name: "Bereinigte Fassung geprüft – freigeben" }).first();
    if ((await btn.count()) === 0) break;
    await btn.click();
    await page.waitForTimeout(1500);
    await waitIdle(page);
  }
  log(`${c.key}: bereinigte Fassungen freigegeben`);
}

async function confirmFields(page: Page, supabase: SupabaseClient, caseId: string, c: SyntheticCase) {
  await step(page, caseId, "erkennung");
  if (MODE === "live") {
    await page.getByRole("button", { name: /Erkennung (starten|erneut ausführen)/ }).click();
    await page.getByText(/Feld\(er\) erkannt|fehlgeschlagen|nicht gesetzt|Fehler/).first().waitFor({ timeout: 300_000 });
    log(`${c.key}: Erkennung: ${(await page.locator(".rounded-md.border").filter({ hasText: /erkannt|fehlgeschlagen/ }).first().textContent())?.slice(0, 300)}`);
    await page.reload();
    await waitIdle(page);
    await shot(page, `${c.key}-2-erkennung`);
  }
  const { data: fields } = await supabase.from("case_fields").select("key,value,status").eq("case_id", caseId);
  const recognized = new Map((fields ?? []).map((f) => [f.key as string, f.value]));
  const fieldResults: Record<string, { expected: unknown; recognized: unknown; ok: boolean }> = {};
  for (const [key, expected] of Object.entries(c.expectedFields)) {
    const label = FIELD_LABELS[key];
    if (!label) throw new Error(`Label fehlt für ${key}`);
    const rec = recognized.get(key);
    const ok = rec !== undefined && same(rec, expected);
    fieldResults[key] = { expected, recognized: rec ?? null, ok };
    const row = rowByLabel(page, label);
    if (ok) {
      const btn = row.getByRole("button", { name: "Bestätigen" });
      if (await btn.count()) await btn.click();
    } else {
      if (MODE === "live") protocol.deviations.push({ case: c.key, kind: "field", key, expected, recognized: rec ?? null });
      await row.getByRole("button", { name: /Erfassen|Korrigieren/ }).click();
      if (ENUM_FIELDS.has(key)) await row.locator("select").selectOption(String(expected));
      else await row.locator("input").first().fill(toInput(key, expected));
      await row.locator("input").last().fill(MODE === "live" ? "Abnahmetest: korrigiert gegen Soll" : `Abnahmetest: Soll-Wert laut ${c.documents[0]?.file}`);
      await row.getByRole("button", { name: "Speichern & bestätigen" }).click();
      await waitSaved(row, `Feld ${key}`);
    }
    await waitConfirmed(row, `Feld ${key}`);
  }
  // übrige Vorschläge der KI: als geprüft bestätigen (Berater-Entscheidung im Abnahmetest)
  for (;;) {
    const btn = page.getByRole("button", { name: "Bestätigen", exact: true }).first();
    if ((await btn.count()) === 0) break;
    await btn.click();
    await page.waitForTimeout(700);
    await waitIdle(page);
  }
  await page.reload();
  await shot(page, `${c.key}-3-vertragsdaten-bestaetigt`);
  return fieldResults;
}

async function assignTariff(page: Page, caseId: string, c: SyntheticCase) {
  await step(page, caseId, "tarif");
  const cat = c.catalog;
  const existingGen = page.locator("tr").filter({ hasText: cat.tariffName }).filter({ hasText: new RegExp(`^.*${cat.generation}.*$`) }).getByRole("button", { name: "Zuordnen" });
  if ((await existingGen.count()) > 0) {
    await existingGen.first().click();
    log(`${c.key}: Katalogtreffer zugeordnet`);
  } else {
    await page.getByText("Neuen Katalogeintrag anlegen").click();
    const form = page.locator("form").filter({ hasText: "Generation / Bedingungsstand" });
    const insurerSelect = form.locator("select[name=insurer_id]");
    const insurerOption = insurerSelect.locator("option", { hasText: cat.insurer });
    if ((await insurerOption.count()) > 0) await insurerSelect.selectOption({ label: cat.insurer });
    else await form.locator("input[name=insurer_name]").fill(cat.insurer);
    const tariffSelect = form.locator("select[name=tariff_id]");
    const tariffOption = tariffSelect.locator("option", { hasText: `${cat.tariffName} (${cat.tariffCode})` });
    if ((await tariffOption.count()) > 0) {
      await tariffSelect.selectOption({ label: `${cat.tariffName} (${cat.tariffCode})` });
    } else {
      await form.locator("input[name=tariff_name]").fill(cat.tariffName);
      await form.locator("input[name=tariff_code]").fill(cat.tariffCode);
      await form.locator("select[name=layer]").selectOption(cat.layer);
      await form.locator("select[name=product_type]").selectOption(cat.productType);
    }
    await form.locator("input[name=generation_label]").fill(cat.generation);
    await form.getByRole("button", { name: /Anlegen und diesem Fall zuordnen/ }).click();
    log(`${c.key}: Katalogeintrag angelegt und zugeordnet`);
  }
  await page.getByText(/^Zugeordnet:/).waitFor({ timeout: 30_000 });
  // Bedingungswerk aus der Bibliothek: vorhanden oder hochladen
  await page.reload();
  await waitIdle(page);
  const already = page.locator("tr").filter({ hasText: c.library.title }).filter({ hasText: "gültig" });
  if ((await already.count()) === 0) {
    await page.setInputFiles('input[type=file][accept*="pdf"]', path.join(here, "../fixtures/synthetic", c.dir, c.library.file));
    await page.locator('select:near(:text("Art"))').first().selectOption(c.library.kind);
    await page.getByPlaceholder("z. B. AVB FondsRente Stand 01/2019").fill(c.library.title);
    await page.getByRole("button", { name: "In Bibliothek ablegen" }).click();
    await page.getByText(/Abgelegt|bereits in der Bibliothek|fehlgeschlagen/).first().waitFor({ timeout: 120_000 });
    log(`${c.key}: Bedingungswerk in Bibliothek abgelegt`);
  } else log(`${c.key}: Bedingungswerk lag bereits in der Bibliothek`);
  await page.reload();
  await shot(page, `${c.key}-4-tarif-bibliothek`);
}

async function confirmCosts(page: Page, supabase: SupabaseClient, caseId: string, c: SyntheticCase) {
  await step(page, caseId, "kosten");
  if (MODE === "live") {
    const btn = page.getByRole("button", { name: /Kostenklauseln aus/ }).first();
    if (await btn.count()) {
      await btn.click();
      await page.getByText(/Vorschlag\/Vorschläge|Fehler|fehlgeschlagen/).first().waitFor({ timeout: 300_000 });
      await page.reload();
      await waitIdle(page);
      await shot(page, `${c.key}-5-kostenvorschlaege`);
    }
  }
  const { data: cs } = await supabase.from("cases").select("generation_id").eq("id", caseId).single();
  const { data: items } = await supabase.from("cost_items").select("id,key,value,status,generation_id,case_id").or(`generation_id.eq.${cs?.generation_id},case_id.eq.${caseId}`).neq("status", "rejected");
  const costResults: Record<string, { expected: unknown; proposed: unknown; ok: boolean }> = {};
  const all: Array<[string, unknown, "generation" | "case"]> = [
    ...Object.entries(c.expectedCosts).map(([k, v]) => [k, v, "generation"] as [string, unknown, "generation"]),
    ...Object.entries(c.caseOverrides).map(([k, v]) => [k, v, "case"] as [string, unknown, "case"]),
  ];
  for (const [key, expected, scope] of all) {
    const label = COST_LABELS[key];
    if (!label) throw new Error(`Kostenlabel fehlt für ${key}`);
    const item = (items ?? []).find((i) => i.key === key && (scope === "generation" ? i.generation_id : i.case_id));
    const ok = !!item && (item.value === null ? expected === null : same(item.value, expected));
    costResults[`${scope}:${key}`] = { expected, proposed: item?.value ?? null, ok };
    const row = rowByLabel(page, label);
    if (ok && item?.status === "confirmed") continue;
    if (ok && item?.status === "proposed") {
      await row.getByRole("button", { name: scope === "generation" ? "Tarifwert bestätigen" : "Abweichung bestätigen" }).click();
    } else {
      if (MODE === "live" && scope === "generation") protocol.deviations.push({ case: c.key, kind: "cost", key, expected, recognized: item?.value ?? null });
      await row.getByRole("button", { name: /Erfassen|Korrigieren/ }).click();
      const controls = row.locator("select, input");
      const first = controls.first();
      if ((await first.evaluate((el) => el.tagName)) === "SELECT") await first.selectOption(String(expected));
      else await first.fill(toInput(key, expected));
      await row.locator("select").filter({ hasText: "gilt für die Tarifgeneration" }).selectOption(scope);
      const docSelect = row.locator("select").filter({ hasText: "Fundstelle: Freitext" });
      if (scope === "generation") {
        await docSelect.selectOption({ index: 1 });
        await row.getByPlaceholder("Seite").fill("1");
        await row.getByPlaceholder(/Abschnitt\/Zitat/).fill("Abnahmetest: Wert laut Bedingungswerk");
      } else {
        await row.getByPlaceholder(/Fundstelle, z. B./).fill(`Abnahmetest: laut ${c.documents[0]?.file} (Fondsauswahl/Rentenfaktor)`);
      }
      await row.getByRole("button", { name: "Speichern & bestätigen" }).click();
      await waitSaved(row, `Kosten ${key}`);
    }
    await waitConfirmed(row, `Kosten ${key}`);
  }
  // übrige KI-Vorschläge außerhalb des Solls verwerfen
  await page.reload();
  for (;;) {
    const btn = page.getByRole("button", { name: "Verwerfen" }).first();
    if ((await btn.count()) === 0) break;
    await btn.click();
    await page.waitForTimeout(700);
    await waitIdle(page);
  }
  await page.reload();
  await page.getByRole("button", { name: /Kostenfaktoren abschließen|Erneut abschließen/ }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  await shot(page, `${c.key}-6-kosten-bestaetigt`);
  const { data: after } = await supabase.from("cases").select("costs_confirmed_at,fields_confirmed_at,status").eq("id", caseId).single();
  if (!after?.costs_confirmed_at) throw new Error(`${c.key}: Kostenfaktoren nicht abgeschlossen (${JSON.stringify(after)})`);
  log(`${c.key}: Kostenfaktoren vollständig bestätigt`);
  return costResults;
}

async function analysisScenariosReport(page: Page, caseId: string, c: SyntheticCase) {
  await step(page, caseId, "analyse");
  await page.getByRole("button", { name: "Annahmen speichern" }).first().click();
  await page.getByText(/Gespeichert/).first().waitFor({ timeout: 20_000 });
  await shot(page, `${c.key}-7-analyse`);
  const pageText = await page.locator("main").innerText();
  const pibLine = pageText.split("\n").find((l) => /PIB/.test(l) && /Abweichung/.test(l));
  await step(page, caseId, "szenarien");
  await page.waitForTimeout(1500);
  await shot(page, `${c.key}-8-szenarien`);
  const scen = await page.locator("main").innerText();
  if (/empfohlen/i.test(scen.replace(/keine Empfehlung|kein Szenario wird[^.]*empfohlen/gi, ""))) log(`${c.key}: WARNUNG – Wort „empfohlen“ auf der Szenarioseite`);
  await step(page, caseId, "report");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 240_000 }), page.getByRole("button", { name: "PDF erzeugen" }).click()]);
  const pdfPath = path.join(OUT, `${c.key}-Klarwert-Analyse.pdf`);
  await download.saveAs(pdfPath);
  log(`${c.key}: Report erzeugt ${pdfPath}`);
  await page.goto(`${BASE}/report/${caseId}`);
  await page.locator('[data-report-ready="true"]').waitFor({ state: "attached", timeout: 60_000 });
  await shot(page, `${c.key}-9-report-seite`);
  return { pibLine: pibLine ?? null, pdf: pdfPath };
}

async function compare(page: Page, caseIds: string[]) {
  const qs = caseIds.map((id) => `faelle=${id}`).join("&");
  await page.goto(`${BASE}/vergleich?${qs}`);
  await waitIdle(page);
  await page.waitForTimeout(1500);
  await shot(page, "vergleich");
  log("Vergleich der drei Fälle dargestellt");
}

async function gateNegative(page: Page): Promise<boolean> {
  // neuer Fall ohne Bestätigungen: Report-API muss ablehnen
  const id = await createCase(page, { ...CASES.offer, title: "Gate-Negativtest" } as SyntheticCase);
  const res = await page.request.post(`${BASE}/api/cases/${id}/report`);
  log(`Gate-Negativtest: HTTP ${res.status()}`);
  return res.status() === 409;
}

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error("KW_EMAIL und KW_PASSWORD setzen");
  if (!SUPABASE_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY setzen");
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw error;
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, locale: "de-DE" });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  try {
    await login(page);
    const ids: string[] = [];
    for (const c of [CASES.riester, CASES.layer3, CASES.offer] as SyntheticCase[]) {
      const id = await createCase(page, c);
      ids.push(id);
      await uploadDocuments(page, id, c);
      const fields = await confirmFields(page, supabase, id, c);
      await assignTariff(page, id, c);
      const costs = await confirmCosts(page, supabase, id, c);
      const result = await analysisScenariosReport(page, id, c);
      protocol.cases[c.key] = { caseId: id, fields, costs, ...result };
    }
    await compare(page, ids);
    protocol.cases.gateNegative = { reportBlocked: await gateNegative(page) };
    log("Abnahme-Durchlauf abgeschlossen");
  } catch (e) {
    await shot(page, "fehler").catch(() => undefined);
    log(`FEHLER: ${e instanceof Error ? e.stack : String(e)}`);
    process.exitCode = 1;
  } finally {
    writeFileSync(path.join(OUT, "protokoll.json"), JSON.stringify(protocol, null, 2));
    await browser.close();
    console.log(`Ergebnisse: ${OUT}`);
  }
}

void main();
