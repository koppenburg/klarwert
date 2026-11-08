import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { teamMemberOrNull } from "@/lib/auth";
import { storeLibraryPdf } from "@/lib/library";
import { download, removeObjects } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  storagePath: z.string().min(1),
  generationId: z.string().uuid().nullable(),
  kind: z.enum(["avb", "tarifbestimmungen", "pib", "kostenblatt", "sonstiges"]),
  title: z.string().min(1).max(300),
  confirmed: z.boolean(),
  /** optional: Dokument einem Vorschlag der Tarifrecherche zuordnen */
  tariffCandidateId: z.string().uuid().nullable().optional(),
  /** optional: Fundstelle im Netz (Link aus der Recherche, über den der Berater das PDF geladen hat) */
  sourceUrl: z.string().url().startsWith("https://").nullable().optional(),
});

/** Nach direktem Upload in den Bucket „library“: Seitentexte erfassen und Eintrag anlegen. */
export async function POST(request: NextRequest) {
  const auth = await teamMemberOrNull();
  if (!auth) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const body = Body.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungültige Angaben" }, { status: 400 });
  try {
    const data = await download(auth.supabase, "library", body.data.storagePath);
    if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: "Keine PDF-Datei" }, { status: 415 });
    const r = await storeLibraryPdf(auth.supabase, {
      data,
      generationId: body.data.generationId,
      kind: body.data.kind,
      title: body.data.title,
      sourceKind: "upload",
      sourceUrl: body.data.sourceUrl ?? null,
      status: body.data.confirmed ? "confirmed" : "candidate",
      confirmedBy: auth.user.id,
      storagePath: body.data.storagePath,
    });
    // bereits vorhandenes Dokument: hochgeladene Kopie wieder entfernen
    if (r.duplicateOf) await removeObjects(auth.supabase, "library", [body.data.storagePath]).catch(() => undefined);
    if (r.duplicateOf && body.data.generationId) {
      await auth.supabase.from("library_documents").update({ generation_id: body.data.generationId }).eq("id", r.id).is("generation_id", null);
    }
    if (body.data.tariffCandidateId) {
      await auth.supabase.from("library_documents").update({ tariff_candidate_id: body.data.tariffCandidateId }).eq("id", r.id).is("tariff_candidate_id", null);
    }
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fehler" }, { status: 500 });
  }
}
