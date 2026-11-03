import { NextResponse, type NextRequest } from "next/server";
import { teamMemberOrNull } from "@/lib/auth";
import type { CaseDocumentRow } from "@/lib/data";
import { download } from "@/lib/storage";

export const runtime = "nodejs";

/** Bereinigte Seite (Bild oder Text) für die Vorschau beim Berater. Originale werden nie ausgeliefert. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string; page: string }> }) {
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id, page } = await ctx.params;
  const type = request.nextUrl.searchParams.get("type") === "text" ? "text" : "image";
  const { data: doc } = await auth.supabase.from("case_documents").select("*").eq("id", id).maybeSingle<CaseDocumentRow>();
  const meta = doc?.sanitized_pages?.find((p) => p.pageNumber === Number(page));
  if (!meta) return NextResponse.json({ error: "Seite nicht gefunden" }, { status: 404 });
  const path = type === "text" ? meta.textPath : meta.imagePath;
  if (!path) return NextResponse.json({ error: "Kein Bild für diese Seite" }, { status: 404 });
  const data = await download(auth.supabase, "sanitized", path);
  return new NextResponse(new Blob([data as BlobPart]), {
    headers: { "content-type": type === "text" ? "text/plain; charset=utf-8" : "image/png", "cache-control": "private, no-store" },
  });
}
