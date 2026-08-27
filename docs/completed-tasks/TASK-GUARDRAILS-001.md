---
id: TASK-GUARDRAILS-001
title: 'Pre-commit lokalny, rozszerzenie evala retrievalu, dyscyplina zmian promptów agentów, regresja promptfoo'
type: task
status: done
created_date: 2026-08-17
updated_date: 2026-08-18
---

# TASK-GUARDRAILS-001 — Pre-commit lokalny, rozszerzenie evala retrievalu, dyscyplina zmian promptów agentów, regresja promptfoo

**Status: DONE (2026-08-18)** — Sekcje 1-3 w pełni zamknięte; Sekcja 4 spike wypalił,
wpięcie do pre-commita świadomie odłożone (patrz notatki przy checkboxach niżej i
`tests/flow-evals/promptfoo-spike/README.md`). **Źródło:** sesja 2026-08-17/18 — audyt setupu (bloki/RAG/lint) + incydent
juz-ide-api-2 (`code-quality-verifier` VETO-wał brak plików warstwy jeszcze nieuruchomionej,
naprawione w `agents/stacks/nestjs-ddd/code-quality-verifier.md` 1.2.0, `{LAYER_SCOPE}`)
**Stan wyjściowy:** cztery strażniki dodane 2026-08-17 (`rag-freshness.mjs`,
`generate-pattern-routing.mjs` obsługujący bloki lokalne, `lint-patterns.mjs --strict` z
baseline, `materialize-runtime.mjs` z hashem obejmującym generator) istnieją, ale każdy
wymaga RĘCZNEGO uruchomienia — dokładnie ten typ dyscypliny, który już raz zawiódł (patrz
`TASK-EVAL-001`, zasada D7: "eval komponentu odpala się, gdy TEN komponent się zmienia").

## Problem

Cztery błędy znalezione 2026-08-16 (`--check` kłamiący o świeżości, karta reguł geo
nieaktualna w RAG, blok lokalny niewidoczny dla hooków, wymóg formatu wzorca bez
egzekwowania) miały wspólną przyczynę: nic nie wymuszało uruchomienia istniejących
strażników. Naprawiłem objawy; ten task naprawia przyczynę — plus trzy pokrewne
usprawnienia znalezione przy okazji rozmowy o kosztach `/orchestrate`.

---

## Sekcja 1 — Pre-commit hook (git hook, nie serwer CI)

Repo jest do lokalnego developmentu — "CI" tutaj znaczy bramkę przy `git commit`, nie
serwer budujący.

- [x] Dodać `simple-git-hooks` (npm, zero transitive deps — lżejsze niż husky, którego
      nie potrzebujemy) jako `devDependency`; sekcja `"simple-git-hooks": {"pre-commit": "node scripts/pre-commit-guards.mjs"}` w `package.json`; `npx simple-git-hooks` w setupie
      (`scripts.prepare`, odpala się automatycznie po `npm install`).
- [x] `scripts/pre-commit-guards.mjs` — uruchamia po kolei, zbiera wszystkie błędy zamiast
      przerywać na pierwszym (jeden commit = jeden pełny raport):
      - `lint-patterns.mjs --strict`
      - `generate-pattern-routing.mjs --check`
      - `rag-freshness.mjs`
      - check z Sekcji 3 (changelog agentów)
- [x] **NIE wchodzi tu**: `materialize-runtime.mjs --check` (dotyczy projektów
      satelitarnych — `juz-ide-api-*` itd. — nie tego repo) i eval retrievalu z Sekcji 2
      (wymaga żywego Qdranta+embeddera, zbyt kosztowne na każdy commit — patrz decyzja w
      `TASK-EVAL-001`: "Retrieval WYKLUCZONY z auto"). Żadne z nich nie jest wołane
      z `pre-commit-guards.mjs`.
- [x] Koordynacja z `TASK-EVAL-001` Faza 1: zdecydowano — TEN hook JEST Fazą 1 stamtąd
      (jedna instalacja `simple-git-hooks`, jeden `pre-commit`). Gdy `TASK-EVAL-001` doda
      `tests/flow-evals/run-all.js`, dopisze wywołanie do `CHECKS` w
      `pre-commit-guards.mjs` zamiast instalować drugi hook — opisane w komentarzu skryptu.

## Sekcja 2 — Rozszerzyć i wpiąć ISTNIEJĄCY eval retrievalu (nie budować nowego)

