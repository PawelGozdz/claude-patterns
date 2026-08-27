#!/usr/bin/env node
/**
 * PostToolUse Hook: Detect inline TextStyle(fontSize:...) and EdgeInsets.*() literals
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires flutter-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-Flutter projects).
 *
 * Checks:
 * - TextStyle(...fontSize...) — should use AppTypography.* tokens instead
 * - EdgeInsets.*() with a bare numeric literal — should use LocalHeroDesignTokens.space* instead
 *
 * Detection: simple per-line regexes, deliberately not a full AST parser — false
 * negatives are acceptable, false positives are not (see design-system.md).
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const fs = require('fs');
const path = require('path');
const { findFlutterConfig, matchesPattern } = require('./lib/flutter-config');
const { readStdinJsonWithRaw } = require('./lib/utils');

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;
const TEXT_STYLE_START = /TextStyle\(/;
const FONT_SIZE_PARAM = /\bfontSize\s*:/;
const EDGE_INSETS_CALL = /EdgeInsets\.\w+\(/g;
// A bare numeric literal used as an arg value: right after "(", ",", ":" or
// "?" (covers positional args, named args, and elderMode ternaries) — but
// NOT after an identifier/dot (e.g. "LocalHeroDesignTokens.space16").
const BARE_NUMERIC_ARG = /(^|[(,:?]\s*)\d/;
const MAX_LOOKAHEAD = 15;

async function main() {
  const { raw, parsed: input } = await readStdinJsonWithRaw();

  try {
    const filePath = input.tool_input?.file_path;

    if (!filePath || !filePath.endsWith('.dart')) {
      process.stdout.write(raw);
      process.exit(0);
    }

    // Load project config — no config means no checks
    const loaded = findFlutterConfig(filePath);
    if (!loaded) {
      process.stdout.write(raw);
      process.exit(0);
    }

    const { config } = loaded;

    // Check if token checks are enabled
    const tokensConfig = config.tokens?.checkInlineStyles;
    if (!tokensConfig?.enabled) {
      process.stdout.write(raw);
      process.exit(0);
    }

    // Skip generated/test files
    const skipPatterns = config.skipPatterns || ['_test.dart', '.g.dart', '.freezed.dart', '.mock.dart'];
    if (skipPatterns.some((pat) => filePath.endsWith(pat))) {
      process.stdout.write(raw);
      process.exit(0);
    }

    // Check if file matches configured patterns
    const normalized = filePath.replace(/\\/g, '/');
    const filePatterns = tokensConfig.filePatterns || ['**/presentation/**/*.dart'];
    const matchesFile = filePatterns.some((pat) => matchesPattern(normalized, pat));

    if (!matchesFile) {
      process.stdout.write(raw);
      process.exit(0);
    }

    // Read the file
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      process.stdout.write(raw);
      process.exit(0);
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    const lines = content.split('\n');
    const basename = path.basename(filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_LINE.test(line)) continue;

      // TextStyle(...) may span multiple lines — scan a bounded lookahead
      // window from the opening paren for a fontSize: parameter.
      if (TEXT_STYLE_START.test(line)) {
        const startCol = line.search(TEXT_STYLE_START);
        const block = collectParenBlock(lines, i, startCol + 'TextStyle('.length - 1, MAX_LOOKAHEAD);
        if (FONT_SIZE_PARAM.test(block)) {
          console.error(
            `[Hook] Flutter: TextStyle(fontSize:...) at line ${i + 1} in ${basename} — use AppTypography.* instead (see .claude/rules/dart/design-system.md)`,
          );
        }
      }

      // EdgeInsets.*(...) may also span multiple lines (named args, one per
      // line) — same bounded lookahead approach as TextStyle above.
      let match;
      EDGE_INSETS_CALL.lastIndex = 0;
      while ((match = EDGE_INSETS_CALL.exec(line)) !== null) {
        const openCol = match.index + match[0].length - 1;
        const block = collectParenBlock(lines, i, openCol, MAX_LOOKAHEAD);
        if (BARE_NUMERIC_ARG.test(block)) {
          console.error(
            `[Hook] Flutter: EdgeInsets literal at line ${i + 1} in ${basename} — use LocalHeroDesignTokens.space* instead (see .claude/rules/dart/design-system.md)`,
          );
          break;
        }
      }
    }
  } catch {
    // Invalid input — pass through
  }

  process.stdout.write(raw);
  process.exit(0);
}

main();

// Collect the text between an opening paren at (lines[startLine], openCol)
// and its matching closing paren, across at most maxLines lines. Bounded
// lookahead — not a full parser, deliberately simple.
function collectParenBlock(lines, startLine, openCol, maxLines) {
  let depth = 1;
  let text = '';
  for (let li = startLine; li < Math.min(lines.length, startLine + maxLines); li++) {
    const line = lines[li];
    const from = li === startLine ? openCol + 1 : 0;
    for (let i = from; i < line.length; i++) {
      const ch = line[i];
      if (ch === '(') depth++;
      if (ch === ')') {
        depth--;
        if (depth === 0) return text;
      }
      text += ch;
    }
    text += '\n';
  }
  return text;
}
