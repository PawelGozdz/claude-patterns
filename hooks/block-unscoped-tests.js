#!/usr/bin/env node
// PreToolUse(Bash) hook — test runner wolno uruchomić WYŁĄCZNIE jako
//   pnpm test:e2e <plik>… | pnpm test:integration <plik>…
// (jawna lista plików, bez `--`). Wszystko inne, co uruchamia testy Node, jest blokowane.
//
// Why (user, 2026-10-31): w trakcie /orchestrate sondy i agenci odpalali `npm run test`, `npx vitest`,
// `pnpm test -- <plik>` i gołe `pnpm test:e2e`. Każda z tych form uruchamia cały zestaw (tysiące testów,
// testcontainers, wspólny flock repo, ~1h), pali tokeny i blokuje inne sesje. Reguła istniała tylko jako
// proza w test-implementer.md; proza nie wiąże LLM-a (patrz ORC-094), hook tak.
//
// Zakres: KAŻDA sesja i KAŻDY subagent, każdy projekt Node. Bez przełącznika wyłączającego: dozwolenie
// dodatkowych skryptów (`allow`) albo testów jednostkowych (`allowUnit`) robi się w `.claude/test-guard.json`
// projektu, a i tam zawsze z jawną listą plików. Pytest/flutter/go test nie są dotknięte.
//
// Kontrakt: deny przez JSON (jak block-root-grep); każdy błąd parsowania → przepuszcza (exit 0).

const { exitAfterBlock } = require('./lib/hook-telemetry');
const { findViolation, loadConfig, allowedScripts } = require('./lib/test-guard');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch { return process.exit(0); }
  if (input.tool_name !== 'Bash') return process.exit(0);
  const cmd = (input.tool_input && input.tool_input.command) || '';
  let hit = null;
  let cfg;
  try {
    cfg = loadConfig(input.cwd || process.cwd());
    hit = findViolation(cmd, cfg);
  } catch { return process.exit(0); }
  if (!hit) return process.exit(0);
  const scripts = [...allowedScripts(cfg)].join(' | ');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `Zablokowane przez block-unscoped-tests: \`${hit.segment.slice(0, 160)}\` — ${hit.detail}. ` +
        'Testy wolno uruchamiać TYLKO jako `pnpm test:e2e <plik_1> <plik_2> …` albo `pnpm test:integration <plik_1> <plik_2> …` ' +
        `(dozwolone skrypty: ${scripts}). Jawne pliki testowe, bez \`--\`, bez katalogów i globów, flagi dopiero po plikach. ` +
        'Nie znasz plików? `git diff --name-only HEAD` i `git ls-files --others --exclude-standard`; nic do uruchomienia = ' +
        'zgłoś „brak plików" i stop. Pełny zestaw odpala człowiek.',
    },
  }));
  exitAfterBlock(0, { hook: 'block-unscoped-tests', rule: hit.rule, cwd: input.cwd });
});
