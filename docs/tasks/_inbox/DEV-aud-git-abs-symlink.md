---
id: DEV-aud-git-abs-symlink
status: proposed
trigger: setup_drift
sources:
  - audit
rule_ref: AUD-GIT-ABS-SYMLINK
first_seen: 2026-10-10
last_seen: 2026-10-14
occurrences: 4
projects:
  - grant-flow-TS-PROJ-COMPANY-001
  - juz-ide-api-4
  - grant-flow
  - marketing-hub
category: config
---

# DEV-aud-git-abs-symlink

## Occurrences

- 2026-10-14 marketing-hub — symlink z absolutną ścieżką w gicie — martwy na innej maszynie (2): .claude/agents/pattern-auditor.md → /opt/projects/claude-patterns/agents/stacks/design-system/pattern-auditor.md, .claude/agents/token-drift.md → /opt/projects/claude-patterns/agents/stacks/design-system/token-drift.md; git rm --cac
- 2026-10-14 grant-flow — symlink z absolutną ścieżką w gicie — martwy na innej maszynie (4): .claude/agents/business-rules-auditor.md → /opt/projects/claude-patterns/agents/stacks/nestjs-ddd/business-rules-auditor.md, .claude/agents/domain-application-implementer.md → /opt/projects/claude-patterns/agents/stacks/nestjs-ddd/i
- 2026-10-10 juz-ide-api-4 — symlink z absolutną ścieżką w gicie — martwy na innej maszynie (5): .claude/agents/infrastructure-implementer.md → /opt/projects/claude-patterns/agents/stacks/nestjs-ddd/implementers/infrastructure-implementer.md, .claude/agents/test-implementer.md → /opt/projects/claude-patterns/agents/stacks/nestj
- 2026-10-10 grant-flow-TS-PROJ-COMPANY-001 — symlink z absolutną ścieżką w gicie — martwy na innej maszynie (4): .claude/agents/business-rules-auditor.md → /opt/projects/claude-patterns/agents/stacks/nestjs-ddd/business-rules-auditor.md, .claude/agents/domain-application-implementer.md → /opt/projects/claude-patterns/agents/stacks/nestjs-ddd/i
