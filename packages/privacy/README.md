# @klarwert/privacy

Entfernt personenbezogene Daten (PII) aus Vertragsunterlagen, **bevor** irgendetwas an die Anthropic-API geht. Alles läuft lokal im Node-Prozess (tesseract.js/WASM, sharp, pdfjs-dist, @napi-rs/canvas). Es gibt keine Systembinaries und keine Downloads zur Laufzeit.

```ts
import { sanitizeDocument, verifySanitized, terminateOcr } from "@klarwert/privacy";

const doc = await sanitizeDocument({ data, mimeType, fileName, knownNames: ["Erika Mustermann"] });
const check = await verifySanitized(doc, { knownNames: ["Erika Mustermann"] });
if (!check.ok) { /* nicht senden, Berater muss nachschwärzen */ }
// An das Modell gehen NUR doc.pages[].text und doc.pages[].image (PNG)
```

> **Wichtig:** `doc.matches` enthält die **Originalwerte**. Das Feld ist nur für die Vorschau beim Berater gedacht und darf nie ans Modell gehen oder geloggt werden. Dasselbe gilt für `PiiMatch.text` aus `detectPii`/`maskText`.

## Verarbeitung je Dateityp

| Eingabe | Vorgehen | `source` |
|---|---|---|
| `text/plain`, `.txt/.md/.csv` | Text maskieren (UTF-8, Fallback Windows-1252) | `text` |
| `image/png`, `image/jpeg` (auch webp/tiff) | EXIF-Drehung anwenden, Metadaten entfernen, OCR (Wörter + Boxen), Treffer auf Wort-Boxen abbilden, schwarz füllen. Ergebnis: PNG + maskierter OCR-Text | `ocr` |
| `application/pdf`, Seite mit Textlayer | Nur maskierter Text, **kein Bild** | `text-layer` |
| `application/pdf`, Scan-Seite | Mit pdfjs + @napi-rs/canvas in 180 dpi rendern, dann wie ein Bild | `ocr` |

Das Original-PDF bzw. -Bild wird nie weitergegeben. Kleine Bilder wie Screenshots werden für die OCR hochskaliert, mindestens auf 2000 px Breite. Dunkle Flächen wie Portal-Kopfleisten mit heller Schrift werden zusätzlich invertiert gelesen. Der Dateiname wird ebenfalls geprüft und bei Bedarf maskiert.

Platzhalter: `[NAME] [ANSCHRIFT] [GEBURTSDATUM] [VERTRAGSNR] [IBAN] [TELEFON] [E-MAIL] [STEUER-ID]`. Text unter manuellen Boxen wird zu `[GESCHWÄRZT]`.

## Was erkannt wird

- **Namen:** nach Labels wie Versicherungsnehmer, Versicherte Person, Name, Vorname, Nachname, Kunde, Beitragszahler, Bezugsberechtigt, (Konto-/Depot-)Inhaber, Antragsteller, Vermittler, VN/VP, geb. (Geburtsname). Der Wert darf auch in der Folgezeile stehen. Außerdem „Herr/Frau/Familie X“, „Sehr geehrte(r) …“ und `knownNames`, auch als Teilnamen, ohne Rücksicht auf Groß-/Kleinschreibung und mit Umlautvarianten wie ü/ue/u. Dazu kommt eine Liste von rund 400 häufigen Vornamen, gefolgt von einem großgeschriebenen Wort. Firmen mit AG/GmbH/SE/VVaG/a.G./KG … gelten nicht als Personen.
- **Anschrift:** Straße + Hausnummer (straße/str./weg/platz/allee/gasse/ring/damm/ufer/chaussee/pfad …, auch „Kölner Straße 12“, „Kurt-Schumacher-Platz 3a“ und Versalien). „Am/Im/Zur … 5“ wird nur erkannt, wenn eine PLZ folgt. Außerdem PLZ + Ort und Labels wie Anschrift/Adresse/Wohnort/PLZ/Ort.
- **Geburtsdatum:** ein Datum nach geb./geboren/Geburtsdatum/Geb.-Datum/`*`, in derselben Zeile oder in der Folgezeile (Tabellenkopf, nächstliegende Spalte). Andere Daten wie Vertragsbeginn oder Stichtage bleiben erhalten.
- **Vertrags-/Versicherungsnummern:** nach Labels (Versicherungsnummer, Vers.-Nr., Vertragsnummer, Police Nr., Kunden-, Mitglieds-, Antrags-, Depot-, Zulagenummer, SV-Nummer, Aktenzeichen, Mandatsreferenz …). Generisch auch Token mit mindestens 6 Ziffern und Zifferngruppen mit mindestens 8 Ziffern. **Ausgenommen** sind Beträge mit Dezimalkomma, Tausenderbeträge (bis 7 Ziffern oder mit €/EUR), Daten und Datumsbereiche, Monat/Jahr, Jahresbereiche, Prozent/Promille, gültige ISINs (Prüfziffer) und WKN.
- **IBAN:** DE und andere Länder, mit oder ohne Leerzeichen, geprüft über Länderlänge und Mod-97. Nach dem Label „IBAN“ auch mit OCR-Fehlern. Außerdem BIC und Kontonummer nach Label.
- **Telefon/Fax:** +49/0049/0 mit Vorwahl sowie Werte nach Tel./Telefon/Mobil/Handy/Fax.
- **E-Mail.**
- **Steuer-ID/Steuernummer** nach Label und das **Sozialversicherungsnummer-Muster** (`65 170839 J 003`).

