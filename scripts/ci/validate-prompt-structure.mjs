#!/usr/bin/env node
/**
 * scripts/ci/validate-prompt-structure.mjs — testy strukturalne promptów (TASK-GSTACK-ADOPT-001, A3).
 *
 * PO CO: prompt jest kodem czytanym przez model, ale nikt go nie kompiluje. Wycięty krok komendy,
 * zmieniona nazwa pola, które czyta skrypt, albo historyjka o incydencie, która po cichu rośnie
 * w pliku ładowanym do każdej sesji, wychodzą dopiero w realnym przebiegu. Ten skrypt łapie to
 * przed commitem, deterministycznie, bez wywołań modelu (dziesiątki ms).
 *
 * ZASADA (docs/test-value-bar.md w gstack): NIE pinujemy zwykłych zdań prozy. Zdanie można
 * przeformułować i prompt dalej działa, więc test na nie to fałszywy alarm, który uczy ludzi
 * odpuszczać cały test. Pinujemy wyłącznie to, co czyta MASZYNA albo od czego zależy kontrakt:
 * nagłówki i numerowane kroki, nazwy markerów/pól/enumów/komend/plików. Regułę bezpieczeństwa,
 * która jest prozą, sprawdza tryb `mentions` (WSPÓŁWYSTĘPOWANIE słów kluczowych w jednej jednostce
 * tekstu, bez rozróżniania wielkości liter, na granicach słów): parafraza go nie psuje, usunięcie
 * reguły tak. Jednostka = zdanie / pozycja listy / wiersz tabeli / krok diagramu w bloku kodu
 * (blok zaczyna się na pustej linii, wierszu tabeli, pozycji listy, nagłówku i ogrodzeniu) i ma
 * limit 600 znaków: długi „akapit" (cały diagram albo tabela rejestru) spełniłby każdą regułę
 * przypadkiem, więc taka jednostka nie liczy się, a reguła spełniona tylko w niej to błąd konfiguracji.
 * Walidator danych odrzuca „token", który wygląda na zdanie (>= 4 słowa albo kończy się kropką).
 *
 * TRZY CZĘŚCI (bez flag: wszystkie trzy; `--only <część>` jedną):
 *   required-steps  — required-steps.json: dla wskazanych plików uporządkowana lista kroków
 *                     (nagłówek / linia pasująca do regexu / literał), które MUSZĄ istnieć
 *                     i występować w tej kolejności; `present` = wymagane, bez kolejności.
 *   pins            — pins.json: `pins` = tokeny czytane maszynowo, które muszą występować
 *                     w pliku (literalnie, z wielkością liter; `context: "code"` + `min_count`
 *                     wymaga ich w kodzie: span `…`, blok kodu, wiersz tabeli; `patterns` = regexy
 *                     na liniach, np. definicja pola w schemacie); `mentions` = reguła jako
 *                     współwystępowanie słów kluczowych (patrz wyżej).
 *   archaeology     — „archeologia" w treści czytanej przez model: numery issue/PR (`#1234`,
 *                     `PR #12`), narracja o incydentach („incydent", „post-mortem", „incident"),
 *                     daty ISO poza sekcjami `## Changelog`/`## Historia`. Uzasadnienia
 *                     i historia mają mieszkać w docs/decisions/, nie w promptach (każdy bajt
 *                     prompta jest płacony w kontekście przy każdym użyciu).
 *                     Skan: agents/**, commands/*, skills/** (bez drzew vendorowanych: skills/marketing,
 *                     skills/finance, skills/legal i każdy katalog z UPSTREAM_VERSION), karty reguł
 *                     patterns/**\/*_summary.md, templates/fragments/. Pomijane: bloki kodu, kod inline,
 *                     URL-e, README.md. Identyfikatory reguł (ORC-nnn, ANL-nnn, TASK-…) NIE są
 *                     trafieniem: to legalne odnośniki do docs/decisions/orchestrate-rule-history.md.
 *
 * RATCHET (jak scripts/context-bill.mjs): istniejące trafienia NIE są ukryte allowlistą, tylko
 * policzone per plik w archaeology-baseline.json. Nowy plik z trafieniem = błąd; wzrost = błąd;
 * spadek = błąd „obniż baseline"; wpis, który niczego już nie łapie = błąd. Dlatego baseline
 * może tylko maleć: sprzątanie prompta wymusza przechwycenie niższego stanu w tym samym commicie,
 * a `--capture` ODMAWIA zapisu, gdy którykolwiek plik rośnie albo pojawia się nowy plik z trafieniami
 * (wzrost tylko z jawnym `--allow-growth` — i wtedy wymaga uzasadnienia w review).
 * Wyjątki konkretne (np. legalny odnośnik do numeru issue w ADR) idą do archaeology-allowlist.json
 * z polami `file`, `match` (fragment LINII), `reason` (>= 10 znaków). Wpis bez powodu albo
 * niedopasowany do niczego = błąd.
 *
 * Użycie:
 *   node scripts/ci/validate-prompt-structure.mjs                      — wszystkie trzy części (exit 1 przy błędzie)
 *   node scripts/ci/validate-prompt-structure.mjs --only pins          — jedna część
 *   node scripts/ci/validate-prompt-structure.mjs --capture            — przechwyć baseline archeologii (tylko spadki/usunięcia)
 *   node scripts/ci/validate-prompt-structure.mjs --capture --allow-growth — j.w., ale przyjmij też WZROST (wymaga uzasadnienia w review)
 *   node scripts/ci/validate-prompt-structure.mjs --list               — wypisz wszystkie trafienia archeologii (plik:linia)
 *   (opcjonalnie: --root <katalog repo>, --data-dir <katalog z JSON-ami> — dla evali na fixture'ach)
 * Kody wyjścia: 0 OK, 1 naruszenia, 2 błędne argumenty.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_REL = join('tests', 'flow-evals', 'prompt-structure');
const PARTS = ['required-steps', 'pins', 'archaeology'];
const CAPTURE_HINT = 'node scripts/ci/validate-prompt-structure.mjs --capture  (i zacommituj archaeology-baseline.json w tym samym commicie co zmiana)';
const VENDORED_SKILL_DIRS = ['skills/marketing', 'skills/finance', 'skills/legal'];

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const posix = (p) => p.split(sep).join('/');

// ── argumenty ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { only: null, capture: false, allowGrowth: false, list: false, root: REPO, dataDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--capture') opts.capture = true;
    else if (a === '--list') opts.list = true;
    else if (a === '--allow-growth') opts.allowGrowth = true;
    else if (a === '--only' || a === '--root' || a === '--data-dir') {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} wymaga wartości`);
      if (a === '--only') {
        if (!PARTS.includes(v)) throw new Error(`--only przyjmuje: ${PARTS.join(' | ')} (podano „${v}")`);
        opts.only = v;
      } else if (a === '--root') opts.root = v;
      else opts.dataDir = v;
    } else throw new Error(`nieznany argument: ${a}`);
  }
  if (opts.capture && opts.only && opts.only !== 'archaeology') throw new Error('--capture dotyczy tylko części archaeology');
  if (opts.allowGrowth && !opts.capture) throw new Error('--allow-growth ma sens tylko razem z --capture');
  if (opts.list && opts.only && opts.only !== 'archaeology') throw new Error('--list dotyczy tylko części archaeology');
  if (!opts.dataDir) opts.dataDir = join(opts.root, DATA_REL);
  return opts;
}

// ── wspólne: pliki i JSON ────────────────────────────────────────────────────

function readJson(file, label, hint) {
  if (!existsSync(file)) throw new Error(`brak pliku danych ${label}: ${file}${hint ? `\n  Napraw: ${hint}` : ''}`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${label} nie jest poprawnym JSON (${file}): ${e.message}`);
  }
}

function readRepoFile(root, rel) {
  const full = join(root, rel);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

// Ogrodzenia bloków kodu — TA SAMA reguła co w scripts/sync-fragments.mjs (FENCE_RE + zamknięcie): otwiera ``` albo ~~~
// (>= 3 znaki), zamyka je wyłącznie ogrodzenie TEGO SAMEGO znaku, co najmniej tak długie i bez info-stringu.
// Dzięki temu blok otwarty czterema backtickami może zawierać trzy (commands/pm2.md) i nie kończy się przedwcześnie.
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

/** Linie z offsetami, flagą „wewnątrz bloku kodu” (linie ogrodzenia też są „w kodzie”) i `fenceLine` (to samo ogrodzenie). */
function splitLines(text) {
  const out = [];
  let offset = 0;
  let fence = null;
  const parts = text.split('\n');
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const fm = line.match(FENCE_RE);
    let inCode = fence !== null;
    let fenceLine = false;
    if (fm) {
      if (fence === null) { fence = fm[1]; inCode = true; fenceLine = true; }
      else if (fm[1][0] === fence[0] && fm[1].length >= fence.length && line.trim() === fm[1]) { fence = null; inCode = true; fenceLine = true; }
    }
    out.push({ n: i + 1, line, offset, inCode, fenceLine });
    offset += raw.length + 1;
  }
  return out;
}

