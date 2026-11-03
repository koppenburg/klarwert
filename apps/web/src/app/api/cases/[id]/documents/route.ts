import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { teamMemberOrNull } from "@/lib/auth";
import { ACCEPTED_MIME, mimeFor } from "@/lib/storage";

export const runtime = "nodejs";

const Body = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().max(25 * 1024 * 1024),
  role: z.enum(["police", "nachtrag", "standmitteilung", "screenshot", "angebot", "pib", "sonstiges"]).default("sonstiges"),
  keepOriginal: z.boolean().default(false),
});

/** Schritt 1 des Uploads: Dokumentzeile anlegen und Upload-Pfad für das Original im privaten Bucket vergeben. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben", details: parsed.error.issues }, { status: 400 });
  const mime = mimeFor(parsed.data.fileName, parsed.data.mimeType);
  if (!ACCEPTED_MIME.includes(mime)) return NextResponse.json({ error: `Dateityp ${mime} wird nicht unterstützt (PDF, PNG, JPG, TXT).` }, { status: 415 });
  const { data, error } = await auth.supabase
    .from("case_documents")
    .insert({
      case_id: id,
      // vorläufiger Name; nach der Bereinigung durch den maskierten Dateinamen ersetzt
      file_name: "upload",
      mime_type: mime,
      size_bytes: parsed.data.sizeBytes,
      doc_role: parsed.data.role,
      keep_original: parsed.data.keepOriginal,
    })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Anlegen fehlgeschlagen" }, { status: 500 });
  const ext = parsed.data.fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "bin";
  const originalPath = `${id}/${data.id}/original.${ext}`;
  await auth.supabase.from("case_documents").update({ original_path: originalPath }).eq("id", data.id);
  return NextResponse.json({ documentId: data.id, originalPath, mimeType: mime });
}
