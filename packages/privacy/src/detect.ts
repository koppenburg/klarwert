import { FIRST_NAMES } from "./first-names";
import type { DetectOptions, PiiKind, PiiMatch } from "./types";

/**
 * Regelbasierte Erkennung personenbezogener Daten in deutschen
 * Vertragsunterlagen. Alle Regeln arbeiten zeilenbezogen (horizontaler
 * Leerraum = Leerzeichen/Tab/NBSP); nur ausgewählte Label-Regeln dürfen auf
 * die Folgezeile ausweichen, wenn das Label am Zeilenende steht.
 */

export const PLACEHOLDERS: Readonly<Record<PiiKind, string>> = {
  name: "[NAME]",
  address: "[ANSCHRIFT]",
  birthdate: "[GEBURTSDATUM]",
  policy_number: "[VERTRAGSNR]",
  iban: "[IBAN]",
  phone: "[TELEFON]",
  email: "[E-MAIL]",
  tax_id: "[STEUER-ID]",
};

interface Candidate {
  kind: PiiKind;
  start: number;
  end: number;
  rule: string;
  priority: number;
}

/* ------------------------------------------------------------------ */
/* Hilfsmuster                                                         */
/* ------------------------------------------------------------------ */

const H = "[ \\t\\u00A0]"; // horizontaler Leerraum
const LB = "(?<![\\p{L}\\p{N}])"; // linke Wortgrenze (Unicode)
const RB = "(?![\\p{L}\\p{N}])"; // rechte Wortgrenze (Unicode)

const MONTHS =
  "(?:Jan(?:uar)?|Feb(?:ruar)?|M(?:ä|ae)rz|Mär|Apr(?:il)?|Mai|Jun(?:i)?|Jul(?:i)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Okt(?:ober)?|Nov(?:ember)?|Dez(?:ember)?)";
const DATE_SRC =
  `(?<![\\d.])(?:\\d{1,2}${H}?\\.${H}?\\d{1,2}${H}?\\.${H}?(?:\\d{4}|\\d{2})(?![\\d])` +
  `|\\d{1,2}\\.?${H}+${MONTHS}\\.?${H}+\\d{4}` +
  `|\\d{4}-\\d{2}-\\d{2}` +
  `|\\d{1,2}/\\d{1,2}/\\d{4})(?!\\d)`;

const STRICT_DATE_TOKEN = /^(?:\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})$/;

/** Wörter, die nie als Personenname gelten (klein geschrieben verglichen). */
const STOPWORDS = new Set(
  `
ab aber alle alter am an anschrift antrag antragsteller anteile anzahl auf aus az bank bei beitrag beiträge beitragszahler
berater bezugsberechtigt bezugsberechtigte bezugsberechtigter bezugsberechtigung bic bis bitte da damen das datum dem den der des
die dr ehepartner ein eine einen einer eur euro fax fonds frau für geb geboren geburtsdatum geburtsname gemäß gesamt gesellschaft
guten hallo herr herren herrn ihr ihre im in inhaber isin ja jährlich kind konto kontoinhaber kunde kundin leben liebe lieber
mit monatlich nach nachname name nein neue nicht nr oder ohne person police prof rente seite seit sie stand summe tarif tel
telefon und unter vertrag vertragsnummer von vor vorname vn vp wert wir wkn wohnort zu zum zur über
versicherte versicherter versicherten versicherungsnehmer versicherungsnehmerin versicherung versicherer gesellschaft
anrede titel familienname zuname vermittler ansprechpartner sachbearbeiter mandant eheleute familie
adresse straße strasse hausnummer plz ort land deutschland email e-mail mobil handy iban steuer-id
januar februar märz april mai juni juli august september oktober november dezember
montag dienstag mittwoch donnerstag freitag samstag sonntag heute morgen
klassik comfort komfort premium plus basis top invest chance balance vario flex select
standmitteilung mitteilung information informationen angebot produktinformationsblatt seite
`
    .split(/\s+/)
    .filter((w) => w.length > 0),
);

/** Wortenden, die auf Fachbegriffe statt Namen hindeuten. */
const STOP_SUFFIXES = [
  "versicherung",
  "vertrag",
  "verträge",
  "beginn",
  "nummer",
  "datum",
  "beitrag",
  "beiträge",
  "summe",
  "betrag",
  "rente",
  "renten",
  "leistung",
  "leistungen",
  "zahlung",
  "tarif",
  "police",
  "konto",
  "fonds",
  "guthaben",
  "kosten",
  "ablauf",
  "laufzeit",
  "information",
  "mitteilung",
  "makler",
  "gesellschaft",
  "kasse",
  "bank",
  "person",
  "nehmer",
  "nehmerin",
  "berechtigte",
  "berechtigter",
  "zahler",
  "anschrift",
  "schutz",
  "wert",
  "stand",
  "jahr",
  "monat",
  "angaben",
  "daten",
  "straße",
  "strasse",
  "allee",
  "gasse",
  "platz",
  "chaussee",
  "weg",
];

const COMPANY_SUFFIX_RE =
  /^(?:AG|GmbH|gGmbH|mbH|SE|VVaG|VaG|a\.G\.|KG|KGaA|OHG|GbR|eG|e\.V\.|Ltd\.?|Limited|S\.A\.|SA|plc|PLC|Inc\.?|N\.V\.|NV|S\.p\.A\.|AB|ASA|Co\.?|Holding|Group|Gruppe|Konzern|Versicherungsverein)$/;

function isStopword(token: string): boolean {
  const lower = token.toLocaleLowerCase("de-DE").replace(/[.:]+$/, "");
  if (STOPWORDS.has(lower)) return true;
  for (const suffix of STOP_SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length >= suffix.length + 4) return true;
  }
  return false;
}

