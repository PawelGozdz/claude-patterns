<!-- LOCAL — artefakt spike'a TASK-GUARDRAILS-001 Sekcja 4, nie wpięty w pre-commit ani w żaden inny automat. -->
# Spike: promptfoo jako regresja promptów agentów

**Status: spike zakończony, WYNIK: mechanizm działa, ale nie nadaje się (jeszcze) na pre-commit.**
Data: 2026-08-18. Kontekst: `docs/tasks/TASK-GUARDRAILS-001.md` Sekcja 4.

## Pytanie spike'a

`promptfoo` jest projektowany pod pojedynczy prompt→completion. Nasi agenci to
wieloturowe przebiegi z narzędziami (Read/Grep/Bash/Task). Czy custom provider
(skrypt zamiast wbudowanego API providera) daje się sensownie podłączyć pod
uruchomienie **realnego, headless subagenta Claude Code** i ocenę jego
**finalnego werdyktu** (nie każdej tury)?

## Odpowiedź: TAK, mechanizm działa

`provider.js` shelluje do `claude -p --agent <nazwa> --output-format json` z cwd
ustawionym na `fixture/` (ma lokalny `.claude/agents/code-quality-verifier.md` —
kopia realnego pliku z `agents/stacks/nestjs-ddd/`, nie rekonstrukcja). Dwa realne
przebiegi to potwierdziły:

1. **Bez `{PATTERNS}` w prompcie** → agent poprawnie ESCALATE'ował (`STOP i
   zgłoś`, zgodnie z własnym protokołem groundingu) zamiast fabrykować werdykt.
   Dowód, że subagent faktycznie wykonuje swoją logikę, nie zwraca placeholdera.
2. **Z `{PATTERNS}` + fixture (handler `application`-layer bez `infrastructure/`)**
   → agent zwrócił pełną tabelę werdyktu, **NIE zawetował braku `infrastructure/`**
   (dokładnie fix `{LAYER_SCOPE}` z incydentu juz-ide-api-2), ale za to złapał
   3 realne naruszenia w fixture (niesprawdzony `Result` z `.save()`, brak
   `@Inject()`, brak nagłówka `📚 Patterns read:`) i słusznie zawetował z ICH
   powodu. `num_turns: 16`, `duration_ms: ~145s`, `cost: ~$0.47`.

Techniczna pułapka po drodze (zostawiona jako komentarz w `provider.js`): ten
promptfoo zawsze robi `new (await import(providerPath))(options)` — provider
MUSI być klasą, nie zwykłym obiektem `{id, callApi}` (starsze przykłady w sieci
pokazują obiekt — nieaktualne dla tej wersji).

## Co NIE wyszło: asercja deterministyczna

Pierwsza asercja (`assert: type: javascript`, regex sprawdzający współwystępowanie
`veto` + `infrastructure|repositor` + `brak|missing`) dała **fałszywy negatyw**
na poprawnym werdykcie z powodu 2: te słowa współwystępują też w akapicie, który
*tłumaczy*, że agent NIE vetuje za brak infrastruktury, i osobno w wierszu VETO,
który mówi o zupełnie innych brakach (`brak logowania`, `Brak Patterns read`).
Polskie „brak" jest zbyt częste, żeby regex mógł bezpiecznie rozróżnić „vetuję
BO brakuje X" od „nie vetuję ZA brak X" / „brakuje Y" (inny powód).

**Wniosek**: ta klasa asercji („czy werdykt zawetował z NIEWŁAŚCIWEGO powodu")
wymaga oceny semantycznej — `type: llm-rubric` (grading przez model), nie
keyword-regex. Nie zaimplementowane w tym spike'u (kolejny płatny call), ale
to jest jasny next step, nie ślepy zaułek.

## Czy to się nadaje do pre-commit? NIE — jeszcze nie

- **Koszt**: ~$0.30–0.50 i ~2–2.5 min per test case (effort=medium, maxTurns=30
  z frontmatter agenta). Jeden test case na commit dla WSZYSTKICH agentów
  z nietrywialnym diffem byłoby zbyt wolne/kosztowne dla bramki `git commit`
  (por. decyzja o evalu retrievalu w Sekcji 1/2 — też wykluczonym z pre-commit
  z tego samego powodu).
- **Asercja niedopracowana** (patrz wyżej) — niedziałający/płytki test w
  pre-commit gorszy niż jego brak (fałszywe poczucie pokrycia), zgodnie z
  zastrzeżeniem w `TASK-GUARDRAILS-001` Sekcja 4.

**Rekomendacja**: promptfoo + ten custom provider to dobry mechanizm dla
**ręcznej/okresowej regresji promptów agentów** (np. przed mergem większej
zmiany w `agents/stacks/**.md`, albo jako osobny `npm run test:agent-regression`
odpalany świadomie) — NIE dla `pre-commit-guards.mjs`. Żeby to domknąć:
1. Przepisać asercję na `llm-rubric` i zweryfikować, że łapie realny fałszywy
   VETO (potrzebny drugi fixture: handler, gdzie infrastruktura FAKTYCZNIE
   powinna wywołać VETO, żeby sprawdzić też true-negative).
2. Rozszerzyć na 2-3 kolejne agenty/scenariusze zanim uzna się mechanizm za
   "przyjęty" (dziś: 1 agent, 1 scenariusz — zgodnie ze spike'em, nie pełnym
   wdrożeniem).

## Pliki

- `provider.js` — custom provider (klasa), shelluje do `claude` CLI.
- `promptfooconfig.yaml` — 1 test case, asercja JS (naiwna, patrz wyżej).
- `fixture/` — minimalny projekt: `.claude/agents/code-quality-verifier.md`
  (kopia realnego pliku) + `src/contexts/demo/application/` (handler + command,
  celowo bez `infrastructure/` i z 3 wstrzykniętymi naruszeniami).

Uruchomienie (realny koszt, ~$0.5): `cd tests/flow-evals/promptfoo-spike && npx promptfoo eval -c promptfooconfig.yaml --no-cache`
