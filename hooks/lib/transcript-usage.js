/**
 * transcript-usage.js — token usage + model, read from a Claude Code transcript.
 *
 * Single source of truth (K77). Two consumers, two module systems:
 *   - hooks/subagent-stop-cost-log.js      (CJS, SubagentStop payload has no `usage`/`model`)
 *   - scripts/workflow-metrics-lib.mjs     (ESM, re-exports via createRequire)
 *
 * Why this exists: the SubagentStop payload carries `agent_transcript_path` but
 * neither `usage` nor `model` (verified against ~/.claude/logs/agent-usage-debug.jsonl).
 * The transcript itself is the only place where both live.
 *
 * Transcript shape: JSONL, one object per line. Assistant lines carry
 * `message.id`, `message.model` and `message.usage`. Streaming means one
 * `message.id` appears on SEVERAL lines with a growing `usage` — the LAST line
 * per id is the authoritative one, summing all of them would multiply the cost.
 *
 * Reading is chunked (not readFileSync) because subagent transcripts routinely
 * reach several MB and this runs inside a hook on the hot path. MAX_BYTES caps
 * the work; when a transcript is larger than the cap we read the FIRST
 * MAX_BYTES and report `truncated: true` so the caller can tell "no data" from
 * "partial data" instead of silently under-reporting.
 */

const fs = require('fs');

// 32 MB — comfortably above the largest transcripts observed (~1 MB) while
// still bounding a pathological file. Override with KR_TRANSCRIPT_MAX_BYTES.
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;

function maxBytes() {
  const n = Number(process.env.KR_TRANSCRIPT_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

/**
 * Read a JSONL file line by line without materializing it in memory.
 * Calls `onLine(str)` for each complete line. Returns { truncated }.
 */
function forEachJsonlLine(file, onLine) {
  const limit = maxBytes();
  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return { truncated: false, ok: false };
  }
  try {
    const buf = Buffer.allocUnsafe(CHUNK_BYTES);
    let carry = '';
    let read = 0;
    let truncated = false;
    for (;;) {
      const want = Math.min(CHUNK_BYTES, limit - read);
      if (want <= 0) {
        // Hit the cap — is there anything left?
        const probe = fs.readSync(fd, buf, 0, 1, null);
        if (probe > 0) truncated = true;
        break;
      }
      const n = fs.readSync(fd, buf, 0, want, null);
      if (n === 0) break;
      read += n;
      const text = carry + buf.toString('utf8', 0, n);
      const parts = text.split('\n');
      carry = parts.pop(); // last element is an incomplete line (or '')
      for (const p of parts) {
        if (p.trim()) onLine(p);
      }
    }
    if (carry.trim()) onLine(carry);
    return { truncated, ok: true };
  } catch {
    return { truncated: false, ok: false };
  } finally {
    try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

/**
 * Sum the 4 usage counters of a transcript.
 * @returns {{inputTokens,outputTokens,cacheWriteTokens,cacheReadTokens}|null}
 *          null when the file is missing/unreadable or carries no usage at all.
 */
function sumTranscriptUsage(transcriptPath) {
  return readTranscriptUsage(transcriptPath).usage;
}

/**
 * Model id used by the assistant turns of a transcript (`message.model`).
 * The last non-empty value wins — a transcript can switch models mid-run and
 * the final one is what the caller is being billed against for the tail.
 * @returns {string|null}
 */
function modelFromTranscript(transcriptPath) {
  return readTranscriptUsage(transcriptPath).model;
}

/**
 * One pass, all answers.
 *   toolCalls — distinct `tool_use` blocks (streaming repeats a block on several lines).
 *   apiError  — the `error` code of the LAST assistant line when Claude Code wrote it as an
 *               API-error message (`isApiErrorMessage`, e.g. 'rate_limit'), else null. Such a
 *               line carries text ("You've hit your weekly limit"), so "the agent returned
 *               something" is not proof that it did its work.
 *   firstTs / lastTs — earliest and latest line `timestamp` (epoch ms) or null: the wall-clock span of
 *               the agent, independent of when any hook happened to run.
 * @returns {{usage: object|null, model: string|null, truncated: boolean,
 *            toolCalls: number, apiError: string|null, firstTs: number|null, lastTs: number|null}}
 */
function readTranscriptUsage(transcriptPath) {
  const empty = { usage: null, model: null, truncated: false, toolCalls: 0, apiError: null, firstTs: null, lastTs: null };
  if (!transcriptPath) return empty;
  let stat;
  try {
    stat = fs.statSync(transcriptPath);
  } catch {
    return empty;
  }
  if (!stat.isFile()) return empty;

  const lastById = new Map();
  const toolUseIds = new Set();
  let model = null;
  let apiError = null;
  let firstTs = null;
  let lastTs = null;

  const { truncated, ok } = forEachJsonlLine(transcriptPath, (line) => {
    let o;
    try { o = JSON.parse(line); } catch { return; }
    const ts = o && o.timestamp ? Date.parse(o.timestamp) : NaN;
    if (Number.isFinite(ts)) {
      if (firstTs === null || ts < firstTs) firstTs = ts;
      if (lastTs === null || ts > lastTs) lastTs = ts;
    }
    const m = o && o.message;
    if (!m) return;
    if (o.type === 'assistant') apiError = o.isApiErrorMessage ? String(o.error || 'unknown') : null;
    // '<synthetic>' marks lines Claude Code wrote itself (API errors), not a model that was billed.
    if (typeof m.model === 'string' && m.model && m.model !== '<synthetic>') model = m.model;
    if (Array.isArray(m.content)) {
      for (const b of m.content) if (b && b.type === 'tool_use' && b.id) toolUseIds.add(b.id);
    }
    const u = m.usage;
    if (!u || !m.id || typeof u.output_tokens !== 'number') return;
    lastById.set(m.id, u);
  });
  if (!ok) return empty;
  const toolCalls = toolUseIds.size;
  if (lastById.size === 0) return { usage: null, model, truncated, toolCalls, apiError, firstTs, lastTs };

  const sums = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
  for (const u of lastById.values()) {
    sums.inputTokens += u.input_tokens || 0;
    sums.outputTokens += u.output_tokens || 0;
    sums.cacheWriteTokens += u.cache_creation_input_tokens || 0;
    sums.cacheReadTokens += u.cache_read_input_tokens || 0;
  }
  return { usage: sums, model, truncated, toolCalls, apiError, firstTs, lastTs };
}

/** Same numbers, snake_case — the shape `estimateCost()` in the cost hook expects. */
function toSnakeCaseUsage(sums) {
  if (!sums) return null;
  return {
    input_tokens: sums.inputTokens || 0,
    output_tokens: sums.outputTokens || 0,
    cache_creation_input_tokens: sums.cacheWriteTokens || 0,
    cache_read_input_tokens: sums.cacheReadTokens || 0,
  };
}

module.exports = {
  sumTranscriptUsage,
  modelFromTranscript,
  readTranscriptUsage,
  toSnakeCaseUsage,
};