const isWordChar = (c) => c !== '' && /[\p{L}\p{N}_]/u.test(c);

// ── (a) required-steps ───────────────────────────────────────────────────────

function validateStepShape(step, where) {
  const kinds = ['heading', 'line', 'text'].filter((k) => typeof step?.[k] === 'string' && step[k].length > 0);
  if (!step || typeof step.id !== 'string' || !step.id) return `${where}: krok bez pola \`id\``;
  if (kinds.length !== 1) return `${where} („${step.id}"): krok musi mieć dokładnie jedno z pól heading | line | text`;
  if (kinds[0] === 'line') {
    try { new RegExp(step.line); } catch (e) { return `${where} („${step.id}"): zły regex w \`line\`: ${e.message}`; }
  }
  return null;
}

/** Pierwsze wystąpienie kroku na pozycji >= from; zwraca { start, end } albo null. */
function findStep(step, text, lines, from) {
  if (step.text !== undefined) {
    const i = text.indexOf(step.text, from);
    return i < 0 ? null : { start: i, end: i + step.text.length };
  }
  const re = step.line !== undefined ? new RegExp(step.line) : null;
  for (const l of lines) {
    if (l.offset + l.line.length < from) continue;
    if (step.heading !== undefined) {
      if (l.inCode) continue;
      // nagłówek wcięty o >= 4 spacje albo tabulator to blok kodu w Markdownie, nie nagłówek
      const hm = l.line.match(/^( {0,3})(\S.*)$/);
      if (!hm || !hm[2].startsWith(step.heading)) continue;
      // „## Raport” nie pasuje do „## Raportowanie”: po nazwie koniec linii albo znak niebędący literą/cyfrą
      if (isWordChar(hm[2].charAt(step.heading.length))) continue;
      const start = l.offset + hm[1].length;
      if (start < from) continue;
      return { start, end: start + step.heading.length };
    }
    const m = re.exec(l.line);
    if (m && l.offset + m.index >= from) return { start: l.offset + m.index, end: l.offset + m.index + m[0].length };
  }
  return null;
}

