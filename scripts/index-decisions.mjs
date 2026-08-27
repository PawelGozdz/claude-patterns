#!/usr/bin/env node
// Indeks rejestru decyzji (ADR + BDR) → .claude/config/decisions-index.json
//   node scripts/index-decisions.mjs <project_dir>
//
// Po co: katalog ADR rośnie do setek plików (juz-ide: 123), a README bywa
// kuratorowany i niekompletny — obserwacja z 2026-07-07, gdy indeks wymieniał
// ~20 z ~100 wpisów. Zamiast trzeciego ręcznego rejestru czytamy nagłówki
// samych plików przy każdym /analyze i zawężamy je polityką z runtime.yml.
//
// CZEGO TEN INDEKS NIE ROBI: nie orzeka, CO dokładnie zostało uchylone.
// Realny przypadek (TS-REP-PIPELINE-001, 2026-07-20): nagłówek ADR-0076 mówi
// „partially superseded by ADR-0106", z czego wyciągnięto błędny wniosek, że
// guardrail 15 km nie obowiązuje — a uchylony był wyłącznie fixed cap 5 km.
// Dlatego wpis z częściowym uchyleniem dostaje `needs_scope_check: true` i NIGDY
// nie jest odsiewany jako nieaktualny. Hierarchia weryfikacji parametru
// (docs/decisions → docs/product → BUSINESS_RULES.yaml → kod → nagłówek ADR)
// obowiązuje dalej; indeks tylko zawęża listę kandydatów.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

let YAML;
try { YAML = (await import('yaml')).default; }
catch { console.error('  BŁĄD: brak paczki "yaml" — odpal `npm ci` w claude-patterns.'); process.exit(1); }

const [projectDir] = process.argv.slice(2);
if (!projectDir) { console.error('użycie: index-decisions.mjs <project_dir>'); process.exit(1); }

const runtimePath = join(projectDir, '.claude/config/runtime.yml');
if (!existsSync(runtimePath)) {
  console.error('  BŁĄD: brak .claude/config/runtime.yml — najpierw setup-project.sh (materializacja bloków).');
  process.exit(1);
}
const runtime = YAML.parse(readFileSync(runtimePath, 'utf8')) ?? {};
const cfg = runtime.params?.['decision-registry'] ?? {};
if (!cfg.adr_dir && !cfg.bdr_dir) {
  console.error('  BŁĄD: runtime.yml nie ma params."decision-registry" — dodaj blok decision-registry do stack_blocks.');
  process.exit(1);
}

// Tagi wpisów walidujemy przeciw taksonomii scalonej w runtime.yml (rdzeń + projekt).
// Bez tego `tags:` w ADR byłyby pisaniem w próżnię: literówka albo wymyślony obszar
// przechodziłyby cicho, a filtr tematyczny po prostu by ich nie znajdował.
const TAX_STACKS = new Set(runtime.taxonomy?.stacks ?? []);
const TAX_AREAS = new Set(runtime.taxonomy?.areas ?? []);
const tagProblems = [];
function validateTags(entry) {
  if (!TAX_AREAS.size) return;
  for (const t of entry.tags) {
    const [stack, area, variant, ...rest] = String(t).split(':');
    if (!area || rest.length) tagProblems.push(`${entry.file}: "${t}" — format to <stack>:<area>[:<variant>]`);
    else if (!TAX_STACKS.has(stack)) tagProblems.push(`${entry.file}: "${t}" — unknown stack "${stack}"`);
    else if (!TAX_AREAS.has(area)) tagProblems.push(`${entry.file}: "${t}" — unknown area "${area}"; add it to .claude/config/taxonomy.yml and re-run setup`);
    else if (variant && !/^[a-z0-9-]+$/.test(variant)) tagProblems.push(`${entry.file}: "${t}" — variant must be kebab-case`);
  }
}

const ACTIVE = (cfg.status_active ?? ['accepted', 'active', 'proposed']).map((s) => String(s).toLowerCase());

const EXCLUDE = new Set((cfg.adr_exclude ?? []).map((n) => String(n).padStart(4, '0')));

