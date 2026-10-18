---
id: TASK-PANEL-NODE-ADVISOR-001
title: '`backend-technology-expert` jest doradcą jednego projektu, a siedzi w bloku `node`: uniwersalny doradca zależny od kontekstu stacku'
type: refactor
status: in-progress
priority: P2
story_points: 3
created_date: 2026-10-17
updated_date: 2026-10-17
assignee: '@unassigned'
labels: [agents, blocks, analyze, kaizen]
related: [TASK-DDD-PANEL-SPLIT-001, TASK-ORCH-PATTERN-GAPS-001]
source: >
  Wpisy w docs/tasks/_inbox z 2026-10-13 (framework-polityczny): panel bloku `node` wnosi
  agenta opisanego pod NestJS/BullMQ/Redis, a `threat-model` „się dubluje". Weryfikacja w kanonie
  2026-10-17 zmieniła diagnozę: dublowania `threat-model` nie ma (patrz Ustalenia), zostaje
  agent i jedna decyzja o `tech-analysis`.
---

# TASK-PANEL-NODE-ADVISOR-001: doradca zależny od kontekstu stacku

## 🎯 Goal

`backend-technology-expert` leży w `agents/universal/`, ale jego treść zakłada jeden projekt
(NestJS, `@vytches/ddd`, PostGIS, BullMQ, Redis, „rynek polski", „zespół 1-2 osoby").
Trzy bloki wnoszą go do panelu (`nestjs`, `node`, `ts-library`), więc iam, ai-gateway,
ai-os-bot, auth, platform i vytches-ddd dostają rady dopasowane do cudzego stacku.
Cel: ten sam agent, ta sama nazwa i ten sam kształt raportu, ale zalecenia wyprowadzane
z faktów o projekcie, a nie z zaszytych w treści założeń.

## Relacja do TASK-DDD-PANEL-SPLIT-001

To zadanie i `TASK-DDD-PANEL-SPLIT-001` (planned) dotykają tego samego pliku z różnych stron:

| | PANEL-SPLIT-001 | to zadanie |
|---|---|---|
| Problem | koszt i latencja: agent (Opus, effort max) odpala się bezwarunkowo w każdym zadaniu | treść: założenia jednego projektu w agencie „uniwersalnym" |
| Rozwiązanie | rozbić na wąskich doradców `nestjs-ddd`, każdy z `when:` | zrobić agenta zależnym od kontekstu stacku |
| Zakres | stack `nestjs-ddd` | wszystkie bloki, które go wnoszą |

Nie wykluczają się, ale **kolejność ma znaczenie**: najpierw to zadanie (oczyszczenie treści
z założeń), potem PANEL-SPLIT-001 wydziela z już czystej treści wąskich doradców. Odwrotnie
rozdzielilibyśmy założenia jednego projektu na kilka plików. Jeśli PANEL-SPLIT-001 zostanie
wykonane wcześniej, sekcje przeniesione do doradców `nestjs-ddd` przejmują tu opisane
zasady 1–4. Warunek `when:` dla odpalania agenta (koszt) zostaje w PANEL-SPLIT-001
i nie wchodzi w zakres tego zadania.

## Ustalenia (zweryfikowane 2026-10-17)

