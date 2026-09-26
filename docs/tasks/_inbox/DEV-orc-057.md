---
id: DEV-orc-057
status: promoted
resolution: >
  Naprawione 2026-09-26 jako ORC-067 (docs/decisions/orchestrate-rule-history.md#orc-067):
  Krok 4 commands/orchestrate.md wymaga teraz `git add` plików z `report`, POTEM
  `git status --short` jako weryfikację, i budowy treści HALT z tego zweryfikowanego stanu
  zamiast z samej wyliczonej listy. Prompt-only (git add/status dzieją się w agencie
  orkiestrującym poza Workflow()) — kandydat do automatyzacji, gdyby powtórzyło się częściej.
trigger: halt
rule_ref: ORC-057
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-orc-057

## Occurrences

- 2026-09-26 ai-os-bot (BOT-009) run `wf_d9d51f1a-69a` — Workflow zwrócił finalny raport z polem 'staged' wypisującym 8 plików, ale rzeczywisty 'git status' po zakończeniu przebiegu pokazywał ZERO plików faktycznie zastage'owanych (working tree miał je jako modified/untracked, nie staged) — silnik nie wykonał realnego 'git add' zgodnego z kontraktem exit: STAGE_NOT_COMMIT, tylko wyliczył listę i zgłosił ją jako fakt. Naprawione ręcznie przez koordynatora ('git add' tej samej listy) przed HALT-em do człowieka, żeby obietnica 'staged, not committed' była prawdziwa w chwili raportu.
