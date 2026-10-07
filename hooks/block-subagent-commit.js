#!/usr/bin/env node
// PreToolUse(Bash) hook — subagenci przebiegu /orchestrate NIE commitują i nie cofają stanu gitem.
//
// Why (ORC-094): przebieg kończy się „staged, not committed", commit robi człowiek. Sam zakaz w
// prompcie implementera (ORC-087) nie wystarczył: ai-os-bot BOT-024 — 40 commitów od implementerów
// i sond (w tym haiku) mimo „ZAKAZ COMMITOWANIA". Prompt nie jest wiążący dla LLM, hook jest.
//
// Zakres celowo wąski: blokuje WYŁĄCZNIE subagentów (payload.agent_id) i WYŁĄCZNIE gdy w cwd
// (lub 3 katalogach wyżej) leży świeży znacznik `.claude/run-state/orchestrating.json` (zapisuje
// go /orchestrate, krok 1). Sesja główna — człowiek i orchestrator — commituje jak dotąd, więc
// zapomniany znacznik nie blokuje użytkownikowi pracy.
//
// Kontrakt: exit 2 + stderr = deny (jak productivity-watchdog); każdy błąd parsowania → exit 0.

const fs = require('fs');
const path = require('path');

const MARKER_MAX_AGE_MS = 12 * 3600 * 1000;
const GIT_FORBIDDEN = /(?:^|[;&|(\s])git\s+(?:(?:-[Cc]\s+\S+|--[\w-]+(?:=\S+)?)\s+)*(commit|push|rebase|tag|merge|cherry-pick|am|stash|reset|restore|checkout)\b/;

function findMarker(startDir) {
  let dir = startDir;
  for (let i = 0; i < 4; i++) {
    const p = path.join(dir, '.claude', 'run-state', 'orchestrating.json');
    try {
      const st = fs.statSync(p);
      if (Date.now() - st.mtimeMs <= MARKER_MAX_AGE_MS) return p;
    } catch { /* brak znacznika na tym poziomie */ }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch { return process.exit(0); }
  if (input.tool_name !== 'Bash' || !input.agent_id) return process.exit(0);
  const cmd = (input.tool_input && input.tool_input.command) || '';
  const m = cmd.match(GIT_FORBIDDEN);
  if (!m) return process.exit(0);
  if (!findMarker(input.cwd || process.cwd())) return process.exit(0);
  process.stderr.write(
    `Zablokowane przez block-subagent-commit: \`git ${m[1]}\` w trakcie przebiegu /orchestrate. ` +
    'Przebieg kończy się „staged, not committed" — commit i cofanie stanu gitem robi człowiek. ' +
    'Zmiany zostają w drzewie roboczym; do zapisu/przywrócenia stanu użyj `cp`, nie gita.\n');
  return process.exit(2);
});