const describeStep = (s) => (s.heading !== undefined ? `nagłówek „${s.heading}"` : s.line !== undefined ? `linia /${s.line}/` : `tekst „${s.text}"`);

function checkRequiredSteps(opts) {
  const errors = [];
  const file = join(opts.dataDir, 'required-steps.json');
  let data;
  try {
    data = readJson(file, 'required-steps.json');
  } catch (e) {
    return [`REQUIRED-STEPS: ${e.message}`];
  }
  if (data?.schema !== 1 || !Array.isArray(data.files)) {
    return ['REQUIRED-STEPS: required-steps.json ma zły kształt (wymagane: schema=1 i tablica `files`)'];
  }
  for (const entry of data.files) {
    const rel = entry?.file;
    if (typeof rel !== 'string' || !rel) { errors.push('REQUIRED-STEPS: wpis bez pola `file`'); continue; }
    const text = readRepoFile(opts.root, rel);
    if (text === null) {
      errors.push(`REQUIRED-STEPS: ${rel}: plik z listy nie istnieje.\n    Napraw: usuń wpis z required-steps.json (plik świadomie usunięty/przeniesiony) albo przywróć plik.`);
      continue;
    }
    const lines = splitLines(text);
    const ordered = entry.steps ?? [];
    const present = entry.present ?? [];
    let shapeBad = false;
    [...ordered, ...present].forEach((s, i) => {
      const bad = validateStepShape(s, `REQUIRED-STEPS: ${rel} krok #${i + 1}`);
      if (bad) { errors.push(bad); shapeBad = true; }
    });
    if (shapeBad) continue;

    for (const s of present) {
      if (!findStep(s, text, lines, 0)) {
        errors.push(`REQUIRED-STEPS: ${rel}: brak wymaganego elementu „${s.id}" — ${describeStep(s)}.\n    Napraw: przywróć go w pliku; jeśli usunięcie jest zamierzone, usuń wpis z required-steps.json w tym samym commicie.`);
      }
    }
    let cursor = 0;
    let prev = null;
    for (const s of ordered) {
      const anywhere = findStep(s, text, lines, 0);
      if (!anywhere) {
        errors.push(`REQUIRED-STEPS: ${rel}: brak kroku „${s.id}" — ${describeStep(s)}.\n    Napraw: przywróć krok w pliku; jeśli usunięcie jest zamierzone, usuń wpis z required-steps.json w tym samym commicie.`);
        continue;
      }
      const hit = findStep(s, text, lines, cursor);
      if (!hit) {
        errors.push(`REQUIRED-STEPS: ${rel}: zła kolejność — krok „${s.id}" stoi PRZED krokiem „${prev?.id ?? '(początek)'}", a ma być po nim (${describeStep(s)}).\n    Napraw: przywróć kolejność w pliku; jeśli zmiana jest zamierzona, zmień kolejność w required-steps.json w tym samym commicie.`);
        continue;
      }
      cursor = hit.end;
      prev = s;
    }
  }
  return errors;
}

// ── (b) pins ─────────────────────────────────────────────────────────────────

// Marker HTML (`<!-- … -->`) to token maszynowy mimo spacji w środku; reszta: >= 4 słowa albo zdanie zakończone kropką.
const looksLikeProse = (t) => !/^<!--.*-->$/.test(t.trim()) && (t.trim().split(/\s+/).length >= 4 || /[.!?]$/.test(t.trim()));
const norm = (s) => s.replace(/[*`]/g, '').replace(/\s+/g, ' ').toLowerCase();

// Górny limit długości jednostki w `mentions`. Jednostka dłuższa nie może spełnić reguły: reguła, która „znajduje” słowa
// w 5-tysięcznym diagramie albo w całej tabeli rejestru, jest zawsze zielona i niczego nie pilnuje.
const MAX_UNIT = 600;
const SENTENCE_SPLIT = /(?<=[\p{L}\p{N})\]"'”`][.!?;])\s+/u;

/**
 * Jednostki tekstu dla `mentions`. Blok zaczyna się na: pustej linii, wierszu tabeli (`|`), pozycji listy (`-`, `*`, `1.`),
 * nagłówku i ogrodzeniu bloku kodu — wiersz tabeli, pozycja listy i każdy krok diagramu w bloku kodu to więc OSOBNE jednostki,
 * a nie jeden „akapit”. scope=paragraph: blok; scope=sentence: blok pocięty dodatkowo na zdania (`.`, `!`, `?`, `;`).
 */
