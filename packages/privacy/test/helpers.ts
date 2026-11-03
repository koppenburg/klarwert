import sharp from "sharp";
import { expect } from "vitest";
import type { Box } from "../src/index";
import { CONTRACT_VALUES, PII_STRINGS } from "./fixtures/make-fixtures";

export function expectNoPiiStrings(text: string): void {
  for (const s of PII_STRINGS) expect(text, `"${s}" darf nicht im Text stehen`).not.toContain(s);
}

export function expectContractValues(text: string): void {
  for (const s of CONTRACT_VALUES) expect(text, `"${s}" muss erhalten bleiben`).toContain(s);
}

/** Prüft, dass jedes Pixel innerhalb der Boxen schwarz ist. */
export async function expectBoxesBlack(png: Uint8Array, boxes: readonly Box[]): Promise<void> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const b of boxes) {
    let nonBlack = 0;
    for (let y = Math.ceil(b.y); y < Math.floor(b.y + b.height); y++) {
      for (let x = Math.ceil(b.x); x < Math.floor(b.x + b.width); x++) {
        const i = (y * info.width + x) * info.channels;
        if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) nonBlack++;
      }
    }
    expect(nonBlack, `Box ${JSON.stringify(b)} nicht vollständig schwarz`).toBe(0);
  }
}

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** PNG-Chunk-Typen (z. B. tEXt, eXIf, iCCP), um Metadaten zu erkennen. */
export function pngChunkTypes(png: Uint8Array): string[] {
  const buf = Buffer.from(png);
  const types: string[] = [];
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    types.push(buf.toString("latin1", pos + 4, pos + 8));
    pos += 12 + len;
  }
  return types;
}
