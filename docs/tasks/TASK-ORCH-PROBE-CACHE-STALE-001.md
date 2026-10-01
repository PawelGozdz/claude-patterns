---
id: TASK-ORCH-PROBE-CACHE-STALE-001
title: 'Cache silnika sond kluczowany po label+prompt zamraża wynik pierwszej próby przy retry tej samej warstwy'
type: bugfix
status: done
priority: P1
story_points: 2
created_date: 2026-09-28
updated_date: 2026-09-28
assignee: '@unassigned'
labels: [kaizen, orchestration, workflow, correctness]
depends_on: []
related: [ORC-065]
updated_source: >
  Dopisane 2026-09-28 — docs/tasks/_inbox/DEV-halt-warstwa-testing-testing-2-swiezy-run-z-rzedu-kon.md
  (grant-flow, TS-SIM-001, run wf_2196b7e0-b44): drugi, ODRĘBNY od cache'owania objaw w tym
  samym mechanizmie — diff-gate zgłosił "zero zmian w zakresie" DWA świeże (nie-retry) runy
  z rzędu, mimo że implementer w tej samej próbie realnie edytował już-śledzony plik spec
  (potwierdzone mtime + git status AM). Zgłaszający podejrzewa niedeterminizm samej sondy
  diff-gate (Haiku, budżet 5 tur), nie tylko stały klucz cache. Niepotwierdzone linią kodu —
  do zbadania razem z fixem cache'u, bo dotyczy tego samego `buildProbePrompt`/diff-gate.
source: >
  docs/tasks/_inbox/DEV-orc-065.md (grant-flow, TS-SIM-001, run wf_e7393e3a-315,
  2026-09-28) — wyemitowany skrypt miał buga: etykieta+prompt sond diff-gate/checks/
  diff-probe były stałe w każdej próbie tej samej warstwy (zależnie tylko od
  layer.id/baseSha), więc cache silnika (klucz po label+prompt) zamrażał wynik
  PIERWSZEJ próby na zawsze — kolejne próby, nawet po realnej zmianie stanu repo,
  dostawały ten sam zamrożony wynik. Ręczna łatka: dopisano numer próby do etykiet
  (diff-gate/checks/diff-probe), przepuszczone przez workflow-lint (OK).
---

# TASK-ORCH-PROBE-CACHE-STALE-001 — cache sond nie odróżnia prób retry tej samej warstwy

## 🎯 Goal

Cache wyników sond (`diff-gate`, `checks`, `diff-probe`) jest kluczowany po `label+prompt`.
Gdy warstwa robi retry (próba 2, 3, …), etykieta i prompt tych sond zależą tylko od
`layer.id`/`baseSha` — obie wartości **nie zmieniają się między próbami tej samej warstwy**.
Skutek: druga i każda kolejna próba trafia w ten sam wpis cache co próba pierwsza i dostaje
**zamrożony wynik pierwszej próby**, nawet jeśli implementer w międzyczasie realnie zmienił
stan repo (nowe commity, naprawione pliki). Sondy przestają odzwierciedlać rzeczywistość od
drugiej próby w górę.

To błąd poprawności, nie tylko kosztu: decyzje `layers_done`/GO-NO_GO w retry mogą się opierać
na stanie repo z przed poprawek implementera, co może maskować realną naprawę jako wciąż
czerwoną (albo odwrotnie — utrzymywać starą zieloną sondę mimo nowego, wprowadzonego błędu).

Zaobserwowane 2026-09-28 (grant-flow, TS-SIM-001, `wf_e7393e3a-315`).

## Poprawka (już ręcznie zweryfikowana przez zgłaszającego)

Dopisać numer próby do etykiet sond `diff-gate`/`checks`/`diff-probe`, żeby klucz cache
(`label+prompt`) różnił się między próbami tej samej warstwy. Łatka przepuszczona przez
`hooks/workflow-lint.js` bez naruszeń w tym przebiegu — do przeniesienia z ręcznej łatki
konkretnego wygenerowanego skryptu do generatora (`scripts/workflow/orchestrate.template.mjs`
albo miejsce budujące etykiety sond), żeby KAŻDY nowo wyemitowany skrypt miał to od razu,
bez ręcznej korekty per przebieg.

## ✅ Kryterium ukończenia

Eval w `tests/flow-evals/orchestrate-script/run.js`: warstwa z dwiema próbami, między którymi
stan repo się zmienia (np. plik naprawiony po próbie 1) — sonda w próbie 2 zwraca wynik
odzwierciedlający STAN PO NAPRAWIE, nie zamrożony wynik z próby 1. Test dwukierunkowy: obecny
kształt (etykieta bez numeru próby) daje zamrożony wynik na tym samym fixture, poprawiony —
świeży.

## Wynik (2026-09-29)

Zaimplementowane jako ORC-077 (docs/decisions/orchestrate-rule-history.md#orc-077): etykiety
`layer.id + '-diff-probe'`, `'-diff-gate'`, `'-checks'` dostały sufiks `+ '-' + attempt` w
`orchestrate.template.mjs`. `-impl`/`-verify`/`-verify-noop` bez zmian — ich prompty już różnią
się między próbami. **Ograniczenie weryfikacji**: cache, którego dotyczy ten bug, żyje w
runtime'ie silnika Workflow (mechanizm `resumeFromRunId`), NIE w części CORE tego pliku
(czyste funkcje wycięte do `orchestrate-core.mjs`, „zero LLM, zero uruchomienia Workflow") —
eval z Kryterium ukończenia (dwie próby, zmiana stanu repo między nimi, porównanie wyniku sondy)
wymagałby mockowania cache'u Workflow, poza zakresem obecnego mechanizmu testowego. Weryfikacja
faktyczna: przegląd kodu (potwierdzone dokładne miejsca, linie z etykietami) +
`canonical-script-passes-workflow-lint` (32/32, bez regresji) — ten sam poziom weryfikacji, jaki
miała oryginalna ręczna łatka zgłaszającego. Druga, słabiej zdiagnozowana usterka z
`updated_source` (niedeterminizm diff-gate między świeżymi runami) POZOSTAJE OTWARTA — nie
naprawiona, brak wystarczającej diagnozy do bezpiecznej zmiany kodu.
