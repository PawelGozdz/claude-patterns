// Dart chunker — .dart → per-symbol chunks via a heuristic scanner (no Dart AST exists for
// Node; tree-sitter would add a native dep for marginal gain here). Mirrors code-chunker.ts
// output: each method / constructor / top-level function is a chunk labeled
// `ClassName.method (L12-40)`; small classes fall back to one whole-class chunk.
// Strings and comments are blanked (same length, newlines kept) BEFORE brace counting, so
// `{`/`}` inside literals, `${...}` interpolations and comments don't skew nesting depth.
// Heuristic parser: accepts rare mis-splits on exotic syntax over pulling in a real grammar.
import type { Chunk } from "./types.js";

const MIN_LEN = 30;

/** Blank comments + string literals with spaces (newlines preserved) for safe structural scans.
 *  Handles: // line, nested block comments, ' " ''' """ quotes, raw r'...', ${...} interpolation. */
function sanitize(src: string): string {
  const out = src.split("");
  const n = src.length;
  const blank = (from: number, to: number) => {
    for (let k = from; k < Math.min(to, n); k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < n) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      const nl = src.indexOf("\n", i);
      const stop = nl === -1 ? n : nl;
      blank(i, stop);
      i = stop;
    } else if (two === "/*") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (src.slice(j, j + 2) === "/*") { depth++; j += 2; }
        else if (src.slice(j, j + 2) === "*/") { depth--; j += 2; }
        else j++;
      }
      blank(i, j);
      i = j;
    } else if (src[i] === "'" || src[i] === '"') {
      const q = src[i];
      const raw = i > 0 && (src[i - 1] === "r" || src[i - 1] === "R");
      const triple = src.slice(i, i + 3) === q.repeat(3);
      const quote = triple ? q.repeat(3) : q;
      let j = i + quote.length;
      while (j < n) {
        if (!raw && src[j] === "\\") { j += 2; continue; }
        if (src.slice(j, j + quote.length) === quote) { j += quote.length; break; }
        if (!raw && src.slice(j, j + 2) === "${") {
          // Interpolation may nest braces — skip to the balancing `}` (nested string quotes
          // inside are rare enough to accept as a known heuristic gap).
          let d = 1;
          j += 2;
          while (j < n && d > 0) {
            if (src[j] === "{") d++;
            else if (src[j] === "}") d--;
            j++;
          }
          continue;
        }
        if (!triple && src[j] === "\n") break; // unterminated — bail at EOL
        j++;
      }
      blank(i, j);
      i = j;
    } else i++;
  }
  return out.join("");
}

interface Span { start: number; end: number }

/** Split sanitized code in [start,end) into sibling declaration spans: a declaration ends at a
 *  `;` at relative depth 0, or at the `}` closing the first block it opened. */
function splitDeclarations(san: string, start: number, end: number): Span[] {
  const spans: Span[] = [];
  let i = start;
  while (i < end) {
    while (i < end && /\s/.test(san[i])) i++;
    if (i >= end) break;
    const declStart = i;
    let depth = 0;
    let openedBlock = false;
    while (i < end) {
      const ch = san[i];
      if (ch === "{" || ch === "(" || ch === "[") {
        if (ch === "{" && depth === 0) openedBlock = true;
        depth++;
      } else if (ch === "}" || ch === ")" || ch === "]") {
        depth--;
        if (depth < 0) { i = end; break; } // malformed / region boundary — stop
        if (depth === 0 && ch === "}" && openedBlock) { i++; break; }
      } else if (ch === ";" && depth === 0) { i++; break; }
      i++;
    }
    spans.push({ start: declStart, end: Math.min(i, end) });
  }
  return spans;
}

/** Strip leading metadata annotations (`@freezed`, `@Deprecated('x')`, …) from a sanitized span
 *  offset so classification regexes see the declaration keyword first. Returns new offset. */
function skipAnnotations(san: string, start: number, end: number): number {
  let i = start;
  for (;;) {
    while (i < end && /\s/.test(san[i])) i++;
    if (san[i] !== "@") return i;
    i++;
    while (i < end && /[\w.$]/.test(san[i])) i++;
    if (san[i] === "(") {
      let d = 1;
      i++;
      while (i < end && d > 0) {
        if (san[i] === "(") d++;
        else if (san[i] === ")") d--;
        i++;
      }
    }
  }
}

/** Identifier immediately preceding the first top-depth `(` — the function/method name. */
function nameBeforeParen(text: string): string | null {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "<" || ch === "[") depth++;
    else if (ch === ">" || ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === "(" && depth === 0) {
      const m = text.slice(0, i).match(/([A-Za-z_$][\w$]*)\s*(?:<[^(]*>)?\s*$/);
      return m ? m[1] : null;
    } else if (ch === "{" || ch === ";" || ch === "=") break;
  }
  return null;
}