**Ważne odkrycie przy pisaniu tego taska**: eval retrievalu już istnieje —
`tests/flow-evals/retrieval/run.js` + `golden.json` (26 zapytań, metryki hit@1/hit@5/MRR,
bramka `hit@5 ≥ 0.6`, zbudowany w `TASK-RAG-002`). To dokładnie to, co planowałem
proponować od zera — nie trzeba. Realna luka jest węższa:

- [x] **`golden.json` ma 0 zapytań o geo** — dokładnie ten wzorzec, który był nieaktualny
      w incydencie 2026-08-16 (karta `geo-spatial-query-pattern_summary.md`, GEO18/GEO19).
      Nawet gdyby eval już wtedy działał w pipeline, by tego nie złapał. Dopisać ≥2
      zapytania PL+EN celujące w `infrastructure/geo-spatial-query-pattern_summary.md`.
      → G01 (PL), G02 (EN), oba pinują `expect: ["geo-spatial-query-pattern_summary"]`.
- [x] Sprawdzić pokrycie pozostałych 9 wzorców z półki `always` (`patterns.always` w
      blokach) w `golden.json` — półka `always` wchodzi do KAŻDEGO taska, więc jej
      retrieval musi mieć najmocniejsze pokrycie testowe, nie przypadkowe.
      → audyt wszystkich `blocks/**/*.yml`: 10 unikalnych wzorców na półce `always`,
      tylko `conventions`/`safe-error-propagation` miały już zapytanie (P15/P07).
      Dopisano P16-P23 dla pozostałych 8 (domain-errors, security-invariants, logger,
      package-boundary, public-api, flutter clean-architecture/either-error/mobile-security).
- [x] Wpiąć `node tests/flow-evals/retrieval/run.js` do `scripts/reseed-patterns.sh`, PO
      kroku `rag-freshness.mjs --record` (świeżość ≠ trafność — to dwa różne pytania,
      oba tanie do sprawdzenia w tym samym miejscu, przy odpaleniu wymagającym i tak
      żywego Qdranta).
- [x] Log trendu (już zaplanowany w `TASK-EVAL-001` Faza 1: `results.jsonl` z
      `{date, hit1, hit5, mrr, n, threshold, gitSha}`) — jeśli robimy Fazę 1 stamtąd przy
      okazji, ten punkt się pokrywa; jeśli nie, zrobić minimalną wersję tutaj.
      → minimalna wersja w `run.js`, punkt odznaczony też w `TASK-EVAL-001.md` żeby nie
      zdublować.

## Sekcja 3 — Dyscyplina zmian promptów agentów: Changelog zamiast semver

Dziś: `**Version**: X.Y.Z` w stopce, tylko 2 z wielu plików `agents/**.md`
(`code-quality-verifier.md`, `security-e2e-verifier.md`), nic nie wymusza bumpa, każdy
bump NADPISUJE opis poprzedniej zmiany (stracony przy dzisiejszym `1.1.0 → 1.2.0` —
`git log` go ma, plik już nie). Sprzeczne z własną zasadą repo: "git log jest
autorytatywny, nie duplikuj" — a jednocześnie *coś* w pliku ma wartość: czytelnik
promptu nie chce otwierać `git log`, żeby zrozumieć, dlaczego agent zachowuje się tak, a
nie inaczej.

- [x] Zamienić `**Version**`/`**Maintainer**` na append-only sekcję `## Changelog` w
      formacie Keep-a-Changelog — tym samym, którego już używa `changelog-bot` — spójność
      formatu w repo, nie nowy standard.
- [x] Zmigrować 2 istniejące pliki (`code-quality-verifier.md`, `security-e2e-verifier.md`)
      do nowego formatu — treść historii bierzemy z `git log -p` na tych plikach, nie
      zgadujemy. → 17 commitów (code-quality-verifier.md) / 12 commitów
      (security-e2e-verifier.md) przeanalizowanych; pominięte czysto kosmetyczne: rename
      `agents/verifiers/` → `agents/stacks/nestjs-ddd/` bez treściowego diffu (commit
      `5d8b2e7`, dotyczy tylko `security-e2e-verifier.md` — w `code-quality-verifier.md`
      ten sam commit miał dodatkowo realną poprawkę `BUSINESS_RULES.md` → `.yaml`, więc tam
      wpis został).
