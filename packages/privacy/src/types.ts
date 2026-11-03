export type PiiKind = "name" | "address" | "birthdate" | "policy_number" | "iban" | "phone" | "email" | "tax_id";

export interface PiiMatch {
  kind: PiiKind;
  start: number;
  end: number;
  text: string;
  rule: string;
}

export interface DetectOptions {
  /** Lokal hinterlegte Kundennamen; werden zusätzlich gesucht (auch Teilnamen, Groß/Klein egal). */
  knownNames?: string[];
}

/** Rechteck in Pixeln im (ggf. gerenderten) Bild. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SanitizedPage {
  pageNumber: number;
  /** Maskierter Text – darf an das Modell. */
  text: string;
  /** Geschwärztes PNG (nur bei Bildern und gescannten PDF-Seiten). */
  image?: Uint8Array;
  width?: number;
  height?: number;
  source: "text" | "text-layer" | "ocr";
  /** Geschwärzte Bereiche (automatisch + manuell). */
  boxes: Box[];
  /** Mittlere OCR-Konfidenz 0–100 (nur bei OCR). */
  ocrConfidence?: number;
}

export interface SanitizedDocument {
  fileName: string;
  mimeType: string;
  pages: SanitizedPage[];
  /**
   * Gefundene Treffer MIT Originalwerten (für die Vorschau des Beraters).
   * Achtung: niemals an das Modell senden.
   */
  matches: Array<PiiMatch & { pageNumber: number }>;
  warnings: string[];
}

export interface SanitizeInput {
  data: Uint8Array;
  mimeType: string;
  fileName: string;
  knownNames?: string[];
  /** Zusätzliche Schwärzungen je Seite (1-basiert), Koordinaten im Ausgabebild. */
  manualBoxes?: Record<number, Box[]>;
}
