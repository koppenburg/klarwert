# DECISIONS.md – Entscheidungen und Annahmen

Jede Entscheidung ist umkehrbar, sofern nicht anders vermerkt. Format: Datum · Entscheidung · Begründung · Alternativen.

## Infrastruktur

**2026-11-03 · Supabase-Projekt `klarwert` in eu-central-1 (Frankfurt), Organisation „Dominic“ (Pro).**
Die Region ist vorgegeben. Die Kostenbestätigung lief über den Supabase-Dialog.

**2026-11-03 · Kein Service-Role-Schlüssel in der App.**
Alle Server-Zugriffe laufen mit der Sitzung des angemeldeten Beraters (RLS `is_team_member()`). Das macht die Angriffsfläche kleiner, und in Vercel liegt kein Schlüssel mit Vollzugriff.

**2026-11-03 · Teamzugang über `team_members` + Auto-Mitgliedschaft für bestätigte @koppenburg.info-Konten.**
Ein angemeldetes, aber nicht freigeschaltetes Konto sieht nichts. Domain in `team_settings`. Empfehlung: Self-Signup in Supabase deaktivieren.

**2026-11-03 · Upload direkt vom Browser in Supabase Storage.**
Vercel begrenzt Request-Bodies auf 4,5 MB, Policen und AVB sind oft größer. Der Server lädt das Original anschließend für die Bereinigung.

**2026-11-03 · Region `fra1` für Vercel-Funktionen** (`apps/web/vercel.json`): kurze Wege zu Supabase Frankfurt.

**2026-11-03 · PDF-Erzeugung mit `playwright-core` + `@sparticuz/chromium` auf Vercel**, lokal mit vorhandenem Chromium.
Der Headless-Browser lädt die echte Report-Seite und bekommt dafür die Sitzungs-Cookies der Anfrage.

**2026-11-03 · TypeScript 6.0 statt 7.0.**
typescript-eslint 8.72 unterstützt TS < 6.1. Next.js 16.4.5 ist kompatibel.

## Datenschutz

**2026-11-03 · Fünftes Paket `packages/privacy`** zusätzlich zu den vorgegebenen vier.
OCR, Bildbearbeitung und PDF-Rendering sind schwere Laufzeitabhängigkeiten und gehören nicht in die Schemas/Prompts von `extraction`. Den Paketgrenzen der Vorgabe widerspricht das nicht.

**2026-11-03 · Tesseract als tesseract.js (WASM) mit gebündelten deutschen Sprachdaten.**
Vercel bietet kein System-Tesseract. Zur Laufzeit gibt es keinen Download (CDN).

**2026-11-03 · PDFs mit Textlayer: Klarwert übermittelt nur den maskierten Text, kein Seitenbild.**
Ein Seitenbild ohne Schwärzung wäre ein PII-Risiko. Für Scan-Seiten rendert Klarwert die Seite, liest sie per OCR und schickt das geschwärzte Bild. Bilder auf Textlayer-Seiten werden nicht übermittelt; das Tool gibt dazu eine Warnung aus.

**2026-11-03 · Menschliche Freigabe der bereinigten Fassung vor jedem Modellaufruf, dazu automatische Zweitprüfung (Re-OCR) unmittelbar vor dem Aufruf.**
Die Erkennung arbeitet regelbasiert und ist nicht vollständig. Vorschau und manuelles Nachschwärzen schließen die Lücke.

**2026-11-03 · Gefundene PII-Werte werden nicht gespeichert, nur ihre Anzahl je Art.**

**2026-11-03 · Fondskosten aus der Fondsauswahl** (gewichtete TER) berechnet der Server deterministisch und legt sie als vertragsindividuellen *Vorschlag* an, nicht das Modell. Bestätigen muss sie der Berater.

## Fachlogik

