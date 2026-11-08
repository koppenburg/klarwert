/**
 * Zuordnung hochgeladener Bedingungswerke zu Vorschlägen der Tarifrecherche – ohne KI, nur über
 * Dateiname, gefundene Links und den Text der ersten Seiten. Ergebnis ist immer ein Vorschlag, den der Berater bestätigt.
 */
import type { DocLink } from "./document-priority";

export type DocKind = "avb" | "tarifbestimmungen" | "kostenblatt" | "pib" | "sonstiges";

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  avb: "Allgemeine Versicherungsbedingungen",
  tarifbestimmungen: "Tarifbestimmungen",
  kostenblatt: "Kosteninformation",
  pib: "Basis-/Produktinformationsblatt",
  sonstiges: "Sonstiges",
};

export interface MatchCandidate {
  id: string;
  name: string;
  code: string | null;
  documentLinks: DocLink[];
}

export interface MatchInput {
  fileName: string;
  /** Text der ersten Seiten (leer bei Scans ohne Textebene) */
  text: string;
  candidates: MatchCandidate[];
  /** Name und Aliasse des Versicherers – tragen nichts zur Unterscheidung bei */
  insurerNames: string[];
}

export interface MatchResult {
  candidateId: string | null;
  confidence: "sicher" | "wahrscheinlich" | "offen";
  kind: DocKind;
  title: string;
  sourceUrl: string | null;
  reason: string;
  ranking: Array<{ candidateId: string; score: number }>;
}

const STOPWORDS = new Set([
  "die", "der", "das", "und", "fuer", "mit", "von", "zur", "zum", "im", "in", "de", "ag", "se", "gmbh", "vvag", "ev",
  "tarif", "tarife", "versicherung", "lebensversicherung", "rentenversicherung", "pdf", "stand", "dokument",
]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s: string, extraStop: Set<string> = new Set()): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t) && !extraStop.has(t));
}

const compact = (s: string) => normalize(s).replace(/ /g, "");

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Dateiname ohne Endung und ohne Browser-Zusatz „ (1)“. */
export function fileStem(fileName: string): string {
  return safeDecode(fileName.split(/[\\/]/).pop() ?? fileName)
    .replace(/\.pdf$/i, "")
    .replace(/\s*\(\d+\)$/, "")
    .trim();
}

/** Mögliche Dateinamen, unter denen der Browser ein PDF dieses Links speichert. */
function linkStems(url: string): string[] {
  try {
    const u = new URL(url);
    const out = [safeDecode(u.pathname.split("/").pop() ?? "")];
    for (const v of u.searchParams.values()) if (v.length >= 4) out.push(safeDecode(v.split("/").pop() ?? v));
    return out.map((s) => s.replace(/\.pdf$/i, "")).filter((s) => compact(s).length >= 4);
  } catch {
    return [];
  }
}

const KIND_PATTERNS: Array<[DocKind, RegExp]> = [
  ["pib", /basisinformationsblatt|wesentliche informationen|priips?|produktinformationsblatt|\bkid\b|\bbib\b|\bpib\b/],
  ["tarifbestimmungen", /tarifbestimmung|besondere bedingungen/],
  ["kostenblatt", /kosteninformation|kostenblatt|kostenuebersicht|ausweis der kosten|kosten und gebuehren|informationen zu den kosten/],
  ["avb", /allgemeine (versicherungs)?bedingungen|versicherungsbedingungen|\bavb\b|bedingungen fuer die/],
];

/** Dokumentart: zuerst der Dateiname, sonst der Begriff, der im Seitenkopf am frühesten vorkommt. */
export function guessKind(fileName: string, text: string): DocKind {
  const name = normalize(fileStem(fileName));
  for (const [k, re] of KIND_PATTERNS) if (re.test(name)) return k;
  const head = normalize(text.slice(0, 2000));
  let best: { kind: DocKind; at: number } | null = null;
  for (const [k, re] of KIND_PATTERNS) {
    const m = re.exec(head);
    if (m && (!best || m.index < best.at)) best = { kind: k, at: m.index };
  }
  return best?.kind ?? "sonstiges";
}

/**
 * Tarifkürzel als ganze Wortfolge suchen. Ein kürzeres Kürzel zählt nicht, wo an derselben Stelle das längere
 * Kürzel eines anderen Tarifs steht („MRI“ nicht in „MRI-R“).
 */
