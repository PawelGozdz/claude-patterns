# TASK-GUARDRAILS-001 — Pre-commit lokalny, rozszerzenie evala retrievalu, dyscyplina zmian promptów agentów, regresja promptfoo

**Status: TODO** · **Źródło:** sesja 2026-08-17/18 — audyt setupu (bloki/RAG/lint) + incydent
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

- [ ] Dodać `simple-git-hooks` (npm, zero transitive deps — lżejsze niż husky, którego
      nie potrzebujemy) jako `devDependency`; sekcja `"simple-git-hooks": {"pre-commit": "node scripts/pre-commit-guards.mjs"}` w `package.json`; `npx simple-git-hooks` w setupie.
- [ ] `scripts/pre-commit-guards.mjs` — uruchamia po kolei, zbiera wszystkie błędy zamiast
      przerywać na pierwszym (jeden commit = jeden pełny raport):
      - `lint-patterns.mjs --strict`
      - `generate-pattern-routing.mjs --check`
      - `rag-freshness.mjs`
      - check z Sekcji 3 (changelog agentów)
- [ ] **NIE wchodzi tu**: `materialize-runtime.mjs --check` (dotyczy projektów
      satelitarnych — `juz-ide-api-*` itd. — nie tego repo) i eval retrievalu z Sekcji 2
      (wymaga żywego Qdranta+embeddera, zbyt kosztowne na każdy commit — patrz decyzja w
      `TASK-EVAL-001`: "Retrieval WYKLUCZONY z auto").
- [ ] Koordynacja z `TASK-EVAL-001` Faza 1 (status TODO, ten sam pomysł — `git pre-commit
      → run-all.js` dla evali L1 hooków/watchera/workflow-lint): albo ten task robi Fazę 1
      z `TASK-EVAL-001` jako część swojego hooka (jeden hook, jedna instalacja), albo oba
      hooki idą osobno i `package.json` woła oba. Zdecydować przy starcie — nie
      duplikować instalacji `simple-git-hooks`.

## Sekcja 2 — Rozszerzyć i wpiąć ISTNIEJĄCY eval retrievalu (nie budować nowego)

**Ważne odkrycie przy pisaniu tego taska**: eval retrievalu już istnieje —
`tests/flow-evals/retrieval/run.js` + `golden.json` (26 zapytań, metryki hit@1/hit@5/MRR,
bramka `hit@5 ≥ 0.6`, zbudowany w `TASK-RAG-002`). To dokładnie to, co planowałem
proponować od zera — nie trzeba. Realna luka jest węższa:

- [ ] **`golden.json` ma 0 zapytań o geo** — dokładnie ten wzorzec, który był nieaktualny
      w incydencie 2026-08-16 (karta `geo-spatial-query-pattern_summary.md`, GEO18/GEO19).
      Nawet gdyby eval już wtedy działał w pipeline, by tego nie złapał. Dopisać ≥2
      zapytania PL+EN celujące w `infrastructure/geo-spatial-query-pattern_summary.md`.
- [ ] Sprawdzić pokrycie pozostałych 9 wzorców z półki `always` (`patterns.always` w
      blokach) w `golden.json` — półka `always` wchodzi do KAŻDEGO taska, więc jej
      retrieval musi mieć najmocniejsze pokrycie testowe, nie przypadkowe.
- [ ] Wpiąć `node tests/flow-evals/retrieval/run.js` do `scripts/reseed-patterns.sh`, PO
      kroku `rag-freshness.mjs --record` (świeżość ≠ trafność — to dwa różne pytania,
      oba tanie do sprawdzenia w tym samym miejscu, przy odpaleniu wymagającym i tak
      żywego Qdranta).
- [ ] Log trendu (już zaplanowany w `TASK-EVAL-001` Faza 1: `results.jsonl` z
      `{date, hit1, hit5, mrr, n, threshold, gitSha}`) — jeśli robimy Fazę 1 stamtąd przy
      okazji, ten punkt się pokrywa; jeśli nie, zrobić minimalną wersję tutaj.

## Sekcja 3 — Dyscyplina zmian promptów agentów: Changelog zamiast semver

