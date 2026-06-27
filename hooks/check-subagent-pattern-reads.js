#!/usr/bin/env node
/**
 * check-subagent-pattern-reads.js — SubagentStop hook (pattern-grounding gate)
 *
 * Closes the gap left when check-patterns-read.js passes ALL subagents:
 * PreToolUse only ever sees the PARENT transcript, so it cannot verify that a
 * subagent read the pattern governing a file it edited. SubagentStop CAN —
 * its payload carries `agent_transcript_path`, the subagent's OWN transcript.
 *
 * What it does, at subagent stop:
 *   1. Scan the subagent's transcript.
 *   2. Collect every source file it Wrote/Edited → map each to its governing
 *      pattern (lib/pattern-routing.js).
 *   3. Collect every pattern the subagent Read (canonical OR _summary variant).
 *   4. For each edited pattern-file whose governing pattern was NOT read →
 *      a violation: the file was written from training data, not project canon.
 *   5. If any violations: block the stop (exit 2) so the subagent must Read the
 *      named patterns and reconcile those files before finishing.
 *
 * This enforces PRESENCE of pattern grounding. Rule-by-rule CONFORMANCE is the
 * verifier's job (code-quality-verifier VETO). The two are complementary.
 *
 * Loop guard: if `stop_hook_active` is set, we already intervened once — pass.
 *
 * Modes (env PATTERN_READS_MODE):
 *   block (default) — exit 2, list files + missing patterns, force a re-read
 *   warn            — stderr, exit 0
 *   off             — disabled
 */

const fs = require('fs');
const { isExempt, findRequiredPattern } = require('./lib/pattern-routing');

const MODE = process.env.PATTERN_READS_MODE || 'block';

function readStdinSync() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function extractToolUses(entry) {
  const out = [];
  if (entry?.type === 'tool_use') { out.push(entry); return out; }
  const content = entry?.message?.content || entry?.content || [];
  if (Array.isArray(content)) {
    for (const block of content) if (block?.type === 'tool_use') out.push(block);
  }
  return out;
}

/**
 * Scan a transcript JSONL file and return { editedFiles:Set, readPatterns:Set }.
 * readPatterns holds the trailing path of any Read under a patterns/ dir.
 */
function scanTranscript(transcriptPath) {
  const editedFiles = new Set();
  const readPatterns = new Set();
  let lines;
  try {
    lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  } catch {
    return { editedFiles, readPatterns };
  }

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    for (const tu of extractToolUses(entry)) {
      const fp = tu.input?.file_path || tu.input?.path;
      if (typeof fp !== 'string') continue;

      if (['Write', 'Edit', 'MultiEdit'].includes(tu.name)) {
        editedFiles.add(fp);
      } else if (tu.name === 'Read') {
        if (fp.includes('.claude/knowledge/patterns/') || fp.includes('claude-patterns/patterns/')) {
          readPatterns.add(fp);
        }
      }
    }
  }
  return { editedFiles, readPatterns };
}

/** True if `requiredPattern` (e.g. 'domain/aggregate-pattern.md') — or its
 *  _summary variant — appears among the Read pattern paths. */
function patternWasRead(requiredPattern, readPatterns) {
  const summary = requiredPattern.replace(/-pattern\.md$/, '-pattern_summary.md');
  for (const fp of readPatterns) {
    if (fp.endsWith('/' + requiredPattern) || fp.endsWith(requiredPattern) ||
        fp.endsWith('/' + summary) || fp.endsWith(summary)) {
      return true;
    }
  }
  return false;
}

function main() {
  const raw = readStdinSync();
  if (!raw) process.exit(0);
  process.stdout.write(raw);

  if (MODE === 'off') process.exit(0);

  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  // Loop guard: we already forced one intervention this stop cycle.
  if (payload.stop_hook_active) process.exit(0);

  const transcriptPath = payload.agent_transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) process.exit(0);

  const { editedFiles, readPatterns } = scanTranscript(transcriptPath);
  if (editedFiles.size === 0) process.exit(0);

  // Build violations: edited pattern-files whose governing pattern was unread.
  const violations = [];
  const seen = new Set();
  for (const file of editedFiles) {
    if (isExempt(file)) continue;
    const required = findRequiredPattern(file);
    if (!required) continue;                 // utility/config — no grounding needed
    if (patternWasRead(required, readPatterns)) continue;
    const key = file + '|' + required;
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push({ file, required });
  }

  if (violations.length === 0) process.exit(0);

  const isBlock = MODE !== 'warn';
  const verb = isBlock ? '🛑 BLOCKED' : '⚠️  WARN';
  const lines = violations.map(v =>
    `      • ${v.file}\n          needs: .claude/knowledge/patterns/${v.required}` +
    ` (or its _summary variant)`);
  const msg =
    `\n${verb}: PATTERN-GROUNDING — subagent edited pattern files WITHOUT reading their pattern.\n` +
    `    These files were likely written from training data, not project canon:\n` +
    lines.join('\n') + `\n\n` +
    `    Action before finishing:\n` +
    `      1. Read each pattern (the _summary Rule Card is enough), then\n` +
    `      2. reconcile the listed file(s) against every MUST / MUST NOT rule.\n\n` +
    `    Mode: ${MODE.toUpperCase()}` +
    (isBlock
      ? ` (hard gate — set PATTERN_READS_MODE=warn to soft-warn, =off to disable)\n`
      : ` (soft warning — set PATTERN_READS_MODE=block to enforce)\n`);

  process.stderr.write(msg);
  process.exit(isBlock ? 2 : 0);
}

main();
