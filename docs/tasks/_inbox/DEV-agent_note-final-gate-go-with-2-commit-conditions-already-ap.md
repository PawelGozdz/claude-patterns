---
id: DEV-agent_note-final-gate-go-with-2-commit-conditions-already-ap
status: proposed
trigger: agent_note
rule_ref: null
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 1
projects:
  - marketing-hub
---

# DEV-agent_note-final-gate-go-with-2-commit-conditions-already-ap

## Occurrences

- 2026-09-26 marketing-hub (TS-MH-010) run `wf_a4483b37-682` — Final gate GO with 2 commit conditions (already applied by orchestrator: staged worktree versions for the 67 files with stale index content; excluded apps/web/test/e2e/visual.spec.ts and apps/web/test-results/.last-run.json from the commit -- out of task scope, breaks format:check). Open gaps noted by verifier: SI3 doesn't address in-process rate-limit store with no external backend (treated as not-applicable); SI2/DI4 assume @Auth() per method but repo uses global IamHeadersGuard + PermissionsGuard default-deny + guardians (treated as compliant, every controller method has @RequirePermissions). Follow-up WARNs: no mechanical guardian against error-message leaks for authorization-error.mapper.ts (only manual coverage list); in-process auth cache invalidation is per-replica only, single-replica assumption (D8) breaks above 1 replica.
