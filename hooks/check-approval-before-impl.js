#!/usr/bin/env node
/**
 * check-approval-before-impl.js  (PreToolUse: Write|Edit|MultiEdit)
 *
 * Backstop dla twardej bramki research→implementacja (ADR 0002). PRIMARY gate to
 * precondition-check w /orchestrate-ddd; ten hook to drugi zamek: blokuje edycje
 * KODU ŹRÓDŁOWEGO, gdy istnieje artefakt analizy w stanie nieapprobowanym.
 *
 * Heurystyka (MVP, single-task flow): jeśli w project-orchestration/tasks/ jest
 * artefakt *.analysis.md ze `status:` innym niż `approved` (lub z pytaniem bez
 * odpowiedzi), to edycja pliku źródłowego prawdopodobnie wyprzedza zatwierdzenie analizy.
 *
 * Tryby (env ORCHESTRATE_DDD_GATE): warn (default) | block | off
 * Ograniczenie: przy wielu równoległych zadaniach jest zgrubny (nie wie, którego
 * zadania dotyczy edycja). Stąd default = warn. One-off bypass: .analysis-ok-sentinel.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MODE = process.env.ORCHESTRATE_DDD_GATE || 'warn';

const ENFORCED_EXT = ['.ts', '.tsx', '.dart', '.py', '.svelte'];
const EXEMPT_FRAGMENTS = ['__tests__/', '.test.', '.spec.', 'node_modules/', '.claude/',
  'project-orchestration/', '/docs/', '.analysis.md'];

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }

function isSourceFile(fp) {
  if (!fp) return false;
  if (EXEMPT_FRAGMENTS.some((f) => fp.includes(f))) return false;
  return ENFORCED_EXT.includes(path.extname(fp));
}

/** Zwraca listę {file, status, hasNullAnswer} dla artefaktów analizy w cwd. */
function scanAnalyses(cwd) {
  const dir = path.join(cwd || '.', 'project-orchestration', 'analysis');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.analysis.md')); } catch { return []; }
  return files.map((f) => {
    let txt = '';
    try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return null; }
    const fm = (txt.match(/^---\n([\s\S]*?)\n---/) || [, ''])[1];
    const status = (fm.match(/^status:\s*([a-z-]+)/m) || [, 'unknown'])[1];
    const hasNullAnswer = /answer:\s*null/.test(fm);
    return { file: f, status, hasNullAnswer };
  }).filter(Boolean);
}

function main() {
  const raw = readStdin();
  if (!raw) process.exit(0);
  let p; try { p = JSON.parse(raw); } catch { process.exit(0); }
  process.stdout.write(raw);

  if (MODE === 'off') process.exit(0);
  if (!['Write', 'Edit', 'MultiEdit'].includes(p.tool_name)) process.exit(0);

  const fp = p.tool_input && (p.tool_input.file_path || p.tool_input.path);
  if (!isSourceFile(fp)) process.exit(0);

  const cwd = p.cwd || process.cwd();

  // one-off bypass sentinel (5 min) obok transcriptu/sesji
  const sentinel = path.join(cwd, '.analysis-ok-sentinel');
  try { if (Date.now() - fs.statSync(sentinel).mtimeMs < 300000) process.exit(0); } catch {}

  const analyses = scanAnalyses(cwd);
  if (analyses.length === 0) process.exit(0); // brak analiz → praca nieorkiestrowana, przepuść

  const pending = analyses.filter((a) => a.status !== 'approved' || a.hasNullAnswer);
  if (pending.length === 0) process.exit(0); // wszystko approved → przepuść

  const isBlock = MODE === 'block';
  const list = pending.map((a) => `      • ${a.file} (status: ${a.status}${a.hasNullAnswer ? ', pytania bez odpowiedzi' : ''})`).join('\n');
  const msg =
    `\n${isBlock ? '🛑 BLOCKED' : '⚠️  WARN'}: APPROVAL-GATE on ${p.tool_name} ${fp}\n` +
    `    Edytujesz kod źródłowy, ale istnieje analiza NIEZATWIERDZONA:\n${list}\n\n` +
    `    Najpierw: odpowiedz na open_questions + ustaw status: approved, potem /orchestrate-ddd <TASK>.\n` +
    `    Tryb: ${MODE.toUpperCase()} (ORCHESTRATE_DDD_GATE=warn|block|off; one-off: touch .analysis-ok-sentinel)\n`;
  process.stderr.write(msg);
  process.exit(isBlock ? 2 : 0);
}
main();