1. **`threat-model` z `nextjs` i `node` nie jest błędem.** Oba stage'e mają ten sam
   `output` (`TM-{TASK_ID}.md`) i `skip_if_exists: true`. `materialize-runtime.mjs`
   (komentarz przy kontroli kolizji `output`) świadomie przepuszcza takie pary: drugi stage
   widzi gotowy plik i się pomija. Twardym błędem jest dopiero para z jednym stage'em
   `blocking`. **Poprawka z 2026-10-17 (wcześniej uznałem to za w pełni niegroźne):** koszt
   rzeczywiście jest zerowy, ale `commands/analyze.md` (Krok 4) każe zgłaszać stage
   „dopasowany przez `when`, a pominięty, bo plik `output:` już istniał" jako
   `ANZ-STAGE-SKIPPED` do `_inbox`. Drugi `threat-model` więc może produkować fałszywe
   zgłoszenia o wadzie „maszyny", której nie ma. Opcje (do decyzji, nie w tym zadaniu):
   (a) wyjątek w `analyze.md`: pominięcie stage'a o tym samym `agent` i `output`
   nie jest zgłaszane; (b) `materialize-runtime` scala nieblokujące stage'e o identycznych
   `agent` + `output` w jeden (suma `when`). Obie zmieniają komendę lub silnik globalnie,
   dlatego wymagają osobnej zgody i bramki diffu `runtime.yml`.
2. **Nadpisanie i usunięcie stage'a już istnieje**: `extends:` w bloku lokalnym, stage o tym
   samym `stage` zastępuje bazowy, `drop: true` go usuwa. Nie dodajemy nowego mechanizmu
   ani ADR-u o modelu kompozycji.
3. **Nazwa agenta jest jedynym kontraktem.** Nic w `scripts/`, `hooks/`, `commands/`
   ani `tests/` nie parsuje formatu jego raportu. Referencje po nazwie: 3 bloki, 4 agenty
   `nestjs-ddd`, `ml-inference-architect`, 3 szablony stacków, `agents/README.md`.
   Żaden projekt nie ma lokalnej kopii (`.claude/agents/backend-technology-expert.md`).

## Co jest nie tak z agentem (do usunięcia z treści)

| Zaszyte założenie | Skutek poza projektem, z którego pochodzi |
|---|---|
| tabela „Technology Stack Context": NestJS, `@vytches/ddd`, PostGIS 3.3, BullMQ, Redis, ADR-0001..0020 | agent „pamięta" cudzy stack i wpisuje go do rekomendacji |
| „Polish market constraints", „B2C first", segmenty z `customer-segments.md` | wymuszona konsultacja z `@product-owner` w projektach bez takich segmentów |
| wagi kryteriów (Bootstrap Fit 30%, Polish Market 20%…) | każda ocena opcji zaczyna od tych samych liczb |
| BullMQ jako domyślna kolejka, Redis jako domyślny cache | projekt z pg-boss dostaje „BullMQ" jako rekomendację |
| opis (`description`) wymienia NestJS | frontmatter wprowadza w błąd przy wyborze agenta |

## Projekt zmiany

Zasada: agent nie nosi wiedzy o stacku, tylko **zna procedurę jej ustalenia** i na niej
opiera każdą rekomendację.

1. **Krok 0: ustal kontekst, zanim cokolwiek zalecisz.** Agent nie ma Grep/Glob, więc czyta
   tylko to, co mu podano lub co otwiera przez `Read`: `.claude/config/runtime.yml`
   (`stack_blocks`, osie), `CLAUDE.md` projektu, wstrzyknięty `{PATTERNS}`, `docs/adr/`.
   Z tego buduje blok „Założenia" na górze raportu (stack, kolejka, cache, ORM,
   ograniczenia). Czego nie ustalił, oznacza jako `NIEZNANE` i prosi wołającego
   o dane (zasada „raport niepełny, ale uczciwy" zostaje).
2. **Stack z projektu, nie z agenta.** Drzewa decyzyjne (sync vs async, cache, kolejka,
   zapytania) zostają, ale stają się neutralne: opcje wypisane jako rodziny
   (kolejka w Redisie / w Postgresie / zarządzana chmurowo; cache w procesie / współdzielony),
   a wybór zaczyna się od pytania „co projekt już ma". Reguła: **nowa technologia
   wymaga uzasadnienia wobec tej, która już jest w stacku**.
3. **Wagi kryteriów z projektu.** Agent ma domyślny zestaw kryteriów bez liczb. Wagi
   bierze z `CLAUDE.md` / ADR-ów albo prosi o nie. Jeśli ich nie ma, podaje rekomendację
   jakościową i jawnie pisze, że wag nie ustalono (zamiast zgadywać 30/20/15).
4. **Kontekst biznesowy opcjonalny.** „Business Value Validation" wykonuje się tylko, gdy
   istnieje `.claude/knowledge/business/customer-segments.md` lub projekt ma
   `@product-owner`; w przeciwnym razie krok jest pomijany z adnotacją, a nie wymuszany.
5. **Zmiany w frontmatterze: tylko `description`** (usunięcie NestJS/BullMQ/Redis z listy
   „Core Expertise" na rzecz „Node/TypeScript backend"). `name`, `tools`, `disallowedTools`,
   `model`, `permissionMode`, `maxTurns`, `memory` zostają bez zmian.
6. **Kształt raportu bez zmian** (`Backend Technology Decision Report`, statusy
   `RECOMMENDATION | ADR_CREATED | ANALYSIS_COMPLETE`) plus jedna nowa sekcja
   „Założenia" na początku. Dodanie sekcji nie psuje niczego, co czyta raport (nic go nie
   parsuje, patrz Ustalenia 3).