**2026-11-03 · Gesetzliche Konstanten an Primärquellen verifiziert** (BGBl. 2026 I Nr. 156, BT-Drs. 21/4088 und 21/4996, gesetze-im-internet.de).
Folgende Werte weichen von den Annahmen im Auftrag ab:
- Kinderzulage neu: **100 % der Beiträge, max. 300 € je Kind** (1:1). Der Auftrag nannte nur „bis 300 €“.
- Kostendeckel Standarddepot: **1,0 %** (RegE: 1,5 %).
- Mindesteigenbeitrag neu: **120 €** als Alles-oder-nichts-Schwelle, keine anteilige Kürzung.
- Abschlusskosten neuer zertifizierter Verträge: verteilt auf die **gesamte Ansparphase** (§ 1 Abs. 1 Nr. 8 AltZertG n. F.); „mindestens 5 Jahre“ gilt für Altverträge. Im Depot-Modell bilden die Depot-Abschlusskosten deshalb einen Prozentsatz je Beitrag über die gesamte Laufzeit ab.
- Sonderausgabenabzug neu: 1.800 € **zuzüglich** Zulage (bisher 2.100 € einschließlich).
- Einzahlungsgrenze Depot: 6.840 € je Vertrag und Jahr. Deshalb legt das Szenario „Kündigung + Depot“ den Rückkaufswert in einer freien Anlage an.
- Neuabschluss ab 2027 überführt alle Bestandsverträge ins neue Recht (§ 52 Abs. 50a S. 6 EStG n. F.). In den Szenarien C und D ist das berücksichtigt.

**2026-11-03 · Zwei Lesarten als Option umgesetzt (bitte prüfen):**
1. Wechselkosten des abgebenden Bestandsvertrags: **D1** max. 150 € ohne Frist (a. F.) und **D2** kostenfrei nach 5 Jahren (n. F.).
2. Kinderzulage bei mehreren Kindern: **je Kind volle 100 %** (Standard, Wortlaut „für jedes Kind“) oder **geteilt** (Summe ≤ Eigenbeitrag). Wählbar in den Szenarien.

„Keine Doppelförderung im Wechseljahr“ steht so nicht ausdrücklich im Gesetz. Klarwert setzt es um, indem je Beitragsjahr genau eine Regel gilt.

**2026-11-03 · Effektivkosten = IRR(ohne Kosten) − IRR(mit Kosten)** bis Rentenbeginn, monatliche Zahlungsströme, geometrische Annualisierung.
Bei Guthabenkosten von x % p.a. ergibt sich eine Renditeminderung von ≈ x·(1+r). Das ist methodisch konsistent mit einer monatlichen Entnahme nach Wertentwicklung.

**2026-11-03 · Zerlegung der Effektivkosten nach Kostenart sequentiell** (α, β, γ, κ, Fonds, Garantie, Freistellung). Die Summe ist exakt, die Anteile sind eine Näherung und so gekennzeichnet.

**2026-11-03 · Zulagengutschrift im März des Folgejahres** (`creditLagMonths = 3`). Zulagen, die erst nach Ende der Ansparphase fällig wären, schreibt Klarwert im letzten Ansparmonat gut, damit keine Förderung verloren geht.

**2026-11-03 · Szenarien starten am Stichtag mit dem Ist-Guthaben.**
Alle Szenarien haben dieselbe Ausgangsbasis: Guthaben, Eigenbeiträge, Bruttorendite und Rentenbeginn sind gleich. Wechselkosten und Stornoabzüge zählen als Kosten. Wechselzeitpunkt: max(Stichtag, 01.01.2027).

**2026-11-03 · Übertragungswert** ist standardmäßig der Rückkaufswert. Liegt der Stichtag der Standmitteilung auf dem Wechselmonat, gilt der dort ausgewiesene Rückkaufswert, sonst der aus den Stornoregeln fortgeschriebene.

**2026-11-03 · Depot-Standardwerte (Annahmen, vor Marktstart unbekannt):**
- Verwaltung 0,3 % p.a.
- Fonds-TER 0,2 % p.a.
- keine festen Kosten
- keine Abschlusskosten
- ohne Garantie

Alles ist als Eingabe änderbar und im Report als Annahme gekennzeichnet.

