import { extractPdfText } from "@klarwert/privacy";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { teamMemberOrNull } from "@/lib/auth";
import { matchDocument, type MatchCandidate } from "@/lib/document-match";
import { download } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  storagePath: z.string().min(1).startsWith("recherche/"),
  fileName: z.string().min(1).max(300),
});

/**
 * Sammel-Upload: ein vom Browser in den Bucket „library“ geladenes PDF einem Vorschlag zuordnen.
 * Ohne KI – Dateiname, gefundene Links und Text der ersten drei Seiten. Es wird noch nichts abgelegt.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await params;
  const body = Body.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungültige Angaben" }, { status: 400 });
  const { supabase } = auth;
  try {
    const data = await download(supabase, "library", body.data.storagePath);
    if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: "Keine PDF-Datei" }, { status: 415 });
    const sha256 = createHash("sha256").update(data).digest("hex");
    const [{ data: insurer }, { data: cands }, { data: dup }] = await Promise.all([
      supabase.from("insurers").select("name,aliases").eq("id", id).single<{ name: string; aliases: string[] }>(),
      supabase.from("tariff_candidates").select("id,name,code,documents").eq("insurer_id", id).neq("status", "rejected"),
      supabase.from("library_documents").select("id,title,tariff_candidate_id").eq("sha256", sha256).neq("status", "rejected").limit(1).maybeSingle<{ id: string; title: string; tariff_candidate_id: string | null }>(),
    ]);
    if (!insurer) return NextResponse.json({ error: "Versicherer nicht gefunden" }, { status: 404 });
    let text = "";
    try {
      text = (await extractPdfText(data, { maxPages: 3 })).map((p) => p.text).join("\n");
    } catch {
      // beschädigte oder verschlüsselte PDFs: Zuordnung nur über den Dateinamen
    }
    const candidates: MatchCandidate[] = (cands ?? []).map((c) => ({ id: c.id, name: c.name, code: c.code, documentLinks: (c.documents ?? []) as MatchCandidate["documentLinks"] }));
    const match = matchDocument({ fileName: body.data.fileName, text, candidates, insurerNames: [insurer.name, ...(insurer.aliases ?? [])] });
    return NextResponse.json({ ...match, sizeBytes: data.byteLength, duplicate: dup ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fehler" }, { status: 500 });
  }
}
