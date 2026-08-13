#!/usr/bin/env node
/**
 * check-human-voice.js — PostToolUse hook (register gate for human-facing fields)
 *
 * Problem: an analysis artifact describes a problem in the language it was found in —
 * class names, file paths, ADR numbers. Useful for the next agent, a wall for the human
 * who has to approve it. The observed cost was a translation round after literally every
 * /analyze ("explain these open questions in plain business language").
 *
 * The contract (commands/analyze.md §2a, templates/task-analysis-template.md):
 *   open_questions[].ask   — for the human: business register, short
 *   open_questions[].q     — for agents/audit: full technical context
 *   decisions[].means      — for the human: what the decision changes for the product
 *   decisions[].rationale  — for agents: why this option won
 *
 * This hook checks the human-facing half after the artifact is written. It WARNS
 * (exit 0) and never blocks: PostToolUse cannot undo a write, and a register miss is a
 * quality issue, not a correctness one. But an unreported one is exactly how the
 * contract would rot back into "q only".
 *
 * Detection is deliberately dumb and syntactic (no model call): it flags the tells the
 * register rules name explicitly. False positives are cheap here — the message says what
 * to look at, not what to do.
 *
 * Configuration: HUMAN_VOICE_MODE=warn|off (default: warn)
 */

const fs = require('fs');
const path = require('path');

const MODE = process.env.HUMAN_VOICE_MODE || 'warn';

// Tells that a "for the human" field is still speaking codebase. Ordered by how
// reliably each one means the field was not rewritten at all.
const TELLS = [
  { re: /\b[\w-]+\.(ts|tsx|js|mjs|dart|py|yml|yaml|json|md)\b/, what: 'nazwa pliku' },
  { re: /(^|\s)\/?(src|lib|app|test|docs)\//, what: 'ścieżka katalogu' },
  { re: /\b(ADR|BDR)-?\s?\d+/i, what: 'numer ADR/BDR' },
  { re: /\b[a-z]+[A-Z]\w*\(/, what: 'wywołanie funkcji' },
  { re: /\b[A-Z][a-z]+(?:[A-Z][a-z]+){2,}\b/, what: 'nazwa klasy' },
  { re: /\b(agregat|aggregate|value object|specification|handler|repozytorium|repository|bounded context)\b/i, what: 'żargon warstw' },
];

function readStdinSync() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

/**
 * Minimal frontmatter reader for the two list shapes this contract uses. Full YAML
 * parsing would mean a dependency inside a hook that must never fail — a regex over the
 * frontmatter block answers the only question here: is the field there, and what is in it.
 */
function extractItems(frontmatter, listKey, humanField) {
  // `$(?![\s\S])` is end-of-input. NOT `\Z` — JavaScript has no such escape, it would
  // match a literal "Z" and truncate the block at the first capitalised word in the prose.
  const block = frontmatter.match(new RegExp(`^${listKey}:\\s*$([\\s\\S]*?)(?=^\\S|$(?![\\s\\S]))`, 'm'));
  if (!block) return [];
  const items = [];
  for (const chunk of block[1].split(/^\s*-\s+/m).slice(1)) {
    const id = chunk.match(/\bid:\s*(\S+)/)?.[1] ?? '?';
    const has = new RegExp(`\\b${humanField}:`).test(chunk);
    // Folded (`>-` / `|`) is tried FIRST and the inline separator is `[ \t]+`, not `[ \t]*`.
    // With `*` the engine backtracks the separator to zero width, lands the lookahead on a
    // space instead of the `>`, and captures the literal " >-" as if it were the value —
    // so a folded field always looked present and always looked clean.
    const folded = chunk.match(new RegExp(`\\b${humanField}:[ \\t]*[>|]-?[ \\t]*\\n([\\s\\S]*?)(?=\\n\\s*\\w+:|$(?![\\s\\S]))`))?.[1];
    const inline = chunk.match(new RegExp(`\\b${humanField}:[ \\t]+(?![>|\\r\\n])(.+)`))?.[1];
    items.push({ id, has, value: (folded ?? inline ?? '').trim() });
  }
  return items;
}

function inspect(items, listKey, humanField, problems) {
  for (const it of items) {
    if (!it.has) {
      problems.push(`${listKey}[${it.id}]: brak pola \`${humanField}\` — to jedyna część, którą czyta człowiek`);
      continue;
    }
    const stripped = it.value.replace(/^["']|["']$/g, '').trim();
    if (!stripped || stripped === '...') {
      problems.push(`${listKey}[${it.id}]: \`${humanField}\` puste`);
      continue;
    }
    const hits = [...new Set(TELLS.filter((t) => t.re.test(stripped)).map((t) => t.what))];
    if (hits.length) {
      problems.push(`${listKey}[${it.id}]: \`${humanField}\` zawiera ${hits.join(', ')} — to należy do pola technicznego`);
    }
  }
}

function main() {
  const raw = readStdinSync();
  if (!raw) process.exit(0);

  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }
  process.stdout.write(raw);

  if (MODE === 'off') process.exit(0);

  const filePath = payload.tool_input?.file_path || payload.tool_input?.path || '';
  if (!filePath.endsWith('.analysis.md')) process.exit(0);

  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { process.exit(0); }

  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (!frontmatter) process.exit(0);

  const problems = [];
  inspect(extractItems(frontmatter, 'open_questions', 'ask'), 'open_questions', 'ask', problems);
  inspect(extractItems(frontmatter, 'decisions', 'means'), 'decisions', 'means', problems);

  if (!problems.length) process.exit(0);

  process.stderr.write(
    `\n⚠️  HUMAN-VOICE: ${path.basename(filePath)} — do poprawy przed oddaniem człowiekowi (${problems.length})\n` +
    problems.map((p) => `    • ${p}`).join('\n') + '\n\n' +
    `    Kontrakt: \`ask\`/\`means\` czyta CZŁOWIEK (rejestr z runtime.yml \`human_voice\`),\n` +
    `    \`q\`/\`rationale\` czytają agenci. Test: czy ktoś, kto nie zna tego kodu, odpowie sam?\n` +
    `    Szczegóły: commands/analyze.md §2a + skills/quality/humanizer (Register Pass).\n` +
    `    Wyłączenie: HUMAN_VOICE_MODE=off\n`
  );
  process.exit(0);
}

main();
