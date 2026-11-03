/**
 * Download von PDF-Kandidaten aus der Websuche. Ergebnis wird nie automatisch als gültig übernommen.
 */

export interface DownloadedPdf {
  url: string;
  data: Uint8Array;
  sizeBytes: number;
  contentType: string | null;
}

export class DownloadError extends Error {}

const MAX_BYTES = 40 * 1024 * 1024;

function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname;
    // keine internen Adressen (SSRF-Schutz)
    if (host === "localhost" || /^(\d+\.){3}\d+$/.test(host) || host.endsWith(".local") || host.endsWith(".internal") || host.includes(":")) return false;
    return true;
  } catch {
    return false;
  }
}

export async function downloadPdf(url: string, opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<DownloadedPdf> {
  if (!isAllowedUrl(url)) throw new DownloadError("Nur öffentliche https-Adressen sind erlaubt.");
  const f = opts.fetchImpl ?? fetch;
  const res = await f(url, { redirect: "follow", signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000), headers: { "user-agent": "Klarwert/1.0 (Bedingungswerk-Abruf)" } });
  if (!res.ok) throw new DownloadError(`Abruf fehlgeschlagen (HTTP ${res.status}).`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new DownloadError("Datei zu groß.");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new DownloadError("Datei zu groß.");
  const magic = new TextDecoder().decode(buf.slice(0, 5));
  if (magic !== "%PDF-") throw new DownloadError("Keine PDF-Datei.");
  return { url: res.url || url, data: buf, sizeBytes: buf.byteLength, contentType: res.headers.get("content-type") };
}