// ── wyciąganie metadanych z nagłówka ──────────────────────────────────────
// Formaty spotkane w praktyce (juz-ide, 123 pliki):
//   `**Status**: accepted (2026-07-12) — częściowo nadpisany przez ...`
//   `## Status` + `**ACCEPTED** — 2026-05-03 — partially superseded by [ADR-0106](...)`
const STATUS_WORDS = ['accepted', 'active', 'proposed', 'draft', 'rejected', 'superseded', 'deprecated', 'obsolete'];
// Rejestr BDR jest pisany po polsku (to rejestr dla product ownera, nie dla kodu), a filtr
// aktywności operuje na angielskich statusach z runtime.yml. Bez mapowania wpis ze statusem
// `wdrożona` po prostu WYPADAŁ z indeksu — po cichu, bo nie był ani znany, ani `unknown`.
// Zgłoszone z api-2 (2026-08-12): ktoś idący literalnie za docs/decisions/template.md
// dostawał znikający wpis zamiast błędu.
const STATUS_SYNONYMS = new Map(Object.entries({
  zaproponowana: 'proposed', proponowana: 'proposed', szkic: 'draft',
  'podjęta': 'accepted', podjeta: 'accepted', 'przyjęta': 'accepted', przyjeta: 'accepted',
  'wdrażana': 'active', wdrazana: 'active', 'wdrożona': 'accepted', wdrozona: 'accepted',
  uchylona: 'superseded', odrzucona: 'rejected', wycofana: 'deprecated',
}));
const KNOWN_STATUSES = new Set([...STATUS_WORDS, ...STATUS_SYNONYMS.values()]);
const normalizeStatus = (raw) => {
  const v = String(raw).toLowerCase().trim();
  return STATUS_SYNONYMS.get(v) ?? v;
};

const PARTIAL_MARKERS = /partial|części|czesci|częśc|czesc/i;
const SUPERSEDE_MARKERS = /supersed|nadpisan|uchyl|zast[ąa]pion/i;

function frontmatter(src) {
  // Frontmatter YAML jest źródłem PIERWSZYM — dopisany do 122 z 123 ADR-ów juz-ide
  // (2026-08-11). Pola: status, superseded_by, supersedes, scope.
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  try { return YAML.parse(m[1]) ?? null; } catch { return null; }
}

function statusLine(src) {
  const inline = src.match(/^\s*\*\*Status\*\*\s*:\s*(.+)$/mi);
  if (inline) return inline[1].trim();
  const section = src.match(/^##+\s*Status\s*$([\s\S]{0,600}?)(?=^##|$(?![\s\S]))/mi);
  if (section) {
    const first = section[1].split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('>'));
    if (first) return first;
  }
  return null;
}

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])
  .flatMap((x) => String(x).split(/[,\s]+/))
  .map((x) => (x.match(/(\d{3,4})/) ?? [])[1])
  .filter(Boolean);

