#!/usr/bin/env node

/**
 * PostToolUse Hook: Security-aware task file analysis
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Two triggers in one hook:
 *
 * Trigger 1 — Task creation/edit (always):
 *   Suggests checklists and /threat-model when task labels/title indicate
 *   security-relevant work (auth, pii, cross-context, b2g, etc.).
 *
 * Trigger 2 — Status changed to in-progress (conditional block):
 *   When task is security-relevant AND Security Pre-Analysis section is
 *   missing/empty/placeholder, exits 2 (BLOCK) regardless of MODE.
 *   Non-security tasks fall back to MODE-controlled warn/block.
 *
 * Modes (env var CHECK_SECURITY_MODE):
 *   warn  (default) — print to stderr, exit 0 (does not block non-security tasks)
 *   block           — exit 2 even for non-security mismatches
 *   off             — silent, exit 0
 *
 * Opt-out marker: file containing `# security: skip` makes the hook exit 0.
 */

const fs = require('fs');
const path = require('path');
const { readStdinJson, readFile, log } = require('./lib/utils');

const MODE = (process.env.CHECK_SECURITY_MODE || 'warn').toLowerCase();

const TASK_FILE_PATTERNS = [
  /project-orchestration[/\\]tasks[/\\][^/\\]+\.md$/,
  /(?:^|[/\\])tasks[/\\][^/\\]+\.md$/,
];

const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /\bXXX\b/,
  /\bTBD\b/i,
  /\bN\/A\b/i,
  /\bplaceholder\b/i,
  /\bfill\s+(this\s+)?in\b/i,
  /\bto\s+be\s+(determined|defined|filled)\b/i,
  /\b\?\?\?+\b/,
];

function isTaskFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  return TASK_FILE_PATTERNS.some(p => p.test(filePath));
}

// --- Frontmatter parsing (subset of YAML for our needs) ---
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const result = {};
  const fmText = match[1];
  const lines = fmText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^(\w[\w_-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();

    // Strip surrounding quotes
    if ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }

    // Inline array: labels: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      result[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      continue;
    }

    // Multi-line YAML array (next lines start with "  - ")
    if (value === '' && i + 1 < lines.length && /^\s*-\s/.test(lines[i + 1])) {
      const arr = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s/.test(lines[j])) {
        arr.push(lines[j].replace(/^\s*-\s*/, '').trim().replace(/^['"]|['"]$/g, ''));
        j++;
      }
      result[key] = arr;
      i = j - 1;
      continue;
    }

    result[key] = value;
  }
  return result;
}

// --- Mini YAML parser for canonical-labels.yml (security_groups section) ---
function loadCanonicalLabels() {
  try {
    const realDir = fs.realpathSync(__dirname);
    const yamlPath = path.join(realDir, '..', 'templates', 'canonical-labels.yml');
    if (!fs.existsSync(yamlPath)) return null;
    const text = fs.readFileSync(yamlPath, 'utf8');

    const groups = {};
    const lines = text.split('\n');
    let inSection = false;
    let currentGroup = null;

    for (const line of lines) {
      // Enter security_groups: section
      if (/^security_groups:/.test(line)) {
        inSection = true;
        continue;
      }
      // Leaving (top-level key starts at column 0, not a comment)
      if (inSection && /^[a-z_]+:/.test(line) && !/^\s/.test(line) && !/^security_groups:/.test(line)) {
        inSection = false;
      }
      if (!inSection) continue;

      // Group: "  <name>:"
      const gm = line.match(/^  (\w+):\s*$/);
      if (gm) {
        currentGroup = gm[1];
        groups[currentGroup] = { aliases: [], checklist: '' };
        continue;
      }

      if (currentGroup) {
        const am = line.match(/^    aliases:\s*\[([^\]]+)\]/);
        if (am) {
          groups[currentGroup].aliases = am[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
        }
        const cm = line.match(/^    checklist:\s*(.+?)$/);
        if (cm) groups[currentGroup].checklist = cm[1].trim();
      }
    }
    return groups;
  } catch (err) {
    return null;
  }
}

// --- Match labels + title against canonical groups ---
function matchSecurityGroups(taskLabels, taskTitle, groups) {
  const matched = [];
  const titleLower = String(taskTitle || '').toLowerCase();
  const labels = (Array.isArray(taskLabels) ? taskLabels : []).map(l => String(l).toLowerCase());

  for (const [name, group] of Object.entries(groups)) {
    for (const alias of group.aliases) {
      // 1. Direct label match
      if (labels.includes(alias)) { matched.push({ name, checklist: group.checklist, via: `label:${alias}` }); break; }
      // 2. Substring match in labels
      if (labels.some(l => l.includes(alias))) { matched.push({ name, checklist: group.checklist, via: `label-contains:${alias}` }); break; }
      // 3. Title keyword match
      if (titleLower.includes(alias)) { matched.push({ name, checklist: group.checklist, via: `title:${alias}` }); break; }
    }
  }
  return matched;
}

