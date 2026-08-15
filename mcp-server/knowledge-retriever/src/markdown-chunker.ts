// Markdown chunker — splits pattern/rule docs into per-section chunks for patterns_global.
// H2 (`## `) = one chunk each (kind='rule_card'), EXCEPT a section named "Anti-Patterns"/
// "Antywzorce" (case-insensitive) — that section is further split by H3 (`### `) so each
// anti-pattern example becomes its OWN chunk (kind='anti_pattern').
import type { Chunk, ChunkKind } from "./types.js";

const MIN_LEN = 20; // shorter than code-chunker's 30 — markdown sections are prose, not code
const ANTI_RE = /anti-?patterns?|antywzorce/i;

interface Section { heading: string; body: string }

function splitByHeading(content: string, marker: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of content.split("\n")) {
    if (line.startsWith(marker)) {
      if (current) sections.push(current);
      current = { heading: line.slice(marker.length).trim(), body: "" };
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (current) sections.push(current);
  return sections;
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// patterns/ mixes DDD layer docs (domain/application/infrastructure/architecture/cross-layer/
// testing/orchestration — all nestjs-ddd) with unrelated stacks/verticals (finance/marketing/legal/
// flutter/nextjs/python/sveltekit/typescript-library) — only the former get tagged 'nestjs-ddd',
// the rest are tagged with their own subdirectory name so retrieve_patterns(tags=...) filtering
// isn't misleading for non-DDD content swept up by the same patterns/**/*.md walk.
const DDD_LAYER_DIRS = new Set(["domain", "application", "infrastructure", "architecture", "cross-layer", "testing", "orchestration"]);

function tagsFromPath(source: string): string[] {
  const parts = source.split("/").filter(Boolean);
  const top = parts[0]; // 'patterns' or 'rules'
  const second = parts[1]; // subdir, e.g. 'domain', 'finance', or (for rules/) the stack itself
  const filename = parts[parts.length - 1].replace(/\.md$/, "");
  const name = filename.replace(/_summary$/, "").replace(/-pattern$/, "");

  const framework = top === "rules" ? second : DDD_LAYER_DIRS.has(second) ? "nestjs-ddd" : second;
  const tags = [framework];
  if (second && second !== framework) tags.push(second);
  tags.push(name);
  return Array.from(new Set(tags));
}

// Project-specific pattern marker — a pattern-doc derived from ONE project's codebase (not yet
// generalized/validated in a second project) opts into exclusion-by-default from retrieve_patterns
// by adding a `**Scope**: project-specific (<project-name>)` line anywhere in the file (convention:
// next to the existing `**Status**:` footer line). Absence = universal (every pre-existing pattern).
const SCOPE_RE = /^\*\*Scope\*\*:\s*project-specific\s*\(([^)]+)\)/m;

function parseScope(content: string): { scope?: "project-specific"; project?: string } {
  const m = SCOPE_RE.exec(content);
  if (!m) return {};
  return { scope: "project-specific", project: m[1].trim() };
}

// Taxonomy tags declared inside the doc (`**Tags**: "api:geo:radius", "api:data-access"`).
// Path-derived tags say WHERE a pattern lives; these say WHAT it is about — the same
// vocabulary ADRs and layers use (blocks/_taxonomy.yml), so retrieve_patterns can filter
// by topic instead of relying on embedding similarity alone.
const TAGS_RE = /^\*\*Tags\*\*:\s*(.+)$/m;
// Conceptual dependency (`**Assumes**: ddd/core`) — a pattern that only makes sense when
// the composition includes that block. Materialization already refuses such a mismatch;
// carrying it into the index keeps the reason visible at retrieval time too.
const ASSUMES_RE = /^\*\*Assumes\*\*:\s*(.+)$/m;

// Depth of treatment (`**Level**: core`). Same four-value taxonomy the @vytches/ddd examples
// already use in library_reference_global (quickstart 39 / core 231 / advanced 58 /
// exhaustive 172), so retrieve_* filters by one vocabulary across BOTH global collections
// instead of two. Absent = "core": the everyday depth, which is what an implementer wants by
// default. Until 2026-08-14 every one of the 1147 patterns_global points carried level: None
// — the field was indexed and filterable, just never populated on the patterns side.
const LEVEL_RE = /^\*\*Level\*\*:\s*(quickstart|core|advanced|exhaustive)\b/mi;

function parseLevel(content: string, source: string): Chunk["level"] {
  const m = LEVEL_RE.exec(content);
  if (m) return m[1].toLowerCase() as Chunk["level"];
  // Bez jawnej deklaracji poziom wynika z ROLI pliku, nie z treści: karta reguł (`_summary.md`)
  // jest z definicji skrótem — tym, co wkleja się do promptu implementera — więc 'quickstart';
  // pełny wzorzec jest referencją, więc 'core'. Dzięki temu 138 plików dostaje sensowny podział
  // bez edytowania każdego z osobna, a `**Level**` w nagłówku nadpisuje default tam, gdzie
  // wzorzec jest realnie głębszy (advanced) albo jest pełną referencją z historią (exhaustive).
  return /_summary\.md$/.test(source) ? "quickstart" : "core";
}

function parseDeclaredTags(content: string): string[] {
  const m = TAGS_RE.exec(content);
  if (!m) return [];
  return m[1]
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(",")
    .map((t) => t.trim().replace(/["'`*]/g, ""))
    .filter((t) => /^[a-z0-9-]+:[a-z0-9-]+(:[a-z0-9-]+)?$/.test(t));
}

function parseAssumes(content: string): string[] {
  const m = ASSUMES_RE.exec(content);
  if (!m) return [];
  return m[1]
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(",")
    .map((d) => d.trim().replace(/["'`*]/g, ""))
    .filter(Boolean);
}

function pushChunk(
  acc: Chunk[],
  source: string,
  heading: string,
  body: string,
  kind: ChunkKind,
  tags: string[],
  scopeInfo: { scope?: "project-specific"; project?: string; level?: Chunk["level"] }
): void {
  const text = body.trim();
  if (text.length < MIN_LEN) return;
  acc.push({ id: `${source}#${slugify(heading)}`, source, section: heading, text, kind, tags, ...scopeInfo });
}

export function chunkMarkdown(content: string, source: string): Chunk[] {
  // Path tags + declared taxonomy tags, deduplicated: retrieval can filter by either.
  const tags = [...new Set([...tagsFromPath(source), ...parseDeclaredTags(content)])];
  const assumes = parseAssumes(content);
  const scopeInfo = { ...parseScope(content), ...(assumes.length ? { assumes } : {}), level: parseLevel(content, source) };
  const chunks: Chunk[] = [];

  for (const section of splitByHeading(content, "## ")) {
    if (ANTI_RE.test(section.heading)) {
      const subsections = splitByHeading(section.body, "### ");
      if (!subsections.length) {
        pushChunk(chunks, source, section.heading, section.body, "anti_pattern", tags, scopeInfo);
      } else {
        for (const sub of subsections) {
          pushChunk(chunks, source, `${section.heading} — ${sub.heading}`, sub.body, "anti_pattern", tags, scopeInfo);
        }
      }
    } else {
      pushChunk(chunks, source, section.heading, section.body, "rule_card", tags, scopeInfo);
    }
  }

  return chunks;
}
