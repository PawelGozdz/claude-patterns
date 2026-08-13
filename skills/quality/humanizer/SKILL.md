---
name: humanizer
description: "Final-pass edit that strips AI-writing tells from prose a HUMAN will read — /analyze 'Otwarte pytania'/synteza sections, ADR body, task Goal/Findings-summary, README/docs prose. Never touches YAML frontmatter, code, or machine-parsed fields. Use when finishing any human-facing write, or when asked to 'humanize this', 'make it sound less AI-written', 'this reads robotic', 'polish for a human reader'."
origin: "Local reimplementation, not a vendor of blader/humanizer (MIT) — `npx skills add blader/humanizer --global` was flagged high-risk by Snyk (the installer/supply-chain path, not the skill content itself), so this recreates the same idea as a plain-Markdown skill native to this repo. Pattern catalog cross-references skills/marketing/seo-audit/references/ai-writing-detection.md (already vendored here) instead of duplicating it."
allowed-tools: Read, Edit
effort: low
---

# Humanizer — final pass for human-facing prose

## Core Purpose

A last editing pass for text a human is meant to *read and reason about* — not text a
script, hook, or another agent will parse. Strips the tells that make a paragraph read
as machine-generated (em dashes, "moreover", signposting theater, hedged filler) without
softening or inventing anything.

## When to Use

**Use this pass for:**
- ✅ `/analyze` artifact prose — `## Synteza`, `## Otwarte pytania`, `## Decyzje (proponowane)`,
  `## Ryzyka / uwagi`. Human reads these to decide whether to approve the analysis.
- ✅ ADR body — Context / Options Considered / Decision / Consequences.
- ✅ Task files — `## 🎯 Goal`, `**Findings summary:**`.
- ✅ README.md, `docs/*.md`, changelog entries, anything meant to be read end-to-end.
- ✅ Narrative prose an agent writes into TEAM-STATE.md (not its tables/dates).

**Do NOT use for:**
- ❌ YAML/JSON frontmatter, `BUSINESS_RULES.yaml`, any machine-parsed field — `status:`,
  `answer:`, `decisions[].choice`, `patterns[]`, `labels:`. These are gates other tooling
  reads structurally; rewording them for "flow" breaks the contract.
- ❌ Code, code comments, commit messages (Conventional Commits format is deliberately terse).
- ❌ Agent/skill frontmatter `description:` fields — those are written for model routing,
  not human reading; humanizing them can hurt trigger-matching.
- ❌ Text a human already reviewed and approved — don't silently reword someone else's
  words without being asked.

## Non-Negotiable Rule: No Fabrication

Never invent a fact, name, number, file path, or citation that wasn't in the source. If a
sentence is vague because the source was vague, flag it instead of papering over the gap
with confident-sounding prose. This matters more here than in generic copy: the text this
skill touches (analysis open questions, ADR decisions, task summaries) is used to make
real decisions — a smoother sentence that quietly changed the claim is worse than an
awkward one that didn't.

## Workflow

1. **Scope the pass** — split the file into human-prose sections vs. machine-parsed data
   (see When to Use / Do NOT). Touch only the former.
2. **Draft rewrite** — apply the pattern checklist below.
3. **Self-audit** — re-read the draft and ask "does this still sound AI-generated?" A
   second pass catches what the first misses, especially em dashes and phrase clusters.
4. **Preserve technical precision** — never turn a hedge into a firm claim or drop a
   caveat just because it reads cleaner without it.

## Pattern Checklist

Word- and phrase-level tells (overused verbs, adjectives, transitions, filler, opening/
closing phrases) are already cataloged in this repo — see the `seo-audit` skill's
`references/ai-writing-detection.md`. Reuse that list instead of duplicating it here.

Structural / register tells not covered there:

- **Em dash overuse** — the single most reliable AI tell; use commas, colons, or parentheses instead.
- **Boldface overuse** — mechanical emphasis on every other phrase; remove all but genuinely load-bearing bold.
- **Inline-header lists** — bolded fake-headers stuffed inside a paragraph → rewrite as flowing prose.
- **Title Case Headings** → sentence case.
- **Emojis** in prose that isn't already using this repo's own emoji convention (task
  templates use 🎯/🔒/🏗️/✅ section markers by design — leave those alone).
