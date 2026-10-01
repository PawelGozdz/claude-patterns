---
id: DEV-orc-069-implementation-sdk-dart-core
status: dismissed
dismissed_reason: >
  Zbadane 2026-09-26 razem z ORC-070 (docs/decisions/orchestrate-rule-history.md#orc-070) — NIE
  ten sam przypadek co DEV-orc-069-domain-domain.md. Wszystkie 3 niezweryfikowane pliki
  (model/detail_result.dart, model/flag_value.dart, model/snapshot.dart) i
  packages/sdk-dart/test/** leżą WE WŁASNYM zakresie tej warstwy (packages/sdk-dart/lib), nie w
  dirs innej jednostki — filtr ORC-070 celowo ich nie odfiltrowuje. To poprawna eskalacja: 2
  realne NO_GO wcześniej (brak eksportów, zero testów), 3. próba szczerze przyznaje niepełną
  weryfikację. Decyzja projektowa dla feature-flags (dokończyć weryfikację / zaakceptować
  ryzyko / podzielić warstwę), nie błąd silnika claude-patterns.

  DODATEK 2026-09-27 (occurrence #2, po podniesieniu budżetu weryfikatora 15→30): inny,
  odrębny problem pod tą samą sygnaturą (rule_ref+layer) — sprzeczność między zatwierdzonymi
  decyzjami D1 (flutter/ jako jedyny katalog importujący package:flutter) i D6 (AssetFetcher w
  fetcher/ musi przyjmować AssetBundle z package:flutter/services.dart). Implementer
  udokumentował adjudykację na D6 wprost w kodzie; weryfikator uczciwie oznaczył to jako
  nierozstrzygalne wobec kart tej warstwy (żadna nie ustanawia reguły granic importu
  wewnątrz jednego pakietu Dart), nie jako naruszenie. Też poprawna eskalacja, też decyzja
  projektowa (feature-flags musi zaadiudykować D1 vs D6, np. zawężając D1 do "poza fetcher/
  gdy uzasadnione typem z frameworka" albo dodając kartę granic importu Dart) — nie błąd
  silnika claude-patterns.
trigger: halt
rule_ref: ORC-069
first_seen: 2026-09-26
last_seen: 2026-09-27
occurrences: 2
projects:
  - feature-flags
reopened_at: 2026-09-27
reopened_from_status: dismissed
---

# DEV-orc-069-implementation-sdk-dart-core

## Occurrences

- 2026-09-27 feature-flags (0010) run `wf_2a6df522-a59` warstwa `implementation:sdk-dart-core` — Po podniesieniu budżetu weryfikatora (15->30 max_tool_calls) recenzent przejrzał wszystkie 18/18 plików (poprzedni halt dotyczył tylko pokrycia), ale attempt 3 znów skończył się GO z niepustym unverified_scope: import 'package:flutter/services.dart' w fetcher/asset_fetcher.dart. Przyczyna: wewnętrzna sprzeczność między dwiema klauzulami TEJ SAMEJ zatwierdzonej decyzji D1 (flutter/ jako JEDYNY katalog importujący package:flutter) i D6 (AssetFetcher w fetcher/ musi przyjmować AssetBundle, typ z package:flutter/services.dart). Implementer udokumentował adjudykację na korzyść D6 wprost w kodzie (docstring, 3 akapity), ale żadna z 7 kart tej warstwy nie ustanawia reguły granic importu w obrębie jednego pakietu Dart, więc weryfikator uczciwie oznaczył to jako niemożliwe do rozstrzygnięcia PASS/FAIL, nie jako naruszenie. Wyczerpane 3 próby -> ESCALATE_AND_HALT. To nie jest już problem budżetu tur, tylko luka w analizie (D1 vs D6) wymagająca decyzji człowieka.
- 2026-09-26 feature-flags (0010) run `wf_2a6df522-a59` warstwa `implementation:sdk-dart-core` — Warstwa implementation:sdk-dart-core (packages/sdk-dart/lib): 2 próby NO_GO (brak eksportu Snapshot/FlagDetail w barrelu mimo publicznego pola FetchSnapshot.snapshot; zero testów jednostkowych rdzenia; ConsoleLogger eksportowany jako konkretna klasa zamiast fabryki). 3. próba dostała GO od ecc:flutter-reviewer, ale werdykt sam przyznaje niezweryfikowany zakres: sprawdzono 15/18 zmienionych plików, pominięto model/detail_result.dart, model/flag_value.dart, model/snapshot.dart oraz nie zweryfikowano niezależnie packages/sdk-dart/test/**. Po wyczerpaniu 3 prób przebieg poprawnie eskalował zamiast fałszywie zaliczyć GO.
