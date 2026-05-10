# Voice Reference — Tone Calibration

**Read this file every time before writing a blog post.** It exists to keep
the blog's voice consistent across weeks and writers (including AI-assisted
drafts).

This file is a **calibration anchor**, not a rulebook. The principles are
illustrated by **3 excerpts** — paragraphs that capture the target tone well.

If your project's voice differs (different language, different persona,
different audience), **replace** the excerpts below with your own anchors.
The principles section above the excerpts is generalizable.

---

## Target voice — defaults

- **Persona**: 40+ founder. Experienced, has-seen-things, balanced. Not a
  hype-merchant, not a junior dev. Substantive.
- **Present tense from that moment**: write *as if you're inside the week*,
  not looking back. "Tuesday morning. Coffee, laptop, the question..." —
  not "Last August, looking back, we decided..."
- **Show dilemmas, not just decisions**: every interesting decision was a
  choice between options. Show the alternatives you considered and rejected,
  briefly, before announcing what you picked.
- **Business + tech**: every technical decision has a business reason.
  Lead with the business reason. Tech rationale is a supporting argument.
- **Audience = PM/PO with coffee**: write for someone smart and curious but
  not a developer. Explain English/jargon terms at first use with a parenthetical
  + Wikipedia link.
- **Honest about uncertainty**: acknowledge what you don't know yet. "We'll
  see in 3 months whether this scales" beats "this is the right approach".

## What to avoid

- ❌ Marketing-speak: "leveraging cutting-edge AI", "revolutionizing X",
  "next-generation platform"
- ❌ AI tells: "Let's dive in!", "It's worth noting that...", "In conclusion",
  excessive bullet points instead of prose, em-dashes used as decorative
  punctuation rather than structural
- ❌ Tech showoff: "We're using AES-256-GCM with HMAC and a circuit breaker
  via Redis cluster". Translate to plain language for main text; reserve
  tech specifics for collapsible `<details>` blocks.
- ❌ Retrospective framing: "Looking back, we should have...", "It turned
  out that..." — these are reflection posts, not weekly logs.
- ❌ Boastful metrics: "We shipped 114 tests at 98% coverage" — readers
  don't care about your test count; they care about what it means.

---

## Anchor excerpts

These three excerpts illustrate the target voice. Adapted for general use —
project-specific names redacted as `<project>`, `<feature>`, `<technology>`.

### Excerpt 1 — Opening narrative

> August 26, Tuesday morning. Coffee, laptop, the realization: <project>
> will handle personal identifiers.
>
> Personal identifiers aren't ordinary fields. They contain birth dates,
> sometimes gender, sometimes more. Privacy regulations classify them as
> sensitive personal data. Fines for a leak? Up to 20 million euro or 4% of
> annual revenue.
>
> <project> is a platform for real users. People will provide: home
> addresses, identifiers, business numbers, contact data. Each of these is
> personal data. Each must be handled correctly.
>
> **Business question**: add compliance now, or later?

**What works here**:
- Time-stamped opening — present tense, specific moment
- Stakes shown concretely (20 million euro fine) — not abstract
- Business question at the end frames the rest of the post
- Plain language: "personal identifiers", not "PII tokens"

---

### Excerpt 2 — Decision narrative

> I've seen this before in other projects. "We'll add compliance later"
> usually means:
>
> - Refactoring under deadline pressure
> - Discovering that the data model leaks identifiers everywhere
> - Three weeks of rewrites that should have been three days at the start
>
> So: from day one. Every sensitive identifier flows through a dedicated
> wrapper that knows it's sensitive. Encryption at rest, audit trail for
> every access, no logging of raw values. The cost — about a day of
> upfront design — buys us months of not worrying later.

**What works here**:
- Personal experience as authority ("I've seen this")
- Concrete failure modes listed (refactoring, leakage, rewrites)
- The decision flows from the failure analysis, not announced top-down
- Cost framed honestly (one day of work) and benefit framed concretely
  (months of not worrying)

---

### Excerpt 3 — Reflection / open question

> What I don't know yet: whether the abstraction will hold when we add the
> next integration. Right now there's one consumer of the wrapper. In two
> months there might be five. The interface may need to grow.
>
> That's okay. The point of doing this on day one isn't to predict every
> future use — it's to make sure the *next* refactor is a refactor of one
> abstraction, not of fifty scattered references to raw identifiers.

**What works here**:
- Honest uncertainty ("I don't know yet")
- Concrete numbers (one → five) to make the uncertainty tangible
- Reframes "this design might change" as a feature, not a flaw
- Closes by reinforcing the original decision without overselling

---

## How to use this file

**Before writing**: read the principles + at least one excerpt out loud.
Pay attention to sentence rhythm — short sentences, occasional one-line
paragraphs for emphasis.

**During writing**: when stuck, re-read an excerpt. Ask: "would the voice
in that excerpt say what I'm about to say?"

**After writing**: read your draft aloud. If anything sounds like marketing
copy or a tech spec, rewrite it.

**Customizing**: replace these three excerpts with paragraphs from your own
project's strongest posts once you have them. The principles section above
is generalizable; the excerpts are project-specific anchors.
