#!/usr/bin/env node
/**
 * PostToolUse Hook: Detect GPU/async correctness bugs in ML inference code
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires python-hooks.json with a "gpu" section in the project
 * root or .claude/. No config, or gpu.enabled !== true = silent skip.
 *
 * Checks (all warn-only, never blocks):
 *
 *   GPU-1  Inference call inside `async def` without asyncio.to_thread /
 *          run_in_executor. One unwrapped call blocks the event loop for the
 *          whole forward pass — every concurrent request freezes.
 *
 *   GPU-2  torch.cuda.empty_cache() without a preceding gc.collect().
 *          empty_cache() only releases blocks with no live references, so
 *          without the collection the unload silently frees nothing.
 *
 *   GPU-3  asyncio.gather() over multiple *_async inference calls. The GPU
 *          serializes them anyway; the only effect is multiplied peak VRAM.
 *
 * Layer purity (torch imported in routers/) is handled by check-python-layers.js
 * via purity.noInfraImportLayers — not duplicated here.
 *
 * Always exits 0.
 */

const fs = require('fs');
const path = require('path');
const { findPythonConfig } = require('./lib/python-config');

const COMMENT_LINE = /^\s*#/;
const QUALIFIED_CALL = /([\w.]+)\.(\w+)\s*\($/;
const ASYNC_DEF = /^(\s*)async\s+def\s+(\w+)\s*\(/;
const SYNC_DEF = /^(\s*)def\s+(\w+)\s*\(/;
const OFFLOADED = /(to_thread|run_in_executor|ThreadPoolExecutor|ProcessPoolExecutor)/;
const GATHER = /asyncio\.gather\s*\(/;
const ASYNC_CALL = /\w+_async\s*\(/g;
const EMPTY_CACHE = /empty_cache\s*\(\s*\)/;
const GC_COLLECT = /gc\.collect\s*\(\s*\)/;

const DEFAULT_INFERENCE_CALLS = [
  'encode', 'predict', 'generate', 'transcribe',
  'translate', 'extract', 'classify', 'summarize',
];

const GC_LOOKBACK_LINES = 6;
const MAX_STDIN = 1024 * 1024;

let data = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) {
    data += chunk.substring(0, MAX_STDIN - data.length);
  }
});

process.stdin.on('end', () => {
  try {
    run();
  } catch {
    // Invalid input or unreadable file — pass through silently
  }
  process.stdout.write(data);
  process.exit(0);
});

function run() {
  const input = JSON.parse(data);
  const filePath = input.tool_input?.file_path;
  if (!filePath || !filePath.endsWith('.py')) return;

  const loaded = findPythonConfig(filePath);
  if (!loaded) return;

  const { config } = loaded;
  if (config.gpu?.enabled !== true) return;

  const skipPatterns = config.skipPatterns || ['test_', '_test.py', 'conftest.py', '__pycache__', '.venv'];
  const basename = path.basename(filePath);
  if (skipPatterns.some((p) => basename.startsWith(p) || basename.endsWith(p) || filePath.includes(p))) {
    return;
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return;

  const lines = fs.readFileSync(resolved, 'utf8').split('\n');
  const callNames = config.gpu.inferenceCallNames || DEFAULT_INFERENCE_CALLS;
  const inferenceCall = buildInferenceRegex(callNames);
  const ignoreQualified = new Set(config.gpu.ignoreQualified || []);

  checkBlockingCalls(lines, basename, inferenceCall, ignoreQualified);
  checkEmptyCacheWithoutGc(lines, basename);
  checkGatherOverAsyncCalls(lines, basename);
}

/** Build /\.(encode|predict|...)\s*\(/ from configured names. */
function buildInferenceRegex(names) {
  const escaped = names
    .filter((n) => n !== '__call__')
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return new RegExp(`\\.(${escaped})\\s*\\(`);
}

/**
 * GPU-1: inference call in an async function body, not offloaded to a thread.
 *
 * Tracks indentation to know whether we are inside `async def`. A nested plain
 * `def` at deeper indentation suspends the check — that body runs on a worker
 * thread and is allowed to block.
 */
function checkBlockingCalls(lines, basename, inferenceCall, ignoreQualified) {
  let asyncIndent = null;   // indent of the `async def` line we are inside
  let nestedSync = null;    // indent of a nested sync `def`, if any
  let offloadDepth = 0;     // >0 while inside a multi-line to_thread(...) call

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (COMMENT_LINE.test(line) || line.trim() === '') continue;

    // Inside a still-open to_thread(...) / run_in_executor(...) — everything
    // in here already runs on a worker thread, including nested lambdas.
    if (offloadDepth > 0) {
      offloadDepth += parenDelta(line);
      continue;
    }

    const indent = line.match(/^\s*/)[0].length;

    // Left the nested sync function?
    if (nestedSync !== null && indent <= nestedSync) nestedSync = null;
    // Left the async function?
    if (asyncIndent !== null && indent <= asyncIndent && !ASYNC_DEF.test(line)) {
      asyncIndent = null;
    }

    const asyncMatch = line.match(ASYNC_DEF);
    if (asyncMatch) {
      asyncIndent = asyncMatch[1].length;
      nestedSync = null;
      continue;
    }

    const syncMatch = line.match(SYNC_DEF);
    if (syncMatch && asyncIndent !== null && syncMatch[1].length > asyncIndent) {
      nestedSync = syncMatch[1].length;
      continue;
    }

    if (asyncIndent === null || nestedSync !== null) continue;

    if (OFFLOADED.test(line)) {
      // The offloaded call may span several lines: suppress until parens balance
      const delta = parenDelta(line);
      if (delta > 0) offloadDepth = delta;
      continue;
    }

    const hit = line.match(inferenceCall);
    if (!hit) continue;
    if (isStringMethodCall(line, hit)) continue;
    if (isIgnored(line, hit, ignoreQualified)) continue;

    console.error(
      `[Hook] GPU: Blocking "${hit[1]}()" at line ${i + 1} in ${basename} — ` +
      `inference inside async def freezes the event loop. Wrap with asyncio.to_thread().`,
    );
  }
}

/** Net open-paren count for a line, ignoring string literals and comments. */
function parenDelta(line) {
  const code = line
    .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/#.*$/, '');
  let delta = 0;
  for (const ch of code) {
    if (ch === '(' || ch === '[' || ch === '{') delta++;
    else if (ch === ')' || ch === ']' || ch === '}') delta--;
  }
  return delta;
}

/**
 * Skip calls the project declared cheap via gpu.ignoreQualified,
 * e.g. "ioc.extract" (pure regex) or "language.detect" (fasttext, CPU).
 * Matches on the receiver directly before the call: `ioc.extract(` → "ioc.extract".
 */
function isIgnored(line, hit, ignoreQualified) {
  if (ignoreQualified.size === 0) return false;
  const upToCall = line.slice(0, line.indexOf(hit[0]) + hit[0].length);
  const qualified = upToCall.match(QUALIFIED_CALL);
  if (!qualified) return false;
  const receiver = qualified[1].split('.').pop();
  return ignoreQualified.has(`${receiver}.${qualified[2]}`);
}

/** `text.encode("utf-8")` is a str method, not model inference. */
function isStringMethodCall(line, hit) {
  const after = line.slice(line.indexOf(hit[0]) + hit[0].length).trimStart();
  return after.startsWith('"') || after.startsWith("'");
}

/** GPU-2: empty_cache() with no gc.collect() in the preceding lines. */
function checkEmptyCacheWithoutGc(lines, basename) {
  for (let i = 0; i < lines.length; i++) {
    if (COMMENT_LINE.test(lines[i]) || !EMPTY_CACHE.test(lines[i])) continue;

    const from = Math.max(0, i - GC_LOOKBACK_LINES);
    const preceding = lines.slice(from, i).join('\n');
    if (GC_COLLECT.test(preceding)) continue;

    console.error(
      `[Hook] GPU: empty_cache() at line ${i + 1} in ${basename} without a preceding ` +
      `gc.collect() — CUDA cache clear only frees blocks with no live references, ` +
      `so VRAM is not actually released.`,
    );
  }
}

/** GPU-3: asyncio.gather() fanning out 2+ *_async inference calls. */
function checkGatherOverAsyncCalls(lines, basename) {
  for (let i = 0; i < lines.length; i++) {
    if (COMMENT_LINE.test(lines[i]) || !GATHER.test(lines[i])) continue;

    // gather() often spans lines — look at a small window
    const window = lines.slice(i, Math.min(lines.length, i + 6)).join('\n');
    const calls = window.match(ASYNC_CALL) || [];
    const distinct = new Set(calls.map((c) => c.replace(/\s*\($/, '')));

    if (distinct.size >= 2) {
      console.error(
        `[Hook] GPU: asyncio.gather() at line ${i + 1} in ${basename} fans out ` +
        `${distinct.size} inference calls (${[...distinct].join(', ')}) — the GPU ` +
        `serializes them anyway; this only multiplies peak VRAM. Run sequentially, ` +
        `or batch. (gather over *load* calls is fine — ignore if these are loaders.)`,
      );
    }
  }
}
