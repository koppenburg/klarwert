import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { teamMemberOrNull } from "@/lib/auth";

export const runtime = "nodejs";

/** Laufzeitdiagnose (nur Teammitglieder): wo liegen OCR-/PDF-Pakete im Funktions-Bundle? Keine Daten. */
export async function GET() {
  if (!(await teamMemberOrNull())) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const cwd = process.cwd();
  const ls = (p: string) => {
    try {
      return readdirSync(p).slice(0, 40);
    } catch (e) {
      return String(e).slice(0, 80);
    }
  };
  const candidates = ["node_modules/pdfjs-dist", "apps/web/node_modules/pdfjs-dist", "node_modules/@tesseract.js-data/deu", "apps/web/node_modules/@tesseract.js-data/deu", "node_modules/.pnpm"];
  return NextResponse.json({
    cwd,
    metaUrl: import.meta.url,
    ls: { cwd: ls(cwd), nm: ls(path.join(cwd, "node_modules")), root: ls(path.join(cwd, "../..")), rootNm: ls(path.join(cwd, "../../node_modules")), privacyNm: ls(path.join(cwd, "../../packages/privacy/node_modules")) },
    rootPnpm: ls(path.join(cwd, "../../node_modules/.pnpm")).toString().split(",").filter((x) => /pdfjs|tesseract|sharp|canvas|chromium|playwright/.test(x)),
    exists: Object.fromEntries(candidates.map((c) => [c, existsSync(path.join(cwd, c))])),
    pnpm: ls(path.join(cwd, "node_modules/.pnpm")).toString().split(",").filter((x) => /pdfjs|tesseract|sharp|canvas|chromium/.test(x)),
  });
}