interface Decl { label: string; classLike: boolean; className?: string }

const CLASS_RE = /^(?:abstract\s+|base\s+|interface\s+|final\s+|sealed\s+|mixin\s+)*class\s+([A-Za-z_$][\w$]*)/;

function classifyTopLevel(head: string): Decl | null {
  if (/^(import|export|part|library)\b/.test(head)) return null;
  let m = head.match(CLASS_RE);
  if (m) return { label: `class ${m[1]}`, classLike: true, className: m[1] };
  m = head.match(/^(?:base\s+)?mixin\s+([A-Za-z_$][\w$]*)/);
  if (m) return { label: `mixin ${m[1]}`, classLike: true, className: m[1] };
  m = head.match(/^extension\s+type\s+(?:const\s+)?([A-Za-z_$][\w$]*)/);
  if (m) return { label: `extension type ${m[1]}`, classLike: true, className: m[1] };
  if (/^extension\b/.test(head)) {
    m = head.match(/^extension\s+([A-Za-z_$][\w$]*)?/);
    return { label: `extension ${m?.[1] ?? "(unnamed)"}`, classLike: true, className: m?.[1] };
  }
  m = head.match(/^enum\s+([A-Za-z_$][\w$]*)/);
  if (m) return { label: `enum ${m[1]}`, classLike: false }; // enhanced enums: value list defeats member splitting — whole chunk
  m = head.match(/^typedef\s+([A-Za-z_$][\w$]*)/);
  if (m) return { label: `typedef ${m[1]}`, classLike: false };
  m = head.match(/\b(get|set)\s+([A-Za-z_$][\w$]*)/);
  if (m) return { label: `${m[1]} ${m[2]}`, classLike: false };
  const fn = nameBeforeParen(head);
  if (fn) return { label: `function ${fn}`, classLike: false };
  if (/\b(?:const|final|var|late)\b/.test(head)) {
    m = head.match(/([A-Za-z_$][\w$]*)\s*[=;]/);
    if (m) return { label: `const ${m[1]}`, classLike: false };
  }
  return null;
}

function classifyMember(head: string, className: string | undefined): string | null {
  const cls = className ?? "(unnamed)";
  const m = head.match(/\b(get|set)\s+([A-Za-z_$][\w$]*)\s*(?:=>|\{|=)/);
  if (m) return `${cls}.${m[2]}`;
  const name = nameBeforeParen(head);
  if (!name) return null; // field / value list — skip, like the TS chunker skips properties
  if (className && name === className) {
    const named = head.match(new RegExp(`${className}\\.([A-Za-z_$][\\w$]*)\\s*\\(`));
    return named ? `${className}.${named[1]}` : `${className}.constructor`;
  }
  return `${cls}.${name}`;
}

export function chunkDart(content: string, source: string): Chunk[] {
  const san = sanitize(content);
  const chunks: Chunk[] = [];
  let idx = 0;

  // line-number lookup: offset → 1-based line
  const lineStarts: number[] = [0];
  for (let i = 0; i < content.length; i++) if (content[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (offset: number): number => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  const push = (label: string, span: Span): boolean => {
    const text = content.slice(span.start, span.end);
    if (text.trim().length < MIN_LEN) return false;
    const startLine = lineOf(span.start);
    const endLine = lineOf(Math.max(span.start, span.end - 1));
    chunks.push({ id: `${source}#${idx++}`, source, section: `${label} (L${startLine}-${endLine})`, text, startLine, endLine });
    return true;
  };

  for (const span of splitDeclarations(san, 0, san.length)) {
    const headStart = skipAnnotations(san, span.start, span.end);
    const head = san.slice(headStart, Math.min(headStart + 300, span.end));
    const decl = classifyTopLevel(head.trimStart());
    if (!decl) continue;

    if (decl.classLike) {
      // body = between the first block-opening `{` (outside parens) and the span's closing `}`
      let bodyStart = -1;
      let depth = 0;
      for (let i = headStart; i < span.end; i++) {
        const ch = san[i];
        if (ch === "(" || ch === "[") depth++;
        else if (ch === ")" || ch === "]") depth--;
        else if (ch === "{" && depth === 0) { bodyStart = i + 1; break; }
      }
      let emitted = 0;
      if (bodyStart !== -1) {
        for (const member of splitDeclarations(san, bodyStart, span.end - 1)) {
          const mStart = skipAnnotations(san, member.start, member.end);
          const mHead = san.slice(mStart, Math.min(mStart + 300, member.end)).trimStart();
          const label = classifyMember(mHead, decl.className);
          if (label) emitted += push(label, member) ? 1 : 0;
        }
      }
      if (emitted === 0) push(decl.label, span); // tiny class → whole thing (TS chunker parity)
    } else {
      push(decl.label, span);
    }
  }

  return chunks;
}
