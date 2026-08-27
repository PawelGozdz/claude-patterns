---
id: TASK-DDD-PANEL-SPLIT-001
title: "Rozbicie advisory-stage'ów panelu /analyze-ddd na węższych, równoległych specjalistów"
type: task
status: planned
created_date: 2026-07-08
---

# TASK-DDD-PANEL-SPLIT-001 — Rozbicie advisory-stage'ów panelu `/analyze-ddd` na węższych, równoległych specjalistów

**Status: TODO** · **Źródło:** sesja 2026-07-08 (audyt latencji `/analyze-ddd` → `/orchestrate-ddd`,
naprawa zależności od `mcp__zen__*`, dyskusja "duzi generaliści vs wielu wąskich specjalistów"
po wzorze panelu `reviewer-*` z 2026-07-07)

**Nie implementować bez przeczytania.** To jest propozycja do dyskusji/zatwierdzenia (analogicznie
do artefaktu `{TASK-ID}.analysis.md`), nie gotowy plan do ślepego wykonania — patrz sekcja
"Otwarte pytania" niżej.

## Kontekst i motywacja

Dzisiejszy audyt panelu `phase_research` (`presets/nestjs-ddd.yml`) ustalił:

1. Panel to 7 sekwencyjnych stage'ów, mimo że część z nich jest jawnie `advisory: true`
   (nie blokuje niczego) i nie zależy od siebie nawzajem (patrz wcześniejsza dyskusja o
   sparalelizowaniu — nieukończony punkt #1 z audytu latencji).
2. `tech-analysis-specialist` (`backend-technology-expert`) odpala się **bezwarunkowo w każdym
   zadaniu** (`model: opus, effort: max` — najwolniejszy węzeł sekwencji), mimo że bundluje 4
   różne, w większości niezależne od siebie kompetencje: sync/async, caching, wybór technologii,
   optymalizacja wydajności/N+1. Większość zadań dotyka co najwyżej jednej z nich, jeśli w ogóle.
3. `impl-analysis` (`infrastructure-testing-implementer`, advisory) i `pattern-fit`
   (`code-quality-verifier`, advisory) to pełne, kilkusetliniowe prompty **implementerów/verifierów
   z uprawnieniem VETO**, użyte tutaj tylko w trybie doradczym — cała reszta ich prompta (pełne
   workflow implementacji/weryfikacji, VETO power, testy) jest w tym kontekście martwym ciężarem
   wczytywanym na każdy przebieg.
4. Dokładnie ten sam problem rozwiązaliśmy już raz — wzorzec `reviewer-*` (15 wąskich, równoległych
   person code-review, `skills/quality/review-panel/`) zamiast kilku grubych generalistów. Ta sama
   logika: niezależne spojrzenia na TEN SAM statyczny input = równoległość "za darmo" + mniejsza
   powierzchnia = mniej okazji na drift (dzisiejszy audyt znalazł martwe referencje
   `@codebase-explorer`/`@customer-value-guardian` właśnie w największych, najbardziej
   rozbudowanych plikach — `ddd-application-expert.md`, `backend-technology-expert.md`).

**Czego NIE dotyczy ten task** (świadomie zostaje bez zmian — patrz uzasadnienie w rozmowie
2026-07-08):
- `ddd-modeling` (`ddd-application-expert`) — to stage produkujący `decisions[]`, rdzeń artefaktu
  analizy; rozbicie decyzji DDD między wieloma agentami bez współdzielonego kontekstu ryzykuje
  niespójne/sprzeczne decyzje. Zostaje jako jeden spójny agent.
- `tech-analysis` (`ecc:architect`) — agent z bazy ECC, poza naszą kontrolą/zakresem edycji.
- `synthesis` (`tech-lead`) — musi być ostatni, zbiera wszystko.
- Implementery właściwe (`domain-application-implementer`, `infrastructure-testing-implementer`
  w roli VETO w `/orchestrate-ddd`) — tam sekwencyjność i "jeden spójny pisarz kodu na warstwę"
  to celowa decyzja (patrz rozmowa: pisanie kodu potrzebuje jednego właściciela kontekstu, nie
  fragmentacji), inna sytuacja niż doradcze, bezstanowe lenses.

## Proponowany podział

Zamiast: `tech-analysis-specialist` (1 agent, bezwarunkowy, Opus+max) + `impl-analysis` (1 pełny
prompt implementera, advisory) + `pattern-fit` (1 pełny prompt verifiera, advisory) — **4 nowe, wąskie,
jednotematyczne agenty doradcze**, każdy z osobnym, warunkowym `when:` (na wzór już istniejącego
`threat-model`), wołane RÓWNOLEGLE:

| Nowy agent (plik do stworzenia) | Zakres | Wyciągnięty z | Model | `when:` (trigger) |
|---|---|---|---|---|
| `agents/stacks/nestjs-ddd/advisors/sync-async-advisor.md` | Tylko decision framework sync vs async (tabela + template z `backend-technology-expert.md` sekcja "1. Sync vs Async Decision Framework") | `backend-technology-expert.md` §1 | sonnet | `sync\|async\|queue\|bullmq\|event-driven\|message queue` |
| `agents/stacks/nestjs-ddd/advisors/performance-cache-advisor.md` | Tylko caching + performance/N+1 decision trees (§2 i §3 "Caching Strategy"/"Queue vs Direct Call"/"Database Query Optimization") | `backend-technology-expert.md` §2-3 | sonnet | `performance\|cache\|caching\|n\+1\|query\|throughput\|scalability` |
| `agents/stacks/nestjs-ddd/advisors/testability-advisor.md` | Sama perspektywa "czy to będzie testowalne, jaki tier piramidy testów, jakie fixture'y" — BEZ pełnego workflow implementacji testów | subset `infrastructure-testing-implementer.md` (tylko advisory-relevant sekcje) | haiku lub sonnet | brak (zawsze, ale tani i wąski) |
| `agents/stacks/nestjs-ddd/advisors/pattern-conformance-advisor.md` | Sama perspektywa "czy proponowane decyzje pasują do znanych wzorców/rule cards, jakie anti-patterny to wywoła" — BEZ pełnego VETO-verify workflow | subset `code-quality-verifier.md` (tylko advisory-relevant sekcje) | haiku lub sonnet | brak (zawsze, ale tani i wąski) |

Każdy nowy plik: **żadnych `mcp__zen__*`** (dzisiejsza lekcja — niepotrzebna zależność), żadnego
`Task` (to liście panelu, ta sama zasada co reszta), tylko `Read` + ewentualnie `Grep/Glob` jeśli
faktycznie potrzebują szukać czegoś poza wstrzykniętym kontekstem.

### Szkic zmiany w `presets/nestjs-ddd.yml`

```yaml
panel:
  - { stage: threat-model, agent: "/threat-model", when: "auth|pii|cross_context|public_api", ... }
  - { stage: tech-analysis, agent: "ecc:architect" }
  - { stage: ddd-modeling, agent: "ddd-application-expert" }        # równolegle z tech-analysis (patrz TASK latency #1)
  - { stage: sync-async,        agent: "sync-async-advisor",        advisory: true, when: "sync|async|queue|bullmq|event-driven" }
  - { stage: performance-cache, agent: "performance-cache-advisor", advisory: true, when: "performance|cache|caching|n\\+1|query|throughput|scalability" }
  - { stage: testability,       agent: "testability-advisor",       advisory: true }
  - { stage: pattern-fit,       agent: "pattern-conformance-advisor", advisory: true }
  - { stage: synthesis,         agent: "tech-lead" }                # ostatni, zbiera wszystko
```

Cztery `advisory: true` stage'e wołane w JEDNYM `parallel()` (albo równoległych `Task` w jednej
wiadomości) zamiast po kolei — 2 z nich (`sync-async`, `performance-cache`) często w ogóle się nie
odpalą (brak trafienia `when:`), więc typowy przebieg będzie miał **2 równoległe advisory-lenses
zamiast 3 sekwencyjnych pełnych agentów**, plus możliwość, że żaden nie trafi (najlżejsze zadania).

