---
id: DEV-orc-005
status: promoted
resolution: >
  Naprawione jako ORC-102 (2026-10-08): prepare kończy exit 2 z treścią błędu YAML zamiast gubić decisions[]/minor_fixes[]; hook check-human-voice ostrzega przy zapisie analizy.
trigger: agent_note
rule_ref: ORC-005
first_seen: 2026-10-08
last_seen: 2026-10-08
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-005

## Occurrences

- 2026-10-08 juz-ide-api-1 (TS-REP-VERIFICATION-LEVEL-SOURCE-001) — orchestrate-prepare: frontmatter analizy z niepoprawnym YAML (dwukropek w nieujętym w cudzysłów polu rag:) jest cicho ignorowany — decisions[], minor_fixes[], layers_done[] czytane jako puste (pierwszy przebieg TS-REP-VERIFICATION-LEVEL-SOURCE-001 poszedł bez 12 decyzji z analizy; wykryte dopiero po 3 rundach NO_GO). Prepare powinno głośno odrzucać frontmatter, którego nie da się sparsować (exit 2) zamiast schodzić do pustych pól.
