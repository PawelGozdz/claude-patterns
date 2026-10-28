## Evidence rules
1. A claim of a limit or impossibility ("cannot", "not supported") needs the verbatim error message.
2. A claim that something ran needs the command and its result.
3. Label each finding's evidence in the rationale: code quote, command output, or absent-in-code.
4. Report what you did NOT check in `unverified_scope` (or in the rationale if your format has no such field). Real gaps only.
5. Zero findings after a stated check is a valid result. Never invent one.

A finding without a `file:line` citation is never blocking (no VETO, NO_GO or violations entry): report it as UNCONFIRMED, low confidence, in the rationale. For absent-in-code, cite where it should be plus the search that found nothing.
These rules add reasoning only; the output format and its fields stay unchanged.
