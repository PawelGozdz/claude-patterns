#!/usr/bin/env node

/**
 * PostToolUse Hook: Check task files for ## Security Considerations section
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Triggers when a task file (project-orchestration/tasks/*.md or tasks/*.md)
 * is written or edited. Reports if the file is missing the ## Security
 * Considerations section, if the section is empty, or if it contains only
 * placeholder text (TODO, FIXME, XXX, tbd, "fill in", etc.).
 *
 * Modes (controlled by env var CHECK_SECURITY_MODE):
 *   warn  (default) — print warning to stderr, exit 0 (does not block)
 *   block           — print warning, exit 2 (Claude Code surfaces as block)
 *   off             — silent, exit 0
 *
 * On non-OK status, the hook suggests running /threat-model to populate
 * the section systematically (rather than ad-hoc filling).
 */

const { readStdinJson, readFile, log } = require('./lib/utils');

const MODE = (process.env.CHECK_SECURITY_MODE || 'warn').toLowerCase();
const LOOKBACK_LINES = 50;

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
  return TASK_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Inspect ## Security Considerations section.
 *
 * Returns:
 *   { status: 'missing' }
 *   { status: 'empty' }
 *   { status: 'placeholder', triggered: ['TODO', ...] }
 *   { status: 'ok' }
 */
function inspectSecuritySection(content) {
  const lines = content.split('\n');
  const sectionIndex = lines.findIndex(line =>
    /^##\s+Security Considerations\s*$/i.test(line.trim())
  );

  if (sectionIndex === -1) {
    return { status: 'missing' };
  }

  // Collect content lines until next ## heading
  const contentLines = [];
  for (let i = sectionIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line.trim())) break;
    contentLines.push(line);
  }

  // Filter out empty lines and HTML comments
  const meaningful = contentLines.filter(line => {
    const t = line.trim();
    return t.length > 0 && !t.startsWith('<!--');
  });

  if (meaningful.length === 0) {
    return { status: 'empty' };
  }

  // Check for placeholder patterns in collected content
  const sectionText = meaningful.join('\n');
  const triggered = [];
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const m = sectionText.match(pattern);
    if (m) {
      triggered.push(m[0]);
    }
  }

  if (triggered.length > 0) {
    return { status: 'placeholder', triggered };
  }

  return { status: 'ok' };
}

function buildMessage(filePath, result) {
  const isBlock = MODE === 'block';
  const verb = isBlock ? '🛑 BLOCKED' : '⚠️  WARN';

  let body;
  switch (result.status) {
    case 'missing':
      body =
        `Task file lacks ## Security Considerations section.\n` +
        `    File: ${filePath}\n\n` +
        `    Action: Add the section, then run /threat-model to populate it:\n` +
        `      ## Security Considerations\n` +
        `      <!-- Run /threat-model for systematic STRIDE-based analysis -->\n\n` +
        `    Or fill in manually following templates/THREAT_MODEL_TEMPLATE.md`;
      break;
    case 'empty':
      body =
        `## Security Considerations section exists but is empty.\n` +
        `    File: ${filePath}\n\n` +
        `    Action: Run /threat-model to populate it systematically,\n` +
        `    or fill in manually using STRIDE categories.\n` +
        `    Template: templates/THREAT_MODEL_TEMPLATE.md`;
      break;
    case 'placeholder':
      body =
        `## Security Considerations contains placeholder text: ${result.triggered.join(', ')}\n` +
        `    File: ${filePath}\n\n` +
        `    Placeholder content (TODO/FIXME/TBD/etc.) is not a security analysis.\n` +
        `    Action: Run /threat-model to replace placeholders with actual\n` +
        `    threat assessment, OR remove placeholder text and write the analysis manually.`;
      break;
    default:
      return '';
  }

  return (
    `\n${verb}: SECURITY-CONSIDERATIONS check\n` +
    `    ${body}\n\n` +
    `    Mode: ${MODE.toUpperCase()}` +
    (isBlock
      ? ` (hard gate — set CHECK_SECURITY_MODE=warn to soft-warn, or =off to disable)\n`
      : ` (soft warning — set CHECK_SECURITY_MODE=block to enforce)\n`)
  );
}

async function main() {
  if (MODE === 'off') {
    process.exit(0);
  }

  const input = await readStdinJson();

  try {
    const toolInput = input.tool_input || {};
    const filePath = toolInput.file_path || toolInput.path || '';

    if (!isTaskFile(filePath)) {
      process.exit(0);
    }

    const content = readFile(filePath);
    if (!content) {
      process.exit(0);
    }

    const result = inspectSecuritySection(content);
    if (result.status === 'ok') {
      process.exit(0);
    }

    const msg = buildMessage(filePath, result);
    process.stderr.write(msg);

    const isBlock = MODE === 'block';
    process.exit(isBlock ? 2 : 0);
  } catch (err) {
    log(`[Security] check-security-considerations error: ${err.message}`);
    process.exit(0);
  }
}

main();
