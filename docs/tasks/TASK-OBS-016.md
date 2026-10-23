---
id: TASK-OBS-016
title: 'process: tool — emiter Skill/Agent poza przebiegiem i plan w każdej komendzie'
type: feature
status: todo
priority: P2
story_points: 5
created_date: 2026-10-22
updated_date: 2026-10-22
assignee: '@unassigned'
labels: [observability, telemetry, hooks, commands]
epic: EP-OBSERVABILITY-002
depends_on: [TASK-OBS-013]
related: [TASK-OBS-003, TASK-OBS-011]
source: 'ADR 0015 D4'
---

# TASK-OBS-016: narzędzia mierzone jak procesy

## 🎯 Goal

Odpowiedzieć, które skille, agenci i komendy są używane i jak kończą. Telemetria widzi siedem procesów;
nie widzi 203 skilli, 34 z 36 komend ani agentów wołanych poza Workflow (panel przeglądu, `product-owner`,
`reviewer-*`). Druga część: „czy czegoś nie pominięto" dla każdej komendy, nie tylko dla `/orchestrate`
i `/analyze`.

## Zakres

1. Nowa wartość `process: tool` (aneks ADR 0012). Hook PreToolUse/PostToolUse na `Skill`: `step.end`
   ze `step.role` = nazwa skilla, czas, wynik `ok`/`failed` z odpowiedzi narzędzia. Hook na `Agent`
   bez otwartego przebiegu (dziś `telemetry-agent-start` go pomija): to samo z typem agenta, tokenami i
   kosztem z transkryptu (`telemetry-agent-stop`). Argumenty skilla, prompt i ścieżki nie są zapisywane.
2. Plan w komendach: pole `telemetry.plan` we frontmatterze (lista id kroków); komenda emituje
   `run-start --plan` i `run-end`, hooki przypinają agentów po markerze `[slot:<id>]` jak w ANL-041.
   Pierwsza fala: `/review-panel`, `/security-review`, `/pulse`, `/sprint`, `/threat-model`.
3. `scripts/ci/validate-commands.js`: komenda, która woła agentów, ma `telemetry.plan`; brak = ostrzeżenie
   (błąd po migracji wszystkich komend, osobny krok).
4. Rollup: `process: tool` liczy `step.role` jak dotąd; nic nowego poza wartością listy.
5. Eval `hooks` (Skill ok/failed, Agent poza przebiegiem, Agent wewnątrz przebiegu nie dubluje kroku)
   i `validate-commands`.

## Kontekst dla świeżej sesji

- **Start po odmrożeniu hooków**, jak TASK-OBS-011 i TASK-OBS-015.
- Nie mierzymy każdego Read/Grep (odrzucone w ADR 0015): tylko Skill, Agent, komendy i blokady.
- Użycie wzorców (retrieve_patterns) jest poza zakresem: emiter leży w `knowledge-retriever`.

## Kryteria akceptacji

- [ ] Wywołanie skilla zostawia jedno zdarzenie `process: tool` bez argumentów skilla (test).
- [ ] Agent wołany poza przebiegiem ma krok z kosztem; wołany w przebiegu nadal jeden krok, nie dwa.
- [ ] Pięć komend z pierwszej fali ma plan; `run-end` dopisuje `skipped` dla pominiętego kroku.
