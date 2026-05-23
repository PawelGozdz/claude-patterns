---
name: capture
description: "Capture insight from the current conversation before it disappears. Analyzes what was discussed, proposes blog article angles, and creates a draft in the blog repo. Use at the end of any valuable conversation that won't leave a git trace."
origin: claude-patterns
allowed-tools: Read, Write, Glob, Bash
effort: low
---

# /capture — Conversation-to-Draft

Conversations disappear. This skill captures them.

Use at the end of any discussion, debate, or problem-solving session that
produced something worth sharing — architecture decisions, debugging stories,
pattern discoveries, strategic choices. The conversation is the source;
git history won't preserve it.

## When to invoke

- After a discussion about WHY a decision was made (not just what)
- After debugging something unexpected
- After discovering a pattern or anti-pattern in practice
- After a strategic/product conversation worth documenting
- Any session where you thought "this would make a good post"

## When NOT to invoke

- Pure code implementation (git history captures it)
- Routine task work with no novel insight
- Conversation that is too internal/specific (company secrets, personal data)

---

## Steps

### 1. Synthesize the conversation

Reflect on the full conversation in context. Identify:

**Core insight** — what's the one thing worth preserving?
- Was a decision made? What were the trade-offs?
- Was a problem solved? What was surprising about the solution?
- Was a pattern discovered? What's the general lesson?
- Was a process discussed? What would help others doing the same?

**Audience fit** — who would benefit from reading this?
- Other developers building similar systems
- Solo founders / small teams
- NestJS / DDD / TypeScript practitioners
- Startup builders (build-in-public angle)

**Scope check** — is this blog-appropriate?
- Too narrow / internal → suggest saving to `elon/insights/` instead (see Step 5b)
- Too generic with no real experience behind it → skip
- Real experience + transferable lesson → proceed

### 2. Propose 2-3 article angles

Present the user with options. Each angle frames the same conversation differently:

| # | Type | Framing |
|---|------|---------|
| A | **Lessons** | "What I learned the hard way about X" — personal, honest, concrete |
| B | **Technical** | "How we solved X — the approach and why it worked" — practical, reproducible |
| C | **Build-in-public** | "The decision we almost got wrong" — founder lens, strategic |

For each angle provide:
- Proposed title (konkretny, nie clickbaitowy)
- One-sentence description
- Who it helps most

Ask the user: "Which angle fits? Or combine elements?"

### 3. Get missing context (if needed)

Before writing the draft, ask only what you don't already know:
- Estimated reading time preference (short ~3 min / medium ~7 min / long ~12 min)?
- Should it be in Polish or English?
- Any specific detail from the conversation to emphasize or omit?

Don't ask for information you already have from the conversation.

### 4. Create the draft

#### 4a. Determine blog path

Check for blog location in this order:
1. `$ARGUMENTS` — user passed path explicitly (`/capture ../juz-ide-blog`)
2. `project.yml` field `blog_dir`
3. Sibling directory: look for `../juz-ide-blog/src/content/posts/`
4. Current project: look for `src/content/posts/` or `content/posts/`
5. If nothing found: create `drafts/` in current directory and tell the user

#### 4b. Generate filename

```
YYYY-MM-DD-<kebab-slug-from-title>.mdx
```

Date = today. Slug = 4-6 words max, lowercase, hyphens.

#### 4c. Write the draft file

Use the frontmatter format from juz-ide-blog (Astro + astro-paper):

```markdown
---
id: <timestamp-based-id, e.g. conv-20260523-capture>
type: lessons
pillar: tech
arc: ""
title: "<final title>"
description: "<1-2 sentences meta description, honest and specific>"
pubDatetime: <YYYY-MM-DDT09:00:00Z>
author: founder
tags: [<2-4 inferred tags from conversation content>]
hero_image: ""
hero_prompt: "<describe a visual metaphor for the article — for Midjourney/DALL-E>"
draft: true
source: conversation
---

<!--
  CAPTURE NOTE (private, remove before publishing)
  Session: <YYYY-MM-DD>
  Origin: conversation — not in git history
  Core insight: <one sentence summary>
  Related code: <file paths if applicable, or "none">
-->

## Kluczowe punkty

- <bullet from conversation — raw insight>
- <bullet from conversation — supporting detail>
- <bullet — what was surprising or counterintuitive>

## Proponowana struktura

**1. Wstęp** — <1-2 sentences: hook + what the reader will learn>

**2. Kontekst / Problem** — <what situation led to this conversation>

**3. <Core section title>** — <main insight or solution>

**4. <Supporting section>** — <trade-offs, alternatives considered, edge cases>

**5. Wnioski** — <transferable lesson in 1-3 bullets>

---

## Notatki robocze

> DO NAPISANIA: Poniżej surowe notatki z rozmowy. Nie publikować.

<key technical details, numbers, specific examples from the conversation>
<quotes or paraphrases worth preserving>
<any "aha moments" from the session>
```

### 5. Report to user

```
Draft zapisany: src/content/posts/2026-05-23-<slug>.mdx

Następne kroki:
  1. Otwórz draft i uzupełnij "Notatki robocze" świeżymi wspomnieniami z rozmowy
  2. Ustaw hero_prompt jeśli chcesz okładkę
  3. Gdy gotowy do edycji: zmień draft: true → false i dodaj pubDatetime

/capture ponownie jeśli chcesz inne ujęcie tej samej rozmowy.
```

### 5b. Alternative: internal insight (not blog-worthy)

If the conversation is too internal (contains sensitive business details, personal
data, or is too narrow to be useful to others), suggest saving to elon instead:

```
Ta rozmowa wygląda na zbyt wewnętrzną do bloga.
Propozycja: zapisać jako insight w elon/insights/<slug>.md?

Typ: governance / finance / product / team / technical-decision
```

If user confirms, create `elon/insights/YYYY-MM-DD-<slug>.md` with:
- frontmatter: `sensitivity: internal`, `type: <type>`, `date: <today>`
- section: `## Kontekst`, `## Decyzja / Insight`, `## Konsekwencje`
