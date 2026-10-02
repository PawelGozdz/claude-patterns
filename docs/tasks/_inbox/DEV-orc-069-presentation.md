---
id: DEV-orc-069-presentation
status: proposed
dismissed_reason: >
  Wzorzec do obserwacji, nie jeszcze gotowy do promocji: oba wystąpienia
  (2026-09-28, 2026-09-29) to nie brak budżetu/kompetencji weryfikatora na
  SPRAWDZENIE, tylko weryfikator NIE URUCHOMIŁ kodu w ogóle (nie skompilowane
  testy SemanticsFlag, 5 padających testów canvas_d wykrytych dopiero ręcznym
  `flutter test`). To inny rdzeń niż reszta rodziny ORC-069 (tam weryfikacja się
  nie mieściła w budżecie; tu weryfikacja nie została w ogóle wykonana) — ale
  bez wskazania KTÓREGO agenta/promptu to dotyczy (nazwa weryfikatora warstwy
  presentation w juz-ide-mobile-app), za mało do promocji. Do obserwacji: jeśli
  się powtórzy z jasną atrybucją agenta, osobne zgłoszenie o wymuszeniu
  faktycznego uruchomienia testów w prompcie tego weryfikatora.

  Reopen, 2026-09-29 (occurrences: 3) — trzecie wystąpienie, TYM RAZEM zamknięte
  ręcznie jako czyste (0 issues, 56 testów) — nie kolejny przypadek "weryfikator
  nie uruchomił kodu", tylko zwykłe GO+unverified_scope po 3 próbach (rodzina
  ORC-069/warstwa, nie final gate). Nie wzmacnia diagnozy poprzednich dwóch
  wystąpień — bez zmian, nadal do obserwacji.
resolution_note: >
  2026-10-02: wystąpienie 9 wskazało przyczynę źródłową całego wpisu — warstwy Flutter nie miały
  checks (silnik znał tylko npm run). Naprawione jako ORC-088: checks jako komendy dosłowne,
  clean-arch dostał flutter analyze/test. Wcześniejsza diagnoza „do obserwacji” nieaktualna.
trigger: halt
rule_ref: ORC-069
first_seen: 2026-09-28
last_seen: 2026-10-01
occurrences: 9
projects:
  - juz-ide-mobile-app
reopened_at: 2026-09-29
reopened_from_status: dismissed
---

# DEV-orc-069-presentation

## Occurrences

- 2026-10-01 juz-ide-mobile-app (DESIGN-SYSTEM-009) run `wf_124a640a-894` warstwa `presentation` — Bramka końcowa NO_GO wymuszona samym unverified_scope: projekt Flutter nie ma checks (analyze/test) w runtime.yml, bo checks to nazwy skryptów package.json; weryfikatorzy nie kompilują. Realny błąd (overflow arkusza w trybie Duży) wyszedł dopiero przy ręcznym flutter test.
- 2026-09-29 juz-ide-mobile-app (DESIGN-SYSTEM-009) run `wf_59bf80d6-dbb` warstwa `presentation` — GO z niezweryfikowanym zakresem po 3 probach (runda 7, stany D-Bledy/D-Komunikaty); domkniete recznie: analyze + test zielone
- 2026-09-29 juz-ide-mobile-app (DESIGN-SYSTEM-009) run `wf_521cc448-edc` warstwa `presentation` — ESCALATE po 3 próbach: GO z unverified_scope (ekrany 872/699 linii); po przebiegu 6 lintów i 1 padający test; naprawione ręcznie
- 2026-09-29 juz-ide-mobile-app (DESIGN-SYSTEM-009) run `wf_f1141169-462` warstwa `presentation` — ESCALATE po 3 próbach: GO z unverified_scope (15 plików); dodatkowo 3 błędy kompilacji i 2 padające testy po przebiegu; naprawione ręcznie
- 2026-09-29 juz-ide-mobile-app (DESIGN-SYSTEM-009) run `wf_d10cd405-ea7` warstwa `presentation` — ESCALATE_AND_HALT po 3 próbach: GO z unverified_scope (plik testów 610 linii); zamknięte ręcznie, analyze+test zielone
- 2026-09-29 juz-ide-mobile-app (DESIGN-SYSTEM-009) run `wf_c1fe3838-ef2` warstwa `presentation` — Bramka końcowa NO_GO z unverified_scope (budżet na grepy); 4. runda z rzędu, zamknięte ręcznie: analyze+test zielone po naprawie
- 2026-09-29 juz-ide-mobile-app (DESIGN-SYSTEM-009) run `wf_57473a02-448` warstwa `presentation` — Runda 2 (komponenty flow): GO z niepustym unverified_scope po 3 probach; zamkniete recznie po analyze+testach (0 issues, 56 testow).
- 2026-09-29 juz-ide-mobile-app (DESIGN-SYSTEM-009) run `wf_f95016a1-abc` warstwa `presentation` — Runda 4a: GO z niepustym unverified_scope po 3 probach; testy w test/ui nie kompilowaly sie (SemanticsFlag) - weryfikator nie uruchamia kodu. Zamkniete recznie.
- 2026-09-28 juz-ide-mobile-app (DESIGN-SYSTEM-009) run `wf_937637f5-ceb` warstwa `presentation` — GO z niepustym unverified_scope po 3 probach; weryfikator nie uruchomil testow (5 padajacych testow canvas_d wykrytych dopiero recznym flutter test). Zamkniete recznie.