- [x] Skrypt sprawdzający (część `pre-commit-guards.mjs` z Sekcji 1): dla każdego
      stage'owanego `agents/**.md` z nietrywialnym diffem (nie samo formatowanie) —
      wymagać nowego wpisu w `## Changelog` z dzisiejszą datą. Plik BEZ sekcji
      `## Changelog` = pomiń (nie każdy plik musi ją mieć od razu; bootstrap wszystkich
      agentów to osobna, większa decyzja — świadomie POZA zakresem tego taska).
      → `checkAgentChangelogs()` w `pre-commit-guards.mjs`, zweryfikowane na tym commicie.

## Sekcja 4 — Regresja promptów agentów: `promptfoo`

Ustalone z użytkownikiem: **pomijamy na razie natywny `claude plugin eval`** (nowsza
funkcja CLI, do zweryfikowania później) — skupiamy się na sprawdzonym na rynku,
zewnętrznym narzędziu.

- [x] **Spike najpierw, nie pełne wdrożenie**: `promptfoo` (npm) jest projektowany pod
      pojedynczy prompt→completion; nasi agenci to wieloturowe przebiegi z narzędziami
      (Read/Grep/Bash/Task). Zanim to się przyjmie jako mechanizm — jeden test case,
      jeden agent, sprawdzić czy promptfoo's custom provider (skrypt zamiast wbudowanego
      API providera) daje się sensownie podłączyć pod uruchomienie subagenta Claude Code
      i ocenę jego finalnego werdyktu (nie każdej tury).
      → **WYPALIŁO.** `tests/flow-evals/promptfoo-spike/` (provider.js, promptfooconfig.yaml,
      fixture/, README.md z pełnym opisem). Dwa realne przebiegi: (1) bez `{PATTERNS}`
      agent poprawnie ESCALATE'ował zamiast fabrykować, (2) z `{PATTERNS}` + fixture
      zwrócił pełną tabelę werdyktu z realnym VETO. Techniczna pułapka znaleziona i
      naprawiona: promptfoo `file://` provider MUSI być klasą (`new (await import(...))(...)`),
      nie obiektem `{id, callApi}`.
- [x] Pierwszy test case, jeśli spike wypali: dokładnie dzisiejszy incydent —
      `code-quality-verifier` weryfikujący warstwę `application` w projekcie, gdzie
      `infrastructure/` jeszcze nie istnieje; asercja: werdykt NIE zawiera VETO z powodu
      brakujących repozytoriów. To pierwszy realny regression test dla `{LAYER_SCOPE}`
      z sekcji "Scope" w `code-quality-verifier.md` 1.2.0.
      → Uruchomiony: agent NIE zawetował braku `infrastructure/` (fix działa), za to
      słusznie zawetował 3 inne, celowo wstrzyknięte naruszenia w fixture. Asercja JS
      (keyword-regex) dała jednak FAŁSZYWY NEGATYW — patrz README, sekcja "Co NIE wyszło".
      Nie naprawione w tym przebiegu (kolejny płatny call) — jasny next step: `llm-rubric`.
- [x] Jeśli spike nie wypali (agentic multi-tool-call trudny do wpięcia pod promptfoo) —
      wrócić do natywnego `claude plugin eval`, odłożonego na start tej sekcji.
      → nie dotyczy, spike wypalił.
- [ ] Wpięcie do `pre-commit-guards.mjs` z Sekcji 1 dopiero po udanym spike — nie
      wcześniej (niedziałający/płytki test w pre-commit gorszy niż jego brak, bo daje
      fałszywe poczucie pokrycia).
      → **ŚWIADOMIE NIE ZROBIONE.** Mechanizm działa, ale (a) asercja JS niedopracowana
      (patrz wyżej), (b) koszt ~$0.3-0.5 i ~2-2.5 min per test case za wolne/drogie na
      bramkę `git commit` (ten sam powód, dla którego eval retrievalu jest wykluczony z
      pre-commit w Sekcji 1). Rekomendacja w README: `promptfoo` jako ręczna/okresowa
      regresja promptów agentów (np. `npm run test:agent-regression` odpalany świadomie),
      NIE jako pre-commit gate. Pozostaje do zrobienia w kolejnej sesji: `llm-rubric` +
      drugi fixture (true-negative case) + 2-3 kolejne scenariusze przed uznaniem
      mechanizmu za "przyjęty".

---

## Kolejność

Sekcje 1+3 są zrośnięte (jeden hook, jedna instalacja) — razem. Sekcja 2 to rozszerzenie
istniejącego mechanizmu, niezależne, można równolegle. Sekcja 4 zaczyna się od spike'a —
nie planować pełnego wdrożenia, dopóki spike nie potwierdzi, że promptfoo w ogóle pasuje
do agentic runów.
