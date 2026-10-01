---
id: DEV-orc-070-infrastructure-shared-infra
status: promoted
resolution: >
  Naprawione 2026-09-27 jako ORC-071 (docs/decisions/orchestrate-rule-history.md#orc-071):
  decideVerdict() odfiltrowuje teraz też pozycje unverified_scope, których TREŚĆ samo-przyznaje
  "poza zakresem" ("poza zakresem", "out of scope", "inna/innej jednostki"), niezależnie od
  tego, czy dają się dopasować do dirs innej warstwy jak ścieżka (dokładnie ten przypadek —
  gołe nazwy plików w nawiasie wewnątrz zdania). Prompt dostał dodatkowo twardą regułę formatu
  (1 wpis = 1 ścieżka, bez prozy) jako drugą linię obrony.

  NIEROZWIĄZANE w tym zgłoszeniu (osobny mechanizm, nie ORC-071): layers_done nie zostało
  zapisane do analysis.md po pierwszym resume tego przebiegu, mimo że shared-infra i guards
  obie osiągnęły faktyczny GO — drugi resume przerabiał obie jednostki od zera. To dotyczy
  persystencji checkpointu przy wznowieniu (resumeFromRunId), nie decideVerdict(); wymaga
  osobnej inwestygacji, zanim powstanie kolejna reguła ORC. Zostawione jako otwarta obserwacja
  w docs/decisions/orchestrate-rule-history.md#orc-071.
trigger: halt
rule_ref: ORC-070
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-070-infrastructure-shared-infra

## Occurrences

- 2026-09-27 juz-ide-api-1 (TS-SEC-112) run `wf_7e99fcb4-a5d` warstwa `infrastructure:shared-infra` — Wariant w drugą stronę tego samego problemu, teraz na warstwie infrastructure:shared-infra: weryfikator (mimo nowego scopeReminder 'pomiń go całkowicie, nie wpisuj tutaj') wpisał do unverified_scope jeden string prozy 'guards unit files (reputation-threshold.guard.ts, residence-verification.guard.ts, geographic-access.guard.ts) — poza zakresem tej jednostki (shared-infra)' — gołe nazwy plików bez prefiksu katalogu. Filtr ownUnverified/layerTouches w decideVerdict wymaga strukturalnego dopasowania do dirs innej warstwy (pełne ścieżki), więc goła nazwa pliku nie dopasowuje się do niczego i pozycja liczy się jako realnie niezweryfikowana, mimo że weryfikator sam słownie stwierdza, że jest poza zakresem. Instrukcja promptu nie jest wiążąca dla LLM. Dodatkowy czynnik: layers_done nigdy nie zostało zapisane do analysis.md po pierwszym resume (mimo że shared-infra i guards obie osiągnęły faktyczny GO), więc drugi resume przerabiał obie jednostki od zera i trafił w nowy wariant błędu przez zmieniony tekst promptu (cache miss na verify). Kod produkcyjny (3 guardy + shared-infra) zweryfikowany dwukrotnie, niezmieniony, poprawny — brak realnego defektu.
