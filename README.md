# Klarwert – Effektivkosten-Analyse für Altersvorsorgeverträge

Internes Werkzeug der Koppenburg GmbH (unabhängiger Versicherungsmakler, Merzig/Losheim am See).
Klarwert berechnet aus Vertragsunterlagen die tatsächliche Kostenbelastung von Altersvorsorgeverträgen.
Es vergleicht Verträge miteinander und mit dem Altersvorsorgedepot (ab 01.01.2027) und erzeugt den PDF-Report „Klarwert-Analyse“ für das Kundengespräch.

> Klarwert liefert Entscheidungsgrundlagen, keine Empfehlungen. Die Produktentscheidung trifft immer der Berater.
> Darstellung je nach Tarif und Bedingungswerk; Entscheidungshilfe, keine Rechts- oder Steuerberatung.

- Produktion: https://klarwert.koppenburg.info (nach DNS-Eintrag, siehe unten)
- Supabase-Projekt: `klarwert` (Ref `mxakiqfyagaeejldnqaw`, Region Frankfurt `eu-central-1`)
- Repository: `koppenburg/klarwert`

---

## Inhalt

1. [Arbeitsablauf im Tool](#arbeitsablauf-im-tool)
2. [Schnellstart für Berater](#schnellstart-für-berater)
3. [Datenschutz: welche Daten welchen Dienst erreichen](#datenschutz-welche-daten-welchen-dienst-erreichen)
4. [Architektur](#architektur)
5. [Lokale Entwicklung](#lokale-entwicklung)
6. [Umgebungsvariablen](#umgebungsvariablen)
7. [Deployment (Vercel, Supabase, DNS bei STRATO)](#deployment)
8. [Benutzer verwalten](#benutzer-verwalten)
9. [Betrieb](#betrieb)
10. [Tests und Abnahme](#tests-und-abnahme)
11. [Bekannte Grenzen](#bekannte-grenzen)

---

## Arbeitsablauf im Tool

Jeder Vertrag ist ein **Fall** mit interner Fallnummer (z. B. `KW-2026-0007`). Die Bearbeitung läuft in sieben Schritten:

| Schritt | Was passiert | Wer entscheidet |
|---|---|---|
| 1 Dokumente | Upload von Police, Nachträgen, Standmitteilungen, Screenshots, Angeboten, PIB (PDF/PNG/JPG/TXT). Klarwert erkennt Texte lokal per OCR und schwärzt Namen, Anschriften, Geburtsdaten, Vertrags- und Kundennummern, IBAN, Telefonnummern, E-Mail-Adressen und Steuer-IDs. | Berater prüft die geschwärzte Vorschau, schwärzt bei Bedarf mit der Maus nach und gibt die Fassung frei. |
| 2 Erkennung | Claude liest **nur die freigegebenen, bereinigten Fassungen**. Es liefert Versicherer, Tarif, Daten, Beiträge und Guthaben, jeweils mit Konfidenz und Fundstelle. Das Modell rechnet nicht. | Berater bestätigt oder korrigiert jeden Wert. |
| 3 Tarif & Bedingungswerk | Zuordnung zum Tarifkatalog (Versicherer → Tarif → Generation, mit Aliasen). Das Bedingungswerk kommt in drei Stufen: (a) aus der Bibliothek, (b) per Websuche als Kandidat, (c) bei Nichtfund manuell, mit Anforderungsschreiben an den Versicherer. | Berater bestätigt das gültige Bedingungswerk. |
| 4 Kostenfaktoren | Claude schlägt α, β, γ, κ, Fonds-, Garantie-, Storno- und Rentenkosten mit Seite und Zitat vor. | Berater bestätigt, korrigiert oder ergänzt **jeden** Wert. Ohne vollständige Bestätigung gibt es weder Berechnung noch Report. |
| 5 Analyse | Effektivkosten p.a. bei 2/4/6 % und beim PIB-Satz, Kosten je Art, Brutto- und Nettoguthaben, Rückkaufswert mit Break-even, Rente gegen Auszahlplan. Die Parameter lassen sich interaktiv ändern. | Berater legt die Annahmen fest. |
| 6 Szenarien & Depot | Riester: Wege A–D (D in zwei Lesarten). Ungefördert: Weiterführen, Beitragsfreistellung + Depot, Kündigung + Depot. Dazu Sensitivität über Rendite und Rentenbeginn. | Neutral: Die Szenarien stehen in fester Reihenfolge, keines ist als „empfohlen“ markiert. |
| 7 Report | Erzeugt das PDF „Klarwert-Analyse“: Steckbrief, Kosten, Charts, Szenarien, Annahmen, Fundstellen im Anhang. | — |

Bestätigte Kostenfaktoren gehören zur **Tarifgeneration**. Beim nächsten Vertrag desselben Tarifs schlägt Klarwert sie automatisch vor. Vertragsindividuelle Abweichungen, etwa die Fondsauswahl, werden als Override am Fall gespeichert.

Weitere Bereiche:
- **Tarifauswahl:** Kundenprofil erfassen, Klarwert rechnet alle Katalogtarife und das Altersvorsorgedepot unter identischen Annahmen durch (siehe unten).
- **Vergleich:** 2–3 Verträge unter identischen Annahmen.
- **Tarifkatalog & Bibliothek:** Aliase pflegen, Bedingungswerke ablegen, Volltextsuche.
- **Gesetzliche Grundlagen:** alle Konstanten mit Quelle und Prüfstatus.

## Schnellstart für Berater

1. https://klarwert.koppenburg.info öffnen und mit E-Mail und Passwort anmelden (Zugang siehe [Benutzer verwalten](#benutzer-verwalten)).
2. **Fälle → Neuer Fall**: Bezeichnung ohne Kundendaten. Den Kundennamen kannst du freiwillig eintragen. Er bleibt in der Datenbank und wird zusätzlich zum Schwärzen genutzt.
3. Schritt für Schritt durch die Reiter 1–7. Die Plaketten oben rechts zeigen, ob Vertragsdaten und Kostenfaktoren vollständig bestätigt sind.
4. Unter **Gesetzliche Grundlagen** steht, welche Werte „bitte prüfen“ sind.

## Tarifauswahl

Unter **Tarifauswahl** erfasst der Berater das Kundenprofil, ohne Namen:
- **Beitrag und Laufzeit:** Vertragsbeginn, Eintrittsalter, Rentenbeginn, Beitrag, Zahlweise, Dynamik, Einmalbeitrag, Schicht.
- **Anforderungen:** Beitragserhalt, Risikoprofil (SRI 1–7), Nachhaltigkeit (Art. 8/9 SFDR), Rentengarantiezeit, Kapitalwahlrecht, Entnahmen, Beitragspausen, Todesfallleistung.
- **Förderung:** Zulageberechtigung, Kinder, Vorjahreseinkommen.

Klarwert rechnet daraufhin jeden Tarif des Katalogs unter identischen Annahmen durch:
- **Beitragsstaffeln** werden für den konkreten Beitrag aufgelöst, etwa geringere Abschluss- oder Verwaltungskosten ab einem Monatsbeitrag.
- **Rentenfaktoren** gelten für das gewählte Rentenbeginnalter, aus einer Tabelle je Alter.
- **Harte Kriterien** wie Mindestbeitrag, Eintrittsalter oder Garantie führen zu „nicht passend“, mit Begründung.
- **Nicht erfasste Tarifmerkmale** schließen nicht aus. Sie erscheinen als „offen – bitte prüfen“.
- **Ergebnis:** Effektivkosten p.a., Endkapital, Zulagen, Kosten gesamt sowie die garantierte und die aktuelle Rente. Sortieren lässt es sich nach Effektivkosten, Endkapital oder Rente; nichts wird als „empfohlen“ markiert.
- **Vergleich:** Das Altersvorsorgedepot läuft mit den eingestellten Depot-Annahmen mit.
- **Speichern und Drucken:** Auswahlen lassen sich speichern (optional mit Fall) und drucken.

Voraussetzung ist ein gepflegter Katalog. Tarifmerkmale, Beitragsstaffeln und Rentenfaktor-Tabellen werden je Tarifgeneration unter **Tarifkatalog & Bibliothek → Generation** erfasst. Die KI kann sie aus dem Bedingungswerk vorschlagen; der Berater bestätigt jeden Wert mit Fundstelle. Tarife mit unvollständigen Kostenfaktoren erscheinen als „nicht berechenbar“. Fondskosten hängen meist von der Fondsauswahl ab; fehlt ein Tarifwert, kann eine einheitliche Annahme gesetzt werden. Sie wird als Annahme ausgewiesen.

## Datenschutz: welche Daten welchen Dienst erreichen

Vertragsunterlagen enthalten Kundendaten. Klarwert entfernt personenbezogene Daten **vor jedem Modellaufruf**:

1. **Upload:** Der Browser lädt das Original direkt in den privaten Supabase-Bucket `originals`. Nur angemeldete Teammitglieder haben Zugriff.
2. **Bereinigung auf dem Server (Vercel-Funktion):** Die Funktion lädt das Original aus Supabase.
   - Bilder: lokale OCR mit Tesseract (tesseract.js/WASM, deutsche Sprachdaten im Paket, kein Download), Treffer werden im Bild geschwärzt und im Text maskiert.
   - PDFs mit Textlayer: Klarwert maskiert nur den Text, ein Bild entsteht nicht.
   - Scan-PDFs: Die Seiten werden gerendert und wie Bilder behandelt.
   - Die bereinigte Fassung liegt im privaten Bucket `sanitized`. Gefundene Werte werden **nicht** gespeichert, nur ihre Anzahl je Art.
3. **Freigabe:** Der Berater sieht genau das, was an die KI geht, und gibt es frei.
4. **Unmittelbar vor dem Modellaufruf** prüft Klarwert die Bereinigung erneut: Der Text wird noch einmal durchsucht, die Bilder werden neu per OCR gelesen. Findet die Prüfung etwas, findet kein Aufruf statt.
5. **Nach der Erkennung** löscht Klarwert das Original, sofern der Berater es nicht ausdrücklich behält.

| Dienst | Was er erhält | Was er nie erhält |
|---|---|---|
| **Supabase** (Postgres, Auth, Storage; Frankfurt) | Originale bis zur Löschung (privater Bucket), bereinigte Fassungen, Vertrags- und Tarifparameter unter Fallnummer, optional den Kundennamen (`cases.customer_name`), Bedingungswerke, Reports (PDF), Anmeldedaten des Teams | — |
| **Vercel** (Hosting und Serverfunktionen) | verarbeitet Originale **flüchtig im Arbeitsspeicher** während der Bereinigung, rendert Report-PDFs; speichert keine Dokumente | dauerhafte Kopien von Dokumenten |
| **Anthropic** (Claude API) | bereinigte Seiten (maskierter Text, geschwärzte PNGs), unpersönliche Bedingungswerke (Text), Suchanfragen mit Versicherer/Tarif/Generation | Originale, Kundenname, Fallnummer, ungeschwärzte Bilder, Report-Daten |
| **Websites der Versicherer** (nur Websuche) | einen Abruf öffentlicher PDF-Dokumente | Kunden- oder Vertragsdaten |

Die Auftragsverarbeitungsverträge mit Anthropic, Supabase und Vercel prüft der Auftraggeber selbst.
Der automatisierte PII-Test liegt in `packages/privacy/test/pii-sanitization.test.ts` und `tests/synthetic-pipeline.test.ts`. Er prüft, dass bereinigte Dokumente keine der genannten Muster mehr enthalten.

## Architektur

```
apps/web                 Next.js 16 (App Router, TypeScript), UI, Server Actions, API-Routen, Report-Seite, PDF über Playwright
packages/calc            Rechenkern: Monatssimulation, Effektivkosten (RIY), Rentenphase, Rückkauf, Zulagen, Depot-Szenarien (ohne UI-/LLM-Abhängigkeit)
packages/extraction      Feldkataloge, Zod-Schemas, Prompts, Claude-Aufrufe (Erkennung, Kostenklauseln, Websuche), Tarif-Matching, Gate, Anforderungsschreiben
packages/privacy         lokale OCR, PII-Erkennung, Schwärzung und Maskierung, Prüfung der Bereinigung
packages/legal-config    gesetzliche Konstanten mit Norm, Quelle, Datum, Status
supabase/migrations      Datenbankschema (RLS: nur Teammitglieder), Storage-Buckets, Report-Gate als Trigger
tests/                   synthetische Fälle, Offline-Pipeline-Test, Playwright-Abnahme, Ablaufplan Echtfälle
```

Details zu Konventionen und Datenfluss stehen in [CLAUDE.md](CLAUDE.md), die Entscheidungen in [DECISIONS.md](DECISIONS.md).

## Lokale Entwicklung

Voraussetzungen: Node 22+, pnpm 10.

```bash
pnpm install
```

```bash
cp apps/web/.env.example apps/web/.env.local   # Werte eintragen, siehe unten
```

```bash
pnpm dev                                       # http://localhost:3000
```

```bash
pnpm check                                     # Typecheck, Lint, alle Tests
```

Für die PDF-Erzeugung braucht Klarwert lokal ein Chromium. Den Pfad gibt `PLAYWRIGHT_CHROMIUM_PATH` vor.

## Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ja | `https://mxakiqfyagaeejldnqaw.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ja | Publishable Key aus Supabase → Project Settings → API Keys (`sb_publishable_…`) |
| `ANTHROPIC_API_KEY` | ja (für Erkennung, Kostenvorschläge, Websuche) | API-Schlüssel aus der Anthropic Console |
| `ANTHROPIC_MODEL` | nein | Standard `claude-opus-5-5` |
| `ANTHROPIC_EFFORT` | nein | `low` · `medium` · `high` (Standard) · `xhigh` · `max` |
| `ANTHROPIC_FALLBACKS` | nein | `default` (Standard): Lehnt das Modell eine Anfrage ab, beantwortet sie serverseitig ein Ersatzmodell. `off` schaltet das ab. |
| `ANTHROPIC_WEBSEARCH_ENABLED` | nein | `true` (Standard) / `false` |
| `ANTHROPIC_WEBSEARCH_MAX_USES` | nein | Standard `5` Suchen je Anfrage |
| `PLAYWRIGHT_CHROMIUM_PATH` | nur lokal | Chromium für die PDF-Erzeugung. Auf Vercel wird automatisch `@sparticuz/chromium` genutzt. |

Ein Service-Role-Schlüssel wird **nicht** benötigt: Alle Zugriffe laufen mit der Sitzung des angemeldeten Beraters und unterliegen der Row Level Security.

## Deployment

### Supabase
Das Projekt `klarwert` (Frankfurt) ist angelegt, das Schema aus `supabase/migrations/` ist eingespielt.
Empfohlene Einstellungen im Supabase-Dashboard:
- **Authentication → Sign In / Providers → Email:** „Confirm email“ eingeschaltet lassen.
- **Authentication → Sign In / Providers:** „Allow new users to sign up“ **ausschalten**. Benutzer legt dann nur der Inhaber an (siehe unten).
- **Authentication → URL Configuration:** Site URL `https://klarwert.koppenburg.info`.
- **Authentication → Attack Protection:** „Leaked password protection“ einschalten (Abgleich mit HaveIBeenPwned).

### Vercel
Das Repository ist in Vercel importiert. Einmalig einstellen:
1. **Project Settings → Build and Deployment → Root Directory:** `apps/web`. „Include files outside the root directory“ bleibt aktiviert (Monorepo). Framework: Next.js. Install- und Build-Befehl bleiben auf Standard (pnpm wird über `pnpm-lock.yaml` erkannt).
2. **Project Settings → Environment Variables:** die Pflichtvariablen aus der Tabelle oben für *Production* und *Preview* eintragen.
3. Funktionsregion: `apps/web/vercel.json` setzt `fra1` (Frankfurt), passend zu Supabase; nichts zu tun.
4. Neu deployen (Deployments → Redeploy), damit die Variablen greifen.
5. **Project Settings → Domains:** `klarwert.koppenburg.info` hinzufügen.

### DNS bei STRATO
Im STRATO-Kundenlogin unter **Domains → koppenburg.info → Subdomain anlegen**: `klarwert`. Danach in den **DNS-Einstellungen** der Subdomain:

| Typ | Name | Wert |
|---|---|---|
| CNAME | `klarwert` | den Wert, den Vercel unter *Domains* anzeigt (in der Regel `cname.vercel-dns.com`, bei neueren Projekten ein projektspezifischer Wert wie `xxxxxxxx.vercel-dns-017.com`) |

Falls STRATO für die Subdomain keinen CNAME zulässt: A-Record `klarwert` → `76.76.21.21` (Vercel-Anycast-IP; Vercel zeigt den gültigen Wert unter *Domains* an).
Vercel stellt das TLS-Zertifikat automatisch aus, sobald der Eintrag aufgelöst wird (meist innerhalb einer Stunde).

## Benutzer verwalten

- **Neuer Berater:** Supabase-Dashboard → Authentication → Users → *Add user* → *Create new user*. Dort E-Mail und Passwort eintragen und *Auto Confirm User* anhaken.
- Bestätigte Konten mit einer Adresse **@koppenburg.info** werden automatisch Teammitglied (Trigger `on_auth_user_team`). Die Domain steht in der Tabelle `team_settings`.
- Andere Adressen schaltet der Inhaber im SQL-Editor frei:
  ```sql
  insert into public.team_members (user_id, display_name)
  select id, 'Name' from auth.users where email = 'person@example.de';
  ```
- Zugang entziehen: Zeile in `team_members` löschen oder den Benutzer in Authentication löschen.
- Für einen erneuten Abnahmelauf (`pnpm e2e:acceptance`) ein eigenes Testkonto anlegen und per SQL in `team_members` eintragen. Danach Konto und Fälle („Synthetik …“) wieder löschen. Das Konto aus der Erstabnahme ist am 08.11.2026 gelöscht worden, ebenso alle Testfälle und der fiktive Katalogeintrag „Musterversicherung AG“.

## Betrieb

### Gesetzliche Konstanten pflegen
Alle Konstanten liegen in `packages/legal-config/src/index.ts`, jeweils mit Norm, Quelle, Abrufdatum und Status (`verifiziert` / `bitte prüfen`). Bei Gesetzesänderungen den Wert, `asOf` und die Quelle anpassen, `pnpm test` ausführen und deployen. Die Seite **Gesetzliche Grundlagen** im Tool zeigt den aktuellen Stand. Der Report hängt ihn an.

### Tarifkatalog und Bibliothek
- Die **Startliste Versicherer** (Bibliothek → „Startliste Versicherer laden“) legt gängige Lebensversicherer mit Kurzformen an.
- Aliase („ARLP“, „AL FondsRente“) sorgen dafür, dass unterschiedliche Schreibweisen auf denselben Tarif treffen. Bei jeder Zuordnung übernimmt Klarwert die erkannten Schreibweisen automatisch als Alias.
- Kandidaten aus der Websuche gelten erst nach Bestätigung als gültig.

### Kosten
- **Anthropic:** Pro Fall fallen eine Erkennung an, eine Kostenextraktion je Bedingungswerk (nur beim ersten Vertrag eines Tarifs) und optional eine Websuche. Modell und Effort sind per Variable steuerbar.
- **Supabase:** Das Projekt `klarwert` läuft in der Organisation „Dominic“ im Pro-Plan; als zusätzliches Projekt fallen Compute-Kosten an.
- **Vercel:** Das Hosting richtet sich nach dem Vercel-Plan des Auftraggebers.

### Diagnose
`/api/diagnose` (nur angemeldete Teammitglieder) zeigt, ob OCR- und PDF-Pakete im Vercel-Bundle liegen. `/api/diagnose?ocr=1` führt einen OCR-Probelauf mit einem synthetischen Bild aus.

### Datensicherung und Löschung
- Supabase sichert die Datenbank täglich (Pro-Plan).
- Originale löscht Klarwert nach der Erkennung automatisch; „Original jetzt löschen“ entfernt sie sofort.
- Ein Fall wird mit allen Daten über die Datenbank gelöscht (`delete from cases where id = …`, kaskadierend; Dateien im Storage unter `<fall-id>/` entfernen).

## Tests und Abnahme

```bash
pnpm test                 # Vitest: Rechenkern-Referenzfälle, Zulagen, Szenarien, PII, Extraktion, Gate, Offline-Pipeline
```

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm fixtures:synthetic   # erzeugt die synthetischen Dokumente neu (tests/fixtures/synthetic)
```

```bash
KW_BASE_URL=https://klarwert.koppenburg.info KW_EMAIL=… KW_PASSWORD=… KW_MODE=live NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… pnpm e2e:acceptance
```

Der Abnahme-Durchlauf (`tests/e2e/acceptance.ts`) führt die drei synthetischen Fälle der fiktiven „Musterversicherung AG“ durch die echte Oberfläche:
- Upload, Bereinigung und Freigabe
- Erkennung (KI im Modus `live`)
- Tarif und Bedingungswerk aus der Bibliothek
- Bestätigung der Kostenfaktoren
- Analyse, Depot-Szenarien und PDF-Report
- Vergleich der drei Fälle
- Gate-Negativtest

Screenshots, PDFs und ein Protokoll mit den Abweichungen zwischen Erkennung und Soll landen in `tests/output/`.
Die KI-Kostenextraktion lässt sich gesondert prüfen: `tests/e2e/cost-extraction-check.ts` vergleicht die Vorschläge für ein Bedingungswerk mit den Soll-Kostenfaktoren (Aufruf im Dateikopf).

**Ergebnis der Live-Abnahme am 08.11.2026** (Vercel, `claude-opus-5-5`):
- Alle drei Fälle sind vollständig durchgelaufen.
- Vertragserkennung: 37 von 37 Sollfeldern ohne Korrektur.
- Kostenextraktion: 49 von 49 Sollwerten, jeweils mit Seite und Zitat.
- PIB-Abgleich (Fall 3): ausgewiesen 1,04 Pp., berechnet 1,04 Pp., Abweichung 0,00 Pp.
- PDF-Reports wurden erzeugt.
- Der Gate-Negativtest blockiert den Report (HTTP 409).
- Laufzeiten: Erkennung etwa 30 s je Fall, Kostenextraktion etwa 30 s je Bedingungswerk, PDF etwa 10 s.

Der Ablaufplan für anonymisierte Echtfälle steht in [tests/fixtures/real/README.md](tests/fixtures/real/README.md).

## Bekannte Grenzen

- **Schwärzung:** Sie arbeitet regelbasiert. Namen ohne Beschriftung und außerhalb der Vornamenliste oder des Kundennamens kann sie übersehen; ebenso Text, den die OCR nicht liest. Deshalb gibt es Vorschau, Freigabe und manuelles Nachschwärzen. Einzelheiten in `packages/privacy/README.md`.
- **Steuern:** Steuerliche Effekte werden nicht gerechnet, das Tool weist nur darauf hin.
- **Garantieprodukte:** Sie werden über Garantiekosten in % p.a. abgebildet. Die Aufteilung in Sicherungsvermögen und Fonds simuliert Klarwert nicht.
- **Zulagen:** Die Gutschrift erfolgt vereinfacht im März des Folgejahres. Erst nach Ende der Ansparphase fällige Zulagen werden im letzten Ansparmonat gutgeschrieben.
- **Depot-Kosten:** Sie sind vor dem Marktstart unbekannt und daher immer Eingabeparameter mit Standardwert (0,3 % Verwaltung, 0,2 % Fonds).
