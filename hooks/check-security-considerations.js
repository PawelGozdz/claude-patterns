#!/usr/bin/env node

/**
 * PostToolUse Hook: Check task files for ## Security Considerations section
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Triggers when a task file (project-orchestration/tasks/*.md or tasks/*.md)
 * is written or edited. Warns if the file is missing the ## Security Considerations
 * section or if the section exists but is empty.
 *
 * This is a warning-only hook — it never blocks the tool call.
 */

const { readStdinJson, readFile, log } = require('../lib/utils');

const TASK_FILE_PATTERNS = [
  /project-orchestration[/\\]tasks[/\\][^/\\]+\.md$/,
  /(?:^|[/\\])tasks[/\\][^/\\]+\.md$/,
];

function isTaskFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  return TASK_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check whether the file content has a ## Security Considerations section
 * and whether it contains meaningful content (not just the heading).
 *
 * Returns:
 *   'missing'  — section heading not found
 *   'empty'    — section heading found but no content before next ## heading
 *   'ok'       — section found and has content
 */
function checkSecurityConsiderations(content) {
  const lines = content.split('\n');
  const sectionIndex = lines.findIndex(line =>
    /^##\s+Security Considerations\s*$/i.test(line.trim())
  );

  if (sectionIndex === -1) {
    return 'missing';
  }

  // Look for non-empty, non-heading lines between this section and the next ## heading
  for (let i = sectionIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();

    // Stop at next ## heading
    if (/^##\s/.test(line)) {
      break;
    }

    // Found a non-empty, non-comment line — section has content
    if (line.length > 0 && !line.startsWith('<!--')) {
      return 'ok';
    }
  }

  return 'empty';
}

async function main() {
  const input = await readStdinJson();

  try {
    // The hook receives the tool call result; the file path is in tool_input.file_path
    // for Write calls, or tool_input.file_path for Edit calls.
    const toolInput = input.tool_input || {};
    const filePath = toolInput.file_path || toolInput.path || '';

    if (!isTaskFile(filePath)) {
      process.exit(0);
    }

    const content = readFile(filePath);
    if (!content) {
      // File unreadable — do not warn, just exit
      process.exit(0);
    }

    const result = checkSecurityConsiderations(content);

    if (result === 'missing') {
      log(
        '[Security] Task file missing ## Security Considerations section. ' +
        'Add it before implementation. See docs/security/SECURITY_STRATEGY.md'
      );
    } else if (result === 'empty') {
      log(
        '[Security] ## Security Considerations section is empty. ' +
        'Fill it in before implementation.'
      );
    }
    // 'ok' — silent
  } catch (err) {
    log(`[Security] check-security-considerations error: ${err.message}`);
  }

  process.exit(0);
}

main();