// --- Compute level (minimal | standard | full) ---
// Heuristics encoded inline (mirror canonical-labels.yml level_detection).
// If user adds # security-level: <level> as first content line, override applies.
const FORCE_FULL_GROUPS = ['cross_context', 'b2g', 'new_context'];
const FULL_TITLE_KEYWORDS = ['payment', 'financial', 'sso', 'eidas', 'ksc', 'civic', 'sensitive'];
const FORCE_MINIMAL_LABELS = ['typo', 'docs-only', 'copy-only', 'fix-typo', 'doc-update', 'comment'];

function detectManualLevel(content) {
  const m = content.match(/^#\s*security-level:\s*(minimal|standard|full)\s*$/im);
  return m ? m[1].toLowerCase() : null;
}

function computeLevel(taskLabels, taskTitle, matchedGroups) {
  const labels = (Array.isArray(taskLabels) ? taskLabels : []).map(l => String(l).toLowerCase());
  const title = String(taskTitle || '').toLowerCase();

  // Force-minimal labels override even matched groups (typo task with `auth` keyword in title)
  if (labels.some(l => FORCE_MINIMAL_LABELS.includes(l))) return 'minimal';

  // No security match → minimal
  if (matchedGroups.length === 0) return 'minimal';

  // Force-full conditions
  if (matchedGroups.some(g => FORCE_FULL_GROUPS.includes(g.name))) return 'full';
  if (FULL_TITLE_KEYWORDS.some(kw => title.includes(kw))) return 'full';
  if (matchedGroups.length >= 2) return 'full';

  // Single matched group from auth/pii/public_api/accessibility → standard
  return 'standard';
}

// --- Inspect security pre-analysis section ---
// Looks for either "## 🔒 Security Pre-Analysis" (new) or "## Security Considerations" (legacy)
function inspectSecuritySection(content) {
  const lines = content.split('\n');
  const sectionIndex = lines.findIndex(line => {
    const t = line.trim();
    return /^##\s+(?:🔒\s+)?Security\s+(Pre-Analysis|Considerations)\s*$/i.test(t);
  });

  if (sectionIndex === -1) return { status: 'missing' };

  const contentLines = [];
  for (let i = sectionIndex + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i].trim())) break;
    contentLines.push(lines[i]);
  }

  const meaningful = contentLines.filter(l => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('<!--');
  });

  if (meaningful.length === 0) return { status: 'empty' };

  const sectionText = meaningful.join('\n');

  // Also accept the section as "completed" if it has positive markers
  const hasThreatModelRef = /TM-[A-Z][A-Z0-9-]+\.md/.test(sectionText) || /\[x\]\s+\/?\s*threat-model/i.test(sectionText);
  const hasFilledTable = /\|\s+(yes|no|n\/a|tak|nie)\s+\|/i.test(sectionText);
  const hasFilledFields = /(?:lawful basis|PII categories|rate limit tier).*?:.*?\S{3,}/im.test(sectionText);

  const triggered = [];
  for (const p of PLACEHOLDER_PATTERNS) {
    const m = sectionText.match(p);
    if (m && !hasThreatModelRef && !hasFilledTable && !hasFilledFields) triggered.push(m[0]);
  }
  if (triggered.length > 0) return { status: 'placeholder', triggered };

  return { status: 'ok' };
}

// --- Build messages ---
function suggestMessage(filePath, matched, level) {
  const checklists = matched.map(m => `      - ${m.checklist}  (matched ${m.via})`).join('\n');
  const groups = matched.map(m => m.name).join(', ');
  const action = level === 'full'
    ? '/threat-model {TASK-ID}  (full Feature TM file in docs/security/threat-models/)'
    : '/threat-model {TASK-ID} --embedded  (embedded section in task file, no separate TM file)';
  return (
    `\n💡 [security-suggest] Task is security-relevant — Level ${level.toUpperCase()}\n` +
    `    File: ${filePath}\n` +
    `    Matched groups: ${groups || '(none — title keyword match)'}\n` +
    `    Recommended checklists:\n${checklists}\n` +
    `    Suggested action: ${action}\n` +
    `    (Hook will block status: in-progress until Security Pre-Analysis is filled.)\n`
  );
}

