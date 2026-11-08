/**
 * Anthropic-Aufrufe. Modell, Effort, Websuche und Fallback werden über Umgebungsvariablen gesteuert:
 *   ANTHROPIC_API_KEY            (Pflicht)
 *   ANTHROPIC_MODEL              Standard: claude-opus-5-5
 *   ANTHROPIC_EFFORT             low | medium | high | xhigh | max (Standard: high)
 *   ANTHROPIC_FALLBACKS          "default" (serverseitiger Fallback bei Ablehnung) | "off" (Standard: default)
 *   ANTHROPIC_WEBSEARCH_ENABLED  "true" | "false" (Standard: true)
 *   ANTHROPIC_WEBSEARCH_MAX_USES Standard: 5
 *
 * Datenschutz: Vertragsunterlagen dürfen nur als bereinigte Seiten (SanitizedPayload) übergeben werden, deren
 * Prüfung (verifySanitized) erfolgreich war. Bedingungswerke sind unpersönlich und gehen unverändert hinaus.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { CONTRACT_SYSTEM_PROMPT, COST_SYSTEM_PROMPT, FEATURE_SYSTEM_PROMPT, SEARCH_SYSTEM_PROMPT, contractUserPrompt, costUserPrompt, featureUserPrompt, searchUserPrompt } from "./prompts";
import { ContractExtractionRaw, CostExtraction, FeatureExtraction, normalizeContractExtraction, SearchCandidates, type ContractExtraction } from "./schemas";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelConfig {
  model: string;
  effort: Effort;
  fallbacks: boolean;
  webSearchEnabled: boolean;
  webSearchMaxUses: number;
}

export function modelConfigFromEnv(env: Record<string, string | undefined> = process.env): ModelConfig {
  const effort = (env.ANTHROPIC_EFFORT ?? "high") as Effort;
  return {
    model: env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5",
    effort: ["low", "medium", "high", "xhigh", "max"].includes(effort) ? effort : "high",
    fallbacks: (env.ANTHROPIC_FALLBACKS ?? "default") !== "off",
    webSearchEnabled: (env.ANTHROPIC_WEBSEARCH_ENABLED ?? "true") !== "false",
    webSearchMaxUses: Number(env.ANTHROPIC_WEBSEARCH_MAX_USES ?? 5) || 5,
  };
}

/** Bereinigte Seite eines Vertragsdokuments (Ausgabe von @klarwert/privacy). */
export interface SanitizedPageInput {
  fileName: string;
  pageNumber: number;
  text: string;
  /** geschwärztes PNG */
  image?: Uint8Array;
}

/** Nachweis, dass die Bereinigung geprüft wurde – ohne ihn verweigert extractContract den Aufruf. */
export interface SanitizedPayload {
  pages: SanitizedPageInput[];
  verification: { ok: true; checkedAt: string };
}

export class PrivacyGuardError extends Error {}
export class ExtractionError extends Error {}

function client(): Anthropic {
  return new Anthropic({ timeout: 10 * 60 * 1000, maxRetries: 2 });
}

type BetaContent = Anthropic.Beta.Messages.BetaContentBlockParam;

function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

async function parseWith<T extends z.ZodType>(
  cfg: ModelConfig,
  schema: T,
  system: string,
  content: BetaContent[],
  extra: { tools?: Anthropic.Beta.Messages.BetaToolUnion[] } = {},
): Promise<{ parsed: z.infer<T>; model: string; message: Anthropic.Beta.Messages.BetaMessage }> {
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content }];
  for (let turn = 0; turn < 5; turn++) {
    const response = await client().beta.messages.parse({
      model: cfg.model,
      max_tokens: 16000,
      system,
      messages,
      output_config: { effort: cfg.effort, format: betaZodOutputFormat(schema) },
      ...(cfg.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      ...(extra.tools ? { tools: extra.tools } : {}),
    });
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content as unknown as BetaContent[] });
      continue;
    }
    if (response.stop_reason === "refusal") throw new ExtractionError("Das Modell hat die Anfrage abgelehnt.");
    if (response.stop_reason === "max_tokens") throw new ExtractionError("Antwort wurde abgeschnitten (max_tokens).");
    const parsed = response.parsed_output as z.infer<T> | null;
    if (parsed === null || parsed === undefined) throw new ExtractionError("Antwort entsprach nicht dem Schema.");
    return { parsed, model: response.model, message: response };
  }
  throw new ExtractionError("Zu viele Unterbrechungen (pause_turn).");
}

