import type { SupabaseClient } from "@supabase/supabase-js";

export type Bucket = "originals" | "sanitized" | "library" | "reports";

export async function download(supabase: SupabaseClient, bucket: Bucket, path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Datei nicht gefunden (${bucket}/${path}): ${error?.message ?? ""}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function upload(supabase: SupabaseClient, bucket: Bucket, path: string, data: Uint8Array | string, contentType: string): Promise<void> {
  const body = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data as BlobPart], { type: contentType });
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`Upload fehlgeschlagen (${bucket}/${path}): ${error.message}`);
}

export async function removeObjects(supabase: SupabaseClient, bucket: Bucket, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw new Error(`Löschen fehlgeschlagen (${bucket}): ${error.message}`);
}

export async function listPrefix(supabase: SupabaseClient, bucket: Bucket, prefix: string): Promise<string[]> {
  const { data } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  return (data ?? []).map((o) => `${prefix}/${o.name}`);
}

export function mimeFor(fileName: string, declared?: string | null): string {
  const lower = fileName.toLowerCase();
  if (declared && declared !== "application/octet-stream") return declared;
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv")) return "text/plain";
  return declared ?? "application/octet-stream";
}

export const ACCEPTED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"];
