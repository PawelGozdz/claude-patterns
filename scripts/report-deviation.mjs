#!/usr/bin/env node
// scripts/report-deviation.mjs — zapis odstępstw od zasad /orchestrate do docs/tasks/_inbox/.
// (ORC-066, docs/decisions/orchestrate-rule-history.md#orc-066)
//
// Powód istnienia: dotąd jedynym kanałem "satelita → claude-patterns" dla ESCALATE_AND_HALT /
// BLOCKED_BY_PRIOR / NO_GO bramki końcowej / naruszeń workflow-lint / adnotacji agenta był
// człowiek, ręcznie kopiujący fragment feedbacku do nowego docs/tasks/TASK-ORCH-*.md. Ten
// skrypt to automatyzuje: wywołuje go agent orkiestrujący /orchestrate (Krok 5,
// commands/orchestrate.md), best-effort, po zwrocie `report` z Workflow() albo po exit 4
// kroku `orchestrate-prepare.mjs --emit-script`.
//
// Użycie:
//   node scripts/report-deviation.mjs --project <nazwa> \
//        --trigger <halt|blocked_by_prior|no_go|workflow_lint|agent_note> \
//        --reason "<tekst>" [--rule <ORC-062|WL17>] [--task <TASK-ID>] [--run-id <id>] [--layer <id>]
//   node scripts/report-deviation.mjs --list
//
// Jeden plik na SYGNATURĘ (rule_ref jeśli podany, inaczej slug trigger+reason), nie na
// zdarzenie — powtarzający się problem staje się licznikiem częstości (`occurrences`,
// `projects[]`), a nie stosem duplikatów. Świadomie bez locka na współbieżny zapis z
// dwóch terminali naraz — akceptowalne dla best-effort telemetrii niskiej częstotliwości.
//
// Skrypt NIGDY nie commituje ani nie staguje. Nowy/reopened wpis (status: proposed) zostaje
// nietrackowany — to CELOWE: `git status` w claude-patterns ma pokazywać nietriage'owane
// zgłoszenia jako `??`, a zestagowane (`A`/`M`) jako te, które człowiek/agent już przejrzał
// i rozstrzygnął (dismissed/promoted). Do 2026-09-27 skrypt sam robił `git add` na każdym
// zapisie (także reopen), więc `git status` nie odróżniał nowego od przetriage'owanego —
// wszystko wyglądało jednakowo zestagowane. Triage (promote do docs/tasks/TASK-ORCH-NNN.md
// albo status: dismissed) robi człowiek — i to on/ona (albo agent w jego imieniu) staguje
// plik, edytując `status:`, patrz docs/tasks/_inbox/README.md.
//
// Wyjście (exit code): 0 = zapisano, 1 = błąd użycia lub błąd zapisu. Wołający (Krok 5
// w commands/orchestrate.md) traktuje niezerowy exit jako niebłokujący — dopisuje uwagę
// do treści HALT i jedzie dalej, nie przerywa przebiegu /orchestrate z tego powodu.

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const YAML = require_(join(REPO_ROOT, 'node_modules', 'yaml'));
const INBOX_DIR = join(REPO_ROOT, 'docs', 'tasks', '_inbox');

const EXIT = { OK: 0, USAGE: 1, WRITE: 1 };
const TRIGGERS = ['halt', 'blocked_by_prior', 'no_go', 'workflow_lint', 'agent_note'];