**2026-11-03 · Kostenkatalog** (`packages/extraction/src/fields.ts`): Pflichtwerte müssen bestätigt sein, 0 bedeutet „keine Kosten dieser Art“. Rentenfaktoren dürfen als „nicht angegeben“ (null) bestätigt werden, weil sie bei Fondstarifen oft erst zu Rentenbeginn feststehen.

**2026-11-03 · Riester-Nettoauszahlung bei schädlicher Verwendung** = Rückkaufswert − erhaltene Zulagen − eingegebene Steuervorteile. Die Steuervorteile sind eine Annahme des Beraters; Klarwert berechnet sie nicht.

## KI

**2026-11-03 · Modell `claude-opus-5-5`, Effort `high`, strukturierte Ausgabe über `client.beta.messages.parse` mit `betaZodOutputFormat`; serverseitiger Fallback bei Ablehnung (`fallbacks: "default"`).** Alles per Umgebungsvariable änderbar.

**2026-11-03 · Websuche über das Anthropic-Tool `web_search_20260209`.**
Die gefundenen PDFs lädt der Server herunter (nur https, keine internen Adressen, PDF-Signatur geprüft) und legt sie als **Kandidat** ab, nie automatisch als gültig.

**2026-11-03 · Kostenextraktion arbeitet bevorzugt mit dem Seitentext des Bedingungswerks** (günstiger, Seitenangaben eindeutig). Hat das Dokument keinen Textlayer, geht das PDF als Dokument an das Modell.

## Abnahme

**2026-11-03 · PIB-Wert des synthetischen Angebots (Fall 3) wird aus den dokumentierten Kostenparametern mit dem Rechenkern erzeugt (1,04 Pp. bei 3,0 %).**
Der Fall prüft damit die Konsistenz der Kette Dokument → Erkennung → Bestätigung → Berechnung, nicht die Methodik gegen einen Versicherer. Das Abnahmeziel von höchstens 0,1 Pp. Abweichung gegenüber echten PIBs prüft der Echtfall-Plan in `tests/fixtures/real/README.md`.

## Betrieb auf Vercel (Erkenntnisse aus der Live-Abnahme, 2026-11-08)

**2026-11-08 · Vertragserkennung mit flachem Antwortschema** (Liste aus Feld, Wert als Text, Konfidenz, Fundstelle) statt eines verschachtelten Objekts je Feld.
Die API lehnte das verschachtelte Schema ab („compiled grammar is too large“). Die Typumwandlung erledigt `normalizeContractExtraction` deterministisch. Unlesbare Werte werden verworfen und als Hinweis gemeldet, nicht geraten.

**2026-11-08 · Koordinaten der Schwärzungen werden gespeichert** (`case_documents.sanitized_pages[].boxList`, keine PII).
Ohne sie liest die Re-OCR vor dem Modellaufruf schwarze Balken als Zeichen und meldet Fehlalarme. Regressionstest: `tests/stored-verification.test.ts`.

**2026-11-08 · Paketauflösung zur Laufzeit mit Rückfall auf den pnpm-Speicher** (`packages/privacy/src/resolve.ts`).
Im Vercel-Bundle fehlen die Symlinks unter `apps/web/node_modules`.

**2026-11-08 · `outputFileTracingIncludes` nennt die Abhängigkeiten des OCR-Workers und `playwright-core`/`@sparticuz/chromium` vollständig.**
Worker-Threads und dynamisch geladene Module erkennt das Tracing nicht.

**2026-11-08 · Diagnose-Route `/api/diagnose` bleibt bestehen** (nur Teammitglieder, keine Kundendaten).
`?ocr=1` führt einen OCR-Probelauf mit synthetischem Bild aus. Sie hilft, wenn nach einem Update von Next.js oder Vercel Pakete im Bundle fehlen.

## Tarifauswahl (2026-11-08)

**Darstellung (Entscheidung Auftraggeber):** Die Ergebnisliste ist sortierbar, standardmäßig nach Effektivkosten aufsteigend. Kein Tarif wird als „empfohlen“ markiert. Tarife, die harte Kriterien verfehlen, stehen getrennt und mit Begründung.

