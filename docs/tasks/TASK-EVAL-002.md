---
id: TASK-EVAL-002
title: 'Ewaluacja JAKOŚCI przebiegu /orchestrate — sygnały w konformancji, retro post-run, korpus pod evale L2'
type: task
status: planned
priority: medium
created_date: 2026-09-15
depends_on: []
related: [TASK-EVAL-001, TASK-OBS-002]
---

# TASK-EVAL-002 — ewaluator całego przebiegu orkiestracji

## Kontekst

Po TASK-OBS-002 przebieg `/orchestrate` jest mierzony (`workflow-metrics-report.mjs`: koszt, tury,
czy krok oddał wynik) i sprawdzany względem planu (`workflow-conformance.mjs`: 8 dewiacji —
agent spoza slotów, brak verify, final gate nie-GO, kolejność warstw, `MAX_ATTEMPTS_EXCEEDED`).
Obie warstwy są deterministyczne i odpowiadają na pytanie „czy przebieg był **zgodny**".
Nic nie odpowiada na pytanie „czy przebieg był **dobry**".

Dowód z 2026-09-14 (juz-ide-api-2, run `wf_5939f0c6-38a`): dwa realne błędy silnika —
decyzje D1–D7 docierały do promptów puste (pole `decision` zamiast `choice`) i eskalacja po
trzech próbach „zero zmian" na warstwie, której task nie dotykał. Konformancja widziała run jako
poprawny („eskalował po `max_attempts`, zgodnie z planem"). Oba znalazł człowiek czytający log.
Naprawy (ANL-036, `layers_skip`, `no_changes_reason`, bramka `choice`) weszły do silnika, ale
mechanizm, który by je *wykrył* zamiast człowieka, nadal nie istnieje. `ecc:agent-evaluator`
i `ecc:eval-harness` są zainstalowane i niewpięte w nic.

## Zakres

Trzy kroki, każdy osobno użyteczny; kolejność jest celowa — bez 1 nie ma sygnałów, bez 2 nie ma
korpusu, bez korpusu 3 nie ma sensu.

### 1. Sygnały jakościowe w `workflow-conformance.mjs` (deterministyczne, zero LLM, ~1 h)

- [ ] `ESCALATE_ON_EMPTY_DIFF` — warstwa eskalowała, a żadna próba nie zmieniła pliku w jej
      `dirs`. Komunikat: „kandydat na `layers_skip` w analizie, nie na porażkę implementera".
- [ ] `DECISIONS_NOT_IN_PROMPT` — artefakt ma `decisions[]` z treścią, a prompt implementera
      (rekord kroku) nie zawiera bloku „DECYZJE ZATWIERDZONE". Wymaga, żeby collector zapisywał
      hash/obecność tego bloku — sprawdzić, co dziś trafia do `workflow-steps.jsonl`.
- [ ] `NOOP_ACCEPTED_WITHOUT_VERIFY` — warstwa zamknięta jako `no-op` bez kroku `verify-noop`
      (brak slotu verify) — informacyjne, żeby było widać, ile no-opów jest niezweryfikowanych.
- [ ] `RETRY_SAME_VIOLATION` — ta sama treść naruszeń w ≥2 kolejnych próbach warstwy
      (implementer nie reaguje na poprawkę; dziś to widać dopiero jako `MAX_ATTEMPTS_EXCEEDED`).
- [ ] Eval L1 dla nowych sygnałów w `tests/flow-evals/workflow-metrics/` (pre-commit już je odpala).

### 2. Retro post-run (LLM, opt-in, tani model)

- [ ] Krok `post-run-review` na końcu szablonu `scripts/workflow/orchestrate.template.mjs`,
      włączany z `runtime.yml → orchestrate.retro: true` (blok wnosi domyślnie `false`).
- [ ] Wejście: `report` (warstwy, statusy, próby, no-opy), wynik konformancji dla tego runu,
      frontmatter artefaktu analizy (decyzje, `layers_skip`, jednostki). **Nie** transkrypty.
- [ ] Wyjście: `docs/orchestrate-retro/<TASK-ID>-<run>.md`, ≤ 5 punktów, stały format:
      *co zaskoczyło* · *gdzie budżet spalił się bez efektu* · *czy decyzje były widoczne
      i zastosowane* · *czy pominięcia warstw były słuszne* · *jaka reguła ANL/ORC by to złapała*.
      Ostatni punkt jest surowcem dla `workflow-lint-rules-from-incidents` — reguła musi łapać
      formę, w jakiej błąd występuje, a formę zna tylko ktoś, kto widział konkretny przebieg.
- [ ] Model: Haiku (rubryka) albo Sonnet; budżet ≤ 10 tur; `agent-evaluator` z ECC jako
      kandydat na wykonawcę, jeśli jego 5 osi da się zawęzić do powyższych pięciu pytań.
- [ ] Retro nigdy nie zmienia werdyktu runu ani nie blokuje — to notatka, nie bramka.

### 3. Korpus i evale L2 (TASK-EVAL-001 faza 2, dopiero gdy jest ≥ 20 retro)

- [ ] Retro z pkt 2 + ręczne oceny człowieka („zgadzam się / nie") jako golden set.
- [ ] Eval: czy nowa wersja szablonu/reguł zmniejsza liczbę punktów w retro per klasa
      (regresja jakości, nie tylko kosztu — dziś `--regression` liczy wyłącznie tury i $).

## Nie w zakresie

- Ewaluator jako bramka blokująca merge — najpierw rok danych, potem decyzja.
- Ocena jakości *kodu* — to robi `final_gate` i `/review-panel`; tu oceniamy *przebieg*.
- Czytanie transkryptów subagentów (memory `hook-subagent-transcript-trap`; koszt kontekstu —
  memory `workflow-cost-is-context-not-work`).

## Warunki brzegowe

- Wszystko z pkt 1 musi zostać deterministyczne (D2 z TASK-OBS-002) — sygnał, którego nie da
  się odtworzyć z `workflow-steps.jsonl` + snapshotu planu, nie wchodzi do konformancji.
- Retro jest opt-in per projekt; domyślnie wyłączone, żeby nie dokładać kroku do każdego runu
  (lekcja `loops-performance-lesson`: pętle są drogie, nie dokładamy do nich nic „na wszelki wypadek").
- Format retro stały od pierwszego pliku — inaczej korpus z pkt 3 nie będzie porównywalny.

## Otwarte pytania

1. Czy collector zapisuje treść promptu kroku (potrzebne do `DECISIONS_NOT_IN_PROMPT`), czy tylko
   metadane? Jeśli tylko metadane — zapisać hash bloku decyzji w rekordzie, nie cały prompt.
2. Gdzie żyje retro w projekcie-konsumencie: `docs/orchestrate-retro/` (jak `docs/security/threat-models/`)
   czy `project-orchestration/retro/` (obok analiz)? Skłonność: obok analiz — to artefakt PM, nie dokumentacja.