function blockMessage(filePath, matched, preStatus, level) {
  const groups = matched.map(m => m.name).join(', ');
  const reason = {
    missing: 'Security Pre-Analysis section is missing.',
    empty: 'Security Pre-Analysis section is empty.',
    placeholder: `Security Pre-Analysis contains placeholder text: ${(preStatus.triggered || []).join(', ')}.`,
  }[preStatus.status] || 'Security Pre-Analysis is incomplete.';

  const guide = level === 'full'
    ? 'task-security-first.md (full template — Feature TM in docs/security/threat-models/)'
    : 'task-standard.md (standard template — embedded section in task file)';

  return (
    `\n🛑 BLOCKED: cannot move security-relevant task (Level ${level.toUpperCase()}) to in-progress\n` +
    `    File: ${filePath}\n` +
    `    Matched security groups: ${groups || '(title keyword)'}\n` +
    `    Reason: ${reason}\n\n` +
    `    Action:\n` +
    `      1. Run /threat-model {TASK-ID}${level === 'standard' ? ' --embedded' : ''} to populate the section, OR\n` +
    `      2. Fill ## 🔒 Security Pre-Analysis manually using\n` +
    `         claude-patterns/templates/${guide}\n\n` +
    `    Override (only if intentional):\n` +
    `      Add line "# security: skip" at top of task file (rare, document why)\n` +
    `      Or "# security-level: minimal" to downgrade level\n`
  );
}

function genericWarn(filePath, preStatus) {
  const reason = {
    missing: 'Security Considerations section is missing.',
    empty: 'Security Considerations section is empty.',
    placeholder: `Section contains placeholder text: ${(preStatus.triggered || []).join(', ')}.`,
  }[preStatus.status] || '';
  return (
    `\n⚠️  [security] ${reason}\n` +
    `    File: ${filePath}\n` +
    `    Consider adding ## 🔒 Security Pre-Analysis (see task-security-first template).\n`
  );
}

// --- Main ---
async function main() {
  if (MODE === 'off') process.exit(0);

  const input = await readStdinJson();

  try {
    const toolInput = input.tool_input || {};
    const filePath = toolInput.file_path || toolInput.path || '';
    if (!isTaskFile(filePath)) process.exit(0);

    const content = readFile(filePath);
    if (!content) process.exit(0);

    // Opt-out marker
    if (/^#\s*security:\s*skip\b/im.test(content)) process.exit(0);

    const fm = parseFrontmatter(content) || {};
    const taskLabels = fm.labels || [];
    const taskTitle = fm.title || '';
    const taskStatus = String(fm.status || '').toLowerCase();

    const groups = loadCanonicalLabels() || {};
    const matched = matchSecurityGroups(taskLabels, taskTitle, groups);

    // Compute level: manual override > auto-detect
    const manualLevel = detectManualLevel(content);
    const level = manualLevel || computeLevel(taskLabels, taskTitle, matched);
    const securityRelevant = level !== 'minimal';

    const preStatus = inspectSecuritySection(content);

    // Trigger 2: hard conditional block — security-relevant + in-progress + pre-analysis incomplete
    if (taskStatus === 'in-progress' && securityRelevant && preStatus.status !== 'ok') {
      process.stderr.write(blockMessage(filePath, matched, preStatus, level));
      process.exit(2);
    }

    // Trigger 1: suggestion when security-relevant (regardless of section state)
    //   - If pre-analysis OK: no message (security work is documented)
    //   - If pre-analysis missing/empty/placeholder: suggest checklists + threat-model
    if (securityRelevant && preStatus.status !== 'ok') {
      process.stderr.write(suggestMessage(filePath, matched, level));
      // Also fall through to a soft warning unless block mode
      process.exit(MODE === 'block' ? 2 : 0);
    }

    // Non-security task with incomplete section: existing legacy warn behaviour
    if (!securityRelevant && preStatus.status !== 'ok') {
      // Don't bother for tasks without ## Security Considerations at all if they're clearly non-security
      // (typo fix, docs-only). Only warn if section EXISTS but is empty/placeholder.
      if (preStatus.status === 'missing') process.exit(0);
      process.stderr.write(genericWarn(filePath, preStatus));
      process.exit(MODE === 'block' ? 2 : 0);
    }

    process.exit(0);
  } catch (err) {
    log(`[Security] check-security-considerations error: ${err.message}`);
    process.exit(0);
  }
}

main();