function unitsOf(text, scope) {
  const blocks = [];
  let cur = null;
  const flush = () => { if (cur !== null && cur.trim()) blocks.push(cur); cur = null; };
  for (const l of splitLines(text)) {
    if (l.fenceLine || !l.line.trim()) { flush(); continue; }
    if (/^\s{0,3}(?:\||#{1,6}\s)/.test(l.line)) { flush(); blocks.push(l.line); continue; }
    if (/^\s{0,3}(?:[-*+]|\d+[.)])\s/.test(l.line)) { flush(); cur = l.line; continue; }
    cur = cur === null ? l.line : `${cur} ${l.line}`;
  }
  flush();
  return blocks.flatMap((b) => (scope === 'sentence' ? b.split(SENTENCE_SPLIT) : [b])).map(norm).filter(Boolean);
}

/**
 * Słowo kluczowe → regex na granicach słów, świadomy Unicode (polskie diakrytyki): „never” nie pasuje do „whenever”,
 * „commit” do „uncommitted”. Końcowe `*` = przedrostek (odmiana: „ręczn*” łapie „ręcznie”, „ręczne”); granica z lewej zostaje.
 */
function keywordRegex(kw) {
  const prefix = kw.endsWith('*');
  const core = (prefix ? kw.slice(0, -1) : kw).toLowerCase();
  const esc = core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lead = isWordChar(core.charAt(0)) ? '(?<![\\p{L}\\p{N}_])' : '';
  const trail = !prefix && isWordChar(core.charAt(core.length - 1)) ? '(?![\\p{L}\\p{N}_])' : '';
  return new RegExp(`${lead}${esc}${trail}`, 'u');
}

/** Wystąpienia tokenu w kontekście „kod”: span `…` w linii, blok kodu albo wiersz tabeli — tak wygląda nazwa pola, nie proza. */
function countInCodeContext(text, token) {
  let n = 0;
  const count = (s) => s.split(token).length - 1;
  for (const l of splitLines(text)) {
    if (l.fenceLine) continue;
    if (l.inCode || /^\s{0,3}\|/.test(l.line)) { n += count(l.line); continue; }
    for (const span of l.line.match(/`[^`]*`/g) ?? []) n += count(span);
  }
  return n;
}

function checkPins(opts) {
  const errors = [];
  const file = join(opts.dataDir, 'pins.json');
  let data;
  try {
    data = readJson(file, 'pins.json');
  } catch (e) {
    return [`PINS: ${e.message}`];
  }
  if (data?.schema !== 1 || !Array.isArray(data.pins) || !Array.isArray(data.mentions ?? [])) {
    return ['PINS: pins.json ma zły kształt (wymagane: schema=1, tablica `pins`, opcjonalnie `mentions`)'];
  }
  const cache = new Map();
  const load = (rel) => {
    if (!cache.has(rel)) cache.set(rel, readRepoFile(opts.root, rel));
    return cache.get(rel);
  };
  const missingFile = (rel) => `PINS: ${rel}: plik z listy nie istnieje.\n    Napraw: usuń go z pins.json (plik świadomie usunięty/przeniesiony) albo przywróć plik.`;
  const FIX = 'przywróć token w pliku; jeśli kontrakt zmienia się świadomie, zaktualizuj pins.json w tym samym commicie co czytnik tokenu.';

  data.pins.forEach((pin, i) => {
    const where = `PINS: pins[${i}]`;
    const tokens = pin?.tokens ?? [];
    const patterns = pin?.patterns ?? [];
    const context = pin?.context ?? 'any';
    const minCount = pin?.min_count ?? 1;
    if (!Array.isArray(pin?.files) || !pin.files.length || !Array.isArray(tokens) || !Array.isArray(patterns) || !(tokens.length + patterns.length)
      || typeof pin.why !== 'string' || pin.why.trim().length < 10 || !['any', 'code'].includes(context) || !Number.isInteger(minCount) || minCount < 1) {
      errors.push(`${where}: wymagane niepuste \`files\`, \`tokens\` i/lub \`patterns\`, \`why\` (>= 10 znaków: który skrypt/hook czyta te tokeny); opcjonalnie \`context\` (any | code) i \`min_count\` (liczba całkowita >= 1).`);
      return;
    }
    const prose = tokens.filter((t) => typeof t !== 'string' || !t || looksLikeProse(t));
    if (prose.length) {
      errors.push(`${where}: token wygląda na zdanie prozy: ${prose.map((t) => `„${t}"`).join(', ')}.\n    Napraw: piny są tylko na tokeny czytane maszynowo (marker, pole, enum, komenda, ścieżka); regułę wyrażoną prozą zapisz w \`mentions\`.`);
      return;
    }
    const regexes = [];
    for (const p of patterns) {
      try { regexes.push([p, new RegExp(p)]); } catch (e) { errors.push(`${where}: zły regex w \`patterns\`: ${p} (${e.message})`); }
    }
    for (const rel of pin.files) {
      const text = load(rel);
      if (text === null) { errors.push(missingFile(rel)); continue; }
      for (const tok of tokens) {
        const n = context === 'code' ? countInCodeContext(text, tok) : text.split(tok).length - 1;
        if (n < minCount) {
          const where2 = context === 'code' ? ' w kontekście kodu (span `…`, blok kodu, wiersz tabeli)' : '';
          const what = n === 0 ? `brakuje tokenu „${tok}"${where2}` : `token „${tok}"${where2} występuje ${n}×, a wymagane jest ${minCount}×`;
          errors.push(`PINS: ${rel}: ${what} (${pin.why.trim()}).\n    Napraw: ${FIX}`);
        }
      }
      const lines = splitLines(text);
      for (const [src, re] of regexes) {
        if (!lines.some((l) => re.test(l.line))) {
          errors.push(`PINS: ${rel}: brak linii pasującej do /${src}/ (${pin.why.trim()}).\n    Napraw: ${FIX}`);
        }
      }
    }
  });

  (data.mentions ?? []).forEach((m, i) => {
    const where = `PINS: mentions[${i}]${m?.id ? ` („${m.id}")` : ''}`;
    const groups = m?.all;
    const okGroups = Array.isArray(groups) && groups.length >= 2 && groups.every((g) => (typeof g === 'string' && g) || (Array.isArray(g) && g.length && g.every((x) => typeof x === 'string' && x)));
    if (typeof m?.id !== 'string' || typeof m?.file !== 'string' || !okGroups || !['sentence', 'paragraph'].includes(m.scope ?? 'paragraph') || typeof m.why !== 'string' || m.why.trim().length < 10) {
      errors.push(`${where}: wymagane \`id\`, \`file\`, \`all\` (>= 2 słowa kluczowe; element może być tablicą synonimów), \`scope\` (sentence | paragraph) i \`why\` (>= 10 znaków).`);
      return;
    }
    const text = load(m.file);
    if (text === null) { errors.push(missingFile(m.file)); return; }
    const wanted = groups.map((g) => (Array.isArray(g) ? g : [g]).map(keywordRegex));
    const label = groups.map((g) => (Array.isArray(g) && g.length > 1 ? `(${g.join(' | ')})` : [].concat(g)[0])).join(' + ');
    const units = unitsOf(text, m.scope ?? 'paragraph');
    const satisfies = (u) => wanted.every((alts) => alts.some((re) => re.test(u)));
    if (units.some((u) => u.length <= MAX_UNIT && satisfies(u))) return;
    const tooLong = units.find((u) => u.length > MAX_UNIT && satisfies(u));
    if (tooLong) {
      errors.push(`${where}: błąd konfiguracji — słowa kluczowe (${label}) występują razem tylko w jednostce o długości ${tooLong.length} znaków (limit ${MAX_UNIT}); taka reguła byłaby bezzębna.\n    Napraw: zawęź \`all\` do słów z jednego zdania (scope=sentence) albo rozbij tekst w pliku na krótsze zdania/wiersze.`);
      return;
    }
    const scopeLabel = (m.scope ?? 'paragraph') === 'sentence' ? 'w jednym zdaniu/pozycji listy/wierszu tabeli' : 'w jednym bloku (akapit, pozycja listy, wiersz tabeli, krok diagramu)';
    errors.push(`PINS: ${m.file}: reguła „${m.id}" zniknęła — nie ma miejsca ${scopeLabel} (<= ${MAX_UNIT} znaków), które zawiera razem: ${label} (${m.why.trim()}).\n    Napraw: przywróć regułę (parafraza jest OK, o ile zachowuje te słowa w jednym miejscu); jeśli usunięcie jest zamierzone, usuń wpis z pins.json.`);
  });
  return errors;
}

// ── (c) archaeology ──────────────────────────────────────────────────────────

const ISO_DATE = /(?<![\d-])20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?![\d-])/g;
// Detektory dobrane na NARRACJĘ o zdarzeniu, nie na słowo-klucz: „incident response", „production incident"
// (opis domeny) ani odnośniki `/incident` nie są archeologią. Identyfikatory ORC-/ANL-/TASK- nie pasują do żadnego.
//
// `#NNN` a kolory CSS (#333, #000, #123): numer 3-4-cyfrowy bywa kolorem. Wybrane rozwiązanie: trafienie jest ODRZUCANE jako kolor,
// gdy (a) tuż za nim stoi `;` albo `}` (koniec deklaracji CSS), (b) tuż przed nim `=` albo cudzysłów (atrybut: fill="#123"),
// albo (c) linia zawiera słownictwo kolorów (color/kolor/background/fill/stroke/border/rgb/hsl/hex/css). Wyjątek: tuż przed numerem
// stoi słowo zgłoszenia (issue, PR, fixes, closes, bug, ticket) — wtedy to ZAWSZE numer issue. Dlaczego nie sama lista słów w linii:
// zdanie „zobacz issue #123 o kolorze" musi pozostać trafieniem. Numer 5-cyfrowy nie jest poprawnym kolorem szesnastkowym (3/4/6/8 cyfr),
// więc nigdy nie jest odrzucany. Cena: odnośnik bez słowa zgłoszenia w linii o kolorach przejdzie — to wąski i świadomy fałszywy negatyw.
const COLOR_WORDS = /(?<![\p{L}\p{N}_])(?:colou?rs?|kolor\p{L}*|background|bg|fill|stroke|border|rgba?|hsla?|hex|css)(?![\p{L}\p{N}_])/iu;
const ISSUE_WORD_BEFORE = /(?:issues?|PR|pull request|fix(?:es|ed)?|closes?|resolves?|bug|ticket|zgłoszeni\p{L}*)\s*$/iu;
function looksLikeColor(masked, start, text) {
  if (text.length - 1 >= 5) return false;
  const before = masked.slice(0, start);
  if (ISSUE_WORD_BEFORE.test(before)) return false;
  return /^\s*[;}]/.test(masked.slice(start + text.length)) || /["']\s*$|=\s*$/.test(before) || COLOR_WORDS.test(masked);
}
const NOT_SLUG = String.raw`(?<![\p{L}/@\-])`;
const DETECTORS = [
  // 3-5 cyfr: dłuższe ciągi to kolory hex (#001529), nie numery issue; 3-4 cyfry mogą być kolorem (patrz wyżej)
  { kind: 'numer #NNN', re: /(?<![\w/.\-#])#\d{3,5}\b(?!\d)/g, skip: looksLikeColor },
  { kind: 'PR #N', re: /\bPR\s*#\d+/gi },
  { kind: 'issue #N', re: /\bissues?\s*#\d+/gi },
  { kind: 'incydent', re: new RegExp(`${NOT_SLUG}incyden\\p{L}*`, 'giu') },
  // „(Incident, …", „incident: …" — etykieta anegdoty; „incident above/from"; „confirmed/documented incident", „caused real incidents";
  // „real delegation-loop incident"; „5 incidents documented"; „ai-os-bot-9 incident"
  { kind: 'incident (narracja)', re: new RegExp(`(?<=\\()incident(?=\\s*[:,])|${NOT_SLUG}incident(?=:)|${NOT_SLUG}incidents?\\s+(?:above|from|of)\\b|(?<=\\b(?:confirmed|documented|caused\\s+real)\\s+)incidents?\\b|(?<=\\breal\\s+[\\w]+-[\\w-]+\\s+)incidents?\\b|(?<=\\d\\s+)incidents\\b|(?<=[A-Za-z]-\\d+\\s+)incident\\b`, 'giu') },
  { kind: 'post-mortem z …', re: /(?<![\p{L}/@])post[- ]?mortem\s+(?:z|from|of|po)\b/giu },
  { kind: 'regresja z datą', re: /regresj\p{L}*\s+z\s+(?:\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{2}\.\d{4})/giu },
  { kind: 'data ISO', re: ISO_DATE, historyExempt: true },
];
const HISTORY_HEADING = /^(#{1,6})\s+(?:changelog|change log|historia(?: zmian)?|history)\b/i;

/** Zastępuje spacjami to, co nie jest narracją: kod inline, URL-e, cele linków markdown (zachowuje długość/offsety). */
function maskNonProse(line) {
  const blank = (m) => ' '.repeat(m.length);
  return line
    .replace(/`[^`]*`/g, blank)
    .replace(/\]\([^)]*\)/g, blank)
    .replace(/https?:\/\/[^\s)>\]]+/g, blank);
}

function scanText(text) {
  const hits = [];
  let historyLevel = null; // poziom nagłówka sekcji Changelog/Historia, w której jesteśmy
  for (const l of splitLines(text)) {
    if (l.inCode) continue;
    const h = l.line.match(/^(#{1,6})\s+\S/);
    if (h) {
      const level = h[1].length;
      if (historyLevel !== null && level <= historyLevel) historyLevel = null;
      const hh = l.line.match(HISTORY_HEADING);
      if (hh) historyLevel = hh[1].length;
    }
    const masked = maskNonProse(l.line);
    const spans = [];
    for (const d of DETECTORS) {
      if (d.historyExempt && historyLevel !== null) continue;
      for (const m of masked.matchAll(d.re)) if (!d.skip?.(masked, m.index, m[0])) spans.push({ s: m.index, e: m.index + m[0].length, kind: d.kind, text: m[0] });
    }
    spans.sort((a, b) => a.s - b.s || b.e - a.e);
    let lastEnd = -1;
    for (const sp of spans) {
      if (sp.s < lastEnd) continue; // zachodzące na siebie (np. „PR #142" i „#142") liczymy raz
      lastEnd = sp.e;
      hits.push({ line: l.n, kind: sp.kind, text: sp.text, lineText: l.line });
    }
  }
  return hits;
}

function walk(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => cmp(a.name, b.name));
  if (entries.some((e) => e.isFile() && e.name === 'UPSTREAM_VERSION')) return acc; // drzewo vendorowane
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, pred, acc);
    else if (e.isFile() && pred(e.name)) acc.push(full);
  }
  return acc;
}

function archaeologyFiles(root) {
  const md = (n) => n.endsWith('.md') && n !== 'README.md';
  const vendored = (f) => VENDORED_SKILL_DIRS.some((v) => posix(relative(root, f)).startsWith(`${v}/`));
  const commandsDir = join(root, 'commands');
  const commands = existsSync(commandsDir)
    ? readdirSync(commandsDir, { withFileTypes: true }).filter((e) => e.isFile() && md(e.name)).map((e) => join(commandsDir, e.name))
    : [];
  const all = [
    ...walk(join(root, 'agents'), md),
    ...commands,
    ...walk(join(root, 'skills'), md).filter((f) => !vendored(f)),
    ...walk(join(root, 'patterns'), (n) => n.endsWith('_summary.md')),
    ...walk(join(root, 'templates', 'fragments'), md),
  ];
  return [...new Set(all.map((f) => posix(relative(root, f))))].sort(cmp);
}

function loadAllowlist(opts) {
  const file = join(opts.dataDir, 'archaeology-allowlist.json');
  if (!existsSync(file)) return { entries: [], errors: [] };
  const errors = [];
  let data;
  try {
    data = readJson(file, 'archaeology-allowlist.json');
  } catch (e) {
    return { entries: [], errors: [`ARCHAEOLOGY: ${e.message}`] };
  }
  if (data?.schema !== 1 || !Array.isArray(data.entries)) {
    return { entries: [], errors: ['ARCHAEOLOGY: archaeology-allowlist.json ma zły kształt (wymagane: schema=1 i tablica `entries` z polami file, match, reason)'] };
  }
  data.entries.forEach((e, i) => {
    const where = `ARCHAEOLOGY: allowlista wpis #${i + 1}${e?.file ? ` (${e.file})` : ''}`;
    if (typeof e?.file !== 'string' || !e.file) errors.push(`${where}: brak pola \`file\`.`);
    else if (typeof e.match !== 'string' || e.match.length < 4) errors.push(`${where}: \`match\` (fragment linii z trafieniem) musi mieć >= 4 znaki — krótszy łapałby zbyt wiele.`);
    else if (typeof e.reason !== 'string' || e.reason.trim().length < 10) errors.push(`${where}: brak powodu — \`reason\` musi mieć >= 10 znaków (dlaczego ten odnośnik jest legalny).\n    Napraw: dopisz powód albo usuń wpis i wyczyść prompt.`);
  });
  return { entries: errors.length ? [] : data.entries, errors };
}

function measureArchaeology(opts) {
  const files = archaeologyFiles(opts.root);
  const scanned = new Set(files);
  const allow = loadAllowlist(opts);
  const errors = [...allow.errors];
  const used = new Array(allow.entries.length).fill(0);
  const perFile = new Map();
  for (const rel of files) {
    const hits = scanText(readFileSync(join(opts.root, rel), 'utf8')).filter((h) => {
      const idx = allow.entries.findIndex((e) => e.file === rel && h.lineText.includes(e.match));
      if (idx >= 0) { used[idx]++; return false; }
      return true;
    });
    if (hits.length) perFile.set(rel, hits);
  }
  allow.entries.forEach((e, i) => {
    if (!scanned.has(e.file)) {
      errors.push(`ARCHAEOLOGY: allowlista: wpis dla pliku spoza skanu: ${e.file} (nie istnieje albo należy do drzewa vendorowanego).\n    Napraw: usuń wpis z archaeology-allowlist.json.`);
    } else if (used[i] === 0) {
      errors.push(`ARCHAEOLOGY: allowlista: martwy wpis — ${e.file} / „${e.match}" niczego już nie łapie.\n    Napraw: usuń wpis z archaeology-allowlist.json (treść została już oczyszczona albo zmieniona).`);
    }
  });
  return { files, perFile, errors };
}

const serializeBaseline = (counts) => {
  const entries = [...counts.entries()].sort((a, b) => cmp(a[0], b[0]));
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return [
    '{',
    `  "_comment": ${JSON.stringify('Baseline archeologii w promptach: liczba trafień PER PLIK (numery issue/PR, narracja o incydentach, daty ISO poza Changelog/Historia). Może tylko maleć: sprzątanie prompta wymaga przechwycenia niższego stanu w tym samym commicie. Generowane: node scripts/ci/validate-prompt-structure.mjs --capture. Nie edytuj ręcznie.')},`,
    '  "schema": 1,',
    `  "total": ${total},`,
    '  "files": {',
    entries.map(([p, n]) => `    ${JSON.stringify(p)}: ${n}`).join(',\n'),
    '  }',
    '}',
    '',
  ].join('\n');
};

function loadBaseline(opts) {
  const file = join(opts.dataDir, 'archaeology-baseline.json');
  const data = readJson(file, 'archaeology-baseline.json', CAPTURE_HINT);
  if (data?.schema !== 1 || typeof data.files !== 'object' || data.files === null || Array.isArray(data.files)
    || !Object.values(data.files).every((n) => Number.isInteger(n) && n >= 0)) {
    throw new Error(`archaeology-baseline.json ma zły kształt (wymagane: schema=1 i files: { plik: liczba całkowita })\n  Napraw: ${CAPTURE_HINT}`);
  }
  return data;
}

function checkArchaeology(opts) {
  const m = measureArchaeology(opts);
  const errors = [...m.errors];
  let baseline;
  try {
    baseline = loadBaseline(opts);
  } catch (e) {
    return [...errors, `ARCHAEOLOGY: ${e.message}`];
  }
  const sample = (hits) => hits.slice(0, 3).map((h) => `\n      linia ${h.line}: [${h.kind}] ${h.text}`).join('') + (hits.length > 3 ? `\n      … i ${hits.length - 3} więcej (pełna lista: --list)` : '');
  for (const [rel, hits] of m.perFile) {
    const base = baseline.files[rel];
    if (base === undefined) {
      errors.push(`ARCHAEOLOGY: NOWY plik z trafieniami: ${rel} — ${hits.length} (baseline: 0).${sample(hits)}\n    Napraw: usuń z prompta numery issue/PR, daty i historyjki o incydentach (uzasadnienie → docs/decisions/orchestrate-rule-history.md); odnośnik, który musi zostać, idzie do archaeology-allowlist.json z powodem. („--capture” takiego wzrostu nie przyjmie bez --allow-growth.)`);
    } else if (hits.length > base) {
      errors.push(`ARCHAEOLOGY: WZROST trafień: ${rel} — ${hits.length} > ${base} w baseline.${sample(hits)}\n    Napraw: usuń nowe trafienie z prompta; „--capture” odmówi wzrostu, a --allow-growth wymaga uzasadnienia w review.`);
    } else if (hits.length < base) {
      errors.push(`ARCHAEOLOGY: SPADEK trafień: ${rel} — ${hits.length} < ${base} w baseline (posprzątano — dobra zmiana).\n    Napraw: obniż baseline: ${CAPTURE_HINT}`);
    }
  }
  const scanned = new Set(m.files);
  for (const rel of Object.keys(baseline.files).sort(cmp)) {
    if (m.perFile.has(rel)) continue;
    errors.push(`ARCHAEOLOGY: martwy wpis baseline: ${rel} (${baseline.files[rel]}) — ${scanned.has(rel) ? 'plik nie ma już trafień' : 'pliku nie ma w skanie (usunięty, przeniesiony albo vendorowany)'}.\n    Napraw: obniż baseline: ${CAPTURE_HINT}`);
  }
  return errors;
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`validate-prompt-structure: ${e.message}`);
    process.exit(2);
  }

  if (opts.list || opts.capture) {
    const m = measureArchaeology(opts);
    if (m.errors.length) {
      console.error('validate-prompt-structure: popraw allowlistę przed --list/--capture:');
      for (const e of m.errors) console.error(`  ${e}`);
      process.exit(1);
    }
    if (opts.list) {
      let total = 0;
      for (const [rel, hits] of m.perFile) {
        for (const h of hits) { total++; console.log(`${rel}:${h.line}: [${h.kind}] ${h.text}`); }
      }
      console.log(`\nrazem ${total} trafień w ${m.perFile.size} plikach (skan: ${m.files.length} plików)`);
      process.exit(0);
    }
    const counts = new Map([...m.perFile].map(([rel, hits]) => [rel, hits.length]));
    // Ratchet działa w jedną stronę: --capture przyjmuje spadki i usunięcia, ale NIE podnosi baseline po cichu.
    let previous = {};
    try { previous = loadBaseline(opts).files; } catch { previous = {}; }
    const grew = [...counts].filter(([rel, n]) => n > (previous[rel] ?? 0)).sort((a, b) => cmp(a[0], b[0]));
    if (grew.length && !opts.allowGrowth) {
      console.error(`validate-prompt-structure --capture: odmowa — archeologia ROŚNIE w ${grew.length} plikach, baseline nie został zmieniony:`);
      for (const [rel, n] of grew) console.error(`  ${rel}: ${previous[rel] ?? 0} → ${n}${previous[rel] === undefined ? ' (nowy plik z trafieniami albo brak baseline)' : ''}`);
      console.error('\nWzrost archeologii wymaga uzasadnienia w review.');
      console.error('Napraw: usuń nowe trafienia z promptów (uzasadnienia → docs/decisions/); odnośnik, który musi zostać, idzie do archaeology-allowlist.json z powodem.');
      console.error('Jeśli wzrost jest świadomy (np. pierwszy baseline): --capture --allow-growth i opisz powód w commicie.');
      process.exit(1);
    }
    const file = join(opts.dataDir, 'archaeology-baseline.json');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, serializeBaseline(counts));
    console.log(`validate-prompt-structure: zapisano baseline archeologii (${[...counts.values()].reduce((s, n) => s + n, 0)} trafień w ${counts.size} plikach, skan ${m.files.length} plików)`);
    console.log(`  ${posix(relative(opts.root, file))} — dodaj do TEGO SAMEGO commitu co zmiana.`);
    process.exit(0);
  }

  const run = opts.only ? [opts.only] : PARTS;
  const fns = { 'required-steps': checkRequiredSteps, pins: checkPins, archaeology: checkArchaeology };
  const errors = [];
  for (const part of run) errors.push(...fns[part](opts));
  if (errors.length) {
    console.error(`validate-prompt-structure: ${errors.length} naruszeń (${run.join(', ')}):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`validate-prompt-structure OK (${run.join(', ')})`);
}

main();
