/**
 * Stufe (c): Anforderungsschreiben an den Versicherer (Vorlage mit Platzhaltern).
 * Personenbezogene Angaben werden bewusst NICHT aus dem System befüllt; der Berater setzt sie beim Versand ein.
 */

export interface LetterInput {
  insurer: string;
  tariffName: string;
  tariffCode?: string | null;
  generation?: string | null;
  contractStart?: string | null;
  caseNumber: string;
  date?: string;
}

export const LETTER_PLACEHOLDERS = [
  "[Anschrift Versicherer]",
  "[Vertragsnummer]",
  "[Name Versicherungsnehmer/in]",
  "[Datum der Maklervollmacht]",
  "[Name Berater/in]",
  "[Kontaktdaten Koppenburg GmbH]",
] as const;

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function requestLetter(input: LetterInput): { subject: string; body: string } {
  const date = formatDate(input.date ?? new Date().toISOString());
  const tarif = `${input.tariffName}${input.tariffCode ? ` (${input.tariffCode})` : ""}${input.generation ? `, Stand ${input.generation}` : ""}`;
  const subject = `Anforderung Vertragsbedingungen und Kosteninformationen – Vertrag [Vertragsnummer]`;
  const body = `[Kontaktdaten Koppenburg GmbH]

${input.insurer}
[Anschrift Versicherer]

${date}

${subject}
Versicherungsnehmer/in: [Name Versicherungsnehmer/in]
Unser Zeichen: ${input.caseNumber}

Sehr geehrte Damen und Herren,

auf Grundlage der uns erteilten Maklervollmacht vom [Datum der Maklervollmacht], die wir Ihnen bereits vorgelegt haben bzw. in Kopie beifügen, bitten wir Sie um Übersendung folgender Unterlagen zum oben genannten Vertrag (Tarif ${tarif}${input.contractStart ? `, Vertragsbeginn ${formatDate(input.contractStart)}` : ""}):

1. die dem Vertrag zugrunde liegenden Allgemeinen Versicherungsbedingungen und Tarifbestimmungen in der bei Vertragsschluss gültigen Fassung einschließlich aller Nachträge,
2. eine Aufstellung sämtlicher Kosten: Abschluss- und Vertriebskosten (Höhe, Bemessungsgrundlage, Verteilungszeitraum), laufende Verwaltungskosten in % des Beitrags, in % des Guthabens und als Stückkosten, Kosten der Fonds einschließlich etwaiger Rückvergütungen, Garantiekosten, Kosten bei Beitragsfreistellung, Kündigung und Übertragung sowie Kosten in der Rentenphase,
3. den garantierten und den aktuellen Rentenfaktor,
4. eine aktuelle Standmitteilung mit Vertragsguthaben und Rückkaufswert,
5. sofern vorhanden, das Produktinformationsblatt mit Ausweis der Effektivkosten.

Für eine Übersendung innerhalb von 14 Tagen in elektronischer Form an die unten genannte Adresse wären wir Ihnen dankbar.

Mit freundlichen Grüßen

[Name Berater/in]
Koppenburg GmbH – unabhängiger Versicherungsmakler
`;
  return { subject, body };
}
