import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { teamMemberOrNull } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Laufzeitdiagnose (nur Teammitglieder): Paketpfade im Bundle und optional ein OCR-Probelauf mit synthetischem Bild. Keine Kundendaten. */
export async function GET(request: NextRequest) {
  if (!(await teamMemberOrNull())) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const root = path.join(process.cwd(), "../..");
  const store = path.join(root, "node_modules/.pnpm");
  const ls = (p: string) => {
    try {
      return readdirSync(p);
    } catch (e) {
      return [String(e).slice(0, 60)];
    }
  };
  const pnpm = ls(store).filter((x) => /pdfjs|tesseract|sharp|canvas|chromium|playwright|img/.test(x));
  const checks = [
    "tesseract.js@7.0.0/node_modules/tesseract.js/src/worker-script/node/index.js",
    "tesseract.js@7.0.0/node_modules/tesseract.js-core",
    "tesseract.js@7.0.0/node_modules/node-fetch",
    "tesseract.js@7.0.0/node_modules/regenerator-runtime",
    "tesseract.js@7.0.0/node_modules/zlibjs",
    "tesseract.js@7.0.0/node_modules/bmp-js",
    "tesseract.js@7.0.0/node_modules/is-url",
    "tesseract.js@7.0.0/node_modules/wasm-feature-detect",
  ];
  const exists = Object.fromEntries(checks.map((c) => [c, existsSync(path.join(store, c))]));
  let ocr: unknown = "nicht ausgeführt (?ocr=1)";
  if (request.nextUrl.searchParams.get("ocr") === "1") {
    const started = Date.now();
    try {
      const sharp = (await import("sharp")).default;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="120"><rect width="100%" height="100%" fill="white"/><text x="20" y="70" font-size="40" font-family="sans-serif">Vertragsbeginn 01.01.2015</text></svg>`;
      const png = new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
      const { sanitizeDocument } = await import("@klarwert/privacy");
      const doc = await Promise.race([
        sanitizeDocument({ data: png, mimeType: "image/png", fileName: "probe.png" }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Zeitüberschreitung 90 s")), 90_000)),
      ]);
      ocr = { ok: true, ms: Date.now() - started, text: doc.pages[0]?.text, conf: doc.pages[0]?.ocrConfidence, warnings: doc.warnings };
    } catch (e) {
      ocr = { ok: false, ms: Date.now() - started, error: e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 6).join("\n")}` : String(e) };
    }
  }
  return NextResponse.json({ cwd: process.cwd(), pnpm, exists, ocr });
}
