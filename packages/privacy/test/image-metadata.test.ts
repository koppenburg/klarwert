import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { applyBoxes, detectPii, sanitizeDocument, terminateOcr, verifySanitized, type Box } from "../src/index";
import { LAYOUT, makePdf, makePortalScreenshotPng, PERSON, valueRect } from "./fixtures/make-fixtures";
import { expectBoxesBlack, expectNoPiiStrings, pngChunkTypes } from "./helpers";

const OCR_TIMEOUT = 120_000;

afterAll(async () => {
  await terminateOcr();
});

describe("JPEG: Metadaten werden entfernt", () => {
  it(
    "EXIF/XMP mit Personendaten verschwinden, Ausgabe ist PNG",
    async () => {
      const jpeg = await sharp(makePortalScreenshotPng())
        .jpeg({ quality: 92 })
        .withExif({ IFD0: { Artist: PERSON.name, ImageDescription: `Police ${PERSON.name}`, Copyright: "Erika Mustermann" } })
        .withXmp(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>${PERSON.name}</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>`)
        .toBuffer();
      const inMeta = await sharp(jpeg).metadata();
      expect(inMeta.exif).toBeDefined();
      expect(jpeg.includes("Mustermann")).toBe(true);

      const doc = await sanitizeDocument({ data: jpeg, mimeType: "image/jpeg", fileName: "scan.jpg" });
      const page = doc.pages[0]!;
      const out = page.image!;
      const meta = await sharp(out).metadata();
      expect(meta.format).toBe("png");
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(Buffer.from(out).includes("Mustermann")).toBe(false);
      expect(pngChunkTypes(out).filter((t) => /^(tEXt|iTXt|zTXt|eXIf|iCCP|tIME)$/.test(t))).toEqual([]);
      expectNoPiiStrings(page.text);
      expect(detectPii(page.text)).toEqual([]);
    },
    OCR_TIMEOUT,
  );

  it(
    "EXIF-Orientierung wird angewendet (Pixel gedreht, Tag entfernt)",
    async () => {
      const png = makePortalScreenshotPng();
      const { width, height } = await sharp(png).metadata();
      // Pixel um 270° gedreht + Orientation 6 → Betrachter zeigt das Bild aufrecht
      const rotated = await sharp(png).rotate(270).jpeg({ quality: 92 }).withMetadata({ orientation: 6 }).toBuffer();
      expect((await sharp(rotated).metadata()).orientation).toBe(6);
      const doc = await sanitizeDocument({ data: rotated, mimeType: "image/jpeg", fileName: "foto.jpg" });
      const page = doc.pages[0]!;
      expect(page.width).toBe(width);
      expect(page.height).toBe(height);
      expect((await sharp(page.image!).metadata()).orientation).toBeUndefined();
      expectNoPiiStrings(page.text);
      expect(page.text).toContain("FR70");
    },
    OCR_TIMEOUT,
  );
});

describe("manualBoxes und applyBoxes", () => {
  it(
    "manuelle Box schwärzt zusätzlich und entfernt den Text darunter",
    async () => {
      const tarifRow = valueRect(7); // "FR70 Fondsgebundene Rentenversicherung"
      const manual: Box = { x: tarifRow.x - 6, y: tarifRow.y - 6, width: 520, height: tarifRow.height + 12 };
      const doc = await sanitizeDocument({
        data: makePortalScreenshotPng(),
        mimeType: "image/png",
        fileName: "portal.png",
        manualBoxes: { 1: [manual], 5: [{ x: 0, y: 0, width: 10, height: 10 }] },
      });
      const page = doc.pages[0]!;
      expect(page.boxes).toContainEqual(manual);
      await expectBoxesBlack(page.image!, page.boxes);
      expect(page.text).not.toContain("Fondsgebundene");
      expect(page.text).not.toContain("FR70");
      expect(page.text).toContain("Tarif: [GESCHWÄRZT]");
      expect(page.text).toContain("Vertragsbeginn: 01.12.2015");
      expect(doc.warnings.some((w) => w.includes("Seite 5"))).toBe(true);
      expect((await verifySanitized(doc)).ok).toBe(true);
    },
    OCR_TIMEOUT,
  );

  it("manualBoxes auf Seite ohne Bild werden ignoriert (Warnung)", async () => {
    const doc = await sanitizeDocument({
      data: await makePdf(),
      mimeType: "application/pdf",
      fileName: "police.pdf",
      manualBoxes: { 1: [{ x: 10, y: 10, width: 100, height: 20 }] },
    });
    expect(doc.pages[0]!.boxes).toEqual([]);
    expect(doc.warnings.some((w) => w.includes("Seite 1") && w.includes("ignoriert"))).toBe(true);
  });

  it("applyBoxes zeichnet schwarze Rechtecke und liefert PNG", async () => {
    const white = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const boxes: Box[] = [
      { x: 10, y: 10, width: 50, height: 20 },
      { x: 180, y: 80, width: 50, height: 50 }, // ragt über den Rand → wird beschnitten
    ];
    const out = await applyBoxes(white, boxes);
    expect((await sharp(out).metadata()).format).toBe("png");
    await expectBoxesBlack(out, [boxes[0]!, { x: 180, y: 80, width: 20, height: 20 }]);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number): number => data[(y * info.width + x) * info.channels]!;
    expect(px(5, 5)).toBe(255);
    expect(px(100, 50)).toBe(255);
    expect(LAYOUT.width).toBe(1400);
  });
});
