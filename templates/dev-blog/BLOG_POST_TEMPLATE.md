---
week_start: YYYY-MM-DD
week_end: YYYY-MM-DD
published: YYYY-MM-DD
category: Business Decision / Technical Implementation / Architecture / Testing / Refactoring
tags: [tag1, tag2, tag3]
difficulty: Beginner
read_time: 7-9 min
---

<!--
CRITICAL RULES — READ BEFORE WRITING:

1. AUDIENCE: PM/PO/Owner with coffee — NOT a developer
   - Writing for a business person interested in HOW the product is built
   - Plain, business-friendly language, understandable to anyone

2. CODE: ❌ NONE IN THE MAIN TEXT
   - Even one line of code = too much
   - BAD: if (user.role === 'admin') { ... }
   - GOOD: "We check whether the user is an admin"
   - All tech details + code = <details> at the end

3. LANGUAGE: Default language follows VOICE_REFERENCE.md
   - Explain English terms in parentheses + Wikipedia link at first use
   - Avoid jargon mixing ("zaimplementowaliśmy feature" / "we did a commit")

4. TECH DETAILS: Minimum in the main text
   - ❌ AES-256-GCM, HMAC, circuit breaker, repository pattern
   - ✅ "Encrypted permissions", "fallback to DB", "secure keys"
   - All tech details = <details> at the end

5. STYLE: Narrative, not report
   - ✅ "August 22, morning. Coffee, laptop, a question..."
   - ✅ "I've seen this before — a simple system after 3 months = chaos"
   - ❌ Bullet points dominating
   - ❌ Sections with headers and no narrative

6. BUSINESS FOCUS: Why, not how
   - More: why this decision, what business problem
   - Less: how exactly it works technically

7. METRICS: ZERO in the main text
   - ❌ "164 tests, 98.8% passing"
   - ❌ "183 tests for PII handling"
   - ✅ "Testing surfaced a few edge cases"
   - All tech metrics = <details> at the end
-->

# [What we did: concrete deliverable or decision]

[1–2 sentences of intro — where we are in the project, time context]

---

## TL;DR

**Problem**: [In 1 sentence — what business problem]

**Solution**: [In 1–2 sentences — what we did, PLAIN LANGUAGE]

**Result**: [In 1 sentence — what this means for the product/business]

---

## 🎯 The problem

### Why now

[Concrete trigger — what set off this work: user feedback, blocker, milestone,
technical debt]

**Business context** (if applicable):

- **Who needs it**: [User segment, stakeholder]
- **Problem being solved**: [Concrete pain point]
- **Why priority**: [Business justification]

**Technical context** (if applicable):

- **What was blocking**: [Technical limitation, debt, complexity]
- **Impact**: [Performance, maintainability, scalability]

**Constraints**:

- **Budget**: [If relevant — time, resources]
- **Time**: [Deadline, sprint goal]
- **Resources**: [Team size, available skills]

---

## 🛠️ Implementation

### What we did

**Deliverables** (high-level):

