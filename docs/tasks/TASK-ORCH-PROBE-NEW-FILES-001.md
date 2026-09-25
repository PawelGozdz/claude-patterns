---
id: TASK-ORCH-PROBE-NEW-FILES-001
title: 'Sondy `orchestrate.template.mjs` nie widzą NOWYCH plików — fałszywy ESCALATE_AND_HALT przy zadaniach dodających same testy'
type: bugfix
status: done
priority: P1
story_points: 1
created_date: 2026-09-24
updated_date: 2026-09-24
assignee: '@unassigned'
labels: [kaizen, orchestration, workflow]
depends_on: []
related: [TASK-KAIZEN-002]
source: >
  Znalezione 2026-09-23/24 podczas realnego przebiegu /orchestrate TS-AIG-015 w satelicie ai-gateway
  (run wf_895a3077-bdc). Zadanie dodawało wyłącznie dwa NOWE pliki testów (426 + 90 linii, 17 bloków
  it/describe, typecheck/lint/vitest EXIT 0). Silnik zjadł 3 próby implementera i skończył
  ESCALATE_AND_HALT z „przyrost bloków wykonywalnych = 0”, zanim weryfikator warstwy i bramka końcowa
  w ogóle ruszyły. Weryfikacja i bramka dokończone ręcznie (GO, test mutacyjny 4/4, PASS), więc
  przebieg nie był zablokowany — ale to obejście, nie fix.
---

# TASK-ORCH-PROBE-NEW-FILES-001 — sondy diff nie widzą nowych plików

## Objaw

Przebieg z jednostką, która tylko TWORZY pliki (typowo: nowe pliki testów), kończy się fałszywym
NO_GO, choć praca jest zrobiona i zielona:

- próba 1: implementer tworzy pliki (nieśledzone) → sonda przyrostu liczy 0;
- próba 2: bramka „kod istnieje”: żaden plik w zakresie nie zmieniony” (nowe pliki są `??`);
- próba 3: implementer „robi realne zmiany” i stage'uje (`A`/`AM`) → sonda przyrostu nadal 0 →
  `ESCALATE_AND_HALT`.

## Przyczyna (dwa miejsca w `scripts/workflow/orchestrate.template.mjs`)

1. **Bramka „kod istnieje”** (~l. 533): `git diff --name-only` / `git diff --stat` pokazują tylko
   zmiany ŚLEDZONYCH plików względem indeksu. Plik nieśledzony (`??`) jest niewidoczny, a plik
   w pełni zestage'owany (`A`) też — bo porównanie idzie working tree ↔ index.
2. **Sonda przyrostu** (~l. 237): `git add -N …; git diff -U0 …`. `add -N` ratuje plik nieśledzony,
   ale nie ratuje pliku już dodanego do indeksu przez agenta: `git diff` (bez `HEAD`) pokazuje
   wtedy tylko różnicę working tree ↔ index, czyli drobne poprawki z ostatniej próby → 0 bloków.

## Poprawka

- Obie sondy porównują z `HEAD`, nie z indeksem, i uwzględniają nieśledzone pliki:
  - bramka: `git add -N -- <scope> 2>/dev/null; git diff HEAD --name-only -- <scope>`
    (albo `git status --porcelain -- <scope>` jako źródło listy plików);
  - przyrost: `git add -N -- <scope> 2>/dev/null; git diff HEAD -U0 -- <scope> | grep -cE …` —
    w JEDNEJ linii źródła (WL6).
- Przy okazji regex liczący bloki: `^\+\s*(it|test|testWidgets|describe|group)\(` nie łapie
  `describe.each(`/`it.each(`/`test.each(` (po nazwie jest `.`, nie `(`). Rozszerzyć o
  `(\.(each|only|skip|concurrent)\b[^(]*)?\(` albo równoważnie.
- Uwaga: `git add -N` zostawia ślad intent-to-add w indeksie — sprawdzić, czy późniejsze kroki
  (`STAGE_NOT_COMMIT`, lista `staged`) nie traktują go jak zestage'owanej treści.

## Drugie potwierdzenie: marketing-hub (2026-09-24)

Ten sam błąd zgłoszony z marketing-hub (TS-MH-003 oraz run `wf_a95b083c-a06`). Tam każde repo
łatało go w swojej kopii skryptu, więc kanon jest jedynym miejscem, gdzie wciąż nie działa.
Feedback wskazuje trzecie miejsce, pominięte wyżej:

3. **Diff-sonda po cichej śmierci** (`buildDiffProbePrompt`, ~l. 251, ORC-038):
   `git status --short` pokazuje nowy katalog jako jedną pozycję (`?? contexts/audience/`),
   a nie jako listę plików. `layerTouches` dopasowuje wtedy katalog, ale `layerFiles` dostaje
   ścieżkę katalogu zamiast plików. Poprawka z feedbacku:
   `git diff --name-only; git diff --cached --name-only; git ls-files --others --exclude-standard`
   (albo `git status --porcelain -uall`). Warto użyć JEDNEGO wspólnego polecenia dla bramki
   i diff-sondy, żeby nie rozjechały się ponownie.

Reguła `workflow-lint`: bramka i diff-sonda muszą uwzględniać pliki nieśledzone (`ls-files --others`,
`-uall` albo `add -N` + `diff HEAD`). Test dwukierunkowy: obecny kształt z l. 251 i l. 533 zostaje
zatrzymany, poprawiony przechodzi.

## Kryterium ukończenia

Eval `tests/flow-evals/orchestrate-script/run.js` ma przypadek „jednostka tworzy wyłącznie nowe
pliki testów” w trzech stanach drzewa (nieśledzone, `A`, `AM`) — w każdym bramka widzi pliki,
a `newTestBlocks > 0`. `hooks/workflow-lint.js` bez naruszeń.

## Wynik (2026-09-24)

Zrobione razem z TASK-ORCH-FALSE-GO-001. Bramka „kod istnieje", diff-sonda i lista plików bramki
końcowej używają jednego polecenia (`treeFilesCmd`: `git diff --name-only <baza>; git ls-files
--others --exclude-standard`), sonda przyrostu `git diff HEAD`, licznik łapie `.each/.only/.skip/
.concurrent`. Eval na prawdziwym repo w trzech stanach (nieśledzony, `A`, `AM`); stary kształt
sprawdzony ręcznie: licznik 0, bramka pusta dla `A`. Reguła `workflow-lint` WL18 (WARN), testowana
na kanonicznym skrypcie z wyciętym `ls-files`. Uwaga o `git add -N`: ślad intent-to-add jest
widoczny w `git diff --name-only HEAD`, więc lista plików go obejmuje; stage'owanie robi człowiek.
Opis: ORC-063.
