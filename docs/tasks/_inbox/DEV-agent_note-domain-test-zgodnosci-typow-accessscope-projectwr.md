---
id: DEV-agent_note-domain-test-zgodnosci-typow-accessscope-projectwr
status: dismissed
dismissed_reason: >
  Błąd planu w analizie projektu (3.1): test zgodności typów i test kysely-task-cost-breakdown
  nie miały właściciela w jednostkach (ANL-038/053, ten sam task co DEV-orc-144-final-gate).
  Obejście przez --overrides layers.testing.scope.dirs zadziałało zgodnie z ORC-042.
  2026-11-03.
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-11-02
last_seen: 2026-11-02
occurrences: 1
projects:
  - grant-flow
---

# DEV-agent_note-domain-test-zgodnosci-typow-accessscope-projectwr

## Occurrences

- 2026-11-02 grant-flow (TS-PROJ-WRITEOWN-002) run `wf_a427a602-2c6` warstwa `domain` — domain: test zgodności typów AccessScope/ProjectWriteScope należy do warstwy application, odnotowany tylko w BR-PROJ-042; infrastructure w layers_skip nie obejmuje testu kysely-task-cost-breakdown (4 konstrukcje komend bez scope), obejście przez --overrides layers.testing.scope.dirs.