const NAME_WORD_RE = /^\p{Lu}[\p{Ll}'’]+(?:-\p{Lu}[\p{Ll}'’]+)*$/u;
const CAPS_NAME_WORD_RE = /^\p{Lu}{2,}(?:-\p{Lu}{2,})*$/u;
const INITIAL_RE = /^\p{Lu}\.$/u;
const PARTICLES = new Set(["von", "van", "vom", "de", "der", "den", "zu", "zum", "ten", "ter", "la", "le", "di", "da", "del", "dos", "el", "al", "bin", "ibn"]);
const TITLES_RE = /^(?:Dr\.|Prof\.|Dipl\.-?\p{L}*\.?|med\.|rer\.|nat\.|jur\.|phil\.|h\.c\.|Ing\.|MBA|M\.Sc\.|B\.Sc\.|Herrn?|Frau|HERRN?|FRAU)$/u;

function isNameWord(core: string, allowCaps: boolean): boolean {
  if (COMPANY_SUFFIX_RE.test(core)) return false;
  if (isStopword(core)) return false;
  if (NAME_WORD_RE.test(core)) return true;
  return allowCaps && CAPS_NAME_WORD_RE.test(core) && core.length <= 30;
}

function isFirstName(core: string): boolean {
  if (FIRST_NAMES.has(core)) return true;
  const first = core.split("-")[0];
  return first !== undefined && first !== core && FIRST_NAMES.has(first) && NAME_WORD_RE.test(core);
}

/* ------------------------------------------------------------------ */
/* Tokenisierung (zeilenweise)                                         */
/* ------------------------------------------------------------------ */