- [Concrete output #1 — feature, refactor, migration]
- [Concrete output #2]
- [Concrete output #3]

**NOTE**: Focus on WHAT and WHY, not the details of HOW. NO: git commits,
exact test counts, LOC, specific library names.

---

### Technical approach (for the curious)

**NOTE**: For technical readers. Non-tech readers can skip.

**Architecture overview** (simplified diagram):

```
┌─────────────────────────────────────────┐
│  High-level diagram (ASCII or Mermaid) │
│  Main components & flow                 │
│  NO implementation details              │
└─────────────────────────────────────────┘
```

**Key decisions** (in business terms):

1. [Decision #1] — **Why**: [Business benefit, plain language]
2. [Decision #2] — **Why**: [Business benefit, plain language]

**IMPORTANT**: Every technical term, first use = explanation + Wikipedia link.
Example: **PostgreSQL** ([a database](https://en.wikipedia.org/wiki/PostgreSQL))
— a proven technology for storing data.

---

### Key snippet (optional — TECH READERS ONLY)

**NOTE**: Code ONLY if it illustrates an important business decision.

```typescript
// 5-10 lines MAX
// Show the PATTERN or KEY DECISION, not implementation details

interface Example {
  // Comment explaining WHY designed this way
  method(): Result<void>;
}
```

**What this means in practice** (plain language): [Explain the CODE in
business terms — what it does, why it matters, what consequences]

**Why we're showing this**: [Business context — what it means for the product]

**What we're NOT showing**: [Exact column names, SQL schemas, implementation
details — security reasons]

---

## 📋 Testing & Quality (optional)

**NOTE**: Optional section. Use ONLY if testing was a key part of the work.

### Testing approach

**What we test** (high-level):

- [Area #1 — e.g., "Domain logic and business rules"]
- [Area #2 — e.g., "Integration with external services"]
- [Area #3 — e.g., "E2E user flows"]

**Quality gates**:

- [ ] Comprehensive test coverage (NO specific %)
- [ ] Business rules documented
- [ ] Code review passed

**DO NOT include**: Exact test counts, % coverage, LOC — that's tech docs,
not blog content.

---

## 🔐 Security & Privacy (if applicable)

**CRITICAL**: NO implementation details (rate limits, library names, specific
configurations). That's information valuable to attackers.

### Security considerations (high-level)

**What we protect**:

- [Asset #1 — e.g., "User data"]
- [Asset #2 — e.g., "Transactions"]

**Our approach to security**:

- [Approach #1 — e.g., "Security by default, not opt-in"]
- [Approach #2 — e.g., "Compliant data handling"]

**DO NOT reveal**:

- ❌ Specific rate limits (e.g., "100 req/min")
- ❌ Library names (Helmet, bcrypt, etc.)
- ❌ Configurations (salt rounds, token expiry)
- ❌ Security headers (CSP directives, CORS origins)

### Security vs UX trade-off (if any)

**Dilemma**: [Conflict between security and UX — describe in general]

**Our approach**: [How we balanced — philosophy, not details]

---

## 📊 Where we are (optional)

**NOTE**: Optional section. Use sparingly — high-level snapshot only.

**Features**:

- ✅ **Done**: [Feature/context production-ready]
- 🚧 **In progress**: [Current focus — WIP]
- 📋 **Up next**: [Planned — roadmap]

**Technical debt** (if significant):

- [Known debt item — general, no specifics]

**DO NOT include**:

- ❌ Exact test counts (114 tests)
- ❌ LOC (14,000 lines)
- ❌ % Coverage (95.3%)

---

## 💭 Reflections

### What went well

[Concrete win — what worked better than expected, what positively surprised]

### What was hard

[Concrete challenge — blocker, unexpected complexity, problem]

**How we resolved it**: [Approach that worked — what we did to unblock]

**What we learned**: [Insight for the future — pattern to remember]

---

### Open questions

We don't know yet:

- [ ] [Uncertainty #1 — what we'll be monitoring]
- [ ] [Uncertainty #2 — what may change, what's TBD]
- [ ] [Uncertainty #3 — question without an answer (yet)]

**Validation plan**: [How we'll verify these uncertainties — metrics, user
feedback, time]

---

## 📝 Pre-publication checklist

**Security review**:

- [ ] No SQL schemas (CREATE TABLE)
- [ ] No exact column names in queries
- [ ] No API keys, credentials, secrets
- [ ] No user data (PII)
- [ ] No internal URLs, IP addresses
- [ ] No specific rate limits
- [ ] No library names + versions

**Content quality**:

- [ ] Present tense (write *then*, not retrospective)
- [ ] Tone matches `VOICE_REFERENCE.md`
- [ ] Business justification for tech decisions
- [ ] Blog tone (not tech documentation — less detail, more WHY)
- [ ] NO tech metrics in main text (test counts, % coverage, LOC)
- [ ] NO: git commits, security details (rate limits, libraries, exact configs)

**Structure**:

- [ ] Week dates in frontmatter
- [ ] TL;DR at top
- [ ] Decisions explained (why X, not Y)
- [ ] Reflections + open questions
- [ ] Links to artifacts (ADRs, tasks) — internal-only, public links if any

**Tone check**:

- [ ] No slang ("LMAO", "HELL YES")
- [ ] Substantive, considered
- [ ] Balanced (show trade-offs)
- [ ] Honest (acknowledge uncertainties)