7. **Wiedza o frameworku zostaje w wzorcach, nie w agencie.** Katalogu `patterns/nestjs/`
   nie ma: wzorce NestJS są rozproszone po `cross-layer/`, `application/`, `infrastructure/`
   i wstrzykiwane przez blok `nestjs` jako `{PATTERNS}`. Agent czyta więc to, co blok mu
   poda, i nie nosi własnej kopii (sekcja „NestJS internals" znika). Dzięki temu
   juz-ide-api-*, marketing-hub i grant-flow dostają konwencje NestJS z `{PATTERNS}`, a Fastify
   i Next.js nie dostają cudzych rad.

Dlaczego nie osobny agent per stack: dwa agenty o prawie tej samej treści rozjeżdżają się
(tak działo się z lokalnymi kopiami agentów), a procedura ustalania kontekstu i tak jest
wspólna. Dlaczego nie wycinanie z `node`: iam, ai-gateway i ai-os-bot dziedziczą po
bloku `node` i straciłyby doradcę, który im się przydaje.

## Decyzja: `tech-analysis` w `[nextjs, ./fp-node]` (podjęta 2026-10-17)

Dwa stage'e o tym samym `stage: tech-analysis` z różnymi agentami (`nextjs-architecture-expert`
z `nextjs`, `ecc:architect` z `node`) wchodzą oba do panelu. **Zostają oba.** Różne agenty
dają różne perspektywy (framework vs backend), a konwencja „generyczny `tech-analysis` obok
specjalisty" jest w blokach `nestjs` i `ts-library` ta sama. Zapisane komentarzem w
`blocks/nextjs.yml`; `drop` nie jest potrzebny, silnik bez zmian.

## Zakres: co NIE jest ruszane

- `scripts/materialize-runtime.mjs`, `scripts/orchestrate-prepare.mjs`, `hooks/*`,
  `commands/analyze.md`, `commands/orchestrate.md`: bez zmian.
- Nazwa stage'a `tech-analysis-specialist` w `nestjs`, `node`, `ts-library`: bez zmian.
- Frontmatter agenta poza `description`: bez zmian.
- Warunek `when:` dla odpalania agenta: zakres PANEL-SPLIT-001.

## Jak nie zepsuć istniejących orkiestracji (bramka przed i po)

Zmiana dotyka treści agenta czytanego przez 6+ projektów z panelem, więc:

1. **Przed zmianą**: zapisać `runtime.yml` dla projektów z agentem (iam, ai-gateway,
   ai-os-bot, auth, platform, vytches-ddd, nest-kit, feature-flags, grant-flow, juz-ide-api-1..4,
   marketing-hub) jako punkt odniesienia.
