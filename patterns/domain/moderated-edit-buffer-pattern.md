# Pattern: Moderated Edit Buffer

**Tags**: "api:domain:moderation-buffer"
**Layer**: Domain
**Level**: advanced
**Status**: experimental
**Scope**: project-specific (juz-ide-api-1) — single-project derivation, not yet validated
in a second codebase. Excluded from `retrieve_patterns` by default; pass
`project: "juz-ide-api-1"` to include it. Promote to universal once a second project adopts this shape.

## What This Is

When a moderated aggregate (a post, an event, an offer — anything with an AI/human
approve-reject-escalate-hidden gate) is edited **after** it was already approved and is
live, the edit must not simply overwrite the live content and flip its moderation status
back to pending — that hides content that real users are already relying on (RSVP'd
attendees, subscribers, anyone with the link). Instead, the new content goes into a
separate, immutable **edit buffer** on the aggregate. The live content stays exactly as
it was — still approved, still visible — while the buffer sits alongside it awaiting its
own, independent moderation decision. Only the buffer's owner (and moderators) ever see
it; everyone else keeps seeing the last-approved content until the buffer itself is
approved and swapped in.

Two variants exist in this codebase, differing only in **how much of the content** goes
into the buffer:

- **Full-content buffer** (`GroupPostPendingEdit`) — the entire editable surface is
  moderated, so the buffer mirrors it 1:1.
- **Field-level buffer** (`EventStagedEdit`, TS-CC-EVT-MOD-VISIBILITY-001) — only the
  fields that are actually AI/human-reviewed (e.g. `title`/`description`) go through the
  buffer; fields that were never moderated (e.g. `location`, `capacity`) keep applying
  immediately, unchanged. Use `Partial<...>` sized to the moderated surface, not the
  whole edit payload — copying the full-content shape onto a partially-moderated
  aggregate buffers fields nobody ever reviews, for no reason.

A third, optional ingredient — **revision fencing** — is required the moment any decision
on the buffer can be made by a *human*, not just an automated pipeline. See
"Revision Fencing" below; this is the part most likely to be skipped, and skipping it
re-opens the exact race this pattern exists to close.

## When to Use

**Use this pattern for:**
- ✅ An aggregate has a moderation gate (`ModerationStatus`: pending/approved/rejected/
  escalated/hidden) AND editing its already-approved, live content today resets that
  gate — silently hiding the item from everyone but the owner until re-approved.