**Beitragsstaffeln und Rentenfaktor-Tabellen (Entscheidung Auftraggeber):**
- Staffelbare Kostenwerte (α-Satz, α auf Zuzahlung/Einmalbeitrag, β, γ, κ) dürfen Stufen nach Monatsbeitrag, Jahresbeitrag oder Beitragssumme haben.
- Rentenfaktoren dürfen als Tabelle je Rentenbeginnalter vorliegen. Zwischen tabellierten Altern wird linear interpoliert, außerhalb der Tabelle nicht extrapoliert.
- Aufgelöst wird vor der Simulation (`resolveTieredCosts`), damit der Rechenkern unverändert bleibt.

**Tarifmerkmale als `cost_items` mit Schlüssel `feature.*`:**
- Das nutzt dieselbe Mechanik für Vorschlag, Bestätigung und Fundstelle wie bei den Kostenwerten.
- Merkmale fließen nicht in das Gate der Fallanalyse ein.
- Ein nicht erfasstes Merkmal schließt einen Tarif in der Selektion nicht aus, sondern erscheint als offener Punkt.

**Neue Riester-Abschlüsse:** Tarife nach altem Recht sind ab einem Vertragsbeginn nach dem 31.12.2026 nicht mehr wählbar (`riesterOld.lastNewContractDate`). Produkte nach neuem Recht sind erst ab dem 01.01.2027 wählbar.

**Bruttorendite je Risikoklasse:** Standard 1/2/3/4,5/5,5/6,5/7 % für SRI 1–7. Das ist eine Annahme, im Fragebogen überschreibbar und für alle Kandidaten gleich.

**Änderungen an Tarifwerten einer Generation** setzen die Kostenbestätigung aller Fälle dieser Generation zurück, damit kein Report auf veralteten Werten beruht. Tarifmerkmale sind davon ausgenommen.

**Gespeicherte Auswahlen** (`selections`) enthalten das Profil ohne Namen und eine Ergebniszusammenfassung; optional sind sie einem Fall zugeordnet.

## Tarifrecherche im Web (2026-11-08)

**Ablauf in drei Stufen** (Kandidat → Dokumente → Übernahme), jeweils mit Bestätigung durch den Berater. Tarifkandidaten liegen in einer eigenen Tabelle `tariff_candidates`, damit der Katalog nur übernommene Tarife enthält. Geladene Dokumente bleiben Kandidaten (`library_documents.status = candidate`, `tariff_candidate_id`), bis der Berater sie bestätigt.

**Schutz gegen erfundene Links:** Produktseiten und Quellen werden nur übernommen, wenn die URL in den Ergebnissen der Websuche vorkam. Dokument-Links außerhalb der Suchergebnisse werden markiert (`fromSearchResults: false`). Ein Download findet nur über https statt, an öffentliche Hosts, mit Prüfung der PDF-Signatur.

**Ein Versicherer je Serveraufruf** (Vercel-Limit 300 s). Die Recherche über alle Versicherer läuft im Browser nacheinander und lässt sich anhalten.

**Kein Marktvergleich:** Die Recherche findet nur, was die Versicherer öffentlich bereitstellen. Nicht öffentliche Tarifdetails (z. B. Maklertarife, Kostenstaffeln nur auf Anfrage) bleiben Aufgabe der Anforderung beim Versicherer.

**2026-11-08 · Zugangssperren der Versicherer werden respektiert.** Das Allianz-Dokumentenportal (Cloudflare-Bot-Schutz) beantwortet automatisierte Serverabrufe mit HTTP 403. Klarwert umgeht solche Sperren nicht: weder über einen anderen Abrufdienst noch durch Vortäuschen eines Browsers. Stattdessen ermittelt Klarwert die Links, der Berater öffnet sie im Browser und lädt die PDFs hoch (Zuordnung zum Vorschlag). Bei einem gesperrten Host bricht Klarwert weitere Versuche ab.
