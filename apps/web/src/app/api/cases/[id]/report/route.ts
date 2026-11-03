import { NextResponse, type NextRequest } from "next/server";
import { chromium as playwright, type Browser } from "playwright-core";
import { buildSnapshot } from "@/components/report/snapshot";
import { runFullAnalysis } from "@/lib/analysis";
import { teamMemberOrNull } from "@/lib/auth";
import { loadCaseBundle } from "@/lib/data";

export const runtime = "nodejs";
export const maxDuration = 120;

const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";

async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const { default: chromium } = await import("@sparticuz/chromium");
    return playwright.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  }
  return playwright.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? LOCAL_CHROMIUM, headless: true, args: ["--no-sandbox"] });
}

/** PDF „Klarwert-Analyse“ aus der druckoptimierten Report-Seite. Gate: nur mit vollständig bestätigten Daten. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet oder nicht freigeschaltet" }, { status: 401 });
  const { supabase } = auth;
  const bundle = await loadCaseBundle(supabase, id);
  if (!bundle) return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });

  const full = runFullAnalysis(bundle);
  if (!full.ok) return NextResponse.json({ error: "Report nicht möglich", messages: full.gate.messages }, { status: 409 });
  if (!bundle.case.fields_confirmed_at || !bundle.case.costs_confirmed_at) {
    return NextResponse.json({ error: "Report nicht möglich", messages: ["Vertragsdaten bzw. Kostenfaktoren sind im Fall noch nicht abschließend bestätigt."] }, { status: 409 });
  }

  const snapshot = buildSnapshot(bundle, full);
  const { data: report, error: insertError } = await supabase.from("reports").insert({ case_id: id, snapshot }).select("id").single<{ id: string }>();
  if (insertError || !report) return NextResponse.json({ error: "Report nicht möglich", messages: [insertError?.message ?? "Speichern fehlgeschlagen"] }, { status: 409 });

  const origin = request.nextUrl.origin;
  let browser: Browser | null = null;
  let pdf: Buffer;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext();
    const cookies = request.cookies.getAll().map((c) => ({ name: c.name, value: c.value, url: origin }));
    if (cookies.length) await context.addCookies(cookies);
    const page = await context.newPage();
    const response = await page.goto(`${origin}/report/${id}?reportId=${report.id}`, { waitUntil: "networkidle", timeout: 60_000 });
    if (!response || !response.ok()) throw new Error(`Report-Seite nicht erreichbar (HTTP ${response?.status() ?? "?"})`);
    await page.waitForSelector('[data-report-ready="true"]', { state: "attached", timeout: 30_000 });
    await page.emulateMedia({ media: "print" });
    pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:8px;width:100%;padding:0 14mm;color:#5b6475;display:flex;justify-content:space-between"><span>Klarwert-Analyse · ${bundle.case.case_number}</span><span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span></div>`,
    });
  } catch (e) {
    return NextResponse.json({ error: "PDF-Erzeugung fehlgeschlagen", messages: [e instanceof Error ? e.message : String(e)], reportId: report.id }, { status: 500 });
  } finally {
    await browser?.close();
  }

  const path = `${id}/${report.id}.pdf`;
  const { error: uploadError } = await supabase.storage.from("reports").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (!uploadError) await supabase.from("reports").update({ pdf_path: path }).eq("id", report.id);

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="Klarwert-Analyse_${bundle.case.case_number}.pdf"`,
      "x-report-id": report.id,
      ...(uploadError ? { "x-storage-warning": encodeURIComponent(uploadError.message) } : {}),
    },
  });
}
