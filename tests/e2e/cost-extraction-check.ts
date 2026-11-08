/**
 * Prüft die KI-Kostenextraktion gegen die Soll-Kostenfaktoren der synthetischen Fälle.
 * Erwartet je Fall die ID eines BESTÄTIGTEN Bibliotheksdokuments einer Generation ohne bestätigte Kostenwerte.
 *   KW_BASE_URL=… KW_EMAIL=… KW_PASSWORD=… KW_DOCS=riester:<id>,layer3:<id>,offer:<id> npx tsx tests/e2e/cost-extraction-check.ts
 */
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { CASES, type SyntheticCase } from "../fixtures/synthetic/cases";

const BASE = (process.env.KW_BASE_URL ?? "").replace(/\/$/, "");
const EMAIL = process.env.KW_EMAIL ?? "";
const PASSWORD = process.env.KW_PASSWORD ?? "";
const docs = Object.fromEntries((process.env.KW_DOCS ?? "").split(",").map((x) => x.split(":") as [string, string]));

function same(a: unknown, b: unknown): boolean {
  if (typeof b === "number") return typeof a === "number" && Math.abs(a - b) < 1e-6;
  if (typeof b === "boolean") return a === b || a === String(b);
  return a === b;
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://mxakiqfyagaeejldnqaw.supabase.co", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "");
  await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("input[name=email]", EMAIL);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/`);
  let total = 0;
  let hits = 0;
  for (const c of [CASES.riester, CASES.layer3, CASES.offer] as SyntheticCase[]) {
    const docId = docs[c.key];
    if (!docId) continue;
    const t = Date.now();
    const r = await page.request.post(`${BASE}/api/library/${docId}/extract-costs`, { timeout: 330_000 });
    const body = await r.json();
    console.log(`\n${c.key}: HTTP ${r.status()} in ${((Date.now() - t) / 1000).toFixed(0)} s, ${body.proposed} Vorschläge, nicht gefunden: ${(body.notFound ?? []).join(", ")}`);
    const { data: doc } = await sb.from("library_documents").select("generation_id").eq("id", docId).single();
    const { data: items } = await sb.from("cost_items").select("key,value,page,quote,confidence").eq("generation_id", doc?.generation_id);
    for (const [key, expected] of Object.entries(c.expectedCosts)) {
      const it = items?.find((i) => i.key === key);
      // „nicht angegeben“ (null) gilt als getroffen, wenn die KI den Schlüssel nicht vorschlägt
      const ok = expected === null ? !it || it.value === null : !!it && same(it.value, expected);
      total++;
      if (ok) hits++;
      console.log(`  ${ok ? "✓" : "✗"} ${key}: Soll ${JSON.stringify(expected)} · KI ${it ? JSON.stringify(it.value) : "–"}${it?.page ? ` (S. ${it.page}, ${Math.round((it.confidence ?? 0) * 100)} %)` : ""}`);
    }
    const extra = (items ?? []).filter((i) => !(i.key in c.expectedCosts));
    if (extra.length) console.log(`  zusätzlich vorgeschlagen: ${extra.map((i) => `${i.key}=${JSON.stringify(i.value)}`).join(", ")}`);
  }
  console.log(`\nTrefferquote: ${hits}/${total}`);
  await browser.close();
}
void main();