/** Erkennung der Vertragsdaten aus bereinigten Unterlagen. */
export async function extractContract(payload: SanitizedPayload, cfg: ModelConfig = modelConfigFromEnv()): Promise<{ data: ContractExtraction; model: string }> {
  if (!payload.verification || payload.verification.ok !== true) throw new PrivacyGuardError("Bereinigung nicht geprüft – kein Modellaufruf.");
  if (payload.pages.length === 0) throw new ExtractionError("Keine Seiten übergeben.");
  const content: BetaContent[] = [];
  for (const p of payload.pages) {
    content.push({ type: "text", text: `=== Datei: ${p.fileName}, Seite ${p.pageNumber} ===` });
    if (p.image) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: toBase64(p.image) } });
    if (p.text.trim()) content.push({ type: "text", text: p.text });
  }
  content.push({ type: "text", text: contractUserPrompt([...new Set(payload.pages.map((p) => p.fileName))]) });
  const { parsed, model } = await parseWith(cfg, ContractExtractionRaw, CONTRACT_SYSTEM_PROMPT, content);
  return { data: normalizeContractExtraction(parsed), model };
}

/** Kostenklauseln aus einem (unpersönlichen) Bedingungswerk – als Seitentext oder als PDF. */
export async function extractCosts(
  input: { pages?: Array<{ pageNumber: number; text: string }>; pdf?: Uint8Array; meta: { insurer: string; tariff: string; generation?: string | null; title: string } },
  cfg: ModelConfig = modelConfigFromEnv(),
): Promise<{ data: CostExtraction; model: string }> {
  const content: BetaContent[] = [];
  const hasText = (input.pages ?? []).some((p) => p.text.trim().length > 50);
  if (hasText) {
    for (const p of input.pages ?? []) content.push({ type: "text", text: `=== Seite ${p.pageNumber} ===\n${p.text}` });
  } else if (input.pdf) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: toBase64(input.pdf) } });
  } else {
    throw new ExtractionError("Bedingungswerk ohne Text und ohne PDF.");
  }
  content.push({ type: "text", text: costUserPrompt(input.meta) });
  const { parsed, model } = await parseWith(cfg, CostExtraction, COST_SYSTEM_PROMPT, content);
  return { data: parsed, model };
}

export interface SearchResult {
  candidates: SearchCandidates["candidates"];
  /** URLs, die die Websuche tatsächlich geliefert hat (Schutz gegen erfundene URLs) */
  searchResultUrls: string[];
  remarks: string | null;
  model: string;
}

/** Stufe (b): Websuche nach dem Bedingungswerk. Ergebnisse sind Vorschläge – nie automatisch gültig. */
export async function searchConditions(
  meta: { insurer: string; tariff: string; tariffCode?: string | null; generation?: string | null; contractStart?: string | null },
  cfg: ModelConfig = modelConfigFromEnv(),
): Promise<SearchResult> {
  if (!cfg.webSearchEnabled) throw new ExtractionError("Websuche ist deaktiviert (ANTHROPIC_WEBSEARCH_ENABLED=false).");
  const { parsed, model, message } = await parseWith(cfg, SearchCandidates, SEARCH_SYSTEM_PROMPT, [{ type: "text", text: searchUserPrompt(meta) }], {
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: cfg.webSearchMaxUses, user_location: { type: "approximate", country: "DE" } }],
  });
  const urls = new Set<string>();
  for (const block of message.content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) if (r.type === "web_search_result") urls.add(r.url);
    }
  }
  return { candidates: parsed.candidates, searchResultUrls: [...urls], remarks: parsed.remarks, model };
}

/** Tarifmerkmale, Beitragsstaffeln und Rentenfaktor-Tabelle aus einem (unpersönlichen) Bedingungswerk. */
export async function extractFeatures(
  input: { pages?: Array<{ pageNumber: number; text: string }>; pdf?: Uint8Array; meta: { insurer: string; tariff: string; generation?: string | null; title: string } },
  cfg: ModelConfig = modelConfigFromEnv(),
): Promise<{ data: FeatureExtraction; model: string }> {
  const content: BetaContent[] = [];
  const hasText = (input.pages ?? []).some((p) => p.text.trim().length > 50);
  if (hasText) {
    for (const p of input.pages ?? []) content.push({ type: "text", text: `=== Seite ${p.pageNumber} ===\n${p.text}` });
  } else if (input.pdf) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: toBase64(input.pdf) } });
  } else {
    throw new ExtractionError("Bedingungswerk ohne Text und ohne PDF.");
  }
  content.push({ type: "text", text: featureUserPrompt(input.meta) });
  const { parsed, model } = await parseWith(cfg, FeatureExtraction, FEATURE_SYSTEM_PROMPT, content);
  return { data: parsed, model };
}
