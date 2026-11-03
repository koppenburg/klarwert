/**
 * @klarwert/privacy – Entfernung personenbezogener Daten vor jedem Modellaufruf.
 *
 * Nur `SanitizedPage.text` und `SanitizedPage.image` sind für das Modell
 * bestimmt. `SanitizedDocument.matches` enthält die Originalwerte und darf
 * ausschließlich lokal (Vorschau für den Berater) verwendet werden.
 */
export type { Box, DetectOptions, PiiKind, PiiMatch, SanitizedDocument, SanitizedPage, SanitizeInput } from "./types";
export { detectPii, maskText, PLACEHOLDERS } from "./detect";
export { sanitizeDocument, verifySanitized, applyBoxes } from "./sanitize";
export { terminateOcr } from "./ocr";