2. **Po zmianie**: `node scripts/ci/validate-agents.js`, `node scripts/ci/validate-blocks.mjs`,
   `node scripts/audit-projects.mjs`, potem `materialize-runtime` + `verify-project-setup`
   w każdym z tych projektów; diff `runtime.yml` ma być **pusty** (zmiana jest w treści
   agenta, nie w blokach).
3. **Przebieg próbny na dwóch projektach o różnych stackach**: jeden NestJS (np. marketing-hub:
   pytanie o kolejkę, oczekiwane: agent zauważa BullMQ/Redis ze stacku) i jeden Fastify
   lub pg-boss (ai-gateway lub framework-polityczny: oczekiwane: nie zaleca BullMQ,
   w „Założeniach" wypisuje faktyczny stack). Porównać z odpowiedzią sprzed zmiany.
4. **Kontrola regresji NestJS**: te same trzy pytania z `description` agenta (sync vs async,
   N+1, kolejka) zadane przed i po na projekcie NestJS; rekomendacje nie mogą się pogorszyć
   (ocena ręczna, zapisana w sekcji Findings).
5. Zmiana `description` nie może wpłynąć na dobór agenta w auto-invoke:
   sprawdzić, że lista `AUTO-INVOKE KEYWORDS` zostaje (to ona, nie opis, steruje wywołaniem
   w komendach projektów).

## Dodatkowo (małe)

- `framework-polityczny/.claude/blocks/fp-node.yml`: po wdrożeniu usunąć `drop: true` dla
  `backend-technology-expert` (agent przestaje przeszkadzać) i dla `threat-model`
  (niepotrzebne, patrz Ustalenia 1). Zmiana po stronie projektu, po decyzji użytkownika.
- `docs/tasks/_inbox`: wpis o `threat-model` oznaczyć jako „zaprojektowane, bez akcji";
  wpis o `backend-technology-expert` zamknąć tym zadaniem.
- `setup-project.sh`: dopisać `installed.yml` do generowanego `.gitignore` (osobny wpis
  z `_inbox`, jedna linia).
- `CHANGELOG.md`: wpis w `[Unreleased]` (Changed: agent; Fixed: `.gitignore` w setupie).

## Findings: przebieg próbny 2026-10-17

Jedno pytanie („e-mail potwierdzający po rejestracji: sync czy async i jakim mechanizmem?")
zadane nowemu agentowi na trzech stackach. Agent miał tylko Read/WebFetch/WebSearch.

| Projekt (stack) | Założenia ustalone z projektu | Rekomendacja | Obce technologie |
|---|---|---|---|
| marketing-hub (NestJS, Kysely) | BullMQ + Redis z CLAUDE.md, outbox z bloku `ddd/events` | rejestracja sync, mail async przez outbox → BullMQ | brak; BullMQ jest w stacku |
| ai-gateway (Fastify, bez bazy) | brak kolejki i bazy, `NIEZNANE` | mail wysyła właściciel kont (iam), nie gateway; outbox w jego bazie | brak; nie zaproponował BullMQ |
| framework-polityczny (Next.js, pg-boss) | pg-boss + `apps/worker`, Redis/BullMQ odrzucone w ADR-0006 | zapis do kolejki sync, wysyłka async w workerze; sprawdził API Better Auth i pg-boss w dokumentacji | brak |

Obserwacje:
- Kryterium „brak NestJS/BullMQ/Redis jako domyślnych" spełnione: BullMQ pojawia się tylko tam,
  gdzie stack go ma. Wagi nie zostały wymyślone, `NIEZNANE` oznaczone uczciwie.
- Dwa razy agent zapytał, czy rejestracja w ogóle należy do danego repo (marketing-hub, ai-gateway).
- Wykryte wady samego tekstu agenta, poprawione tego samego dnia: Step 0 twierdził „tylko Read"
  (agent ma też WebFetch/WebSearch), akapit o `mcp__zen__*` był nieprawdziwy od 2026-09-08,
  `Read` na katalogu kończy się EISDIR (2 z 3 prób) — dodano regułę czytania listy ADR
  z `decisions-index.json`, gdy projekt ma `decision-registry`.
- Ograniczenie: nie zrobiono porównania A/B ze starą wersją agenta na tych pytaniach, więc
  „brak regresji w NestJS" jest oceną jakości raportu (grounding, zgodność ze stackiem), nie
  pomiarem względem poprzednika.
- Raporty są długie (agent opisuje opcje i notatki dla implementerów); długość nie była
  kryterium, ale warto ją obserwować przy kosztach panelu (Opus, effort max).

Znaleziska poza zakresem zadania (zgłosić osobno):
1. framework-polityczny: ADR-0006 ma `status: accepted` we frontmatterze, a treść mówi
   „pg-boss: proponowane". Indeks decyzji uznaje pg-boss za przesądzony.
2. marketing-hub: `when` etapu `threat-model` z bloku `nestjs` nie łapie rejestracji ani
   weryfikacji e-maila (brak słów `token`/`pii`/`auth` w typowym opisie takiego taska).
3. Wzorzec `transactional-outbox` odsyła do `bullmq-queue-pattern.md` (nie ustalono, gdzie leży)
   i jednocześnie kieruje zadania z tego samego kontekstu do „plain BullMQ", a zabrania
   `queue.add` w handlerze zdarzenia domenowego.

## ✅ Acceptance criteria

- [x] `backend-technology-expert` nie zawiera nazw NestJS, BullMQ, Redis, PostGIS,
      `@vytches/ddd`, „Polish market" (poza komentarzem o incydencie w `blocks/nestjs.yml`
      i wpisem w Changelogu agenta).
- [x] Raport zaczyna się sekcją „Założenia" z faktami ustalonymi z projektu lub `NIEZNANE`.
- [x] `validate-agents`, `validate-blocks`, `audit-projects` bez nowych ostrzeżeń.
      (2026-10-17: walidatory przechodzą — 60 agentów, 28 bloków. `audit-projects`: 2 błędy to
      absolutne symlinki w git w grant-flow i marketing-hub, 5 ostrzeżeń to `extends` nadpisujący
      `orchestrate` w aig/bot/grant-flow/iam/mi; żadne nie dotyczy tej zmiany. Brak
      porównania ze zrzutem sprzed zmiany, ale pozycje nie dotykają agenta ani bloków `node`/`nextjs`.)
- [x] Diff `runtime.yml` w projektach z agentem: pusty (21 projektów, kopie bazowe).
- [x] Dwa przebiegi próbne (NestJS i nie-NestJS) opisane w Findings, bez regresji w NestJS.
      (A/B 2026-10-17, Sonnet, grant-flow, to samo pytanie: e-mail + PDF po złożeniu wniosku.
      Stara wersja (HEAD) i nowa dały zgodną rekomendację ze stacku projektu: sync tylko zapis,
      PDF i e-mail async, BullMQ, outbox w transakcji, `jobId` + drugi poziom idempotencji w bazie
      (ADR-0008), `opossum`. Nowa wersja miała dodatkowo sekcję „Założenia" z `NIEZNANE`
      (dostawca SMTP, biblioteka PDF), lepsze uwzględnienie reguł wzorców (separator `_` w `jobId`,
      `OnWorkerEvent('failed')`) i nie przeniosła do raportu nieaktualnej tabeli stacku (PostGIS,
      `@vytches/ddd`), o którą stara wersja się potknęła. Jedna próbka na wersję — wniosek
      kierunkowy, nie statystyczny.)
- [x] Decyzja o `tech-analysis` w `nextjs`+`node` zapisana (komentarz w bloku lub `drop`).
- [x] Wpisy w `_inbox` zaktualizowane, `CHANGELOG.md` uzupełniony.
