#!/usr/bin/env node
/**
 * productivity-watchdog.js — PreToolUse hook (TASK-OBS-001, decyzja D6)
 *
 * Ramię egzekucyjne scripts/workflow-watcher.js: hook NIE mierzy niczego sam —
 * czyta flagi wystawione przez zewnętrzny watcher i ODMAWIA (exit 2) kolejnych
 * tool-calli subagentom oznaczonym jako spinning oraz wszystkim subagentom
 * przy aktywnym kill-switchu. Nie da się zabić wiszącego agenta z hooka;
 * deny kolejnych narzędzi to realny, dostępny punkt HALT.
 *
 * Zasada (D6): NIE twardy cap tokenów. Watcher flaguje dopiero tokeny rosnące
 * BEZ zdarzenia postępu zdefiniowanego dla KONTRAKTU ETAPU agenta
 * (implement→Write/Edit, verify→StructuredOutput/werdykt, inne→artefakt).
 *
 * Źródła flag (pisane przez watcher / człowieka):
 *   <cwd>/.claude/run-state/halt.json  — { all?: {reason,ts}, agents: { <agentId>: {reason,ts} } }
 *   <cwd>/.claude/run-state/KILL       — kill-switch (touch = STOP wszystkich subagentów)
 *
 * Detekcja subagenta: payload.agent_id obecny TYLKO w subagencie (jak w
 * check-delegation.js). Główny agent NIGDY nie jest blokowany — musi móc
 * reagować i odblokowywać. Hook NIE czyta transkryptów (PreToolUse hooki
 * skanujące transcript blokowały subagentów — znana pułapka).
 *
 * Zwolnienie HALT: usuń wpis z halt.json (lub cały plik) / usuń KILL.
 * Flagi w halt.json wygasają po TTL (15 min) — stara flaga nie blokuje
 * nowego, zdrowego przebiegu.
 *
 * Opt-in per projekt (NIE w globalnym hooks.json).
 * Configuration: WATCHDOG_MODE=block|warn|off (default: block)
 */

const fs = require('fs');
const path = require('path');

const MODE = process.env.WATCHDOG_MODE || 'block';
const FLAG_TTL_MS = 15 * 60 * 1000;

function readStdinSync() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function isFresh(entry) {
  if (!entry || !entry.ts) return false;
  const age = Date.now() - Date.parse(entry.ts);
  return Number.isFinite(age) && age >= 0 && age < FLAG_TTL_MS;
}

function deny(kind, reason, runStateDir, isBlock) {
  const verb = isBlock ? '🛑 HALTED' : '⚠️  WARN';
  process.stderr.write(
    `\n${verb}: PRODUCTIVITY-WATCHDOG (${kind})\n` +
    `    ${reason}\n\n` +
    `    Sprawdź RUN-STATE.md (pisze go scripts/workflow-watcher.js) — tam widać,\n` +
    `    który agent pali tokeny bez postępu i od kiedy.\n` +
    `    NIE ponawiaj całego Workflow — użyj resumeFromRunId po usunięciu przyczyny.\n` +
    `    Zwolnienie: usuń wpis agenta z ${path.join(runStateDir, 'halt.json')}\n` +
    `    (kill-switch: usuń plik ${path.join(runStateDir, 'KILL')}).\n` +
    `    Mode: ${MODE.toUpperCase()} (WATCHDOG_MODE=warn → tylko ostrzeżenie, =off → wyłącz)\n`
  );
  process.exit(isBlock ? 2 : 0);
}

function main() {
  const raw = readStdinSync();
  if (!raw) process.exit(0);

  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  // Zawsze przepuść payload dalej bez zmian.
  process.stdout.write(raw);

  if (MODE === 'off') process.exit(0);

  // Główny agent NIGDY nie jest blokowany — musi móc reagować/odblokować.
  const agentId = payload.agent_id;
  if (!agentId) process.exit(0);

  const cwd = payload.cwd || process.cwd();
  const runStateDir = path.join(cwd, '.claude', 'run-state');
  const isBlock = MODE !== 'warn';

  // Kill-switch: człowiek zatrzymuje WSZYSTKICH subagentów jednym touch.
  if (fs.existsSync(path.join(runStateDir, 'KILL'))) {
    deny('kill-switch', 'Kill-switch aktywny (.claude/run-state/KILL) — wszystkie tool-calle subagentów wstrzymane.', runStateDir, isBlock);
  }

  let flags = null;
  try { flags = JSON.parse(fs.readFileSync(path.join(runStateDir, 'halt.json'), 'utf8')); } catch { process.exit(0); }
  if (!flags || typeof flags !== 'object') process.exit(0);

  if (isFresh(flags.all)) {
    deny('halt-all', `Watcher zatrzymał cały przebieg: ${flags.all.reason || 'brak powodu'}`, runStateDir, isBlock);
  }
  const entry = flags.agents && flags.agents[agentId];
  if (isFresh(entry)) {
    deny('spinning', `Agent ${agentId} oflagowany przez watcher: ${entry.reason || 'tokeny bez postępu'}`, runStateDir, isBlock);
  }

  process.exit(0);
}

main();
