import { expect, it } from "vitest";
import { isBlocked, prioritizeDocuments } from "./document-priority";

it("wählt AVB, Kosten und Tarifbestimmungen vor, höchstens zwei Basisinformationsblätter", () => {
  const links = [
    ...Array.from({ length: 10 }, (_, i) => ({ url: `https://x.de/bib${i}.pdf`, title: `BIB ${i}`, kind: "pib" })),
    { url: "https://x.de/avb.pdf", title: "AVB", kind: "avb" },
    { url: "https://x.de/kosten.pdf", title: "Kosten", kind: "kostenblatt" },
    { url: "https://x.de/avb.pdf", title: "AVB doppelt", kind: "avb" },
  ];
  const top = prioritizeDocuments(links, 6);
  expect(top.map((t) => t.title)).toEqual(["AVB", "Kosten", "BIB 0", "BIB 1"]);
});

it("erkennt Zugangssperren", () => {
  expect(isBlocked("nicht abrufbar: HTTP 403 von goa-eportale.allianz.de (text/html)")).toBe(true);
  expect(isBlocked("nicht abrufbar: Keine PDF-Datei (text/html von x.de, vermutlich Webseite oder Zugangssperre)")).toBe(true);
  expect(isBlocked("nicht abrufbar: nicht erreichbar (Zeitüberschreitung)")).toBe(false);
});
