import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { teamMemberOrNull } from "@/lib/auth";
import type { CaseDocumentRow } from "@/lib/data";
import { processDocument } from "@/lib/documents";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ originalFileName: z.string().min(1).max(255) });

/** Schritt 2 des Uploads: Original lokal bereinigen (OCR, Schwärzung, Maskierung). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await ctx.params;
  const body = Body.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungültige Angaben" }, { status: 400 });
  const { data: doc } = await auth.supabase.from("case_documents").select("*").eq("id", id).maybeSingle<CaseDocumentRow>();
  if (!doc) return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
  const { data: c } = await auth.supabase.from("cases").select("customer_name").eq("id", doc.case_id).single<{ customer_name: string | null }>();
  try {
    const result = await processDocument(auth.supabase, doc, { originalFileName: body.data.originalFileName, customerName: c?.customer_name ?? null });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bereinigung fehlgeschlagen" }, { status: 500 });
  }
}