function findCodeHits(candidates: MatchCandidate[], hay: string, stemCompact: string): Set<string> {
  const words = normalize(hay).split(" ").filter(Boolean);
  const codes = candidates
    .map((c) => ({ id: c.id, seq: c.code ? normalize(c.code).split(" ").filter(Boolean) : [] }))
    .filter((c) => c.seq.join("").length >= 2);
  const at = (seq: string[], p: number) => seq.every((w, k) => words[p + k] === w);
  const hits = new Set<string>();
  for (const c of codes) {
    for (let p = 0; p < words.length; p++) {
      if (!at(c.seq, p)) continue;
      const longer = codes.some((o) => o.seq.length > c.seq.length && o.seq.slice(0, c.seq.length).join(" ") === c.seq.join(" ") && at(o.seq, p));
      if (!longer) {
        hits.add(c.id);
        break;
      }
    }
    // zusammengeschriebene Dateinamen wie „MRIR2015.pdf“ (nur längere Kürzel)
    const cc = c.seq.join("");
    if (!hits.has(c.id) && cc.length >= 4 && stemCompact.includes(cc)) {
      const longer = codes.some((o) => o.seq.join("").length > cc.length && o.seq.join("").startsWith(cc) && stemCompact.includes(o.seq.join("")));
      if (!longer) hits.add(c.id);
    }
  }
  return hits;
}

interface Scored {
  candidateId: string;
  score: number;
  reasons: string[];
  link: DocLink | null;
}

export function matchDocument(input: MatchInput): MatchResult {
  const stem = fileStem(input.fileName);
  const stemCompact = compact(stem);
  const insurerStop = new Set(input.insurerNames.flatMap((n) => tokens(n)));
  const hayText = `${stem} ${input.text.slice(0, 8000)}`;
  const hayTokens = new Set(tokens(hayText));
  const hayNorm = ` ${normalize(hayText)} `;

  // Gewicht je Namensbestandteil: seltene Bestandteile unterscheiden die Tarife (z. B. „Invest“ vs. „Perspektive“)
  const nameTokens = new Map(input.candidates.map((c) => [c.id, [...new Set(tokens(c.name, insurerStop))]]));
  const df = new Map<string, number>();
  for (const ts of nameTokens.values()) for (const t of ts) df.set(t, (df.get(t) ?? 0) + 1);
  const n = Math.max(1, input.candidates.length);
  const weight = (t: string) => Math.log(1 + n / (df.get(t) ?? 1));

  const codeHits = findCodeHits(input.candidates, `${stem} ${input.text.slice(0, 8000)}`, stemCompact);

  const scored: Scored[] = input.candidates.map((c) => {
    let score = 0;
    const reasons: string[] = [];
    let link: DocLink | null = null;

    const urlHit = c.documentLinks.find((l) => linkStems(l.url).some((s) => compact(s) === stemCompact));
    if (urlHit) {
      score += 100;
      link = urlHit;
      reasons.push("Dateiname entspricht einem gefundenen Link");
    }

    if (codeHits.has(c.id)) {
      score += 40;
      reasons.push(`Tarifkürzel ${c.code}`);
    }

    const ts = nameTokens.get(c.id) ?? [];
    if (ts.length) {
      const total = ts.reduce((a, t) => a + weight(t), 0);
      const found = ts.filter((t) => hayTokens.has(t));
      const share = found.reduce((a, t) => a + weight(t), 0) / total;
      if (share > 0) {
        score += Math.round(60 * share);
        if (hayNorm.includes(` ${ts.join(" ")} `)) {
          score += 20;
          reasons.push("Tarifname im Dokument");
        } else reasons.push(`Namensteile: ${found.join(", ")}`);
      }
    }

    if (!link) {
      for (const l of c.documentLinks) {
        const lt = tokens(l.title, insurerStop);
        if (lt.length >= 3 && lt.filter((t) => hayTokens.has(t)).length / lt.length >= 0.8) {
          score += 15;
          link = l;
          reasons.push("Titel eines gefundenen Links im Dokument");
          break;
        }
      }
    }
    return { candidateId: c.id, score, reasons, link };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1]?.score ?? 0;
  const confidence: MatchResult["confidence"] =
    best && best.score >= 80 && best.score - second >= 25 ? "sicher" : best && best.score >= 40 && best.score - second >= 15 ? "wahrscheinlich" : "offen";
  const chosen = confidence === "offen" ? null : best;
  const kind = chosen?.link && chosen.link.kind in DOC_KIND_LABELS && chosen.reasons[0]?.startsWith("Dateiname") ? (chosen.link.kind as DocKind) : guessKind(input.fileName, input.text);
  const cand = chosen ? input.candidates.find((c) => c.id === chosen.candidateId) : undefined;
  const title = chosen?.link?.title ?? (cand ? `${DOC_KIND_LABELS[kind]} – ${cand.name}` : stem.replace(/[_]+/g, " "));

  return {
    candidateId: chosen?.candidateId ?? null,
    confidence,
    kind,
    title,
    sourceUrl: chosen?.link?.url ?? null,
    reason: chosen
      ? chosen.reasons.join("; ")
      : best && best.score > 0
        ? `nicht eindeutig (${scored
            .slice(0, 2)
            .map((s) => input.candidates.find((c) => c.id === s.candidateId)?.name)
            .join(" / ")})`
        : input.text.trim()
          ? "kein Tarif erkannt"
          : "kein Text lesbar (Scan?) und Dateiname ohne Treffer",
    ranking: scored.filter((s) => s.score > 0).map((s) => ({ candidateId: s.candidateId, score: s.score })),
  };
}
