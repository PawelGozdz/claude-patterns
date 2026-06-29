# ADR 0002 — /orchestrate-ddd: research → human gate → implement

**Status**: accepted (2026-06) · **Branch**: refactor/ecc-overlay
**Context source**: konsultacje @backend-technology-expert + @tech-lead; spike Faza 0 (GO).

## Kontekst
Budujemy automatyzację implementacji DDD na bazie pluginu ECC (Workflow tool, /goal, agenci
`ecc:*`, loop-operator). Wymóg użytkownika #1: **twarda granica między fazą research/analizy
a implementacją**, z dyskusją człowieka po środku (często wychodzą rzeczy do przedyskutowania).
Nasz moat: pattern-grounding hooks + VETO verifiers (GO/NO-GO) + 72 patterns DDD.

## Decyzja
Trzy decyzje kształtujące implementację:

### D1 — Dwie osobne komendy (granica = bramka)
`/analyze-ddd <TASK>` (research) i `/orchestrate-ddd <TASK>` (implementacja) — NIE jedna komenda
z trybami. Ograniczenie CC „slash command nie może wołać innej komendy" działa NA KORZYŚĆ:
granica między komendami jest fizycznie nieprzekraczalna przez autonomię. `/analyze-ddd` ma
zawężone narzędzia (bez Edit/Bash/implementerów) → strukturalnie nie może implementować.
Stary generyczny `/orchestrate` zostaje jako fallback dla lekkich/nie-DDD zadań.

### D2 — Workflow tool jako silnik, NIE /goal
Faza impl = deterministyczny pipeline: outer = sekwencja warstw (domena→aplikacja→infra) +
końcowa bramka security; inner = retry implement→verify→fix aż verdykt GO lub MAX prób.
**Nie oddajemy warunku stopu modelowi** (/goal = „model ogłasza zwycięstwo" — failure mode).
Workflow (JS control-flow) parsuje `{verdict, violations[]}` i rozgałęzia deterministycznie.

### D3 — Artefakt jako kontrakt handoff
`project-orchestration/tasks/{TASK-ID}.analysis.md` — YAML frontmatter (bramka maszynowa:
`status: draft|awaiting-human|approved`, `open_questions[].answer`, `decisions[]`, `patterns[]`)
+ Markdown body (synteza + dyskusja). `/orchestrate-ddd` ODMAWIA startu gdy artefakt nie istnieje
LUB `status != approved` LUB jakiekolwiek `answer == null`. `decisions[]` wstrzykiwane do KAŻDEGO
promptu implementera → implementacja ugruntowana w ustaleniach, nie re-derywowana.

## Dwa STOP-y
- **STOP1** (po analizie) = granica komend. `/analyze-ddd` pisze artefakt + drukuje OTWARTE PYTANIA
  i wychodzi. Człowiek dyskutuje, edytuje artefakt, flipuje `status: approved`, ręcznie odpala impl.
- **STOP2** (koniec) = terminal „staged, not committed": `git add` + raport + HALT. Commit/merge =
  osobna akcja człowieka (zasada [[commit-review-workflow-preference]]).

## Seam'y Ralphinho (zero-kosztowe teraz, no-op w MVP)
unit abstraction (`units=[task]`), worktree jako param (jeden wspólny teraz), fan-out point
(`for`→`parallel`), merge jako nazwany no-op stage, verdykty jako structured data, `units:` slot
w artefakcie, guardrails od dnia 1 (push tylko `claude/` branche, max-budget/turns/timeout).

## Konsekwencje
- (+) Twarda bramka za darmo (topologia narzędzi, nie proza). Determinizm stopu. Audytowalny handoff.
- (+) Zgodne z nawykiem usera (/threat-model → panel → STOP → /orchestrate).
- (−) Dwa pliki komend = ryzyko driftu wspólnego boilerplate (Pattern Discovery Step 0.5) →
  mitygacja: wspólna sekcja referowana przez obie.
- (−) Workflow tool wymaga opt-in i może być kosztowny → limity budżetu w configu.

## Odrzucone alternatywy
- Jedna komenda z `plan|implement` — słabsza bramka (proza zamiast topologii), łatwiej o pomyłkę.
- /goal jako silnik — niedeterministyczny warunek stopu.
- Wstrzykiwanie analizy do pliku zadania — miesza spec z artefaktem pochodnym.
- Jedna ciągła pętla z pauzami-na-człowieka wewnątrz — krucha (hooki nie wznawiają iteracji).