- ✅ The moderated surface is a strict subset of the editable surface (some fields are
  reviewed, others aren't) — use the field-level (`Partial`) variant, not the full-copy
  one.
- ✅ A moderation decision can come from a **human moderator** clicking approve/reject in
  a UI, not only from an automated AI consumer — this is the trigger for adding revision
  fencing (see below), not an optional hardening.

**Do NOT use for:**
- ❌ Content with no moderation gate at all — there is nothing to protect; edit in place.
- ❌ Content that has never been approved yet (still `draft`/`pending`, nobody but the
  owner can see it regardless) — apply the edit directly to the live fields; a buffer
  protects visibility that doesn't exist yet. Gate the buffer creation on
  `moderationStatus.isApproved() || moderationStatus.isRejected()`, not on every edit.
- ❌ Concurrent-write protection between two writers racing to save the same aggregate —
  that is the existing `version`/optimistic-lock column in the persistence layer
  (`infrastructure/repository-pattern.md`, RP5). A moderated-edit-buffer's revision
  counter protects against a *stale decision*, not a *concurrent write* — see Revision
  Fencing below for why the two must stay separate fields with separate names.

## Implementation

### 1. The buffer Value Object (full-content variant — reference: `GroupPostPendingEdit`)

```typescript
// domain/.../value-objects/xxx-pending-edit.vo.ts
import { BaseValueObject } from '@vytches/ddd';
import { ModerationStatus } from '@shared/domain/value-objects/moderation-status.vo';

interface XxxPendingEditProps {
  readonly title?: string;
  readonly body: string;
  readonly mediaIds: string[];
  readonly submittedAt: Date;
  readonly moderationStatus: ModerationStatus;
}

export class XxxPendingEdit extends BaseValueObject<XxxPendingEditProps> {
  protected readonly props: XxxPendingEditProps;

  private constructor(props: XxxPendingEditProps) {
    super(props);
    this.props = props;
  }

  public static create(body: string, mediaIds: string[], title?: string): XxxPendingEdit {
    return new XxxPendingEdit({
      title, body, mediaIds: [...mediaIds],
      submittedAt: new Date(),
      moderationStatus: ModerationStatus.pending(),
    });
  }

  public static reconstitute(props: XxxPendingEditProps): XxxPendingEdit {
    return new XxxPendingEdit(props);
  }

  validate(props: XxxPendingEditProps): boolean {
    return props.body.length > 0 && props.submittedAt instanceof Date;
  }

  protected getEqualityComponents(): unknown[] {
    return [this.props.title, this.props.body, this.props.mediaIds.join(','),
            this.props.submittedAt.toISOString(), this.props.moderationStatus.status];
  }

  get title(): string | undefined { return this.props.title; }
  get body(): string { return this.props.body; }
  get mediaIds(): string[] { return [...this.props.mediaIds]; }
  get submittedAt(): Date { return this.props.submittedAt; }
  get moderationStatus(): ModerationStatus { return this.props.moderationStatus; }

  // Returns a COPY with a new status — never mutates. The live aggregate fields are
  // never touched here; only approveEdit()-equivalent logic ever applies buffer content.
  public withModerationStatus(moderationStatus: ModerationStatus): XxxPendingEdit {
    return new XxxPendingEdit({ ...this.props, moderationStatus });
  }
}
```

### 2. Field-level variant — only the moderated subset is `Partial`

```typescript
// domain/.../value-objects/xxx-staged-edit.vo.ts
interface XxxStagedEditProps {
  readonly title?: XxxTitle;        // only present if title actually changed
  readonly description?: XxxDescription; // only present if description actually changed
  readonly submittedAt: Date;
  readonly moderationStatus: ModerationStatus;
}
// Same BaseValueObject shape as above. Fields that are NOT part of the moderated
// surface (location, capacity, time range, ...) never appear here at all — they keep
// applying directly to the aggregate, unchanged, regardless of moderation status.
```

### 3. Aggregate wiring — `edit()` branches on what changed and on current status

```typescript
public edit(userId: string, props: Partial<EditableFields>): Result<void, XxxDomainError> {
  // ...ownership / lifecycle guards unchanged...

  const { moderatedFields, immediateFields } = splitByModeratedSurface(props); // e.g. {title,description} vs {location,capacity,timeRange}

  if (hasAny(immediateFields)) {
    applyImmediately(immediateFields);                    // unchanged today's behavior
    if (this._moderationStatus?.isApproved() || this._moderationStatus?.isRejected()) {
      this.resetModerationStatus();                        // unchanged today's behavior — these
    }                                                        // fields were never buffered
  }

  if (hasChanged(moderatedFields)) {
    if (this._moderationStatus?.isApproved() || this._moderationStatus?.isRejected()) {
      // Already-live, already-reviewed content: buffer it, do NOT touch the live status.
      this._stagedEdit = (this._stagedEdit ?? XxxStagedEdit.create()).withFields(moderatedFields);
      this._stagedEditRevision += 1;                        // see Revision Fencing
      this.apply(new XxxSubmittedForModerationEvent({ /* buffered content, not live */ }));
    } else {
      applyImmediately(moderatedFields);                    // nothing live to protect yet
    }
  }

  this.apply(new XxxEditedEvent({ /* changedFields + stagedFields subset */ }));
  return Result.empty();
}
```

### 4. Applying a decision — `applyModerationDecision()` branches on `isEdit`/buffer presence

```typescript
// Reference shape (GroupPostAggregate.applyModerationDecision) — decision matrix:
//   approved  + buffer exists → swap buffer content into live fields, clear buffer,
//                                emit XxxModeratedEvent (needed for cache invalidation)
//   rejected/escalated/hidden + buffer exists → buffer.withModerationStatus(newStatus)
//                                ONLY — live fields and live status stay untouched
//   same decision already recorded on the buffer → Result.empty() (idempotent no-op)
//   no buffer at all → behave exactly as before this pattern existed
switch (status) {
  case 'approved':
    if (this._stagedEdit) {
      this.applyStagedFieldsToLive();
      this._stagedEdit = undefined;                          // revision counter is NOT reset — see below
    } else {
      this._moderationStatus = ModerationStatus.approved();
    }
    this.apply(new XxxModeratedEvent({ /* ... */ }));         // required even when buffer-only — list caches key off this
    break;
  case 'rejected': case 'escalated': case 'hidden': {
    const next = ModerationStatus[status](level, category, confidence);
    if (this._stagedEdit) this._stagedEdit = this._stagedEdit.withModerationStatus(next);
    else this._moderationStatus = next;
    break;
  }
}
```

### 5. Revision Fencing — mandatory once a *human* decides

The buffer above is safe for a fully-automated pipeline: one consumer reads the
aggregate, evaluates it, decides, done — no time gap in which the buffer could change
under it. It stops being safe the moment a **moderator UI** exists: the moderator opens
a review queue (reads the aggregate, sees buffer content X), spends time reading it, then
clicks "approve" — and in that gap, the author could have edited again, replacing the
buffer with content Y. Without fencing, "approve" applies to **whatever is currently in
the buffer**, i.e. Y, carrying the moderator's signature on text they never saw.

```typescript
// Aggregate: monotonic counter, NEVER reset, NEVER reused. Deliberately NOT named
// "version" — that name is already the optimistic-lock column in the persistence layer
// (a different guarantee: concurrent writes, not stale decisions). Collapsing the two
// names makes it look like one mechanism when the failure modes are unrelated.
private _stagedEditRevision: number = 0;
get stagedEditRevision(): number { return this._stagedEditRevision; }

public applyModerationDecision(
  status: ModerationStatusEnum, level?: ModerationLevelEnum, category?: string,
  confidence?: number, reason?: string, moderatorId?: string,
  revisionId?: number,                                       // additive, positional, last (see command-handler-pattern CH11 on branch symmetry)
): Result<void, XxxDomainError> {
  if (this._stagedEdit) {
    if (revisionId === this._stagedEditRevision) {
      // proceed exactly as in step 4
    } else if (this._stagedEdit.moderationStatus.status === status) {
      return Result.empty();                                  // already-recorded identical decision — idempotent no-op
    } else if (revisionId! < this._stagedEditRevision) {
      return Result.fail(StaleModerationRevisionError.of(revisionId, this._stagedEditRevision));   // "stale" — content moved on since the reviewer opened it
    } else {
      return Result.fail(UnknownModerationRevisionError.of(revisionId, this._stagedEditRevision)); // "impossible" — revisionId ahead of what the aggregate has ever produced; corrupted caller state, NOT the same failure as stale
    }
  }
  // ...no-buffer path, unchanged...
}
```

The **caller** (application-layer command handler) must source `revisionId` from the
**same read** that produced the review-queue view shown to the moderator — never
re-fetch "the current revision" immediately before calling `applyModerationDecision`.
Re-fetching compares the aggregate's state to itself and the fencing guard can never
trigger — this exact mistake was caught mid-design by an independent security review
before it shipped (see `docs/security/threat-models/TM-TS-CC-EVT-MOD-VISIBILITY-001.md`,
D5). The same single-read discipline applies **symmetrically** to an automated AI
consumer that re-reads the aggregate fresh at decision time (a legitimate pattern to
avoid a different, older race) — both the content it evaluates and the `revisionId` it
passes back must come from that one read, not two.

### 6. Exposure gating — every serialization path, not just the primary one

The buffer is visible to its owner and to moderators only. This is easy to get right in
the one endpoint you're thinking about (the detail view) and easy to miss everywhere
else the same row gets turned into a DTO: list/feed endpoints, any shared query-result
cache. A cache keyed without the viewer's identity **must never store the buffer in the
cached value** — gate it out (or in) **after** reading from cache, per viewer, never
before writing to cache. One shared cache entry containing the buffer, served to two
different viewers, is a moderation-bypass-adjacent leak even though the mechanism above
is otherwise correct.

## Anti-Patterns

### Anti-Pattern 1: Buffer without revision fencing once a human decision path exists

`GroupPostAggregate.applyModerationDecision()` (the reference implementation this
pattern is extracted from) has a manual-decision code path (`moderatorId` parameter,
human moderator UI) but **no revision counter and no fencing at all** — `isEdit: true`
decisions apply to whatever is currently in `_pendingEdit`, unconditionally. This is
exactly the race described in "Revision Fencing" above, live and unresolved as of this
writing. It was not caught earlier because until TS-CC-EVT-MOD-VISIBILITY-001 built the
same mechanism for events and put it through an independent security review, nobody had
looked at this angle for group posts. Tracked as
`GAP-GROUPS-PENDING-EDIT-FENCING-001` in `docs/security/security-gaps.md` (juz-ide-api-1)
— **do not copy `GroupPostPendingEdit`'s decision-application code verbatim into a new
aggregate that has a manual moderator UI; add the fencing from step 5 first.**

### Anti-Pattern 2: Resetting moderation status on ANY edit to live content

The bug this pattern exists to fix: treating every edit to an approved, live item as
"start over" — resetting `moderationStatus` to pending and, as a side effect, hiding the
item from everyone but the owner via the visibility rule that keys off that status. The
fix is never to touch the visibility rule (it was already correct — it just needs the
live status to actually stay `approved`); the fix is to stop flipping the status for
reviewed fields.

### Anti-Pattern 3: Comparing the wrong status for idempotency

When checking "is this decision already applied" for a buffer-targeted decision, compare
against the **buffer's own** `moderationStatus`, never the aggregate's main
`moderationStatus` — the main status can already be `approved` (the live content was
published earlier) while the buffer is still `pending`. Comparing against the main
status makes every buffer decision silently no-op (`TS-SEC-GROUP-POST-MODERATION-GAP-001`
in this codebase's history).

### Anti-Pattern 4: Letting the buffer leak into the visibility/authorization specification

Do not add buffer-awareness (`hasStagedEdit`, `stagedEdit !== undefined`, etc.) to the
aggregate's `getSpecificationContext()` or to whatever specification governs who can view
the item. The whole point of keeping the live fields untouched is that the *existing*
visibility rule — based only on the main status and ownership — keeps working without
modification. Adding a new branch there re-opens a second way to leak unapproved content,
in the one place that was already correct.

### Anti-Pattern 5: A manual moderation queue that filters only on the main `moderationStatus`

This pattern's whole point is that adopting it makes the aggregate's main
`moderationStatus` stay `approved` while a buffer sits alongside it awaiting its own
decision (MEB1). Any query that lists "content pending review" by filtering
`moderationStatus = 'pending'` — written *before* this pattern existed, when pending
content and hidden content were the same thing — goes blind to every buffer the moment
this pattern ships, because the row it should surface now reports `approved`. This is not
a pre-existing gap being inherited; it is a **new** blind spot the pattern itself creates
in any consumer that hasn't been updated to also match on buffer presence (e.g.
`staged_edit IS NOT NULL` alongside the status filter). Confirmed independently in two
sibling adoptions (`TS-CC-EVT-MOD-VISIBILITY-001`, `TS-NE-LS-MOD-VISIBILITY-001`) — treat
updating every manual review-queue query as a mandatory step of adopting this pattern, not
an optional follow-up, and audit any earlier adopter that shipped without this check
(`GroupPostAggregate` — tracked as `GAP-GROUPS-PENDING-EDIT-FENCING-001`, queue-visibility
angle unverified as of this writing).

### Anti-Pattern 6: Submitting the buffer for moderation via direct fan-out instead of the transactional outbox

Emitting the "this buffer needs review" integration event by calling a fan-out/dispatch
service directly (e.g. `IntegrationEventFanOutService.fanOut()`) from inside the
command handler, instead of writing it through the same transactional outbox that the
aggregate's *first-submission* moderation event already uses, re-opens the exact
event-before-commit race this codebase already fixed once for first submissions: the
event reaches the moderation consumer before (or even if) the transaction that saved the
buffer ever commits. Route the buffer's moderation-submission event through the same
outbox mechanism as the initial submission — never introduce a second, weaker delivery
path for what is conceptually the same "submitted for review" event just because the
trigger is an edit instead of a create (`TS-NE-LS-MOD-VISIBILITY-001`, D10).
