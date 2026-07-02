# TASK-AGENT-CONFORMANCE-001 — agenci DDD: zgodność implementacji, luki w weryfikacji, awaria Workflow

**Kontekst:** sesja 2026-07-01, feedback z realnego użycia `/analyze-ddd` + `/orchestrate-ddd` w
`juz-ide-api-1` (task TS-SEC-VERIFICATION-LEVELS-002 i inne, przez `code-quality-verifier`
agent-memory). Zebrane tu problemy są NIEZALEŻNE od `docs/tasks/TASK-RAG-002.md` (to o
knowledge-retriever/MCP) — ten task dotyczy jakości implementacji agentów DDD i niezawodności
mechanizmu weryfikacji/orkiestracji.

## 1. Audyt zgodności Specification/Policy (`juz-ide-api-1`, 270 plików)

Pełny audyt grep/Read wg Rule Card `patterns/domain/specification-policy-pattern_summary.md`:
**270 plików (240 specyfikacji + 30 policy), 35 (~13%) ma ≥1 naruszenie.** `N1`
(`BusinessRuleValidator.addRule` — najgorszy zakazany wzorzec) — **zero wystąpień**.

Trzy różne przyczyny, nie jedna:

1. **Luka w samym Rule Cardzie, nie błąd implementera.** 6/8 naruszeń SP3 (klasa zamiast
   `function createXxxPolicy()`) to w rzeczywistości poprawne "Calculation Policy" (ADR-0035) —
   Rule Card nie rozróżnia Business Rule Policy (blokująca, przez `PolicyBuilder`) od Calculation
   Policy (zwraca wartość). Tylko 2/8 to realne naruszenie (brak PolicyBuildera w ogóle mimo nazwy
   `*.policy.ts`): `shared/domain/policies/verification-capabilities.policy.ts:8`,
   `authorization/domain/policies/capability-threshold.policy.ts:206`.
2. **Realny, systemowy drift: dekorator jako fałszywy dowód delegacji (N4).** Na próbce 8
   agregatów, **5/8** (`UserIdentityAggregate`, `ThreadAggregate`, `TokenWalletAggregate`,
   `VouchRegistryAggregate`, `PaymentAggregate`) ma logikę biznesową inline mimo dekoratora
   `@BusinessRule(RULES.xxx)` — dekorator wygląda jak spełnienie wzorca, ale delegacji do
   specyfikacji nie ma. Zwykły grep po "czy jest `@BusinessRule`" by to przepuścił — trzeba czytać
   treść metody. Najbardziej rażący, powtarzalny wzorzec w audycie.
3. **Żywy bug (N3)**: `contexts/auth/domain/specifications/social-login.specifications.ts` — 5/8
   klas ma repo w generyku kontekstu + `await candidate.repository.findByProviderId(...)` w
   `isSatisfiedByAsync()` (np. L53/61/134/254/348) — specyfikacja z zapytaniem DB zamiast
   wyciągnięcia wyniku w handlerze.

Dodatkowo: `SP2` "primitive generic" drift (`CompositeSpecification<string/number/boolean/Date>`
zamiast dedykowanego interfejsu) — ~15 plików, rozproszone niemal po każdym kontekście,
systemowe ale niskiego ryzyka.

**Zastrzeżenie metodologiczne**: `check-subagent-pattern-reads.js` (SubagentStop) blokuje dopiero
przy NOWYM Write/Edit w danej sesji — nie weryfikuje retroaktywnie istniejącego kodu. Nie wiadomo,
ile z 35 plików to świeża regresja vs. dług sprzed wprowadzenia Rule Cards. **Zrobić `git blame`
na najgorszych plikach przed decyzją co naprawiać najpierw.**

