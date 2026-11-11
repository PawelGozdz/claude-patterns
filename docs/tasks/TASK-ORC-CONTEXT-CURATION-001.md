---
id: TASK-ORC-CONTEXT-CURATION-001
title: 'Kontekst agentów /orchestrate: kompaktowe karty, bezpieczne zawężanie dla weryfikatora, kurator przykładów z RAG'
type: feature
status: in-progress
priority: P2
story_points: 8
created_date: 2026-11-11
updated_date: 2026-11-11
assignee: '@unassigned'
labels: [orchestrate, cost, context, rag]
related: [TASK-ORC-GATE-COST-001, TASK-COST-CONTEXT-001]
source: 'analiza telemetrii workflow-steps.jsonl i archiwum werdyktów, 2026-11-11 (rozmowa o koszcie kontekstu /orchestrate)'
---

# TASK-ORC-CONTEXT-CURATION-001: mniej tokenów w promptach agentów, bez utraty reguł

## 🎯 Goal

Zmniejszyć koszt kontekstu agentów `/orchestrate` tam, gdzie go widać w danych, i **sprawdzać każdy krok na danych historycznych**,
zanim trafi do silnika. Praca jest oddzielona od `develop` (gałąź `feature/TASK-ORC-CONTEXT-CURATION-001`).

## Dane wyjściowe (2026-11-11)

Telemetria `workflow-steps.jsonl`, 2026-10-01..11-11, 10 711 kroków, **$3593**. Cenniki z regresji `costUsd` (Sonnet: zapis do cache
$3,75, odczyt $0,30, wyjście $15 za mln tokenów; Opus 6,25/0,50/25; Haiku 5.5 0,12/0,01/0,50).

- Role: implementer 49% ($1756), bramka 27% ($984), weryfikator 14% ($515), naprawa 7%, sondy 2%.
- Rodzaj tokenów: **zapis do cache 45%**, odczyt 39%, wyjście 16%. Każde wywołanie zapisuje cały prompt od nowa.
- Koszt implementera rozkłada się równo po długości kroku (do 8 tur 25%, 9–20 23%, 21–40 25%, powyżej 40 27%): tania część to stały prompt.
- Karty reguł to większość promptu implementera: TS-OBS-LOG-LINE-001 miał 20 kart, 91 tys. znaków (~25 tys. tokenów), reszta promptu ok. 4,5 tys. tokenów.
  Taki blok kosztuje $0,13 (5 tur Sonneta) do $0,48 (52 tury); w bramce na Opusie $0,22–0,81.
- Kolejne weryfikatory w tym samym runie zapisują 55 tys. tokenów wobec 74 tys. pierwszego: część prefiksu (system, CLAUDE.md) już jest współdzielona.

## Wynik powtórki historycznej (`scripts/card-citation-replay.mjs`, archiwum 900 werdyktów, 2026-10-18..11-11)

1. **Widok kompaktowy kart.** Sekcje `MUST`/`NEVER`/`RULES` to **54% znaków** 86 kart (321 tys.), a zawierają **619 z 620** cytowanych reguł kart
   (99,8%); samo `MUST`/`NEVER` to 46% znaków i 94% cytowań. Wniosek: kompaktowy widok ~ połowy rozmiaru gubi ok. 0,2% cytowań.