## Fazy

### Faza 1 — przygotowanie treści (bez zmian w presecie/agentach jeszcze)
- [ ] Wyciągnąć z `backend-technology-expert.md` sekcje §1 (Sync vs Async) i §2-3
      (Performance/Caching) do dwóch osobnych, samodzielnych promptów — sprawdzić, czy dają się
      w pełni oddzielić bez odwołań do reszty pliku (Business Value Validation, Collaboration
      Protocol itd. — część z tego trzeba będzie skrócić/zduplikować minimalnie).
- [ ] Wyciągnąć z `infrastructure-testing-implementer.md` i `code-quality-verifier.md` TYLKO
      sekcje istotne dla oceny "na sucho" (bez pełnego workflow implementacji/VETO) —
      zidentyfikować dokładnie które sekcje to są.

### Faza 2 — nowe pliki agentów
- [ ] Utworzyć 4 pliki wg tabeli wyżej, każdy z `disallowedTools` blokującym `Task`/`mcp__zen__*`
      od razu (nie czekać na kolejny audyt drift).
- [ ] Dodać do `agents/README.md`.

### Faza 3 — preset + orchestracja
- [ ] Zaktualizować `presets/nestjs-ddd.yml` wg szkicu wyżej.
- [ ] Zaktualizować `commands/analyze-ddd.md` krok 1 (dobór agentów panelu) — opisać nowe stage'e
      i zasadę równoległości dla `advisory: true` grupy.
