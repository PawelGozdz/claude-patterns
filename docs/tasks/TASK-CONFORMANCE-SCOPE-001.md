---
id: TASK-CONFORMANCE-SCOPE-001
title: 'Zawężanie zakresu tools/conformance/check.mjs (warunek konieczny przed wpięciem go do /orchestrate)'
type: task
status: todo
created_date: 2026-09-12
---

# TASK-CONFORMANCE-SCOPE-001 — tryb zawężonego zakresu dla `check.mjs`

## Kontekst

Cel wyższego rzędu: odciążyć weryfikatora (`code-quality-verifier` i odpowiedniki
per-stack) z ręcznego, tokenochłonnego odtwarzania mechanicznych reguł zgodności
(`extends`, dekoratory, `throw`/importy w domain, cross-context importy) — te reguły da
się sprawdzić deterministycznie, AST-em, zamiast wzrokowym przejściem karty wzorca przez
LLM za każdą warstwę.

Analiza (sesja 2026-09-10/12) potwierdziła: infrastruktura docelowa już pasuje.
`tools/conformance/check.mjs` (AST przez TypeScript compiler API) kończy działanie
kodem wyjścia (`process.exit(violations.length>0?1:0)`) — dokładnie taki kontrakt, jakiego
wymaga istniejący mechanizm sondy `ORC-031` w `orchestrate.template.mjs` (werdykt liczony
WYŁĄCZNIE z exit code, nigdy z treści stdout). Żaden istniejący hook (`check-delegation.js`,
`check-subagent-pattern-reads.js`) nie koliduje z wywołaniem sondy przez `Bash` z promptu
orchestratora — to potwierdzone, nie założenie.

## Problem blokujący (dlaczego to osobny task, nie od razu wpięcie do `/orchestrate`)

`check.mjs` dziś nie ma trybu zawężania zakresu — `walk()` rekurencyjnie skanuje CAŁY
katalog przekazany jako root, sekwencyjnie (`readdirSync`/`statSync`, `for...of`). Wpięcie
go „jak jest" jako sondy przed `verify`, wywoływanej co warstwę (i do 3× przy retry,
`ORC-050`), odtworzyłoby **dokładnie ten sam kształt błędu**, co incydent opisany w pamięci
`orchestrate-probe-and-monorepo-scope-fix.md` (142k tokenów, bo sonda dla 1 pliku odpaliła
się na 19 pakietach monorepo) — tam było `nx run-many` na całym repo, tu byłby pełny skan
AST całego `src/` przy każdym wywołaniu warstwy. Fix tamtego incydentu (`ORC-015`/`ORC-016`:
zawężanie do dotkniętego zakresu) jest wyłącznie prozą w prompt orchestratora, niczym
nieegzekwowaną — więc `check.mjs` nie odziedziczy nawet tej częściowej ochrony za darmo.

## Zakres tego taska

1. Dodać do `tools/conformance/check.mjs` tryb zawężonego zakresu: lista jawnie podanych
   plików (np. `--files a.ts,b.ts` albo lista ze stdin/`git diff --name-only`) jako
   alternatywa do dzisiejszego „daj mi root i ja rekurencyjnie zejdę wszędzie". Domyślne
   zachowanie (cały katalog) zostaje dla wywołań ręcznych (`/conformance-check` bez
   argumentów) — tryb zawężony jest opt-in, nie zamianą domyślnego.
2. Przy okazji: zrównoleglić przetwarzanie plików (`Promise.all`) — dziś sekwencyjne
   `for...of`. To osobna, dużo mniej ryzykowna zmiana (czysta wydajność, nie zmienia
   semantyki reguł), ale ma sens dopiero po punkcie 1 — zrównoleglanie pełnego skanu całego
   repo to optymalizacja złego rozwiązania.
3. Testy: dodać przypadki dla trybu zawężonego (podzbiór plików trafia w reguły, pliki
   spoza listy są ignorowane nawet jeśli łamią regułę) — bez tego punkt 1 jest
   nieweryfikowalny.

## Nie w zakresie (świadomie odłożone, osobny task w przyszłości)

- Wpięcie sondy do `commands/orchestrate.md`/`orchestrate.template.mjs` jako krok przed
  `verify` — to zależy od tego taska i nie startuje przed jego ukończeniem.
- Rozszerzenie `check.mjs`/`rules.json` o reguły z `check-domain-purity.js` (throw/importy
  w domain) i `check-context-isolation.js` (cross-context importy) — merytorycznie
  pożądane, ale osobna zmiana; hooki zostają niezależne (inny moment cyklu: PostToolUse/
  Stop, warn-only), sonda ma tylko czerpać tę samą logikę reguł, nie ich zastępować.
- Dodanie fixture GOOD/BAD do `tests/flow-evals` dla nowego kroku sondy w orchestrate —
  potrzebne dopiero przy wpięciu do `/orchestrate`, nie przy samej zmianie w `check.mjs`.
- Pokrycie 62/108 patternów rule-cards — sonda (nawet po tym tasku) pokryje tylko `kinds`
  zdefiniowane w `rules.json`; reszta patternów zostaje przy ręcznej weryfikacji agenta.
  To ograniczenie do jawnego zakomunikowania w prompt orchestratora przy wpięciu, nie do
  rozwiązania tutaj.

## Warunki brzegowe, które MUSZĄ przetrwać (do zachowania w przyszłym tasku wpięcia)

- Sonda dostarcza dodatkowy fakt OBOK, nigdy nie zwalnia subagenta z literalnego `Read`
  karty wzorca — inaczej `hooks/check-subagent-pattern-reads.js` (SubagentStop, exit 2)
  zacznie fałszywie blokować subagentów, którzy „zaufali" wynikowi sondy zamiast przeczytać
  kartę.
- Zakres sondy jest jawnie ograniczony do warstwy/zmienionych plików tą samą metodą co
  reszta `checks:` w `runtime.yml` — nie osobną, niespójną konwencją.