function parseDoc(file, src, kind) {
  // Numer z nazwy pliku: `0081-slug.md` (konwencja ADR) albo `BDR-001-slug.md`.
  const id = (basename(file).match(/^(?:ADR|BDR)?-?(\d{3,4})/i) ?? [])[1] ?? null;
  const title = (src.match(/^#\s+(.+)$/m) ?? [])[1]?.trim() ?? basename(file);
  const fm = frontmatter(src);

  if (fm?.status) {
    // `scope:` to opis ZAKRESU uchylenia albo zmiany — pole, którego nagłówek nigdy nie miał.
    // Przenosimy jego treść do indeksu, żeby agent dostał gotową odpowiedź („uchylony jest
    // wyłącznie fixed cap 5 km; guardrail 15 km obowiązuje") zamiast otwierać plik i zgadywać.
    const scope = fm.scope ? String(fm.scope).trim() : null;
    return {
      id, kind, file, title,
      status: normalizeStatus(fm.status),
      status_raw: String(fm.status).trim(),
      source: 'frontmatter',
      status_line: null,
      date: fm.date ? String(fm.date) : null,
      // `tags` zawężają rejestr do tematu taska, `summary` pozwala ocenić trafność
      // wpisu bez otwierania pliku — bez tych dwóch pól indeks umie tylko tytuł.
      tags: Array.isArray(fm.tags) ? fm.tags.map(String) : (fm.tags ? [String(fm.tags)] : []),
      summary: fm.summary ? String(fm.summary).trim() : null,
      scope,
      superseded_by: asList(fm.superseded_by),
      supersedes: asList(fm.supersedes),
      // Obecność `scope:` znaczy „częściowo" — także bez `superseded_by` (ADR-0106:
      // „partially amended by @founder decisions, no BDR entry recorded yet").
      needs_scope_check: Boolean(scope),
    };
  }

  // Fallback dla plików bez frontmattera (BDR, starsze ADR): odczyt z prozy.
  const line = statusLine(src);
  const status = line
    ? (STATUS_WORDS.find((w) => new RegExp(`\\b${w}`, 'i').test(line)) ?? 'unknown')
    : 'unknown';
  const refs = [...src.slice(0, 1500).matchAll(/\b(?:ADR|BDR)[- ](\d{3,4})/gi)].map((m) => m[1]).filter((n) => n !== id);
  const supersededMentioned = line ? SUPERSEDE_MARKERS.test(line) : false;
  return {
    id, kind, file, title,
    status,
    source: 'proza',
    date: null,
    tags: [],
    summary: null,
    status_line: line,
    scope: null,
    superseded_by: supersededMentioned ? [...new Set(refs)] : [],
    supersedes: [],
    needs_scope_check: supersededMentioned && (line ? PARTIAL_MARKERS.test(line) : false),
  };
}

function scanDir(dir, kind) {
  const abs = join(projectDir, dir);
  if (!existsSync(abs)) return [];
  // Plik otwartych pytań jest wskazywany osobno (`open_questions`) i czyta go stage
  // decision-gate — nie jest wpisem rejestru, więc nie ma tu statusu do oceny.
  const openQ = cfg.open_questions ? basename(cfg.open_questions) : null;
  return readdirSync(abs)
    .filter((f) => f.endsWith('.md') && !/^README|^template/i.test(f) && f !== openQ)
    .sort()
    .map((f) => parseDoc(join(dir, f), readFileSync(join(abs, f), 'utf8'), kind));
}

const all = [
  ...(cfg.adr_dir ? scanDir(cfg.adr_dir, 'adr') : []),
  ...(cfg.bdr_dir ? scanDir(cfg.bdr_dir, 'bdr') : []),
];

for (const d of all) validateTags(d);

// ── kontrola jakości rejestru ─────────────────────────────────────────────
const problems = { duplicate_ids: [], missing_status: [], unknown_status: [], scope_pending_registration: [] };
const byId = new Map();
for (const d of all) {
  if (!d.id) continue;
  const key = `${d.kind}:${d.id}`;
  const prev = byId.get(key);
  // Duplikaty numerów istnieją naprawdę (juz-ide: dwa 0015-, dwa 0018-). Bez tego
  // ostrzeżenia `adr_exclude: [0015]` wyrzucałby losowy z dwóch plików.
  if (prev) problems.duplicate_ids.push({ id: d.id, kind: d.kind, files: [prev.file, d.file] });
  else byId.set(key, d);
}
for (const d of all) if (d.status === 'unknown') problems.missing_status.push(d.file);
// Status, którego słownik nie zna (literówka albo nowy termin) — wpis ZOSTAJE w indeksie,
// ale wymaga uzgodnienia: albo poprawki we wpisie, albo dopisania synonimu wyżej.
for (const d of all)
  if (d.status !== 'unknown' && !KNOWN_STATUSES.has(d.status))
    problems.unknown_status.push(`${d.file}: "${d.status_raw ?? d.status}"`);
// `scope` bywa miejscem, w którym ktoś odnotował BRAK wpisu w rejestrze („no BDR entry
// recorded yet"). To sygnał do działania, nie ozdoba — wyciągamy go zamiast liczyć na to,
// że ktoś przeczyta wszystkie pola scope. (Z api-2: brief pomylił się co do tego, której
// decyzji dotyczy adnotacja w ADR-0106 — automat nie zgaduje, cytuje.)
for (const d of all)
  if (d.scope && /no (bdr|adr) entry|brak wpisu|not recorded|nie zarejestrowan/i.test(d.scope))
    problems.scope_pending_registration.push(`${d.file}: ${d.scope.slice(0, 140)}`);
// Wpis, który sam CYTUJE taką adnotację (bo ją domyka), też tu wpadnie — dlatego to
// sygnał do sprawdzenia, nie zarzut. Rozstrzygnięcie „czy luka nadal istnieje" wymaga
// spojrzenia na oba wpisy i należy do człowieka.

// ── filtr polityki ────────────────────────────────────────────────────────
const active = all.filter((d) => {
  if (d.id && EXCLUDE.has(d.id.padStart(4, '0'))) return false;
  if (d.needs_scope_check) return true;                  // częściowo uchylone (ma `scope:`) zostaje
  if (d.status === 'unknown') return true;               // brak statusu ≠ nieaktualny
  // Status spoza słownika traktujemy jak aktywny i raportujemy. Odfiltrowanie wpisu,
  // którego statusu nie rozumiemy, to cicha utrata decyzji — najgorszy możliwy wynik.
  if (!KNOWN_STATUSES.has(d.status)) return true;
  return ACTIVE.includes(d.status);
});

// Filtr tematyczny: `--tags api:geo,api:auth` zwraca wpisy trafiające w którykolwiek tag
// (dopasowanie po prefiksie, więc `api:geo` łapie też `api:geo:radius`).
const tagArg = (() => { const i = process.argv.indexOf('--tags'); return i > -1 ? process.argv[i + 1] : null; })();
const wanted = tagArg ? tagArg.split(',').map((t) => t.trim()).filter(Boolean) : [];
const matched = wanted.length
  ? active.filter((d) => d.tags.some((t) => wanted.some((w) => t === w || t.startsWith(`${w}:`) || w.startsWith(`${t}:`))))
  : active;

const index = {
  generated_at: new Date().toISOString(),
  source: { adr_dir: cfg.adr_dir ?? null, bdr_dir: cfg.bdr_dir ?? null, open_questions: cfg.open_questions ?? null },
  policy: { status_active: ACTIVE, adr_exclude: [...EXCLUDE] },
  counts: {
    total: all.length,
    active: active.length,
    from_frontmatter: all.filter((d) => d.source === 'frontmatter').length,
    needs_scope_check: all.filter((d) => d.needs_scope_check).length,
  },
  problems: { ...problems, invalid_tags: tagProblems },
  query: wanted.length ? { tags: wanted, matched: matched.length } : null,
  entries: active,
  // Brief: jedna linia na wpis, bez ścieżek i pól technicznych. To ON idzie do prompta
  // decision-gate (pełny JSON bywa 5-8x większy — zbyt dużo, żeby tylko wybrać wpis).
  // `summary`/`title` ucięte do 200 znaków — kilka wpisów (np. cross-context ACL vs
  // read-projection) miało po 500-600 znaków samego streszczenia, co przy 150 aktywnych
  // decyzjach robiło różnicę rzędu kilkunastu KB (K34, TASK-KAIZEN-001, 2026-08-27).
  // decision-gate cytuje `scope`/pełny wpis z `entries[]` gdy potrzebuje więcej niż to.
  brief: active.map((d) => {
    const text = d.summary ?? d.title ?? '';
    const trimmed = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    return `${d.kind.toUpperCase()}-${d.id ?? '????'} | ${d.status}${d.needs_scope_check ? ' ⚠zakres' : ''}` +
      `${d.tags.length ? ` | ${d.tags.join(' ')}` : ''} | ${trimmed}`;
  }),
  filtered_out: all.filter((d) => !active.includes(d)).map((d) => ({ id: d.id, file: d.file, status: d.status })),
};

writeFileSync(join(projectDir, '.claude/config/decisions-index.json'), JSON.stringify(index, null, 2));

if (wanted.length) {
  // Zapytanie wypisujemy na stdout — to jest ta forma, która ma trafić do prompta:
  // kilka linii zamiast 47 KB entries.
  console.log(`  filtr [${wanted.join(', ')}] → ${matched.length} z ${active.length}:`);
  for (const d of matched) console.log(`    ${d.kind.toUpperCase()}-${d.id} | ${d.status}${d.needs_scope_check ? ' ⚠zakres' : ''} | ${d.summary ?? d.title}`);
}
console.log(`  decisions-index.json: ${all.length} wpisów → ${active.length} aktywnych` +
  `, ${index.counts.from_frontmatter} z frontmattera` +
  `, ${index.counts.needs_scope_check} z opisanym zakresem częściowego uchylenia`);
if (problems.duplicate_ids.length)
  console.error('  UWAGA: zdublowane numery: ' +
    problems.duplicate_ids.map((d) => `${d.kind.toUpperCase()}-${d.id} (${d.files.map((f) => basename(f)).join(' + ')})`).join(', '));
if (tagProblems.length)
  console.error(`  UWAGA: ${tagProblems.length} nieprawidłowych tagów:\n    ` + tagProblems.slice(0, 5).join('\n    '));
if (problems.unknown_status.length)
  console.error(`  UWAGA: ${problems.unknown_status.length} wpisów ze statusem spoza słownika (zostają w indeksie):\n    ` +
    problems.unknown_status.slice(0, 5).join('\n    '));
if (problems.scope_pending_registration.length)
  console.error(`  UWAGA: ${problems.scope_pending_registration.length} wpisów wspomina o niezarejestrowanej decyzji (sprawdź, czy luka nadal istnieje):\n    ` +
    problems.scope_pending_registration.join('\n    '));
if (problems.missing_status.length)
  console.error(`  UWAGA: ${problems.missing_status.length} plików bez czytelnego statusu — traktowane jako aktywne: ` +
    problems.missing_status.slice(0, 5).map((f) => basename(f)).join(', ') + (problems.missing_status.length > 5 ? ', …' : ''));
