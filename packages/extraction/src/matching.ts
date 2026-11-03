/**
 * Tarif-Matching: erkannte Angaben (Versicherer, Tarifname, Kürzel, Generation) gegen den Tarifkatalog.
 * Aliase sorgen dafür, dass z. B. „ARLP FR70“ und „Alte Leipziger FondsRente FR70“ auf denselben Eintrag zeigen.
 */

export interface CatalogInsurer {
  id: string;
  name: string;
  aliases: string[];
}
export interface CatalogTariff {
  id: string;
  insurerId: string;
  name: string;
  code: string | null;
  aliases: string[];
}
export interface CatalogGeneration {
  id: string;
  tariffId: string;
  label: string;
  validFrom: string | null;
  validTo: string | null;
  aliases: string[];
}
export interface Catalog {
  insurers: CatalogInsurer[];
  tariffs: CatalogTariff[];
  generations: CatalogGeneration[];
}

export interface MatchQuery {
  insurer?: string | null;
  tariffName?: string | null;
  tariffCode?: string | null;
  generation?: string | null;
  contractStart?: string | null;
  /** Freitext, z. B. Zeile aus einem Maklerportal „ARLP FR70 Stand 2019“ */
  freeText?: string | null;
}

export interface MatchCandidate {
  insurerId: string;
  tariffId: string;
  generationId: string | null;
  score: number;
  reasons: string[];
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(ag|se|vvag|gmbh|a g|lebensversicherung|versicherung|lebensversicherungs|lv|leben)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((t) => t.length > 1));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function containsPhrase(haystack: string, needle: string): boolean {
  const h = ` ${normalize(haystack)} `;
  const n = normalize(needle);
  return n.length > 1 && h.includes(` ${n} `);
}

function insurerScore(ins: CatalogInsurer, q: MatchQuery): { score: number; reason?: string } {
  const names = [ins.name, ...ins.aliases];
  const texts = [q.insurer, q.freeText, q.tariffName].filter((x): x is string => !!x);
  for (const t of texts) {
    for (const n of names) {
      if (normalize(t) === normalize(n)) return { score: 1, reason: `Versicherer „${n}“ exakt` };
      if (containsPhrase(t, n)) return { score: 0.9, reason: `Versicherer „${n}“ im Text` };
    }
  }
  const best = Math.max(0, ...texts.flatMap((t) => names.map((n) => jaccard(tokens(t), tokens(n)))));
  return best > 0.3 ? { score: best * 0.8, reason: "Versicherername ähnlich" } : { score: 0 };
}

function tariffScore(t: CatalogTariff, q: MatchQuery): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const texts = [q.tariffName, q.freeText, q.tariffCode].filter((x): x is string => !!x);
  const codes = [t.code, ...t.aliases].filter((x): x is string => !!x);
  if (q.tariffCode && t.code && normalize(q.tariffCode) === normalize(t.code)) {
    score += 0.6;
    reasons.push(`Tarifkürzel ${t.code}`);
  } else if (t.code && texts.some((x) => containsPhrase(x, t.code as string))) {
    score += 0.5;
    reasons.push(`Tarifkürzel ${t.code} im Text`);
  }
  const names = [t.name, ...t.aliases];
  const nameSim = Math.max(0, ...texts.flatMap((x) => names.map((n) => (normalize(x) === normalize(n) ? 1 : jaccard(tokens(x), tokens(n))))));
  if (nameSim > 0) {
    score += 0.4 * nameSim;
    if (nameSim > 0.5) reasons.push(`Tarifname ähnlich (${Math.round(nameSim * 100)} %)`);
  }
  if (codes.length && texts.some((x) => codes.some((c) => containsPhrase(x, c)))) score += 0.05;
  // ein übereinstimmendes Tarifkürzel ist ein starkes Merkmal
  if (reasons.some((r) => r.startsWith("Tarifkürzel"))) score = Math.max(score, 0.9);
  return { score: Math.min(1, score), reasons };
}

function generationScore(g: CatalogGeneration, q: MatchQuery): { score: number; reason?: string } {
  if (q.generation && [g.label, ...g.aliases].some((l) => normalize(l) === normalize(q.generation as string) || containsPhrase(q.generation as string, l))) {
    return { score: 1, reason: `Generation „${g.label}“` };
  }
  if (q.contractStart) {
    const d = q.contractStart.slice(0, 10);
    if ((!g.validFrom || d >= g.validFrom) && (!g.validTo || d <= g.validTo)) return { score: 0.7, reason: `Vertragsbeginn im Gültigkeitszeitraum von „${g.label}“` };
  }
  return { score: 0 };
}

/** Rangliste der Katalogeinträge; Score 0–1. Ab 0,75 gilt ein Treffer als Vorschlag, bestätigt wird immer vom Berater. */
export function matchTariff(catalog: Catalog, q: MatchQuery): MatchCandidate[] {
  const out: MatchCandidate[] = [];
  for (const ins of catalog.insurers) {
    const is = insurerScore(ins, q);
    if (is.score === 0) continue;
    for (const t of catalog.tariffs.filter((x) => x.insurerId === ins.id)) {
      const ts = tariffScore(t, q);
      if (ts.score === 0) continue;
      const gens = catalog.generations.filter((g) => g.tariffId === t.id);
      const scored = gens.map((g) => ({ g, s: generationScore(g, q) })).sort((a, b) => b.s.score - a.s.score);
      const bestGen = scored[0];
      const genScore = bestGen?.s.score ?? 0;
      const score = 0.35 * is.score + 0.5 * ts.score + 0.15 * genScore;
      out.push({
        insurerId: ins.id,
        tariffId: t.id,
        generationId: bestGen && bestGen.s.score > 0 ? bestGen.g.id : null,
        score,
        reasons: [is.reason, ...ts.reasons, bestGen?.s.reason].filter((x): x is string => !!x),
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export const MATCH_SUGGEST_THRESHOLD = 0.75;