- [ ] Zaktualizować sekcję "synthesis" (`tech-lead`), żeby wiedziała, że może dostać 0-4 raportów
      advisory zamiast zawsze 2 — streszczenie musi to obsłużyć gracefully.

### Faza 4 — weryfikacja
- [ ] Przebieg testowy na małym zadaniu (bez sync/async/cache w opisie) — potwierdzić, że
      `sync-async`/`performance-cache` się NIE odpalają i panel faktycznie jest krótszy.
- [ ] Przebieg testowy na zadaniu z cache'owaniem — potwierdzić, że `performance-cache-advisor`
      się odpala i daje sensowną, węższą analizę niż pełny `backend-technology-expert`.

## Otwarte pytania (do rozstrzygnięcia PRZED implementacją)

1. Czy 4 nowe advisory-lenses powinny widzieć `decisions[]` z `ddd-modeling`, czy tylko surowy
   spec zadania + Rule Cards? (Wpływa na to, czy mogą lecieć równolegle Z `ddd-modeling`, czy
   muszą czekać na jego wynik.)
2. Czy `testability-advisor`/`pattern-conformance-advisor` naprawdę potrzebują osobnych plików,
   czy to nadmiarowe rozdrobnienie w stosunku do zysku (w przeciwieństwie do `sync-async`/
   `performance-cache`, te dwa NIE mają warunku `when:` — zawsze się odpalą, więc oszczędność
   czasu jest mniejsza niż przy prawdziwie warunkowych stage'ach).
3. Czy `backend-technology-expert.md` zostaje jako plik (do użycia poza `/analyze-ddd`, np.
   ad-hoc "@backend-technology-expert zaprojektuj cache'owanie sesji") równolegle z nowymi,
   węższymi advisorami, czy zostaje zdeprecjonowany na rzecz dwóch nowych plików?
4. **(dodane 2026-07-08, z dyskusji o wzorcu skill↔agent)** Czy te nowe, wąskie advisory-agenty
   powinny same deklarować `skills:` w swoim frontmatterze (jak dziś robią np.
   `security-e2e-verifier.md`, `library-api-guardian.md`), skoro — do zweryfikowania — to
   pole obecnie może nie mieć egzekwowalnego efektu (patrz odpowiedź w rozmowie); czy zamiast
   tego logika decyzyjna (np. sync-vs-async decision tree) powinna żyć jako osobny SKILL, a agent
   być tylko cienką warstwą wołającą go? Patrz `patterns/` na precedens „logika w
   skillu/patternie, agent tylko orkiestruje" zanim się to rozstrzygnie.

## Zasada

Rozbijaj generalistę na wąskich specjalistów tam, gdzie ich perspektywy są **niezależne od siebie
i od reszty panelu** (jak w `reviewer-*`) — równoległość i mniejsza powierzchnia driftu są wtedy
"darmowe". NIE rozbijaj tam, gdzie potrzebny jest jeden spójny właściciel kontekstu podejmujący
powiązane decyzje (`ddd-modeling`) albo piszący kod (implementery w `/orchestrate-ddd`) — tam
fragmentacja kosztuje więcej (koordynacja, spójność), niż oszczędza.