### Rekomendowane naprawy
- [x] (2026-07-02) Rozdzielono w Rule Cardzie SP3 → **SP3a Business Rule Policy** (PolicyBuilder,
      factory function) vs **SP3b Calculation Policy** (ADR-0035, zwraca wartość, klasa OK) +
      reguła domknięcia: `*.policy.ts` musi być jednym z dwóch. Tabela symptomów zaktualizowana
      („NAJPIERW sprawdź, czy to nie Calculation Policy"). To odblokowuje prerequisite D5(a) dla
      TASK-RAG-003.
- [x] (2026-07-02) N4 rozszerzone: „dekorator `@BusinessRule` NIE jest dowodem delegacji — ciało
      metody bez `isSatisfiedBy(`/`policy.check(` = VETO" + grep-owalny symptom w tabeli
      („czytaj ciało, nie sam dekorator"). Follow-up (nieblokujący): dopisać sekcję Calculation
      Policy także w pełnym `specification-policy-pattern.md` (Rule Card jest wiążący).
- [x] (2026-07-02) `git blame` wykonane — **wszystkie 3 najgorsze pliki to dług sprzed Rule Cards,
      nie świeża regresja maszynerii**: `verification-capabilities.policy.ts` ostatnio 2025-10-17;
      `capability-threshold.policy.ts` 2026-04-13 (TS-DDD-001 F2); `social-login.specifications.ts`
      2026-04-21. Naprawa żywego buga N3 (social-login) = osobny task W `juz-ide-api-1`
      (kod produkcyjny innego repo, flow /analyze-ddd tam).

## 2. Luki w niezawodności `code-quality-verifier` (poza samą zgodnością kodu)

Z pamięci agenta `.claude/agent-memory/code-quality-verifier/` w `juz-ide-api-1`:

- **`feedback_cross_context_db_isolation.md`**: weryfikator przeoczył naruszenie izolacji
  bounded-context (SELECT do tabel innego kontekstu w Kysely), bo przeczytał tylko 120 z 443 linii
  pliku repozytorium. Część problemu to nie tylko "implementer łamie wzorce" — to "weryfikator nie
  czyta całych plików".
- **`feedback_verify_implementation_exists_first.md`** — **plik NIE jest wpisany do
  `MEMORY.md`** (osierocony wpis, sam w sobie bug systemu pamięci). Przy TS-SEC-VERIFICATION-LEVELS-002
  weryfikator dostał do sprawdzenia listę "zaimplementowanych" symboli, a `git log`/`grep` pokazały
  zero zmian w `src/` — weryfikacja kodu, który nigdy nie powstał.
- Mechanizm `check-subagent-pattern-reads.js` sprawdza tylko OBECNOŚĆ odczytu pliku wzorca, NIE
  poprawność zastosowania — faktyczna zgodność zależy wyłącznie od jednego self-reportującego
  agenta Sonnet (`code-quality-verifier`), bez drugiej, niezależnej weryfikacji.
- `code-quality-verifier.md` frontmatter deklaruje `tools: ..., mcp__zen__codereview,
  mcp__zen__analyze` — **te MCP nie są zarejestrowane nigdzie** (ani `.mcp.json` projektu, ani
  globalnie `~/.claude.json`/`~/.claude/settings.json`) — martwa, prawdopodobnie skopiowana z
  innego szablonu konfiguracja.

### Rekomendowane naprawy
- [x] (2026-07-02) Dopisano `feedback_verify_implementation_exists_first.md` do `MEMORY.md`
      w `juz-ide-api-1` + treść feedbacku wcielona do protokołu weryfikatora (krok 0 Workflow:
      „verify the implementation EXISTS first — pusta delta = ESCALATE, nie werdykt").
- [x] (2026-07-02) Usunięto martwe `mcp__zen__codereview`/`mcp__zen__analyze` z `tools:`
      w `code-quality-verifier.md`. Dodano też regułę całych plików (krok 1 Workflow:
      „never verdict on a partial read" — incydent 120/443 linii).
- [ ] Drugi, niezależny pass weryfikacji dla krytycznych zmian — częściowo pokryje deterministyczny
      `/conformance-check` (AST, offline) jako drugi tor; pełna decyzja przy TASK-RAG-002/003
      (eval modularny D7 da seeded-bugs do zmierzenia skuteczności verifiera).

## 3. Awaria `/orchestrate-ddd` Workflow — token/czas (NAJPILNIEJSZE, ale świadomie odłożone)

Task TS-SEC-VERIFICATION-LEVELS-002 w `juz-ide-api-1`: **4 przebiegi Workflow, ~5,2M tokenów
łącznie, żaden nie ukończył pełnej weryfikacji.** Wzorzec: `code-quality-verifier` milknie w
środku aktywnego przeglądu (bez tekstu podsumowującego, bez wywołania narzędzia z werdyktem) — w
9/9 wywołań weryfikatora (3 warstwy × 3 próby) w jednym z przebiegów, niezależnie od zawężenia
zakresu ("mechanism"/"wire-up"/"docs").

**Ustalone (dowód w transkryptach, `/home/dev/.claude/projects/-opt-projects-juz-ide-api-1/.../subagents/workflows/wf_1d72895a-716/agent-a2200c1cd6eb89cb8.jsonl`)**:
- SubagentStop hook `check-subagent-pattern-reads.js` (tryb `block`) faktycznie wymusił dodatkową
  rundę "reconciliation pass" na 3 wywołaniach `domain-application-implementer` — to prawdopodobnie
  tłumaczy część wcześniejszych pustych wyników u implementerów. Działający mechanizm, nie awaria —
  ale kosztowny.
- Transkrypt padającego weryfikatora kończy się **zaraz po udanym `tool_result`**, bez kolejnej
  wypowiedzi asystenta, bez śladu hooka, bez błędu API w logu. `code-quality-verifier` w tym
  przebiegu **złamał własny protokół** (Phase 1 "ALWAYS DELEGATE to Explore") — poszedł prosto na
  `git status`/`grep`/`Read` bezpośrednio na Sonnet zamiast delegować file discovery, co samo w
  sobie zjada jego budżet.
- Dla weryfikatorów hook `check-subagent-pattern-reads.js` **fizycznie nie mógł być przyczyną** —
  `code-quality-verifier` ma `tools: Read, Glob, Grep, Bash` (bez Write/Edit/MultiEdit), więc hook
  wychodzi natychmiast (`editedFiles.size === 0`).
- **Nadal niewyjaśnione**: dlaczego proces milknie bez żadnego śladu. Wygląda na poziom silnika
  Workflow (`agent()` w `parallel()` — terminalny błąd API po wyczerpanych retry, zwrot `null`,
  stąd komunikat orchestratora "verifier agent ... nie zwrocil wyniku") — poza zasięgiem
  diagnostycznym z poziomu repo/hooków `claude-patterns`.

### Mitygacje (tanie, bez potwierdzonej przyczyny źródłowej)
- [x] (2026-07-02) `verify()` sekwencyjnie, NIGDY `parallel()` — twarda reguła w
      `orchestrate-ddd.md` („Reguły verify()"), także dla wycinków mechanism/wire-up/docs.
- [x] (2026-07-02) `maxTurns` `code-quality-verifier` 15 → 30.
- [ ] Gate delegacji-do-Explore dla weryfikatorów — **ŚWIADOMIE ODŁOŻONE**: PreToolUse nie zna
      `agentType` (tylko `agent_id`), więc selektywny gate byłby kruchy. SKUTEK złamania protokołu
      (budżet palony bez postępu) łapie teraz watchdog produktywności (TASK-OBS-001: burn bez
      zdarzenia postępu → SPINNING → HALT) + maxTurns. Wrócić, jeśli watchdog pokaże, że to nie
      wystarcza.
- [x] (2026-07-02) Reguła no-rerun w `orchestrate-ddd.md`: nigdy od zera, `resumeFromRunId`,
      po 2 nieudanych wznowieniach → STOP i eskalacja (commit 8d5c700, TASK-OBS-001).

Dopisane i WYKONANE 2026-07-02 (z `TASK-RAG-002.analysis.md` rewizja 2, status: approved):
- [x] **Bramka „kod istnieje"** — w pseudokodzie pętli `orchestrate-ddd.md`: `git diff --stat`
      puste po implement() → ESCALATE, nie weryfikuj. Lustrzany krok 0 w protokole weryfikatora.
- [x] **Werdykty przez `schema` w `agent()`** — reguła w `orchestrate-ddd.md`: `{verdict,
      violations[]}` przez StructuredOutput; `null` = agent umarł → natychmiastowy ESCALATE
      (w pseudokodzie). Werdykt = zdarzenie postępu dla watchdoga (kontrakt verify, D6).
- [x] **Reguła całych plików** — w protokole weryfikatora (krok 1: „never verdict on a partial
      read", czytaj do EOF).
- Uwaga sekwencjonowania: **Rule Card fix (SP3 split + N4) — WYKONANY — był twardym PREREQUISITE
  bramki best_practices w `TASK-RAG-003.md`** (D5a); RAG-003 ma odblokowany warunek 2.

## Priorytet na następną sesję
1. Mitygacje z sekcji 3 (najdroższy problem — godziny + miliony tokenów bez rezultatu).
2. Rule Card fix (SP3 split + `@BusinessRule`-bez-delegacji reguła) z sekcji 1 — wysoka dźwignia,
   mały nakład.
3. Drobne porządki z sekcji 2 (martwe `mcp__zen__*`, osierocony wpis memory).
