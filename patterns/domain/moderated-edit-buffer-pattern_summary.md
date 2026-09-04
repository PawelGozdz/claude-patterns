# Rule Card: Moderated Edit Buffer

**Tags**: "api:domain:moderation-buffer"
**Pattern**: `patterns/domain/moderated-edit-buffer-pattern.md`
**Layer**: Domain
**Level**: quickstart
**Scope**: project-specific (juz-ide-api-1)

## Why this card exists

Editing already-approved, live moderated content must never reset its moderation status
in a way that hides it from the people already relying on it — and the buffer that fixes
this introduces its own failure mode (a stale human decision applying to content the
reviewer never saw) that is easy to ship without noticing, because the automated-only
path works fine without it.

## Rules

| ID | Rule | Failure if broken |
|----|------|-------------------|
| **MEB1** | Edits to already-approved/rejected (live) moderated content go into a separate, immutable buffer VO on the aggregate — the live fields and live `moderationStatus` are NOT touched. | Content flips back to pending and disappears from everyone but the owner while awaiting re-review — the exact bug this pattern fixes. |
| **MEB2** | Buffer only the fields actually covered by moderation (`Partial<>` sized to the moderated surface) — fields never reviewed keep applying immediately, unchanged. | Non-moderated fields (e.g. capacity, location) silently stop updating in real time for no reason, or the buffer needlessly duplicates the whole editable surface. |
| **MEB3** | Buffer creation is gated on `moderationStatus.isApproved() \|\| moderationStatus.isRejected()` — content never yet approved is edited directly, no buffer. | Draft/never-reviewed content gets pointlessly buffered; nothing was visible to protect. |
| **MEB4** | `withXxxStatus()`/equivalent on the buffer VO returns a NEW instance — never mutates (VO4, value-object-pattern). | Shared-reference mutation can silently change a buffer another code path already read. |
| **MEB5 — MANDATORY the moment ANY decision path is manual (human moderator UI, not just an automated consumer)**: the aggregate carries a monotonic `_stagedEditRevision`/equivalent counter (never reset, never reused), and `applyModerationDecision()` takes an additional, optional, positional `revisionId` compared against it. | Without this, a moderator's approval applies to whatever is CURRENTLY in the buffer, not what they reviewed — a newer, unseen edit ships with the moderator's signature (TOCTOU). Confirmed unresolved in `GroupPostAggregate` today — see `GAP-GROUPS-PENDING-EDIT-FENCING-001`. |
| **MEB6** | `revisionId` passed to `applyModerationDecision()` MUST come from the SAME read (`findById()`) that produced the review view shown to the decider — the handler must NEVER re-fetch "the current revision" immediately before applying the decision. | Re-fetching compares the aggregate to itself; the fencing check in MEB5 can never trigger, silently disabling it while looking implemented. Applies symmetrically to an automated consumer that re-reads content fresh — same read must supply both content and revision. |
| **MEB7** | The stale-revision error and the "corrupted/never-issued" (revisionId ahead of the counter) error are TWO DISTINCT domain error classes, not one class with a flag. | Callers (and HTTP mapping) can't distinguish "review again, content moved on" (409, expected) from "this should not be possible" (signal of a deeper bug) if collapsed into one. |
| **MEB8** | The revision counter is a field distinct in NAME from any optimistic-lock `version` column in the persistence layer (`infrastructure/repository-pattern.md` RP5) — never reuse or overload that field. | Conflates two unrelated guarantees (concurrent-write protection vs stale-decision protection); a fix to one silently breaks the other. |
| **MEB9** | For a decision targeting the buffer, idempotency checks compare against the BUFFER's own `moderationStatus`, never the aggregate's main status. | Main status can already be `approved` (published earlier) while the buffer is `pending` — comparing against the wrong one silently no-ops every buffer decision. |
| **MEB10** | The buffer is NEVER added to the aggregate's `getSpecificationContext()` or to the visibility/authorization specification. | Re-opens a second, independent leak path in code that was already correct — the whole point of MEB1 is that the existing visibility rule needs no changes. |
| **MEB11** | Buffer gating for API exposure (owner/moderator only) is applied at EVERY call site that maps the row to a DTO, and — for any cache keyed without viewer identity — AFTER reading from cache, per viewer, never before writing to it. | One missed mapper call site, or a buffer value baked into a shared cache entry, leaks unapproved content to an unrelated viewer regardless of how correct steps MEB1-MEB9 are. |
| **MEB12** | Every manual moderation-queue query that lists "content pending review" MUST also match on buffer presence (e.g. `staged_edit IS NOT NULL`), not only on the main `moderationStatus`. | Adopting this pattern makes the main status stay `approved` while a buffer awaits its own decision (MEB1) — a queue filtering only on status goes blind to every buffered edit, a NEW gap this pattern creates, not an inherited one. |
| **MEB13** | The buffer's "submitted for moderation" event is dispatched through the SAME transactional outbox as the aggregate's first-submission moderation event — never via a direct fan-out/dispatch call from inside the handler. | Direct fan-out re-opens the event-before-commit race the first-submission path already had to fix; the buffer's review notification can reach the moderation consumer before (or even if) the save transaction commits. |

**Read `## Revision Fencing` in the full pattern before implementing MEB5-MEB7 — the
ordering of the fencing branches (stale vs unknown vs idempotent-same vs matching) is
easy to get subtly wrong.**
