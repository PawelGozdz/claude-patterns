---
id: DEV-anz-pattern-mismatch-testing
status: promoted
resolution: >
  Przeniesione do TASK-ORCH-CARDS-STACK-MISMATCH-001 (testing-pyramid-pattern zakłada
  NestJS/DDD, ai-gateway to płaski serwis Node).
trigger: analyze_note
category: other
sources:
  - analyze
rule_ref: ANZ-PATTERN-MISMATCH
first_seen: 2026-10-11
last_seen: 2026-10-11
occurrences: 1
projects:
  - ai-gateway
---

# DEV-anz-pattern-mismatch-testing

## Occurrences

- 2026-10-11 ai-gateway (TS-AIG-079) warstwa `testing` — testing/testing-pyramid-pattern.md (trigger test|coverage w aig-panel) zakłada NestJS/DDD (L1 Specification, BUSINESS_RULES.yaml); ai-gateway to płaski serwis Node bez DDD
