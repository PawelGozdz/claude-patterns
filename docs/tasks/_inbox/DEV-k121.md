---
id: DEV-k121
status: proposed
trigger: agent_note
category: silent
sources:
  - orchestrate
rule_ref: K121
first_seen: 2026-11-07
last_seen: 2026-11-07
occurrences: 1
projects:
  - claude-patterns
---

# DEV-k121

## Occurrences

- 2026-11-07 claude-patterns (TASK-KAIZEN-002) — Poprawka K50 działa częściowo: od 2026-11-04 38-63% dziennych wpisów w `~/.claude/logs/agent-usage.jsonl` znów ma `"agent":"unknown"` (z 3000 ostatnich wierszy: dnia 2026-11-07 274 z 623 wierszy, 11-06 93 z 220, 11-05 84 z 219, 11-04 119 z 189; 11-03 jeszcze 0 z 342). Te wiersze mają `model: null`, zerowe tokeny i `duration_ms: null`, więc payload SubagentStop nie niósł ani `agent_type`, ani `agent_transcript_path`. Występują w większości projektów (juz-ide-api-1..8, vytches-ddd, ai-gateway, mobile-app). Hipoteza do sprawdzenia: Claude Code zmienił payload dla pewnego rodzaju subagentów (tła, forki) albo hook odpala się także dla zdarzeń bez subagenta. Pierwszy krok: zapisać klucze payloadu przy `unknown` (auto-debug w `hooks/subagent-stop-cost-log.js` wyłącza się po 5 wpisach, a plik `agent-usage-debug.jsonl` ma 7 linii z 2026-10-17). Do czasu naprawy koszt per agent z tego logu jest zaniżony.