Dziś: `**Version**: X.Y.Z` w stopce, tylko 2 z wielu plików `agents/**.md`
(`code-quality-verifier.md`, `security-e2e-verifier.md`), nic nie wymusza bumpa, każdy
bump NADPISUJE opis poprzedniej zmiany (stracony przy dzisiejszym `1.1.0 → 1.2.0` —
`git log` go ma, plik już nie). Sprzeczne z własną zasadą repo: "git log jest
autorytatywny, nie duplikuj" — a jednocześnie *coś* w pliku ma wartość: czytelnik
promptu nie chce otwierać `git log`, żeby zrozumieć, dlaczego agent zachowuje się tak, a
nie inaczej.

- [ ] Zamienić `**Version**`/`**Maintainer**` na append-only sekcję `## Changelog` w
      formacie Keep-a-Changelog — tym samym, którego już używa `changelog-bot` — spójność
      formatu w repo, nie nowy standard:
      ```markdown
      ## Changelog
      - 2026-08-17 — `{LAYER_SCOPE}` contract: verify one layer, not the whole task
      - 2026-01-15 — initial VETO power rules
      ```
- [ ] Zmigrować 2 istniejące pliki (`code-quality-verifier.md`, `security-e2e-verifier.md`)
      do nowego formatu — treść historii bierzemy z `git log -p` na tych plikach, nie
      zgadujemy.
- [ ] Skrypt sprawdzający (część `pre-commit-guards.mjs` z Sekcji 1): dla każdego
      stage'owanego `agents/**.md` z nietrywialnym diffem (nie samo formatowanie) —
      wymagać nowego wpisu w `## Changelog` z dzisiejszą datą. Plik BEZ sekcji
      `## Changelog` = pomiń (nie każdy plik musi ją mieć od razu; bootstrap wszystkich
      agentów to osobna, większa decyzja — świadomie POZA zakresem tego taska).

## Sekcja 4 — Regresja promptów agentów: `promptfoo`

Ustalone z użytkownikiem: **pomijamy na razie natywny `claude plugin eval`** (nowsza
funkcja CLI, do zweryfikowania później) — skupiamy się na sprawdzonym na rynku,
zewnętrznym narzędziu.

- [ ] **Spike najpierw, nie pełne wdrożenie**: `promptfoo` (npm) jest projektowany pod
      pojedynczy prompt→completion; nasi agenci to wieloturowe przebiegi z narzędziami
      (Read/Grep/Bash/Task). Zanim to się przyjmie jako mechanizm — jeden test case,
      jeden agent, sprawdzić czy promptfoo's custom provider (skrypt zamiast wbudowanego
      API providera) daje się sensownie podłączyć pod uruchomienie subagenta Claude Code
      i ocenę jego finalnego werdyktu (nie każdej tury).
- [ ] Pierwszy test case, jeśli spike wypali: dokładnie dzisiejszy incydent —
      `code-quality-verifier` weryfikujący warstwę `application` w projekcie, gdzie
      `infrastructure/` jeszcze nie istnieje; asercja: werdykt NIE zawiera VETO z powodu
      brakujących repozytoriów. To pierwszy realny regression test dla `{LAYER_SCOPE}`
      z sekcji "Scope" w `code-quality-verifier.md` 1.2.0.
- [ ] Jeśli spike nie wypali (agentic multi-tool-call trudny do wpięcia pod promptfoo) —
      wrócić do natywnego `claude plugin eval`, odłożonego na start tej sekcji.
- [ ] Wpięcie do `pre-commit-guards.mjs` z Sekcji 1 dopiero po udanym spike — nie
      wcześniej (niedziałający/płytki test w pre-commit gorszy niż jego brak, bo daje
      fałszywe poczucie pokrycia).

---

## Kolejność

Sekcje 1+3 są zrośnięte (jeden hook, jedna instalacja) — razem. Sekcja 2 to rozszerzenie
istniejącego mechanizmu, niezależne, można równolegle. Sekcja 4 zaczyna się od spike'a —
nie planować pełnego wdrożenia, dopóki spike nie potwierdzi, że promptfoo w ogóle pasuje
do agentic runów.
