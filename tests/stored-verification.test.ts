/**
 * Regression: Die erneute Prüfung vor dem Modellaufruf arbeitet mit der GESPEICHERTEN bereinigten Fassung.
 * Ohne die Koordinaten der Schwärzungen liest die Re-OCR schwarze Balken als Zeichen („EN“) und meldet
 * fälschlich einen Namen. Mit den gespeicherten Koordinaten muss die Prüfung bestehen.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { sanitizeDocument, terminateOcr, verifySanitized, type SanitizedDocument } from "@klarwert/privacy";
import { CASES } from "./fixtures/synthetic/cases";

const here = path.dirname(fileURLToPath(import.meta.url));

afterAll(async () => {
  await terminateOcr();
});

it("gespeicherte und wieder geladene Fassung besteht die Prüfung (Box-Koordinaten werden mitgespeichert)", async () => {
  const c = CASES.riester;
  const data = new Uint8Array(readFileSync(path.join(here, "fixtures/synthetic", c.dir, "standmitteilung-2026.png")));
  const doc = await sanitizeDocument({ data, mimeType: "image/png", fileName: "standmitteilung.png", knownNames: [c.person.name] });
  // wie apps/web/src/lib/documents.ts: Metadaten als JSON in Postgres, Bild/Text im Storage
  const meta = JSON.parse(JSON.stringify(doc.pages.map((p) => ({ pageNumber: p.pageNumber, source: p.source, width: p.width, height: p.height, boxList: p.boxes }))));
  const reloaded: SanitizedDocument = {
    fileName: doc.fileName,
    mimeType: "image/png",
    matches: [],
    warnings: [],
    pages: doc.pages.map((p, i) => ({ ...p, boxes: meta[i].boxList })),
  };
  const v = await verifySanitized(reloaded, { knownNames: [c.person.name] });
  expect(v.findings).toEqual([]);
  expect(v.ok).toBe(true);
}, 180_000);
