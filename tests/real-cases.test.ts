/**
 * Echtfälle (anonymisiert) aus tests/fixtures/real/<fall>/: Prüfung, dass die abgelegten Dokumente keine
 * erkennbaren personenbezogenen Daten mehr enthalten. Ohne Fälle wird der Test übersprungen.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { sanitizeDocument, terminateOcr } from "@klarwert/privacy";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/real");
const cases = readdirSync(root).filter((d) => statSync(path.join(root, d)).isDirectory() && existsSync(path.join(root, d, "soll.json")));
const MIME: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".txt": "text/plain" };

afterAll(async () => {
  await terminateOcr();
});

describe.skipIf(cases.length === 0)("Echtfälle: anonymisierte Dokumente", () => {
  for (const c of cases) {
    const dir = path.join(root, c, "dokumente");
    const files = existsSync(dir) ? readdirSync(dir) : [];
    it.each(files)(`${c}: %s enthält keine erkennbaren personenbezogenen Daten`, async (f) => {
      const mime = MIME[path.extname(f).toLowerCase()];
      if (!mime) return;
      const doc = await sanitizeDocument({ data: new Uint8Array(readFileSync(path.join(dir, f))), mimeType: mime, fileName: f });
      expect(doc.matches.map((m) => m.kind)).toEqual([]);
    }, 180_000);
  }
});

it("Echtfall-Verzeichnis ist vorhanden", () => {
  expect(existsSync(path.join(root, "README.md"))).toBe(true);
});
