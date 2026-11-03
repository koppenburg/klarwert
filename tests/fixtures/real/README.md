# Echtfälle (anonymisiert) – Ablaufplan

Dieses Verzeichnis nimmt **anonymisierte** Echtfälle auf, die der Auftraggeber ergänzt. Sie zeigen, ob Klarwert echte Unterlagen deutscher Versicherer richtig erkennt und die ausgewiesenen Effektivkosten reproduziert.

> Keine Originale mit Kundendaten einchecken. Das Repository ist privat, aber Kundendaten gehören trotzdem nicht hinein.

## Abnahmeziel je Echtfall

1. **Anbieter und Tarif korrekt erkannt:** Versicherer, Tarifname, Tarifkürzel und Generation stimmen nach der Erkennung ohne Korrektur.
2. **Effektivkosten reproduziert:** Bei den Annahmen des Produktinformationsblatts (Wertentwicklung, Beitrag, Laufzeit) weicht der berechnete Wert um **höchstens 0,1 Prozentpunkte** vom ausgewiesenen ab.

## Ablauf je Fall

1. **Auswahl.** Ein Vertrag, zu dem ein PIB mit ausgewiesenen Effektivkosten vorliegt. Gute Startfälle sind ein Angebot mit Musterfall-PIB, ein Riester-Fondsvertrag und eine Schicht-3-Fondsrente verschiedener Versicherer.
2. **Anonymisieren, bevor Dateien hier landen.** Die Dokumente durchlaufen in Klarwert Schritt 1. Gespeichert wird die bereinigte Fassung aus der Vorschau: Screenshot des geschwärzten Bildes bzw. maskierter Text. Alternativ schwärzt der Berater die Unterlagen vorher von Hand, z. B. im PDF-Editor (schwärzen, nicht nur überdecken). Die PII-Prüfung läuft danach mit `pnpm vitest run tests/real-cases.test.ts`, sobald Fälle vorhanden sind.
3. **Ablage.** Je Fall ein Ordner `tests/fixtures/real/<versicherer>-<tarif>-<generation>/` mit:
   - `dokumente/` – anonymisierte Vertragsunterlagen
   - `bedingungswerk/` – AVB, Tarifbestimmungen, PIB (unpersönlich, unverändert)
   - `soll.json` – Sollwerte, siehe unten
4. **Durchlauf in Klarwert.** Fall anlegen, Dokumente hochladen, Erkennung starten. Abweichungen gegenüber `soll.json` notieren. Dann Tarif zuordnen, Bedingungswerk in die Bibliothek legen, Kostenfaktoren vorschlagen lassen und bestätigen.
5. **PIB-Abgleich.** Im Reiter *Analyse* den PIB-Satz als Bruttorendite verwenden (das passiert automatisch, sobald „Effektivkosten laut PIB“ und „Wertentwicklungsannahme im PIB“ bestätigt sind). Die Anzeige „Abweichung“ ablesen.
6. **Protokoll.** Ergebnis in `soll.json` unter `ergebnis` eintragen (Datum, Klarwert-Version/Commit, erkannte Werte, berechnete Effektivkosten, Abweichung). Bei Abweichung > 0,1 Pp. die Ursache dokumentieren, typischerweise eine dieser:
   - abweichende Musterfall-Annahmen im PIB (Laufzeit, Beitrag, Zahlweise, Dynamik)
   - nicht erfasste Kostenposten (z. B. Kosten auf Zulagen, Fondswechsel)
   - andere Verteilung der Abschlusskosten (gezillmert gegenüber verteilt)
   - Fondskosten im PIB anders gewichtet
   - Garantie- bzw. Sicherungsvermögensanteil

## Format `soll.json`

```json
{
  "beschreibung": "Riester-Fondsrente, Musterfall laut PIB",
  "dokumente": [{ "datei": "dokumente/pib.pdf", "art": "pib" }],
  "bedingungswerk": [{ "datei": "bedingungswerk/avb-2019.pdf", "art": "avb" }],
  "soll": {
    "insurer": "…",
    "tariff_name": "…",
    "tariff_code": "…",
    "tariff_generation": "…",
    "layer": "riester",
    "contract_start": "2027-01-01",
    "retirement_start": "2062-01-01",
    "contribution_amount": 100,
    "payment_frequency": "monthly",
    "pib_effective_costs_pp": 1.23,
    "pib_return_percent": 3.0
  },
  "kostenfaktoren": { "alpha.rate": 25, "beta.percentOfPremium": 5 },
  "ergebnis": null
}
```

Die Schlüssel entsprechen den Feldkatalogen in `packages/extraction/src/fields.ts` (`CONTRACT_FIELDS`, `COST_FIELDS`).

## Automatisierung (sobald Fälle vorliegen)

Der Live-Abnahmedurchlauf `tests/e2e/acceptance.ts` arbeitet mit den synthetischen Fällen aus `tests/fixtures/synthetic/cases.ts`. Für Echtfälle ist dieselbe Struktur vorgesehen: `soll.json` einlesen, Dokumente hochladen, Erkennung gegen `soll` prüfen, PIB-Abweichung protokollieren. Der Ordner bleibt bis dahin leer.
