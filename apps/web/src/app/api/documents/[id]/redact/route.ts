import { applyBoxes } from "@klarwert/privacy";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { teamMemberOrNull } from "@/lib/auth";
import type { CaseDocumentRow } from "@/lib/data";
import { processDocument } from "@/lib/documents";
import { download, upload } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

const BoxSchema = z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() });
const Body = z.object({ originalFileName: z.string().optional(), boxes: z.record(z.string(), z.array(BoxSchema)) });

/** Manuelle Nachschwärzung durch den Berater. Mit Original: neu bereinigen (auch Text). Ohne Original: nur Bild. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await ctx.params;
  const body = Body.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungültige Angaben" }, { status: 400 });
  const { data: doc } = await auth.supabase.from("case_documents").select("*").eq("id", id).maybeSingle<CaseDocumentRow>();
  if (!doc) return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
  const boxes: Record<number, z.infer<typeof BoxSchema>[]> = Object.fromEntries(Object.entries(body.data.boxes).map(([k, v]) => [Number(k), v]));
  if (doc.original_path) {
    const { data: c } = await auth.supabase.from("cases").select("customer_name").eq("id", doc.case_id).single<{ customer_name: string | null }>();
    const result = await processDocument(auth.supabase, doc, { originalFileName: body.data.originalFileName ?? doc.file_name, customerName: c?.customer_name ?? null, manualBoxes: boxes });
    return NextResponse.json({ ...result, mode: "neu bereinigt" });
  }
  const pages = doc.sanitized_pages ?? [];
  for (const meta of pages) {
    const b = boxes[meta.pageNumber];
    if (!b?.length || !meta.imagePath) continue;
    const png = await download(auth.supabase, "sanitized", meta.imagePath);
    await upload(auth.supabase, "sanitized", meta.imagePath, await applyBoxes(png, b), "image/png");
    meta.boxList = [...(meta.boxList ?? []), ...b];
    meta.boxes = meta.boxList.length;
  }
  const warnings = [...(doc.sanitize_warnings ?? []), "Nachschwärzung nur im Bild (Original bereits gelöscht) – der Text wurde nicht verändert."];
  await auth.supabase.from("case_documents").update({ sanitized_pages: pages, sanitize_warnings: warnings, sanitized_approved_at: null }).eq("id", doc.id);
  return NextResponse.json({ mode: "nur Bild", warnings });
}
