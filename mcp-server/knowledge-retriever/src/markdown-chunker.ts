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

function pushChunk(
  acc: Chunk[],
  source: string,
  heading: string,
  body: string,
  kind: ChunkKind,
  tags: string[],
  scopeInfo: { scope?: "project-specific"; project?: string }
): void {
  const text = body.trim();
  if (text.length < MIN_LEN) return;
  acc.push({ id: `${source}#${slugify(heading)}`, source, section: heading, text, kind, tags, ...scopeInfo });
}

export function chunkMarkdown(content: string, source: string): Chunk[] {
  const tags = tagsFromPath(source);
  const scopeInfo = parseScope(content);
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
