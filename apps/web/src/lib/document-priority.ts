/** Auswahl der wichtigsten Dokumente aus langen Linklisten (z. B. ein Basisinformationsblatt je Laufzeit/Garantie). */
export interface DocLink {
  url: string;
  title: string;
  kind: string;
}

const ORDER: Record<string, number> = { avb: 0, kostenblatt: 1, tarifbestimmungen: 2, pib: 3, sonstiges: 4 };
const CAP: Record<string, number> = { avb: 2, kostenblatt: 2, tarifbestimmungen: 2, pib: 2, sonstiges: 2 };

export function prioritizeDocuments<T extends DocLink>(links: T[], max = 8): T[] {
  const seen = new Set<string>();
  const perKind: Record<string, number> = {};
  const sorted = [...links].sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9));
  const out: T[] = [];
  for (const l of sorted) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    if ((perKind[l.kind] ?? 0) >= (CAP[l.kind] ?? 2)) continue;
    perKind[l.kind] = (perKind[l.kind] ?? 0) + 1;
    out.push(l);
    if (out.length >= max) break;
  }
  return out;
}

/** Fehlermeldung eines Downloads, die auf eine Zugangssperre des Versichererservers hindeutet. */
export function isBlocked(status: string): boolean {
  return /HTTP 40[13]|HTTP 429|Zugangssperre/.test(status);
}
