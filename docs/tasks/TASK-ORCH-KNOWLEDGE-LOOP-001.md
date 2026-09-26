---
id: TASK-ORCH-KNOWLEDGE-LOOP-001
title: 'Domknięcie pętli zgłoszeń: known-fix lookup + alert na nieznane odstępstwo + wpis do globalnej bazy wiedzy'
type: spike
status: planned
priority: P3
story_points: 5
created_date: 2026-09-26
updated_date: 2026-09-26
assignee: '@unassigned'
labels: [kaizen, orchestration, knowledge-base, future]
depends_on: []
related: []
source: >
  Rozmowa z użytkownikiem 2026-09-25/26, po wdrożeniu ORC-066 (docs/tasks/_inbox/,
  scripts/report-deviation.mjs — lokalny, plikowy rejestr odstępstw z /orchestrate).
  Użytkownik opisał docelową architekturę w 3 wiadomościach; poniżej streszczenie do
  wykorzystania, gdy temat wróci. Decyzja na 2026-09-26: zostać przy mechanizmie
  lokalnym/plikowym na razie ("na ten moment lokalnie jak to zrobimy też będzie ok") —
  ten task to zapis wizji, NIE zlecenie do natychmiastowej realizacji.
---

# TASK-ORCH-KNOWLEDGE-LOOP-001 — domknięcie pętli zgłoszeń odstępstw

## 🎯 Goal

Dzisiejszy mechanizm (ORC-066) jest wyłącznie reaktywny i jednokierunkowy: workflow
zgłasza odstępstwo do `docs/tasks/_inbox/`, ale (a) nie sprawdza PRZED próbą, czy dany
problem jest już znany i naprawiony, (b) nieznane/nowe odstępstwa nie trafiają nigdzie
poza plik — nikt nie dostaje sygnału, że coś nowego wymaga uwagi, (c) po naprawie
wiedza nie wraca automatycznie do miejsca, z którego korzystają agenci (RAG/wzorce).
Bez tego dużo pracy przepada — inny projekt/osoba może próbować naprawiać dokładnie to
samo, niezauważenie, marnując zasoby na coś już rozwiązanego.

## Docelowa architektura (wizja użytkownika, do doprecyzowania przed realizacją)

1. **Known-fix lookup przed próbą** — workflow/`orchestrate-prepare.mjs` sprawdza,
   zanim zacznie, czy sygnatura problemu jest już znana (analogicznie do tego, jak
   agenci dziś pobierają wzorce implementacji z bazy wektorowej przez lokalny MCP
   `knowledge-retriever`). Jeśli tak — natychmiastowa propozycja naprawy dla usera
   (np. "zaktualizuj claude-patterns do wersji X", konkretna zmiana `project.yml`),
   zamiast pozwalać workflow ponownie palić tokeny na coś już rozwiązanego.
2. **Alert na nieznane odstępstwo** — gdy lookup z punktu 1 nie znajdzie dopasowania
   (czyli faktycznie nowy przypadek), system wysyła notyfikację na określony kanał
   Discord.
3. **Proces naprawy** — osoba odpowiedzialna z tego kanału zakłada ticket i naprawia
   (dziś to się dzieje ręcznie i nieregularnie — to jest właśnie ten proces, tylko
   bez alertu wypychającego sygnał do człowieka).
4. **Zamknięcie pętli** — po naprawie wpis trafia do bazy danych, przez co staje się
   dostępny globalnie — dla wszystkich projektów/osób, tym samym mechanizmem, którym
   agenci już dziś pobierają wzorce (czyli rozwiązanie problemu staje się kolejnym
   typem obiektu w tej samej bazie wiedzy, nie osobnym systemem).

## Otwarte pytania (do rozstrzygnięcia, zanim to wejdzie do realizacji)

- Czy potrzebny jest realny czas rzeczywisty (Discord/serwis sieciowy), czy
  wystarczy synchronizacja w tempie git push/pull między osobami z lokalnym
  claude-patterns? To rozstrzyga, czy w ogóle potrzebna jest nowa infrastruktura
  sieciowa (ai-gateway), czy punkt 1 i 4 da się zrobić w całości na już istniejącym
  lokalnym `knowledge-retriever` (indeksując rozwiązane `TASK-ORCH-*.md` /
  `orchestrate-rule-history.md` tak jak dziś indeksuje się wzorce).
- Kto formalnie jest "osobą odpowiedzialną" z punktu 3 — to decyzja organizacyjna,
  nie techniczna, i wg oceny z rozmowy 2026-09-25 to ONA realnie ratuje ten mechanizm
  przed losem `docs/adr/0006-cross-instance-broadcast.md` (retired 2026-09-07, zero
  wpisów przez 11 miesięcy) — punkt 2/3 bez właściciela procesu to ten sam błąd w
  nowej formie, niezależnie od tego, czy alert idzie na Discord czy gdziekolwiek indziej.
- Punkt 1 (known-fix lookup) da się prawdopodobnie zbudować NAJPIERW, niezależnie od
  punktów 2-4, i bez ai-gateway — patrz rekomendacja w rozmowie źródłowej.

## ✅ Kryterium ukończenia

Nie dotyczy na tym etapie — to task typu `spike`/wizja, nie zaimplementowany kawałek.
Do doprecyzowania (osobny `/analyze`) w momencie, gdy temat wróci.