2. **Połowa cytowań weryfikatorów w ogóle nie dotyczy kart.** 658 z 1278 zacytowanych ID to decyzje taska (D#), BDR i ADR. Decyzji i kanonu
   NIE wolno ciąć „przy okazji" odchudzania kart.
3. **Zawężenie kart po tagach (ORC-163, scalone) jest ryzykowne dla WERYFIKATORA warstwy.** Z 25 werdyktów NO_GO weryfikatorów warstw z cytowaną regułą
   karty w **9 (36%)** co najmniej jedno blokujące naruszenie dotyczyło karty, której po zawężeniu ta warstwa by nie dostała; z 80 blokujących
   cytowań 12 (15%). Najczęstsze pary: infrastruktura ← `acl-registry` (3), aplikacja ← `geo-spatial-query` (2), infrastruktura ← `domain-errors` (2),
   infrastruktura ← `testing-pyramid` (2). Te ustalenia wyłapałaby wtedy dopiero bramka końcowa (mediana $2,39 wobec $0,40 weryfikatora warstwy).
   Zastrzeżenia: próbka mała (25 werdyktów, głównie juz-ide-api-1), 32 z 80 cytowań ma ID niejednoznaczne (to samo ID w kilku kartach; liczyłem
   „utracone" tylko gdy żadna karta o tym ID nie byłaby dostarczona), a tagi warstw przyjąłem z runtime.yml projektów API.

## Zakres

### A. Naprawa zawężania dla weryfikatora (pilne, bo ORC-163 jest w `develop`)
Zrobione (ORC-164): zawężanie zostaje dla implementera i naprawy (56% kosztu), weryfikator warstwy dostaje komplet kart planu.

### B. Widok kompaktowy kart
Strojenie na archiwum zmieniło założenie: sekcje `MUST`/`NEVER`/`RULES` to 54% znaków, ale `Minimal correct skeleton` (14%) jest potrzebny implementerowi, a
`Verifier — najczęstsze naruszenia → VETO` (15%) weryfikatorowi. Realny zysk z widoków per rola (bez WHY/POWIĄZANE/✅❌/komentarzy i bez sekcji drugiej roli) to
raczej 20–25% niż połowa; do potwierdzenia na prawdziwych kartach przed budową. Dalej: generowany deterministycznie z `_summary.md`.

Generowany deterministycznie z `_summary.md` (bez nowych plików utrzymywanych ręcznie). Kryterium: ≥ 99% cytowań z archiwum pokrytych, rozmiar ≤ 55%.
Weryfikator i bramka dalej mogą dostać pełną kartę; implementer kompaktową.

### C. Kurator przykładów z RAG (tylko przykłady, nie karty)
Krok `agent()` na Haiku przed implementerem: wybiera 1–2 przykłady `plik:linia` z RAG poza kontekstem implementera. Walidacja mechaniczna
(ścieżka istnieje, mieści się w zakresie warstwy, sufit rozmiaru), bez sędziego-LLM. Kryterium wejścia: **offline recall** na archiwum
(czy kurator trafia w pliki/reguły, które weryfikator potem cytował) ≥ ustalony próg PRZED włączeniem.

### D. Pomiar na prawdziwych przebiegach
Po pierwszych przebiegach `/orchestrate` po ORC-162/163: mediana tur i koszt implementera/weryfikatora/bramki, odsetek `gap:` i NO-GO bramki.

## Czego świadomie nie robimy
- Redis: koszt jest w tokenach kontekstu, nie w miejscu przechowywania danych.
- Qdrant zamiast kart w prompcie: weryfikator sprawdza reguły po ID i potrzebuje pełnej listy; wcześniejsze ORC-044/046 pokazały, że retrieval
  w kontekście implementera dokłada tury.
- Panel Herdr jako kurator: skrypt Workflow nie ma powłoki, więc nie może nim sterować; krok `agent()` daje to samo z telemetrią i wznowieniem.

## Kryteria akceptacji

- [x] Powtórka historyczna: skrypt i wyniki w tym pliku.
- [x] A: weryfikator warstwy bez zawężenia (ORC-164), 0/80 utraconych na archiwum; test w `orchestrate-flow`. Porównane polityki: P1 tagi 12/80 utraconych (karty 49/40/15 tys.), P7 tagi + katalogi przekrojowe 4/80 (63/60/39 tys.), P0 komplet 0/80 (91 tys.); wybrany P0 dla weryfikatora (oszczędność zawężenia po stronie weryfikatora jest mała wobec kosztu spóźnionego wyłapania w bramce).
- [ ] B: widok kompaktowy + test pokrycia na archiwum.
- [ ] C: offline recall kuratora zmierzony; decyzja go/no-go zapisana.
- [ ] D: pomiar po prawdziwych przebiegach.