Erhalten bleiben vertragsrelevante Inhalte: Versicherer, Tarif (z. B. „FR70“), Beträge, Prozente, ‰, Vertrags-/Rentenbeginn, Fondsnamen und ISINs. Die Firmenadresse des Versicherers wird meist mitgeschwärzt; das ist so gewollt („im Zweifel schwärzen“). Service-Telefonnummern und E-Mail-Adressen des Versicherers werden ebenfalls maskiert.

## Prüfung und manuelle Nachschwärzung

- `maskText` prüft den maskierten Text erneut, bis keine Treffer mehr übrig sind. Auf OCR-Seiten passiert dasselbe auf Wortebene.
- `verifySanitized` prüft den Text noch einmal und liest jedes Ausgabebild **neu per OCR**. Schwärzungen zählen dabei als Platzhalter. `ok: false` bedeutet: nicht senden.
- `manualBoxes: { [seite]: Box[] }` schwärzt zusätzliche Bereiche. Die Koordinaten beziehen sich auf das ausgegebene Bild. Wörter darunter werden auch aus dem Text entfernt. Seiten ohne Bild werden ignoriert und bekommen eine Warnung.
- `applyBoxes(png, boxes)` zeichnet nur in das Bild. Soll auch der Text bereinigt werden, `sanitizeDocument` mit `manualBoxes` erneut aufrufen.

## Grenzen – der Berater muss die Vorschau prüfen

Die Erkennung arbeitet mit Regeln und ist **nicht vollständig**. Vor jedem Versand sollte der Berater die Vorschau mit maskiertem Text und geschwärztem Bild ansehen und bei Bedarf nachschwärzen.

- **Unbeschriftete Namen** ohne Label, ohne bekannten Vornamen und nicht in `knownNames` werden nicht erkannt, z. B. „Mustermann“ allein oder seltene Vornamen. Deshalb sollte `knownNames` immer mit dem lokal hinterlegten Kundennamen und mitversicherten Personen befüllt werden.
- **OCR-Fehler:** schlechte Scans, Handschrift, sehr kleine Schrift, Stempel, gedrehte Seiten (außer über EXIF) oder farbige Hintergründe können Text verfälschen oder verschlucken. Was die OCR nicht liest, wird nicht geschwärzt. Bei mittlerer Konfidenz unter 70 % kommt eine Warnung. Unsichere Wörter mit vielen Ziffern werden vorsorglich geschwärzt.
- Unterschriften, Fotos, Logos und QR-/Barcodes werden **nicht** erkannt; Barcodes können Nummern enthalten.
- PDF-Textlayer mit kaputter Zeichenkodierung (Zeichensalat) werden nur erkannt, wenn sie viele Ersatzzeichen enthalten; sonst geht unverständlicher Text durch. Bilder auf Seiten mit Textlayer werden **nicht** weitergegeben (Warnung).
- Mehrspaltige Layouts können dazu führen, dass Label und Wert nicht zugeordnet werden. Dafür gibt es eine zweite Erkennung über optische Zeilen; garantiert ist die Zuordnung trotzdem nicht.
- Freitext mit Gesundheits- oder Familiendaten („Ehefrau seit 2019 erkrankt“) ist nicht abgedeckt.
- Wenn das Rendern einer Scan-Seite fehlschlägt, wird die Seite mit Warnung ausgelassen. Das Paket stürzt dabei nicht ab.

## Betrieb (Vercel / Node-Serverless)

- Es gibt einen OCR-Worker pro Prozess. Er wird beim ersten Bedarf erzeugt und wiederverwendet; Aufträge laufen nacheinander. `terminateOcr()` räumt ihn auf, z. B. in Tests (`afterAll`).
- Die Sprachdaten kommen lokal aus `@tesseract.js-data/deu/4.0.0_best_int` (LSTM). `KLARWERT_TESSDATA_DIR` überschreibt den Pfad. Es wird nichts in das Arbeitsverzeichnis geschrieben (`cacheMethod: "none"`).
- In der Next.js-App müssen diese Pakete als externe Server-Pakete laufen: `tesseract.js`, `tesseract.js-core`, `sharp`, `pdfjs-dist`, `@napi-rs/canvas` (`serverExternalPackages`). Folgende Dateien müssen ins Function-Bundle (`outputFileTracingIncludes`):
  - `@tesseract.js-data/deu/4.0.0_best_int/**`
  - `tesseract.js/src/worker-script/**`
  - `tesseract.js-core/*.wasm*`
  - `pdfjs-dist/legacy/build/pdf.worker.mjs`
  - `pdfjs-dist/{standard_fonts,cmaps,wasm,iccs}/**`
- Laufzeit (lokal gemessen): ein Screenshot mit 1400 px braucht ca. 2 s für die Bereinigung und ca. 2 s für `verifySanitized`. Ein PDF mit Textlayer dauert Millisekunden.

## Tests

```
pnpm vitest run packages/privacy
pnpm --filter @klarwert/privacy typecheck
```

Die Testdokumente werden synthetisch erzeugt (`test/fixtures/make-fixtures.ts`, fiktive Person „Erika Mustermann“). Echte Kundendaten gehören nicht ins Repository.