- **Curly quotation marks** → straight quotes.
- **Copula avoidance** — "X serves as Y" → "X is Y".
- **Negative parallelism** — "not just X, but Y" — cut unless it's genuinely doing work.
- **Rule-of-three padding** — three-item lists added for rhythm rather than content — cut the weakest item.
- **Passive voice / subjectless fragments** — add the subject, prefer active voice.
- **Signposting theater** — "let's dive in", "here's what you need to know" — cut, start with the content.
- **Fragmented headers** — a heading immediately followed by a one-line restatement of itself — cut the restatement.
- **Diff-anchored writing** — narrating "we changed X to Y" when the reader only needs the
  current state — state the current state directly. Matters most in ADRs and changelogs.
- **Chatbot artifacts** — "I hope this helps!", "let me know if you have questions" — cut, this isn't a chat reply.
- **Sycophantic tone** — "Great question!" — cut.
- **Manufactured punchlines** — staccato drama sequences ("Fast. Cheap. Reliable.") — only keep if the source actually wrote that way.

## Voice Matching

If the file already has an established voice (existing ADRs, this repo's terse PL/EN
technical register), match that instead of generic "content" polish. Don't inject
enthusiasm or marketing energy into a technical artifact — the target is a clear-headed
engineer's voice, not a copywriter's.

## Register Pass: Business Language, Not Layer Jargon

Stripping AI tells is not enough when the reader is deciding, not reviewing. A sentence
can be perfectly human and still unanswerable, because it names things only the codebase
knows. This pass runs alongside the checklist above, on the fields and sections a human
reads in order to make a call.

Read the target register from `runtime.yml` `human_voice` (`language`, `register`,
`max_sentences`, `avoid[]`). No such section (project predating it) → Polish, business
register, 2 sentences max, no class names, file paths, or ADR/BDR numbers.

The substitutions that carry most of the weight:

| instead of | write |
|---|---|
| a class, service, or function name | what that thing does for the product |
| a file path or layer name | the area of the system, in the user's words |
| an ADR/BDR number | the decision it made, in one clause |
| a pattern name (`ACL Registry`, `Specification`) | the property it buys — isolation, one place to change a rule |
| "sync vs async" | "immediately, or with a delay" |
| a metric with no baseline | the metric plus what hitting or missing it means |

Two rules that outrank "shorter is better":

1. **Keep the consequence.** A question stripped to its bare decision ("close it or leave
   it?") is useless without the so-what: cost, delay, risk, blast radius. That clause is
   the reason a human reads the question at all. If the source carries no consequence, say
   so rather than inventing one.
2. **Never trade precision for smoothness.** Same non-fabrication rule as above: if the
   business-language version would change what is being asked, keep the technical term and
   gloss it in a subordinate clause.

Acceptance test: hand the text to someone who has never opened this repo. Can they answer?
If their first move is "what is X", the pass is not finished.

## Integration Points in This Repo

- `/analyze` — pass on `Synteza`, `Otwarte pytania`, `Decyzje (proponowane)`,
  `Ryzyka / uwagi` before the artifact `Write` in step 2, **plus the frontmatter fields
  written for a human**: `open_questions[].ask` and `decisions[].means` (see the register
  pass above — they exist precisely to carry the business-language version). The
  machine-gate fields stay untouched: `open_questions[].q`, `answer`, `status`,
  `decisions[].choice`/`rationale`, `patterns[]` — those are what `/orchestrate` reads.
- `/adr` (`skills/decision-frameworks/adr`) — pass on Context / Options Considered /
  Decision / Consequences before writing the file. `Status`/`Date`/`Stack` stay untouched.
- `templates/task-standard.md` — `## 🎯 Goal` and `**Findings summary:**`.
- General docs/README work — apply before finishing; skip anything meant to be parsed by
  a hook, script, or another agent.

## Related Skills

- **copy-editing** (`skills/marketing/copy-editing`) — deeper multi-pass framework (Seven
  Sweeps) built for conversion copy: CTAs, proof, emotion. Use that instead when the
  text's job is to persuade a customer, not inform a colleague.
- **seo-audit** `references/ai-writing-detection.md` — the underlying word/phrase list
  this skill leans on rather than duplicating.