interface Token {
  /** Rohtext des Tokens (ohne Leerraum) */
  raw: string;
  /** Token ohne führende/abschließende Satzzeichen (Initialen behalten den Punkt) */
  core: string;
  start: number; // Offset von core im Gesamttext
  end: number;
  /** Abschließendes Satzzeichen direkt hinter core (z. B. ",") */
  trailing: string;
  line: number;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /[^\s]+/g;
  let line = 0;
  let lastIndex = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    for (let i = lastIndex; i < m.index; i++) if (text.charCodeAt(i) === 10) line++;
    lastIndex = m.index;
    const raw = m[0];
    const lead = /^[("„“'‚[]+/.exec(raw)?.[0].length ?? 0;
    let body = raw.slice(lead);
    let trailing = "";
    if (!INITIAL_RE.test(body) && !TITLES_RE.test(body)) {
      const t = /[),;:!?"“”'’.\]]+$/.exec(body);
      if (t) {
        trailing = t[0];
        body = body.slice(0, body.length - trailing.length);
      }
    }
    if (body.length === 0) continue;
    const start = m.index + lead;
    tokens.push({ raw, core: body, start, end: start + body.length, trailing, line });
  }
  return tokens;
}

/* ------------------------------------------------------------------ */
/* Regeln                                                              */
/* ------------------------------------------------------------------ */

const PRIORITY: Readonly<Record<string, number>> = {
  email: 100,
  iban: 95,
  "tax-id-label": 92,
  "birthdate-label": 90,
  "birthdate-asterisk": 90,
  "phone-label": 88,
  "bic-label": 87,
  "account-label": 87,
  "policy-label": 85,
  "known-name": 82,
  "name-label": 80,
  "name-salutation": 80,
  "address-label": 76,
  "address-street": 75,
  "address-zip-city": 75,
  "phone-generic": 70,
  "sv-pattern": 70,
  "name-first-name": 60,
  "number-generic": 50,
};

function add(out: Candidate[], kind: PiiKind, start: number, end: number, rule: string): void {
  if (end <= start) return;
  out.push({ kind, start, end, rule, priority: PRIORITY[rule] ?? 10 });
}

function lineEndAt(text: string, pos: number): number {
  const i = text.indexOf("\n", pos);
  return i === -1 ? text.length : i;
}

function lineStartAt(text: string, pos: number): number {
  return text.lastIndexOf("\n", pos - 1) + 1;
}

/** Überspringt Doppelpunkt/Leerraum nach einem Label. Liefert Position des Werts (ggf. in der Folgezeile). */
function valueStart(text: string, labelEnd: number, allowNextLine: boolean): { pos: number; nextLine: boolean } | null {
  const sep = /[ \t\u00A0]*(?:[:#]|\.(?=[ \t\u00A0]))?[ \t\u00A0]*/y;
  sep.lastIndex = labelEnd;
  const m = sep.exec(text);
  let pos = labelEnd + (m ? m[0].length : 0);
  if (pos < text.length && text[pos] !== "\n") return { pos, nextLine: false };
  if (!allowNextLine || pos >= text.length) return null;
  // Label steht am Zeilenende → Wert in der Folgezeile
  pos++;
  const ws = /[ \t\u00A0]*/y;
  ws.lastIndex = pos;
  pos += ws.exec(text)?.[0].length ?? 0;
  if (pos >= text.length || text[pos] === "\n") return null;
  return { pos, nextLine: true };
}

function* labelHits(text: string, labelSrc: string, flags = "giu"): Generator<{ start: number; end: number }> {
  const re = new RegExp(`(?<![\\p{L}\\p{N}\\[-])(?:${labelSrc})(?![\\p{L}])`, flags);
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    yield { start: m.index, end: m.index + m[0].length };
    if (m[0].length === 0) re.lastIndex++;
  }
}

/** Liest eine Namensfolge ab `pos` (gleiche Zeile). Liefert Ende oder null. */
function readNameAt(text: string, pos: number, allowCaps: boolean): number | null {
  const lineEnd = lineEndAt(text, pos);
  const seg = text.slice(pos, lineEnd);
  const toks = tokenize(seg);
  let i = 0;
  // Anrede/Titel überspringen
  while (i < toks.length && TITLES_RE.test(toks[i]!.core) && toks[i]!.start - (toks[i - 1]?.end ?? 0) <= 2) i++;
  if (i > 0 && toks[i - 1]!.trailing.includes(",")) return null;
  let count = 0;
  let end: number | null = null;
  let commaUsed = false;
  let prevEnd = toks[i - 1]?.end ?? 0;
  for (; i < toks.length && count < 5; i++) {
    const t = toks[i]!;
    if (t.start - prevEnd > 2 && count > 0) break; // großer Abstand → nächste Spalte
    if (/^\[/.test(t.raw)) break;
    const isParticle = PARTICLES.has(t.core) && count > 0 && i + 1 < toks.length;
    if (isParticle) {
      prevEnd = t.end;
      continue;
    }
    if (!(isNameWord(t.core, allowCaps) || INITIAL_RE.test(t.core))) break;
    if (i + 1 < toks.length && COMPANY_SUFFIX_RE.test(toks[i + 1]!.core)) return null;
    end = t.end;
    count++;
    prevEnd = t.end;
    if (t.trailing.length > 0) {
      // "Mustermann, Erika" ist erlaubt (genau ein Komma), sonst Ende
      if (t.trailing === "," && !commaUsed && i + 1 < toks.length && isNameWord(toks[i + 1]!.core, allowCaps)) {
        commaUsed = true;
        continue;
      }
      break;
    }
  }
  if (end === null || count === 0) return null;
  return pos + end;
}

const NAME_LABELS = [
  "Versicherungsnehmer(?:in|/in|\\(in\\))?",
  "Mitversicherte[rn]?(?:[ \\t]+Person)?",
  "Versicherte[rn]?(?:[ \\t]+Person)?",
  "Vers\\.?[ \\t]?Person",
  "Vor-?[ \\t]+und[ \\t]+(?:Nach|Zu)name",
  "Vorname(?:[ \\t]*/[ \\t]*Name)?",
  "Nachname",
  "Familienname",
  "Geburtsname",
  "Zuname",
  "Name(?:[ \\t]*,[ \\t]*Vorname)?",
  "Kunde",
  "Kundin",
  "Beitragszahler(?:in)?",
  "Bezugsberechtigte?[rn]?",
  "Bezugsberechtigung",
  "Kontoinhaber(?:in)?",
  "Depotinhaber(?:in)?",
  "Inhaber(?:in)?",
  "Antragsteller(?:in)?",
  "Ehepartner(?:in)?",
  "Ehegatte",
  "Begünstigte[rn]?",
  "Ansprechpartner(?:in)?",
  "Sachbearbeiter(?:in)?",
  "Berater(?:in)?",
  "Vermittler(?:in)?",
  "Mandant(?:in)?",
  "Zahler",
  "z\\.[ \\t]?Hd\\.?",
  "zu[ \\t]+Händen",
  "VN",
  "VP",
  "geb\\.",
  "geborene[rn]?",
].join("|");

function ruleNames(text: string, out: Candidate[]): void {
  // Label-basiert (Wert in gleicher oder folgender Zeile)
  for (const hit of labelHits(text, NAME_LABELS)) {
    const v = valueStart(text, hit.end, true);
    if (!v) continue;
    const end = readNameAt(text, v.pos, true);
    if (end !== null) add(out, "name", v.pos, end, "name-label");
  }
  // Anrede: Herr/Frau/Familie/Eheleute (case-sensitiv)
  for (const hit of labelHits(text, "Herrn?|Frau|HERRN?|FRAU|Familie|Eheleute|Liebe[rn]?|Hallo", "gu")) {
    const v = valueStart(text, hit.end, false);
    if (!v || v.pos - hit.end > 3) continue;
    const end = readNameAt(text, v.pos, true);
    if (end !== null) add(out, "name", v.pos, end, "name-salutation");
  }
  // Vornamensliste + großgeschriebenes Folgewort
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const prev = tokens[i - 1];
    // Form "Mustermann, Erika" bzw. "Mustermann Erika"
    if (
      isFirstName(t.core) &&
      prev !== undefined &&
      prev.line === t.line &&
      (prev.trailing === "," || prev.trailing === "") &&
      t.start - prev.end <= 2 &&
      isNameWord(prev.core, false) &&
      !isFirstName(prev.core) &&
      !(tokens[i + 1] !== undefined && tokens[i + 1]!.line === t.line && t.trailing === "" && isNameWord(tokens[i + 1]!.core, false))
    ) {
      add(out, "name", prev.start, t.end, "name-first-name");
      continue;
    }
    if (!isFirstName(t.core)) continue;
    let j = i;
    // weitere Vornamen / Initialen
    while (
      j + 1 < tokens.length &&
      tokens[j]!.trailing === "" &&
      tokens[j + 1]!.line === t.line &&
      tokens[j + 1]!.start - tokens[j]!.end <= 2 &&
      (isFirstName(tokens[j + 1]!.core) || INITIAL_RE.test(tokens[j + 1]!.core))
    ) {
      j++;
    }
    let k = j + 1;
    while (k < tokens.length && tokens[k]!.line === t.line && PARTICLES.has(tokens[k]!.core)) k++;
    const sur = tokens[k];
    const lastFirst = tokens[j]!;
    if (
      sur !== undefined &&
      sur.line === t.line &&
      lastFirst.trailing === "" &&
      sur.start - lastFirst.end <= 2 + (k - j - 1) * 6 &&
      isNameWord(sur.core, false) &&
      !(tokens[k + 1] !== undefined && COMPANY_SUFFIX_RE.test(tokens[k + 1]!.core))
    ) {
      add(out, "name", t.start, sur.end, "name-first-name");
      i = k;
    } else if (j > i) {
      // "Hans Peter" (nur Vornamen)
      add(out, "name", t.start, tokens[j]!.end, "name-first-name");
      i = j;
    }
  }
}

/** Ersetzt Umlaute/ß durch Alternativen, damit "Müller" auch "Mueller"/"Muller" findet. */
function fuzzyNamePattern(part: string): string {
  const base = part
    .toLocaleLowerCase("de-DE")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
  let out = "";
  for (let i = 0; i < base.length; i++) {
    const two = base.slice(i, i + 2);
    if (two === "ae") {
      out += "(?:ae|ä|a)";
      i++;
    } else if (two === "oe") {
      out += "(?:oe|ö|o)";
      i++;
    } else if (two === "ue") {
      out += "(?:ue|ü|u)";
      i++;
    } else if (two === "ss") {
      out += "(?:ss|ß)";
      i++;
    } else {
      const ch = base[i]!;
      out += ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    }
  }
  return out;
}

const NAME_IGNORE_PARTS = new Set(["herr", "herrn", "frau", "dr", "dr.", "prof", "prof.", ...PARTICLES]);

function ruleKnownNames(text: string, names: readonly string[] | undefined, out: Candidate[]): void {
  if (!names || names.length === 0) return;
  const patterns = new Set<string>();
  for (const full of names) {
    const trimmed = full.trim();
    if (trimmed.length < 2) continue;
    const words = trimmed.split(/[\s,]+/).filter((w) => w.length > 0);
    const parts = new Set<string>();
    for (const w of words) {
      parts.add(w);
      for (const p of w.split("-")) parts.add(p);
    }
    for (const p of parts) {
      const clean = p.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
      if (clean.length < 2 || NAME_IGNORE_PARTS.has(clean.toLocaleLowerCase("de-DE"))) continue;
      patterns.add(fuzzyNamePattern(clean));
    }
    if (words.length > 1) {
      patterns.add(words.map((w) => fuzzyNamePattern(w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""))).join("[\\s,.\\-]+"));
    }
  }
  for (const p of patterns) {
    const re = new RegExp(`${LB}${p}${RB}`, "giu");
    for (let m = re.exec(text); m !== null; m = re.exec(text)) add(out, "name", m.index, m.index + m[0].length, "known-name");
  }
}

const STREET_SUFFIX =
  "(?:straße|strasse|str\\.|weg|platz|allee|gasse|ring|damm|ufer|chaussee|pfad|steig|stieg|markt|wall|graben|kamp|zeile|promenade|garten|hof|berg|feld|winkel|anger|bogen|höhe|park|siedlung|brücke|steg|tor|stra(?:ss|ß)e)";
const STREET_WORD = "(?:Straße|Strasse|Str\\.|Weg|Platz|Allee|Gasse|Ring|Damm|Ufer|Chaussee|Pfad|Steig|Markt|Wall|Graben|Promenade|Brücke|Tor|Berg|Hof|Park)";
const HOUSE_NO = `\\d{1,4}(?:${H}?[a-zA-Z](?![\\p{L}]))?(?:${H}?[-–/]${H}?\\d{1,4}[a-zA-Z]?)?(?![\\d]|[.,]\\d|${H}?%)`;
const ZIP_CITY_AHEAD = `(?=${H}*[,;]?${H}*(?:\\n${H}*)?(?:D${H}?-${H}?)?\\d{5}${H}+\\p{Lu})`;
const CITY_WORD = "\\p{Lu}[\\p{Ll}ß]{1,40}(?:-\\p{Lu}?[\\p{Ll}ß]{1,40}){0,3}";

const CITY_STOP = new Set(
  "euro eur stück stk anteile anteil jahre jahr monate monat tage tag punkte prozent mal usd chf beiträge raten euro.".split(" "),
);

function ruleAddress(text: string, out: Candidate[]): void {
  // Straße (zusammengesetzt) + Hausnummer: "Heidestraße 17", "Kurt-Schumacher-Platz 3a"
  const compound = new RegExp(`${LB}\\p{Lu}\\p{L}{0,40}?(?:-\\p{L}{1,30}){0,4}?(?:${STREET_SUFFIX}|-${STREET_WORD})${H}*${HOUSE_NO}`, "gu");
  for (let m = compound.exec(text); m !== null; m = compound.exec(text)) add(out, "address", m.index, m.index + m[0].length, "address-street");
  // Getrennte Schreibweise: "Kölner Straße 12", "Unter den Linden"-artige mit Straßenwort
  const separate = new RegExp(`${LB}(?:\\p{Lu}[\\p{L}.\\-]{0,40}${H}{1,3}){1,3}${STREET_WORD}${H}+${HOUSE_NO}`, "gu");
  for (let m = separate.exec(text); m !== null; m = separate.exec(text)) add(out, "address", m.index, m.index + m[0].length, "address-street");
  // Präpositionale Straßennamen nur mit nachfolgender PLZ: "Am Heidering 5, 51147 Köln"
  const prep = new RegExp(
    `${LB}(?:Am|An der|An den|Auf der|Auf dem|Im|In der|In den|Zum|Zur|Hinter der|Hinter dem|Unter den|Vor dem|Bei der|Alt|Alte)${H}+\\p{Lu}[\\p{L}\\-]{1,40}(?:${H}\\p{Lu}[\\p{L}\\-]{1,40})?${H}+${HOUSE_NO}${ZIP_CITY_AHEAD}`,
    "gu",
  );
  for (let m = prep.exec(text); m !== null; m = prep.exec(text)) add(out, "address", m.index, m.index + m[0].length, "address-street");
  // Versalien: "HEIDESTRASSE 17"
  const caps = new RegExp(`${LB}\\p{Lu}{2,40}[\\p{Lu}\\-]{0,40}?(?:STRASSE|STRAßE|STR\\.|WEG|PLATZ|ALLEE|GASSE|RING|DAMM|UFER|CHAUSSEE|PFAD)${H}*${HOUSE_NO}`, "gu");
  for (let m = caps.exec(text); m !== null; m = caps.exec(text)) add(out, "address", m.index, m.index + m[0].length, "address-street");
  // PLZ + Ort
  const zip = new RegExp(
    `(?<![\\p{L}\\p{N}.,/:-])(?:D${H}?-${H}?)?\\d{5}${H}+(${CITY_WORD})((?:${H}+(?:am|an der|im|in der|ob der|bei|vor der|a\\.${H}?d\\.|i\\.${H}?Br\\.|a\\.${H}?M\\.)${H}*(?:${CITY_WORD})?)|(?:${H}*/${H}*${CITY_WORD})|(?:${H}*\\(${H}*${CITY_WORD}${H}*\\)))?`,
    "gu",
  );
  for (let m = zip.exec(text); m !== null; m = zip.exec(text)) {
    const city = m[1] ?? "";
    if (CITY_STOP.has(city.toLocaleLowerCase("de-DE")) || isStopword(city)) continue;
    let end = m.index + m[0].length;
    // "Bad Homburg", "Sankt Augustin" usw.
    if (/^(?:Bad|Sankt|St|Neu|Groß|Klein|Alt|Hansestadt|Markt)$/.test(city)) {
      const more = new RegExp(`${H}+${CITY_WORD}`, "uy");
      more.lastIndex = end;
      const mm = more.exec(text);
      if (mm) end += mm[0].length;
    }
    add(out, "address", m.index, end, "address-zip-city");
  }
  // Label-basiert: Rest der Zeile (bzw. Folgezeile, wenn diese Ziffern enthält)
  const labels =
    "Wohnanschrift|Postanschrift|Meldeanschrift|Privatanschrift|Anschrift|Adresse|Wohnort|Wohnsitz|wohnhaft(?:[ \\t]+in)?|PLZ[ \\t]*/[ \\t]*Ort|PLZ,[ \\t]*Ort|PLZ[ \\t]+Ort|Postleitzahl|PLZ|Straße[ \\t]*/[ \\t]*Nr\\.?|Straße,[ \\t]*Hausnummer|Hausnummer|Ort";
  for (const hit of labelHits(text, labels)) {
    const v = valueStart(text, hit.end, true);
    if (!v) continue;
    const ch = text[v.pos] ?? "";
    if (!/[\p{Lu}\p{N}]/u.test(ch)) continue;
    const end = cutValueEnd(text, v.pos);
    const value = text.slice(v.pos, end);
    if (v.nextLine && !/\d/.test(value)) continue;
    if (/^Ort$/i.test(text.slice(hit.start, hit.end)) && !/^(?:\p{Lu}|\d)/u.test(value)) continue;
    add(out, "address", v.pos, end, "address-label");
  }
}

/** Ende eines Label-Werts: Zeilenende, Tab, Doppel-Leerzeichen, " | " oder nächstes "Label:". */
function cutValueEnd(text: string, pos: number): number {
  const lineEnd = lineEndAt(text, pos);
  const seg = text.slice(pos, lineEnd);
  const stop = /\t|[ \u00A0]{2,}|[ \t]\|[ \t]|[ \t]│|[ \t]+\p{Lu}[\p{L}.\-/]+(?:[ \t][\p{L}.\-/]+){0,3}:(?=[ \t]|$)/u.exec(seg);
  let end = pos + (stop ? stop.index : seg.length);
  while (end > pos && /[\s,;:]/.test(text[end - 1] ?? "")) end--;
  return end;
}

function ruleBirthdate(text: string, out: Candidate[]): void {
  const labels =
    "Geburtsdatum|Geb\\.?[ \\t]?-?[ \\t]?Datum|Geb\\.?datum|Geburtstag|geboren(?:[ \\t]+am)?|geb\\.(?:[ \\t]*am)?|Geb\\.|Gebdat\\.?|Date of birth|DOB";
  const dateRe = new RegExp(DATE_SRC, "gu");
  for (const hit of labelHits(text, labels)) {
    const lineEnd = lineEndAt(text, hit.end);
    const rest = text.slice(hit.end, lineEnd);
    dateRe.lastIndex = 0;
    const dm = dateRe.exec(rest);
    const between = dm ? rest.slice(0, dm.index) : rest;
    const otherDateLabel = /beginn|ablauf|ende|stichtag|stand|datum|vom|seit/i.test(between);
    if (dm && !otherDateLabel) {
      add(out, "birthdate", hit.end + dm.index, hit.end + dm.index + dm[0].length, "birthdate-label");
      continue;
    }
    // Folgezeile nur, wenn in der Label-Zeile kein Wert steht (keine Ziffern, kein Platzhalter)
    if (/[\d[]/.test(rest) || lineEnd >= text.length) continue;
    const nextStart = lineEnd + 1;
    const nextEnd = lineEndAt(text, nextStart);
    const next = text.slice(nextStart, nextEnd);
    if (next.includes(PLACEHOLDERS.birthdate)) continue;
    const col = hit.start - lineStartAt(text, hit.start);
    let best: { s: number; e: number; d: number } | null = null;
    dateRe.lastIndex = 0;
    for (let m = dateRe.exec(next); m !== null; m = dateRe.exec(next)) {
      const d = Math.abs(m.index - col);
      if (!best || d < best.d) best = { s: m.index, e: m.index + m[0].length, d };
    }
    if (best) add(out, "birthdate", nextStart + best.s, nextStart + best.e, "birthdate-label");
  }
  // "* 12.03.1980" (Sternchen = geboren)
  const star = new RegExp(`(?<=^|[\\s(,])\\*${H}?(${DATE_SRC})`, "gmu");
  for (let m = star.exec(text); m !== null; m = star.exec(text)) {
    const d = m[1] ?? "";
    add(out, "birthdate", m.index + m[0].length - d.length, m.index + m[0].length, "birthdate-asterisk");
  }
}

const POLICY_LABELS = [
  "Versicherungsschein[ \\t-]?(?:nummer|Nr\\.?)",
  "Versicherungs[ \\t-]?(?:nummer|Nr\\.?)",
  "Versichertennummer",
  "Krankenversichertennummer",
  "Vers\\.?[ \\t-]?(?:Schein[ \\t-]?)?Nr\\.?",
  "VS[ \\t-]?Nr\\.?",
  "VSNR",
  "Vertrags[ \\t-]?(?:nummer|Nr\\.?)",
  "Vertragsnr\\.?",
  "Vertrag[ \\t]+Nr\\.?",
  "Polic(?:e|en)[ \\t-]?(?:nummer|Nr\\.?)",
  "Polizzen?[ \\t-]?(?:nummer|Nr\\.?)",
  "Police",
  "Kunden[ \\t-]?(?:nummer|Nr\\.?)",
  "Kd\\.?[ \\t-]?Nr\\.?",
  "Mitglieds?[ \\t-]?(?:nummer|Nr\\.?)",
  "Antrags[ \\t-]?(?:nummer|Nr\\.?)",
  "Depot[ \\t-]?(?:nummer|Nr\\.?)",
  "Sozialversicherungs[ \\t-]?(?:nummer|Nr\\.?)",
  "SV[ \\t-]?(?:Nummer|Nr\\.?)",
  "Rentenversicherungs[ \\t-]?(?:nummer|Nr\\.?)",
  "RV[ \\t-]?(?:Nummer|Nr\\.?)",
  "Zulagen?[ \\t-]?(?:nummer|Nr\\.?)",
  "Aktenzeichen",
  "Az\\.",
  "Unser[ \\t]+Zeichen",
  "Ihr[ \\t]+Zeichen",
  "Schadens?[ \\t-]?(?:nummer|Nr\\.?)",
  "Vorgangs[ \\t-]?(?:nummer|Nr\\.?)",
  "Referenz(?:nummer)?",
  "Personal[ \\t-]?(?:nummer|Nr\\.?)",
  "Vermittler[ \\t-]?(?:nummer|Nr\\.?)",
  "Mandanten[ \\t-]?(?:nummer|Nr\\.?)",
  "Bestands[ \\t-]?(?:nummer|Nr\\.?)",
  "Mandatsreferenz",
  "Ordnungsbegriff",
  "Buchungszeichen",
  "Kassenzeichen",
].join("|");

function ruleLabeledNumbers(text: string, out: Candidate[]): void {
  // Wert: Token mit Ziffer, danach weitere reine Zifferngruppen
  const value = new RegExp(
    `(?=[A-Za-z0-9./\\-]*\\d)[A-Za-z0-9][A-Za-z0-9./\\-]*(?:${H}(?:(?!\\d{1,2}\\.\\d{1,2}\\.\\d{2,4})(?![\\d./\\-]*,\\d)\\d[\\d./\\-]*|\\p{Lu}(?=${H}\\d)))*`,
    "uy",
  );
  const take = (labelSrc: string, kind: PiiKind, rule: string, nextLine: boolean): void => {
    for (const hit of labelHits(text, labelSrc)) {
      const v = valueStart(text, hit.end, nextLine);
      if (!v) continue;
      value.lastIndex = v.pos;
      const m = value.exec(text);
      if (!m) continue;
      let end = v.pos + m[0].length;
      while (end > v.pos && /[.\-/]/.test(text[end - 1] ?? "")) end--;
      const val = text.slice(v.pos, end);
      if (val.replace(/\D/g, "").length < 2 || val.replace(/[^\p{L}\p{N}]/gu, "").length < 3) continue;
      add(out, kind, v.pos, end, rule);
    }
  };
  take(POLICY_LABELS, "policy_number", "policy-label", true);
  take(
    "Steuerliche[ \\t]+Identifikationsnummer|Steuer[ \\t-]?Identifikationsnummer|Identifikationsnummer|Steuer[ \\t-]?ID(?:[ \\t-]?Nr\\.?)?|Steuer[ \\t-]?IdNr\\.?|IdNr\\.?|Steuernummer|St\\.?[ \\t-]?Nr\\.?|TIN",
    "tax_id",
    "tax-id-label",
    true,
  );
  take("Konto[ \\t-]?(?:nummer|Nr\\.?)|Kto\\.?[ \\t-]?Nr\\.?", "iban", "account-label", true);
  // BIC nach Label
  const bic = new RegExp(`\\p{Lu}{4}${H}?\\p{Lu}{2}${H}?[A-Z0-9]{2}(?:${H}?[A-Z0-9]{3})?(?![\\p{L}\\p{N}])`, "uy");
  for (const hit of labelHits(text, "BIC(?:[ \\t]*/[ \\t]*SWIFT)?|SWIFT(?:[ \\t]*/[ \\t]*BIC)?(?:-Code)?")) {
    const v = valueStart(text, hit.end, true);
    if (!v) continue;
    bic.lastIndex = v.pos;
    const m = bic.exec(text);
    if (m) add(out, "iban", v.pos, v.pos + m[0].length, "bic-label");
  }
  // Telefon nach Label
  const phoneVal = new RegExp(`(?:\\+|\\(?0)[\\d \\t()/.\\-–+]{4,}\\d`, "uy");
  for (const hit of labelHits(
    text,
    "Telefonnummer|Telefon|Tel\\.?|Mobilfunk(?:nummer)?|Mobilnummer|Mobiltelefon|Mobil|Handy(?:nummer)?|Telefax|Fax|Rufnummer|Phone|Mobile|Festnetz",
  )) {
    const v = valueStart(text, hit.end, true);
    if (!v) continue;
    let pos = v.pos;
    const extra = /(?:privat|geschäftlich|dienstlich|mobil|tagsüber|abends)[ \t]*:?[ \t]*/iy;
    extra.lastIndex = pos;
    const em = extra.exec(text);
    if (em) pos += em[0].length;
    phoneVal.lastIndex = pos;
    const m = phoneVal.exec(text);
    if (m) {
      let end = pos + m[0].length;
      while (end > pos && /[\s.\-/(]/.test(text[end - 1] ?? "")) end--;
      add(out, "phone", pos, end, "phone-label");
    }
  }
}

function ibanMod97(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const val = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const d of val) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GR: 27, HR: 21,
  HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SE: 24,
  SI: 19, SK: 24, SM: 27, TR: 26,
};

function ruleIbanLabel(text: string, out: Candidate[]): void {
  // Nach "IBAN" auch OCR-verfälschte Werte (z. B. "O" statt "0") schwärzen
  const first = new RegExp(`[A-Z]{2}${H}?[0-9A-Z]{2}`, "uy");
  const group = new RegExp(`${H}?([A-Z0-9]{1,4})(?![\\p{Ll}:])`, "uy");
  for (const hit of labelHits(text, "IBAN")) {
    const v = valueStart(text, hit.end, true);
    if (!v) continue;
    first.lastIndex = v.pos;
    const fm = first.exec(text);
    if (!fm) continue;
    const expected = IBAN_LENGTHS[fm[0].slice(0, 2)] ?? 34;
    let end = v.pos + fm[0].length;
    let len = fm[0].replace(/[^A-Z0-9]/g, "").length;
    while (len < expected) {
      group.lastIndex = end;
      const gm = group.exec(text);
      if (!gm || gm[1] === undefined) break;
      const take = Math.min(gm[1].length, expected - len);
      end += gm[0].length - (gm[1].length - take);
      len += take;
    }
    if (len >= 12) add(out, "iban", v.pos, end, "iban");
  }
}

function ruleIban(text: string, out: Candidate[]): void {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])[A-Z]{2}${H}?\\d{2}(?:${H}?[A-Z0-9]){11,30}`, "gu");
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const raw = m[0];
    const country = raw.slice(0, 2);
    const expected = IBAN_LENGTHS[country];
    // Zeichen bis zur erwarteten Länge abzählen (Leerzeichen überspringen)
    const cut = (len: number): number => {
      let n = 0;
      for (let i = 0; i < raw.length; i++) {
        if (/[A-Z0-9]/.test(raw[i]!)) n++;
        if (n === len) return i + 1;
      }
      return -1;
    };
    let endInRaw = -1;
    if (expected !== undefined) {
      endInRaw = cut(expected);
    } else {
      for (let len = Math.min(34, raw.replace(/[^A-Z0-9]/g, "").length); len >= 15; len--) {
        const e = cut(len);
        if (e > 0 && ibanMod97(raw.slice(0, e).replace(/[^A-Z0-9]/g, ""))) {
          endInRaw = e;
          break;
        }
      }
    }
    if (endInRaw <= 0) {
      re.lastIndex = m.index + 2;
      continue;
    }
    const compact = raw.slice(0, endInRaw).replace(/[^A-Z0-9]/g, "");
    const plausible = ibanMod97(compact) || (expected !== undefined && /^[A-Z]{2}\d{2}\d{10,}/.test(compact));
    if (!plausible) {
      re.lastIndex = m.index + 2;
      continue;
    }
    add(out, "iban", m.index, m.index + endInRaw, "iban");
    re.lastIndex = m.index + endInRaw;
  }
}

function rulePhoneGeneric(text: string, out: Candidate[]): void {
  const intl = new RegExp(
    `(?<![\\p{L}\\p{N}.,])(?:\\+|00)\\d{2,3}${H}?(?:\\(0\\)${H}?)?\\(?\\d{1,5}\\)?(?:${H}?[/\\-]?${H}?\\d{2,}){1,5}(?![\\p{N}]|[.,]\\d|${H}?%)`,
    "gu",
  );
  for (let m = intl.exec(text); m !== null; m = intl.exec(text)) {
    if (m[0].replace(/\D/g, "").length >= 9) add(out, "phone", m.index, m.index + m[0].length, "phone-generic");
  }
  const national = new RegExp(
    `(?<![\\p{L}\\p{N}.,/])(?:\\(0\\d{2,5}\\)|0\\d{2,5})(?:${H}?[/\\-]${H}?|${H})\\d{3,}(?:[${"\\-"} \\t]\\d{2,})*(?![\\p{N}]|[.,]\\d|${H}?%|${H}?€)`,
    "gu",
  );
  for (let m = national.exec(text); m !== null; m = national.exec(text)) {
    if (m[0].replace(/\D/g, "").length >= 7) add(out, "phone", m.index, m.index + m[0].length, "phone-generic");
  }
}

function ruleEmail(text: string, out: Candidate[]): void {
  // Startgrenze + Längenbegrenzung verhindern quadratisches Backtracking bei langen Wortketten
  const re = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){0,8}\.\p{L}{2,24}(?![\p{L}])/gu;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) add(out, "email", m.index, m.index + m[0].length, "email");
}

function ruleSvPattern(text: string, out: Candidate[]): void {
  const re = new RegExp(`${LB}\\d{2}${H}?[0-3]\\d[01]\\d{3}${H}?\\p{Lu}${H}?\\d{3}${RB}`, "gu");
  for (let m = re.exec(text); m !== null; m = re.exec(text)) add(out, "tax_id", m.index, m.index + m[0].length, "sv-pattern");
}

export function isValidIsin(code: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(code)) return false;
  let digits = "";
  for (const ch of code) {
    const c = ch.charCodeAt(0);
    digits += c >= 65 && c <= 90 ? String(c - 55) : ch;
  }
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const YEAR_RE = /^(?:19|20)\d{2}$/;

/** Generische Nummernketten mit ≥ 6 Ziffern (keine Beträge, Daten, Prozente, ISIN). */
function ruleGenericNumbers(text: string, out: Candidate[]): void {
  const tok = /(?<![\p{L}\p{N}])[\p{L}\p{N}](?:[\p{L}\p{N}]|[./,\-_](?=[\p{L}\p{N}]))*/gu;
  for (let m = tok.exec(text); m !== null; m = tok.exec(text)) {
    const t = m[0];
    const digits = t.replace(/\D/g, "").length;
    if (digits < 6) continue;
    const start = m.index;
    const end = start + t.length;
    const after = text.slice(end, end + 3);
    const before = text.slice(Math.max(0, start - 6), start);
    if (/,\d/.test(t)) continue; // Betrag/Dezimalzahl
    if (/^[ \t]?[%‰]/.test(after)) continue;
    if (STRICT_DATE_TOKEN.test(t)) continue;
    const parts = t.split(/[-–/]/);
    if (parts.length > 1 && parts.every((p) => STRICT_DATE_TOKEN.test(p) || YEAR_RE.test(p) || /^\d{1,2}\.\d{4}$/.test(p))) continue;
    if (/^\d{1,2}[./]\d{4}$/.test(t)) continue; // Monat/Jahr
    if (isValidIsin(t)) continue;
    if (/^\d{1,3}(?:\.\d{3})+$/.test(t)) {
      // Tausenderformat ohne Dezimalen: Betrag, wenn Währung angrenzt oder ≤ 7 Ziffern
      if (/^[ \t]?(?:€|EUR|Euro)/.test(after) || /(?:€|EUR|Euro)[ \t]?$/.test(before) || digits <= 7) continue;
    }
    if (/WKN[ \t:]*$/i.test(before)) continue;
    add(out, "policy_number", start, end, "number-generic");
  }
  // Durch Leerzeichen gruppierte Ziffern: "12 345 678", "0532 0130 00"
  const groups = new RegExp(`(?<![\\p{L}\\p{N}.,])\\d{2,6}(?:${H}\\d{2,6}){1,6}(?![\\p{L}\\p{N}]|[.,]\\d|${H}?[%‰€])`, "gu");
  for (let m = groups.exec(text); m !== null; m = groups.exec(text)) {
    const parts = m[0].split(/[ \t\u00A0]+/);
    const digits = parts.join("").length;
    if (digits < 8) continue;
    if (parts.every((p) => YEAR_RE.test(p))) continue;
    if (!parts.some((p) => p.length >= 3)) continue;
    add(out, "policy_number", m.index, m.index + m[0].length, "number-generic");
  }
}

/* ------------------------------------------------------------------ */
/* Zusammenführung                                                     */
/* ------------------------------------------------------------------ */

function resolve(text: string, cands: Candidate[]): PiiMatch[] {
  // Trimmen
  for (const c of cands) {
    while (c.start < c.end && /\s/.test(text[c.start] ?? "")) c.start++;
    while (c.end > c.start && /\s/.test(text[c.end - 1] ?? "")) c.end--;
  }
  const list = cands.filter((c) => c.end > c.start).sort((a, b) => a.start - b.start || b.priority - a.priority || b.end - a.end);
  const merged: Candidate[] = [];
  for (const c of list) {
    const last = merged[merged.length - 1];
    if (last && c.start < last.end) {
      if (c.priority > last.priority) {
        last.kind = c.kind;
        last.rule = c.rule;
        last.priority = c.priority;
      }
      last.end = Math.max(last.end, c.end);
      continue;
    }
    // Angrenzende Namens-/Adressteile zusammenfassen
    if (last && last.kind === c.kind && (c.kind === "name" || c.kind === "address")) {
      const gap = text.slice(last.end, c.start);
      const ok = c.kind === "name" ? /^[ \t\u00A0]{1,2}$/.test(gap) : /^[ \t\u00A0]*,?[ \t\u00A0]*$/.test(gap) && gap.length <= 3;
      if (ok) {
        last.end = c.end;
        if (c.priority > last.priority) {
          last.rule = c.rule;
          last.priority = c.priority;
        }
        continue;
      }
    }
    merged.push({ ...c });
  }
  return merged.map((c) => ({ kind: c.kind, start: c.start, end: c.end, text: text.slice(c.start, c.end), rule: c.rule }));
}

/** Findet personenbezogene Daten in `text`. Liefert nicht überlappende Treffer, nach Position sortiert. */
export function detectPii(text: string, opts: DetectOptions = {}): PiiMatch[] {
  const cands: Candidate[] = [];
  ruleEmail(text, cands);
  ruleIban(text, cands);
  ruleIbanLabel(text, cands);
  ruleLabeledNumbers(text, cands);
  ruleBirthdate(text, cands);
  ruleKnownNames(text, opts.knownNames, cands);
  ruleNames(text, cands);
  ruleAddress(text, cands);
  rulePhoneGeneric(text, cands);
  ruleSvPattern(text, cands);
  ruleGenericNumbers(text, cands);
  return resolve(text, cands);
}

function applyPlaceholders(text: string, matches: readonly PiiMatch[]): string {
  let out = "";
  let pos = 0;
  for (const m of matches) {
    out += text.slice(pos, m.start) + PLACEHOLDERS[m.kind];
    pos = m.end;
  }
  return out + text.slice(pos);
}

/**
 * Ersetzt alle Treffer durch Platzhalter. Prüft das Ergebnis erneut (bis zu
 * drei Durchläufe), damit durch das Ersetzen keine neuen Muster übrig bleiben.
 * `matches` bezieht sich auf den Originaltext (erster Durchlauf).
 */
export function maskText(text: string, opts: DetectOptions = {}): { text: string; matches: PiiMatch[] } {
  const matches = detectPii(text, opts);
  let masked = applyPlaceholders(text, matches);
  for (let i = 0; i < 3; i++) {
    const again = detectPii(masked, opts);
    if (again.length === 0) break;
    masked = applyPlaceholders(masked, again);
  }
  return { text: masked, matches };
}
