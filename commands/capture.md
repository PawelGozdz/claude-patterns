---
description: Capture insight from the current conversation as a blog draft before it disappears
---

# /capture — Conversation-to-Draft

Conversations disappear. Git doesn't capture WHY — only what changed.

Run at the end of any valuable discussion: architecture decisions, debugging
stories, pattern discoveries, strategic choices. The skill reflects on what
was discussed, proposes article angles, and writes a draft in your blog.

## Usage

`/capture [blog-dir]`

## Examples

```
/capture                           # auto-detect blog location
/capture ../juz-ide-blog           # explicit path
/capture --internal                # save to elon/insights/ instead of blog
```

## What it does

1. Reflects on the full conversation in context — extracts the core insight
2. Proposes 2-3 article angles (lessons / technical / build-in-public)
3. You pick one, or combine elements
4. Creates a draft `.mdx` file with proper frontmatter, structure outline,
   and working notes — NOT finished prose

## Output format

Compatible with juz-ide-blog (Astro + astro-paper):
- `draft: true` until you're ready to publish
- `source: conversation` so you know origin
- Private capture note at top (remove before publishing)
- Proposed structure + bullet notes, not full prose

## Arguments

`$ARGUMENTS` — optional path to blog root directory.
If omitted, searches for `../juz-ide-blog/src/content/posts/` automatically.
