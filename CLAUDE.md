# CLAUDE.md – Architektur und Konventionen

Klarwert ist ein internes Analyse-Tool der Koppenburg GmbH. Es berechnet die Effektivkosten von Altersvorsorgeverträgen. Nutzer sind Versicherungsprofis, keine Entwickler.
UI, Reports, Doku und Kommunikation sind auf Deutsch, Code-Identifier auf Englisch. Das Tool liefert Entscheidungsgrundlagen und markiert nie ein Szenario oder einen Vertrag als „empfohlen“.

## Monorepo (pnpm Workspaces)

| Paket | Zweck | Abhängigkeiten |
|---|---|---|
| `packages/calc` | Rechenkern: Monatssimulation, Effektivkosten (RIY), Rentenphase, Rückkauf, Zulagen, Depot-Szenarien, Vergleich | nur `@klarwert/legal-config`; **keine** UI-, Netz- oder LLM-Abhängigkeit |
| `packages/legal-config` | gesetzliche Konstanten mit Norm, Quelle, `asOf`, Status | keine |
| `packages/privacy` | lokale OCR (tesseract.js), PII-Erkennung, Schwärzung (sharp), PDF (pdfjs-dist, @napi-rs/canvas) | keine Systembinaries |
| `packages/extraction` | Feldkataloge (`fields.ts`), Zod-Schemas, Prompts, Claude-Aufrufe, Tarif-Matching, Gate und Rechenmodell-Aufbau (`model-builder.ts`), Anforderungsschreiben, PDF-Download | `@anthropic-ai/sdk`, `zod`, `@klarwert/calc` |
| `apps/web` | Next.js 16 App Router | alle Pakete (Quelltext über `transpilePackages`) |

Pakete werden als TypeScript-Quelltext konsumiert (`exports: ./src/index.ts`) und haben keinen eigenen Build.

## Nicht verhandelbare Regeln

1. **Kein Modellaufruf mit ungeprüften Vertragsunterlagen.** `extractContract` verlangt einen `SanitizedPayload` mit `verification.ok === true`. Die API-Route `api/cases/[id]/extract` ruft vorher `verifyStored` auf (Text erneut prüfen, Bilder erneut per OCR lesen). Kundenname, Fallnummer und Originale kommen nie in den API-Kontext. Bedingungswerke sind unpersönlich und dürfen unverändert hinaus.
2. **Das Modell rechnet nie.** Es liefert Rohdaten mit Konfidenz und Fundstelle. Jede Berechnung findet in `packages/calc` statt.
3. **Das Gate gilt ausnahmslos.** Ohne bestätigte Pflichtfelder und vollständig bestätigte Kostenfaktoren gibt es keine Berechnung und keinen Report. Geprüft wird an drei Stellen:
   - `checkGate` / `buildModel` (wirft `GateError`)
   - die Report-Route (409)
   - der DB-Trigger `reports_gate`

   Jede Änderung an einem Feld oder Kostenwert setzt `cases.costs_confirmed_at` zurück, wenn das Gate nicht mehr erfüllt ist (`recomputeConfirmation` in `faelle/[id]/actions.ts`).
4. **Jede Zahl im Report trägt eine Fundstelle** oder ist als Annahme gekennzeichnet. `buildModel` liefert `provenance`, `components/report/sources.ts` baut daraus das Register V/K/A/G.
5. **Gesetzliche Werte stehen nur in `packages/legal-config`**, nie als Literal in Rechenkern oder UI. Bei Auslegungsfragen gilt: beide Varianten rechnen und „bitte prüfen“ kennzeichnen (Beispiele: D1/D2, Lesart Kinderzulage).
6. **Depot-Kosten sind immer Eingabeparameter** mit Standardwert, nie fest verdrahtet.

## Rechenkern-Konventionen (`packages/calc`)

- Zeit in Monaten ab Vertragsbeginn, 0-basiert. Beiträge am Monatsanfang. Wertentwicklung monatlich `(1 + r)^(1/12)`.
- Kosten auf das Guthaben (γ, Fonds, Garantie) am Monatsende auf den Wert nach Wertentwicklung, κ/12 am Monatsende. Abzüge sind auf das vorhandene Guthaben begrenzt.
- α: entweder ‰ der Beitragssumme, als Raten auf die planmäßigen Zahlungstermine im Verteilungsfenster verteilt, oder % je Beitrag. Dynamikerhöhungen bilden eigene Tranchen.
- Beitragsfreistellung: `onPaidUp` = `stop` | `charge_remaining` | `continue`.
- Effektivkosten = IRR ohne Kosten − IRR mit Kosten. Die Zerlegung nach Kostenart läuft sequentiell in der Reihenfolge `COST_KINDS`; die Summe ist exakt, die Aufteilung eine Näherung.
- Neue Funktionalität immer mit **handgerechnetem Referenzfall** in `packages/calc/test/` (Rechenweg im Testnamen oder Kommentar, Sollwert nicht aus dem Code übernommen).

## Datenmodell (Supabase, `supabase/migrations/`)

- Tarifkatalog: `insurers` → `tariffs` → `tariff_generations`, jeweils mit `aliases text[]`.
- `library_documents` + `library_pages` (Volltext `german`, RPC `search_library`), Status `candidate` | `confirmed` | `rejected`.
- `cases`, `case_documents` (nur Metadaten und Pfade; `pii_summary` enthält nur Anzahlen), `case_fields` (Wert, Konfidenz, Fundstelle, Status), `extractions` (Rohantwort).
- `cost_items`: entweder `generation_id` (Tarifwert) **oder** `case_id` (Override), jeweils mit Fundstelle und Status.
- `comparisons`, `reports` (Snapshot + PDF-Pfad).
- RLS auf allen Tabellen: Zugriff nur für `is_team_member()`. Storage-Buckets `originals`, `sanitized`, `library`, `reports` sind privat.
- Schemaänderungen: neue Datei in `supabase/migrations/` und einspielen (Supabase MCP `apply_migration` oder Supabase CLI), danach die Security-Advisors prüfen.

## Web-App (`apps/web`)

- Next.js 16: `proxy.ts` statt Middleware, async `params`/`searchParams`, Server Actions für Mutationen, Route Handler für lange Läufe (OCR, KI, PDF; `maxDuration` bis 300 s).
- Große Dateien lädt der Browser **direkt** in Supabase Storage, wegen des Body-Limits von 4,5 MB auf Vercel. Danach stößt er die Verarbeitung über eine API-Route an.
- Schwere Node-Pakete (`tesseract.js`, `sharp`, `pdfjs-dist`, `@napi-rs/canvas`, `@sparticuz/chromium`, `playwright-core`) sind `serverExternalPackages`; Sprachdaten und Worker kommen über `outputFileTracingIncludes` ins Bundle.
- Clientseitige Berechnung: Client-Komponenten importieren nur `@klarwert/calc` und `lib/analysis-settings.ts`, nie `@klarwert/extraction` (zieht das Anthropic-SDK).
- UI-Bausteine: `src/components/ui.tsx`. Farben als CSS-Variablen in `globals.css`, Branding-Platzhalter in `src/lib/branding.ts`.

## Befehle

```bash
pnpm check
```

`pnpm check` führt Typecheck, Lint und alle Vitest-Tests aus.

```bash
pnpm --filter @klarwert/web build
```

```bash
pnpm fixtures:synthetic
```

```bash
pnpm e2e:acceptance
```

Für `pnpm e2e:acceptance` sind die Umgebungsvariablen aus der README nötig.