function die(code, msg) {
  process.stderr.write(`✘ report-deviation: ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    project: null, trigger: null, rule: null, reason: null,
    task: null, runId: null, layer: null, list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') out.list = true;
    else if (a === '--project') out.project = argv[++i] ?? '';
    else if (a === '--trigger') out.trigger = argv[++i] ?? '';
    else if (a === '--rule') out.rule = argv[++i] ?? '';
    else if (a === '--reason') out.reason = argv[++i] ?? '';
    else if (a === '--task') out.task = argv[++i] ?? '';
    else if (a === '--run-id') out.runId = argv[++i] ?? '';
    else if (a === '--layer') out.layer = argv[++i] ?? '';
    else die(EXIT.USAGE, `nieznany przełącznik: ${a}`);
  }
  return out;
}

function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'unknown';
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function readInboxEntries() {
  if (!existsSync(INBOX_DIR)) return [];
  const files = readdirSync(INBOX_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md');
  const rows = [];
  for (const f of files) {
    const raw = readFileSync(join(INBOX_DIR, f), 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) continue;
    const fm = YAML.parse(m[1]) || {};
    rows.push({ file: f, ...fm });
  }
  return rows;
}

function listInbox() {
  const rows = readInboxEntries();
  if (!rows.length) {
    console.log('docs/tasks/_inbox/ jest puste.');
    return;
  }
  rows.sort((a, b) => (b.occurrences || 0) - (a.occurrences || 0)
    || String(b.last_seen || '').localeCompare(String(a.last_seen || '')));
  console.log(`${rows.length} pozycji w docs/tasks/_inbox/ (sortowane wg occurrences):\n`);
  for (const r of rows) {
    const projects = Array.isArray(r.projects) ? r.projects.join(',') : '';
    console.log(`  ${String(r.occurrences ?? '?').padStart(3)}x  ${r.id || r.file}  `
      + `[${r.trigger || '?'}]  last_seen=${r.last_seen || '?'}  status=${r.status || '?'}  `
      + `projects=${projects}`);
  }
}

function upsert(args) {
  // Sam `rule_ref` to za gruba sygnatura dla reguł-bezpieczników ogólnego przeznaczenia
  // (np. ORC-062/BLOCKED_BY_PRIOR odpala na dowolnej warstwie z dowolnego powodu) — bez
  // `--layer` w sygnaturze różne, niepowiązane przyczyny na różnych warstwach tego samego
  // czy różnych projektów zlewały się w jeden plik (2026-09-26: DEV-orc-062.md pochłonął
  // nowy, inny problem — PII guard w testing:l1-l2 — pod już zamkniętym `status: dismissed`
  // z domain:rules). `--layer`, gdy podany, wchodzi do sygnatury razem z regułą.
  const signature = args.rule
    ? slugify(args.layer ? `${args.rule}-${args.layer}` : args.rule)
    : `${args.trigger}-${slugify(args.reason.slice(0, 50))}`;
  const id = `DEV-${signature}`;
  mkdirSync(INBOX_DIR, { recursive: true });
  const target = join(INBOX_DIR, `${id}.md`);
  const today = todayIso();

  const parts = [args.project];
  if (args.task) parts.push(`(${args.task})`);
  if (args.runId) parts.push(`run \`${args.runId}\``);
  if (args.layer) parts.push(`warstwa \`${args.layer}\``);
  const occurrenceLine = `- ${today} ${parts.join(' ')} — ${args.reason}`;

  let fm;
  let body;
  if (existsSync(target)) {
    const raw = readFileSync(target, 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!m) die(EXIT.WRITE, `${target}: uszkodzony frontmatter — popraw ręcznie zanim skrypt dopisze kolejne wystąpienie`);
    fm = YAML.parse(m[1]) || {};
    body = m[2];
    const wasClosed = fm.status === 'dismissed' || fm.status === 'promoted';
    fm.occurrences = (fm.occurrences || 0) + 1;
    fm.last_seen = today;
    fm.projects = Array.from(new Set([...(fm.projects || []), args.project]));
    if (wasClosed) {
      // Nowe wystąpienie po zamknięciu NIE oznacza automatycznie, że to ten sam, już
      // rozstrzygnięty problem — sygnatura bywa współdzielona przez różne przyczyny
      // (patrz komentarz przy `signature` wyżej). Reopen zamiast cichego dopisania pod
      // zamkniętym statusem — dismissed_reason/resolution zostają jako historia DECYZJI
      // O POPRZEDNIM wystąpieniu, nie jako wyrok na to nowe.
      fm.reopened_at = today;
      fm.reopened_from_status = fm.status;
      fm.status = 'proposed';
      process.stderr.write(`⚠ report-deviation: ${id} był "${fm.reopened_from_status}", nowe wystąpienie go REOPEN'uje do "proposed" — sprawdź, czy to ten sam problem co poprzednio\n`);
    }
    if (!body.includes('## Occurrences')) body += `\n## Occurrences\n\n`;
    body = body.replace(/(## Occurrences\r?\n\r?\n)/, `$1${occurrenceLine}\n`);
  } else {
    fm = {
      id,
      status: 'proposed',
      trigger: args.trigger,
      rule_ref: args.rule || null,
      first_seen: today,
      last_seen: today,
      occurrences: 1,
      projects: [args.project],
    };
    body = `# ${id}\n\n## Occurrences\n\n${occurrenceLine}\n`;
  }

  const out = `---\n${YAML.stringify(fm).trimEnd()}\n---\n\n${body.replace(/^\n+/, '')}`;
  writeFileSync(target, out);

  console.log(`inbox: ${id} occurrences=${fm.occurrences}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    listInbox();
    process.exit(EXIT.OK);
  }

  if (!args.project) die(EXIT.USAGE, 'brak --project');
  if (!args.trigger) die(EXIT.USAGE, 'brak --trigger');
  if (!TRIGGERS.includes(args.trigger)) die(EXIT.USAGE, `--trigger musi być jednym z: ${TRIGGERS.join(', ')}`);
  if (!args.reason) die(EXIT.USAGE, 'brak --reason');

  try {
    upsert(args);
  } catch (e) {
    die(EXIT.WRITE, `nie udało się zapisać: ${e && e.message ? e.message : String(e)}`);
  }
  process.exit(EXIT.OK);
}

main();
