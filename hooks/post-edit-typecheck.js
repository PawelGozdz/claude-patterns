#!/usr/bin/env node
/**
 * PostToolUse Hook: TypeScript check after editing .ts/.tsx files
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs after Edit tool use on TypeScript files. Walks up from the file's
 * directory to find the nearest tsconfig.json, then runs tsc --noEmit
 * and reports only errors related to the edited file.
 *
 * Two brakes on cost (K107, TASK-KAIZEN-002). The original version ran a full
 * `tsc --noEmit` over the WHOLE project on every single `.ts` edit — on a large
 * monorepo that is tens of seconds of CPU per one-line change, repeated for every
 * file an implementer touches in a row:
 *
 *   1. `--incremental` with a `.tsbuildinfo` under `.claude/run-state/`, so the
 *      second and later runs re-check only what actually changed. TypeScript
 *      before 5.6 refuses `--incremental` next to `--noEmit` (TS5074); the hook
 *      detects that, records it in the marker and stops paying for the retry.
 *   2. A per-directory cooldown (`TYPECHECK_COOLDOWN_MS`, default 120 s). Inside
 *      the window the hook is SILENT for that tsconfig root — editing six files of
 *      one feature triggers one typecheck, not six. State lives in
 *      `.claude/run-state/typecheck-<hash>.json` (gitignored), see
 *      `lib/typecheck-cooldown.js`.
 *
 * `TYPECHECK_MODE=off` disables the hook entirely. Findings are always advisory:
 * this hook passes stdin through and exits 0 no matter what happens.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { readStdinJsonWithRaw } = require("./lib/utils");
const cooldown = require("./lib/typecheck-cooldown");

/**
 * Runs tsc and returns its combined output ('' means clean).
 * `incremental: false` is the fallback for TypeScript < 5.6, which rejects
 * `--incremental` alongside `--noEmit`.
 */
function runTsc(projectDir, { incremental }) {
  const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
  // --no-install: never fetch TypeScript from the network mid-edit. A project without a
  // local tsc has no typecheck to run; downloading one behind the user's back would turn
  // a 200 ms hook into a multi-second stall on the first edit in every fresh checkout.
  const args = ["--no-install", "tsc", "--noEmit", "--pretty", "false"];
  if (incremental) {
    args.push("--incremental", "--tsBuildInfoFile", cooldown.buildInfoPath(projectDir));
  }
  try {
    execFileSync(npxBin, args, {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    });
    return "";
  } catch (err) {
    return (err.stdout || "") + (err.stderr || "");
  }
}

/** TS5074/TS5069: `--incremental` is not accepted next to `--noEmit` on this compiler. */
function rejectsIncremental(output) {
  return /TS5074|TS5069|cannot be specified with option '(?:noEmit|incremental)'/i.test(output);
}

async function main() {
  const { raw, parsed: input } = await readStdinJsonWithRaw();

  try {
    if (process.env.TYPECHECK_MODE === "off") {
      process.stdout.write(raw);
      process.exit(0);
    }

    const filePath = input.tool_input?.file_path;

    if (filePath && /\.(ts|tsx)$/.test(filePath)) {
      const resolvedPath = path.resolve(filePath);
      if (!fs.existsSync(resolvedPath)) {
        process.stdout.write(raw);
        process.exit(0);
      }
      // Find nearest tsconfig.json by walking up (max 20 levels to prevent infinite loop)
      let dir = path.dirname(resolvedPath);
      const root = path.parse(dir).root;
      let depth = 0;

      while (dir !== root && depth < 20) {
        if (fs.existsSync(path.join(dir, "tsconfig.json"))) {
          break;
        }
        dir = path.dirname(dir);
        depth++;
      }

      if (fs.existsSync(path.join(dir, "tsconfig.json")) && !cooldown.inCooldown(dir)) {
        const marker = cooldown.readMarker(dir);
        const wantIncremental = marker.incremental_supported !== false;
        let output = runTsc(dir, { incremental: wantIncremental });

        if (wantIncremental && rejectsIncremental(output)) {
          cooldown.writeMarker(dir, { incremental_supported: false });
          output = runTsc(dir, { incremental: false });
        }

        cooldown.markRun(dir);

        if (output) {
          // tsc exits non-zero when there are errors — filter to the edited file.
          // tsc output uses paths relative to its cwd (the tsconfig dir), so check
          // the relative path, the absolute path and the original path.
          // Avoid bare basename matching — it causes false positives when multiple
          // files share a name (e.g., src/utils.ts vs tests/utils.ts).
          const relPath = path.relative(dir, resolvedPath);
          const candidates = new Set([filePath, resolvedPath, relPath]);
          const relevantLines = output
            .split("\n")
            .filter((line) => {
              for (const candidate of candidates) {
                if (line.includes(candidate)) return true;
              }
              return false;
            })
            .slice(0, 10);

          if (relevantLines.length > 0) {
            console.error(
              "[Hook] TypeScript errors in " + path.basename(filePath) + ":",
            );
            relevantLines.forEach((line) => console.error(line));
          }
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
