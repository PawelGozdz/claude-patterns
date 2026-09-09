#!/usr/bin/env node
/**
 * tests/flow-evals/hooks/run.js — eval L1 (D7, TASK-RAG-002.analysis.md) dla hooków.
 *
 * Deterministyczny scorer: payload → oczekiwana decyzja (pass=exit 0 / deny=exit 2).
 * Zero LLM. Uruchamiaj przy KAŻDEJ zmianie hooka: `node tests/flow-evals/hooks/run.js`.
 *
 * MVP: fixtures inline (poniżej). Nagrane wejścia z realnych transkryptów
 * dokładaj do tests/flow-evals/hooks/fixtures/*.json wg tego samego schematu
 * {name, hook, env, payload, setup, expect} — runner je dołączy automatycznie.
 *
 * Asercje na wyjściu (hooki doradcze zawsze kończą exit 0, więc sam kod wyjścia
 * niczego nie odróżnia):
 *   expect_stderr: "<regex>"  — ten tekst MUSI paść na stderr (hook złapał naruszenie)
 *   expect_silent: true      — stderr MUSI być pusty (hook przepuścił / brak configu)
 *   expect_typecheck_ran: <bool> — czy post-edit-typecheck doszedł do tsc (czyta znacznik
 *                              cooldownu; wymaga setup.typecheckCooldown)
 *   setup.cwd: true          — proces hooka startuje w katalogu tymczasowym, dzięki czemu
 *                              względne `file_path` trafiają w pliki z `setup.files`
 *   setup.typecheckCooldown: { ageMs } — sadzi znacznik cooldownu post-edit-typecheck
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const WATCHDOG = path.join(REPO, 'hooks', 'productivity-watchdog.js');

const iso = (ageMin = 0) => new Date(Date.now() - ageMin * 60000).toISOString();

// setup: { kill?: true, halt?: {all?, agents?} } — flagi tworzone w tymczasowym cwd
const FIXTURES = [
  {
    name: 'main-agent-passes-even-on-kill', hook: WATCHDOG,
    payload: { tool_name: 'Write', tool_input: { file_path: 'x.ts' } }, // brak agent_id = main
    setup: { kill: true }, expect: 'pass',
  },
  {
    name: 'subagent-clean-passes', hook: WATCHDOG,
    payload: { agent_id: 'a1', tool_name: 'Read', tool_input: {} },
    setup: {}, expect: 'pass',
  },
  {
    name: 'subagent-flagged-denied', hook: WATCHDOG,
    payload: { agent_id: 'a1', tool_name: 'Grep', tool_input: {} },
    setup: { halt: { agents: { a1: { reason: 'spinning', ts: iso(1) } } } }, expect: 'deny',
  },
  {
    name: 'other-subagent-not-affected', hook: WATCHDOG,
    payload: { agent_id: 'b2', tool_name: 'Grep', tool_input: {} },
    setup: { halt: { agents: { a1: { reason: 'spinning', ts: iso(1) } } } }, expect: 'pass',
  },
  {
    name: 'stale-flag-expired-passes', hook: WATCHDOG,
    payload: { agent_id: 'a1', tool_name: 'Grep', tool_input: {} },
    setup: { halt: { agents: { a1: { reason: 'spinning', ts: iso(30) } } } }, expect: 'pass', // TTL 15 min
  },
  {
    name: 'kill-switch-denies-subagent', hook: WATCHDOG,
    payload: { agent_id: 'a1', tool_name: 'Read', tool_input: {} },
    setup: { kill: true }, expect: 'deny',
  },
  {
    name: 'halt-all-denies-any-subagent', hook: WATCHDOG,
    payload: { agent_id: 'zz9', tool_name: 'Bash', tool_input: {} },
    setup: { halt: { all: { reason: 'runaway run', ts: iso(1) } } }, expect: 'deny',
  },
  {
    name: 'warn-mode-never-blocks', hook: WATCHDOG, env: { WATCHDOG_MODE: 'warn' },
    payload: { agent_id: 'a1', tool_name: 'Read', tool_input: {} },
    setup: { kill: true }, expect: 'pass',
  },
  {
    name: 'off-mode-never-blocks', hook: WATCHDOG, env: { WATCHDOG_MODE: 'off' },
    payload: { agent_id: 'a1', tool_name: 'Read', tool_input: {} },
    setup: { kill: true, halt: { agents: { a1: { reason: 'x', ts: iso(1) } } } }, expect: 'pass',
  },
  {
    name: 'garbage-stdin-passes', hook: WATCHDOG,
    raw: 'not-json', setup: {}, expect: 'pass',
  },
];

function loadExternalFixtures() {
  const dir = path.join(__dirname, 'fixtures');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch { return []; }
  return files.flatMap(f => {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const list = Array.isArray(parsed) ? parsed : [parsed]; // plik = fixture LUB tablica fixtures
    return list.map(fx => ({ ...fx, hook: path.join(REPO, 'hooks', fx.hook) })); // w plikach: nazwa pliku hooka
  });
}

function runFixture(fx) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-eval-'));
  try {
    const rsDir = path.join(tmp, '.claude', 'run-state');
    if (fx.setup && (fx.setup.kill || fx.setup.halt)) fs.mkdirSync(rsDir, { recursive: true });
    if (fx.setup && fx.setup.kill) fs.writeFileSync(path.join(rsDir, 'KILL'), '');
    if (fx.setup && fx.setup.halt) fs.writeFileSync(path.join(rsDir, 'halt.json'), JSON.stringify(fx.setup.halt));
    // setup.files: { "rel/sciezka": "treść" } — pliki tworzone w tymczasowym cwd (np. artefakt
    // analizy dla check-approval-before-impl)
    if (fx.setup && fx.setup.files) {
      for (const [rel, content] of Object.entries(fx.setup.files)) {
        const p = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content);
      }
    }

    // setup.typecheckCooldown: { ageMs } — sadzi znacznik cooldownu post-edit-typecheck
    // DOKŁADNIE tam, gdzie hook go szuka. Ścieżkę liczy ta sama biblioteka co hook
    // (hooks/lib/typecheck-cooldown.js) — powielenie schematu hashowania tutaj dawałoby
    // zielony test przy rozjechanym hooku, czyli dokładnie to, czemu ten eval ma zapobiegać.
    let plantedRun = null;
    if (fx.setup && fx.setup.typecheckCooldown) {
      const cd = require(path.join(REPO, 'hooks', 'lib', 'typecheck-cooldown.js'));
      const ageMs = fx.setup.typecheckCooldown.ageMs || 0;
      plantedRun = new Date(Date.now() - ageMs);
      cd.markRun(tmp, plantedRun);
    }

    const input = fx.raw !== undefined ? fx.raw : JSON.stringify({ ...fx.payload, cwd: tmp });
    // setup.cwd: true — proces hooka startuje w katalogu tymczasowym, więc względne
    // `file_path` z payloadu rozwiązują się do plików z `setup.files` (hooki czytające
    // `payload.cwd` tego nie potrzebują i domyślnie zachowanie jest bez zmian).
    const res = spawnSync('node', [fx.hook], {
      input, encoding: 'utf8', env: { ...process.env, WATCHDOG_MODE: 'block', ...(fx.env || {}) },
      ...(fx.setup && fx.setup.cwd ? { cwd: tmp } : {}),
    });
    const got = res.status === 0 ? 'pass' : res.status === 2 ? 'deny' : `exit-${res.status}`;
    const stderr = (res.stderr || '').trim();
    // expect_silent: hook ma nie powiedzieć NIC na stderr (kod wyjścia tego nie odróżnia —
    // hooki doradcze zawsze kończą 0, a cała różnica jest w tym, czy coś wypisały)
    if (fx.expect_silent && stderr) {
      return { ok: false, got: `stderr: ${stderr.split('\n')[0]}`, stderr: stderr.split('\n')[0] };
    }
    // expect_stderr: wzorzec (regex), który MUSI pojawić się na stderr. Odwrotność
    // expect_silent i jedyny sposób odróżnienia „hook złapał naruszenie" od „hook
    // nic nie zrobił" u hooków doradczych — obie sytuacje kończą się exit 0.
    if (fx.expect_stderr && !new RegExp(fx.expect_stderr).test(stderr)) {
      return { ok: false, got: `stderr bez /${fx.expect_stderr}/`, stderr: stderr.split('\n')[0] || '(cisza)' };
    }
    // expect_typecheck_ran: czy post-edit-typecheck w ogóle doszedł do uruchomienia tsc.
    // Cisza na stderr tego nie rozstrzyga (czysty projekt też milczy), a to jest CAŁA
    // różnica między „cooldown zadziałał" a „cooldown wygasł" — czytamy znacznik last_run.
    if (fx.expect_typecheck_ran !== undefined && plantedRun) {
      const cd = require(path.join(REPO, 'hooks', 'lib', 'typecheck-cooldown.js'));
      const after = Date.parse(cd.readMarker(tmp).last_run || '');
      const ran = Number.isFinite(after) && after > plantedRun.getTime();
      if (ran !== fx.expect_typecheck_ran) {
        return { ok: false, got: `typecheck_ran=${ran}`, stderr: stderr.split('\n')[0] || '' };
      }
    }
    return { ok: got === fx.expect, got, stderr: stderr.split('\n')[0] || '' };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const fixtures = [...FIXTURES, ...loadExternalFixtures()];
  let failed = 0;
  for (const fx of fixtures) {
    const r = runFixture(fx);
    if (r.ok) {
      process.stdout.write(`  ✅ ${fx.name}\n`);
    } else {
      failed++;
      process.stdout.write(`  ❌ ${fx.name} — expected ${fx.expect}, got ${r.got} ${r.stderr ? `(${r.stderr})` : ''}\n`);
    }
  }
  process.stdout.write(`\n${fixtures.length - failed}/${fixtures.length} passed\n`);
  process.exit(failed ? 1 : 0);
}

main();
