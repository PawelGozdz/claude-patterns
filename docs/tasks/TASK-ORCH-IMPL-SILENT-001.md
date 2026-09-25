---
id: TASK-ORCH-IMPL-SILENT-001
title: 'infrastructure-implementer kończy bez StructuredOutput 4 na 4 razy: prompt za ciężki czy definicja agenta?'
type: spike
status: done
priority: P2
story_points: 2
created_date: 2026-09-24
updated_date: 2026-09-24
assignee: '@unassigned'
labels: [kaizen, orchestration, agents, cost]
depends_on: []
related: [TASK-ORCH-FALSE-GO-001, TASK-ORCH-PREPARE-FORMS-001]
source: >
  Feedback z marketing-hub, 2026-09-24, run wf_a95b083c-a06 (TS-MH-005), punkt 10.
  Journal: ~/.claude/projects/-opt-projects-marketing-hub/a38e6efd-…/subagents/workflows/wf_a95b083c-a06/journal.jsonl.
---

# TASK-ORCH-IMPL-SILENT-001: ciche śmierci implementera infrastruktury

## 🎯 Goal

Ustalić, dlaczego `infrastructure-implementer` w TS-MH-005 zakończył bez wyniku we wszystkich
4 wywołaniach, także przy warstwach z 2-8 plikami, a `domain-application-implementer` raz na 6.
Diff-sonda (ORC-038) uratowała pracę, ale każda taka próba to około 40 spalonych tur.

## Hipotezy do sprawdzenia w journalu

1. Prompt za ciężki: decyzje (~17 KB) i karty (~90 KB) wracają w każdej turze, więc budżet
   `implTurns: 40` kończy się, zanim agent dojdzie do oddania wyniku. Sprawdzić: liczba tur
   i rozmiar kontekstu przy ostatniej turze każdej martwej próby.
2. Definicja agenta nie prowadzi do StructuredOutput: porównać
   `agents/stacks/nestjs-ddd/implementers/infrastructure-implementer.md` z
   `domain-application-implementer.md` (zmieniony w tym cyklu) pod kątem sekcji o formie
   wyniku i momencie jej oddania.
3. Karty wzorców bez filtra: `cardsFor` daje warstwie jej karty plus wszystkie globalne.
   Po `patterns_exclude` (TASK-ORCH-PREPARE-FORMS-001) i brakującej karcie zod (13,5 KB pełnego
   wzorca) rozmiar może spaść na tyle, że problem zniknie sam.

## ✅ Kryterium ukończenia

Wniosek z liczbami z journala (tury, bajty promptu, ostatnie narzędzie przed śmiercią) i jedna
z trzech decyzji: zmiana definicji agenta, zmiana budżetu/kart w prepare albo „rozwiązane przez
PREPARE-FORMS-001". Wpis w `orchestrate-rule-history.md` przy ORC-038.

## Wynik (2026-09-24)

Dane z transkryptów `wf_a95b083c-a06` (tury liczone po unikalnym `requestId`, tak jak liczy `maxTurns`):

| Wywołanie | Tury | Ostatnie narzędzie | Wynik | Prompt (decyzje / karty) |
|---|---|---|---|---|
| infra-contracts-config, próba 1 | 40 | Bash | brak | 106 KB (11 / 89 KB) |
| infra-migration, próba 1 | 40 | Read | brak | 91 KB (11 / 75 KB) |
| infra-crypto-repos, próba 1 | 40 | Read | brak | 91 KB (11 / 75 KB) |
| infra-module-acl, próba 1 | 40 | Bash | brak | 91 KB (11 / 75 KB) |
| te same warstwy, kolejna próba | 5–15 | StructuredOutput | jest | jak wyżej |
| domain-app application-capture-confirm | 40 | Read (41 Readów) | brak | 91 KB (11 / 75 KB) |
| pozostałe 5 warstw domain-app | 17–35 | StructuredOutput | jest | ~91 KB (11 / 75 KB) |

- Hipoteza 1 (budżet tur) potwierdzona jako mechanizm: każda cicha śmierć kończy się na dokładnie 40. turze.
- Hipoteza 2 (definicja agenta nie prowadzi do StructuredOutput) obalona: obie definicje mają tę samą sekcję TURN BUDGET.
- Hipoteza 3 (rozmiar kart) obalona jako przyczyna: karty tej samej wagi (75 KB) są i w udanych warstwach domeny, i w martwych warstwach infra.
- Faktyczny wyróżnik: `infrastructure-implementer` ma Bash (domain-app ma go zabronionego). Martwe próby infra zużyły 13, 15, 18 i 35 wywołań Bash, głównie na iteracyjny `tsc`/build, wbrew własnej regule „one Bash for a build check".

Zmiana: sekcja TURN BUDGET w `agents/stacks/nestjs-ddd/implementers/infrastructure-implementer.md` zakazuje pętli kompilacji/testów przez Bash (sonda robi to zaraz po implementerze) i każe oddać wynik częściowy przy ~80% budżetu. Ta sama zasada trafiła do promptu implementera w `orchestrate.template.mjs`, więc obejmuje też `general-purpose`. Budżetu `implTurns` nie zmieniono: udane próby mieszczą się w 5–35 turach.
