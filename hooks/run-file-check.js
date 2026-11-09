#!/usr/bin/env node
/**
 * PostToolUse Hook (matcher: Write|Edit|MultiEdit): per-file project check.
 *
 * After an agent writes a file that matches `globs`, run the project's own single-file check
 * (e.g. `pnpm lint:ddd:file {FILE}`, `dart analyze {FILE}`, `ruff check {FILE}`) and hand the
 * failure output back to the agent as PostToolUse `additionalContext`. The agent sees the problem
 * in the same turn instead of after the whole layer (the /orchestrate probe runs per layer).
 *
 * OPT-IN PER PROJECT — NOT registered in the global hooks.json. A project turns it on with the
 * `file-check` block (blocks/file-check.yml); `sync-runtime-hooks.mjs` wires it into settings.json.
 * Configuration comes from runtime.yml → params.file-check (project.yml → block_params.file-check):
 *   command          list of argv items, `{FILE}` is replaced by the absolute path of the written file
 *   globs            project-relative patterns the file must match (`*` stays in one directory, `**` crosses)
 *   exclude          patterns that win over `globs`
 *   timeout_s        hard limit for the command (default 30)
 *   max_output_lines failure output is cut to this many lines (default 40)
 *
 * Contract: ALWAYS exit 0 — never blocks the tool-use pipeline. Success is silent. The command runs
 * through execFile (no shell), so a path with spaces or metacharacters stays one argument. A missing
 * binary, a timeout or an unreadable runtime.yml means "skip silently": this hook must never turn
 * a half-installed clone into noise.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readStdinJsonWithRaw } = require('./lib/utils');

const DEFAULTS = { timeout_s: 30, max_output_lines: 40 };
const MAX_BUFFER = 4 * 1024 * 1024;

/** `**` crosses directories, `*` and `?` stay inside one path segment. */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

const matchesAny = (rel, globs) => globs.some((g) => globToRegExp(g).test(rel));

function findProjectDir(startDir) {
  let dir = startDir;
  const root = path.parse(dir).root;
  for (let depth = 0; dir !== root && depth < 25; depth++) {
    if (fs.existsSync(path.join(dir, '.claude', 'config', 'runtime.yml'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function loadParams(projectDir) {
  const YAML = require(path.join(__dirname, '..', 'node_modules', 'yaml'));
  const rt = YAML.parse(fs.readFileSync(path.join(projectDir, '.claude', 'config', 'runtime.yml'), 'utf8')) || {};
  const p = rt.params && rt.params['file-check'];
  if (!p || !Array.isArray(p.command) || p.command.length === 0) return null;
  if (!Array.isArray(p.globs) || p.globs.length === 0) return null;
  return {
    command: p.command.map(String),
    globs: p.globs.map(String),
    exclude: Array.isArray(p.exclude) ? p.exclude.map(String) : [],
    timeout_s: Number(p.timeout_s) > 0 ? Number(p.timeout_s) : DEFAULTS.timeout_s,
    max_output_lines: Number(p.max_output_lines) > 0 ? Number(p.max_output_lines) : DEFAULTS.max_output_lines,
  };
}

function buildArgv(command, filePath) {
  const hasPlaceholder = command.some((a) => a.includes('{FILE}'));
  const argv = command.map((a) => a.split('{FILE}').join(filePath));
  if (!hasPlaceholder) argv.push(filePath);
  return argv;
}

/** Returns { ok: true } or { ok: false, output } — null when the check could not run at all. */
function runCheck(projectDir, params, filePath) {
  const [bin, ...args] = buildArgv(params.command, filePath);
  try {
    execFileSync(bin, args, {
      cwd: projectDir,
      timeout: params.timeout_s * 1000,
      maxBuffer: MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return { ok: true };
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ETIMEDOUT' || err.signal) return null;
    if (typeof err.status !== 'number') return null;
    return { ok: false, output: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

// Szum opakowania, nie wynik kontroli: echo skryptu pnpm/npm (`> pkg@1.0.0 lint:ddd:file /ścieżka`),
// ELIFECYCLE/ERR_PNPM_* po niezerowym kodzie oraz ostrzeżenia Node/ESLint o samej konfiguracji.
const NOISE = [
  /ESLintIgnoreWarning|--trace-warnings/,
  /^>\s+\S+@\S+\s/,
  /ELIFECYCLE|ERR_PNPM_|Command failed with exit code|npm error|npm ERR!/,
];

function trimOutput(output, maxLines) {
  const lines = output
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '' && !NOISE.some((re) => re.test(l)));
  if (lines.length <= maxLines) return lines.join('\n');
  return `${lines.slice(0, maxLines).join('\n')}\n… (+${lines.length - maxLines} linii, uruchom komendę ręcznie)`;
}

async function main() {
  const { raw, parsed: input } = await readStdinJsonWithRaw();
  const finish = () => {
    process.stdout.write(raw);
    process.exit(0);
  };

  try {
    const filePath = input && input.tool_input && input.tool_input.file_path;
    if (!filePath) return finish();

    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) return finish();

    const projectDir = findProjectDir(path.dirname(absPath));
    if (!projectDir) return finish();

    const params = loadParams(projectDir);
    if (!params) return finish();

    const rel = path.relative(projectDir, absPath).split(path.sep).join('/');
    if (rel.startsWith('..') || !matchesAny(rel, params.globs) || matchesAny(rel, params.exclude)) return finish();

    const result = runCheck(projectDir, params, absPath);
    if (!result || result.ok) return finish();

    const body = trimOutput(result.output, params.max_output_lines);
    const additionalContext =
      `[Hook] file-check nie przeszedł dla ${rel} — popraw przed zakończeniem pracy:\n` +
      `$ ${buildArgv(params.command, rel).join(' ')}\n${body || '(komenda zakończyła się kodem ≠ 0 bez treści)'}`;
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } }));
    process.exit(0);
  } catch {
    finish();
  }
}

main();
