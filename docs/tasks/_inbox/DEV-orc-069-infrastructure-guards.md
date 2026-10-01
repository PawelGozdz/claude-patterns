---
id: DEV-orc-069-infrastructure-guards
status: promoted
resolution: >
  Naprawione 2026-09-27 jako ORC-070 (docs/decisions/orchestrate-rule-history.md#orc-070),
  dodatek z tego samego dnia: dwa z trzech elementów (calibration-signal-shutdown.service.ts,
  system-log-retention-sweeper.scheduler.ts) to ścieżki przypisane do innych jednostek tego
  przebiegu (shutdown, logging) — filtr `ownUnverified` w decideVerdict() je teraz odfiltrowuje.
  Trzeci ("pełny review specs", jednostka test-implementer) to wolny tekst bez separatora
  ścieżki, więc filtr mechaniczny sam by go nie złapał — dlatego buildVerifierPrompt() dostał
  wprost przypomnienie (odwołujące się do ORC-011), że unverified_scope to WYŁĄCZNIE własny,
  niesprawdzony zakres warstwy, a nie robota innej jednostki tego przebiegu. Obie zmiany razem
  pokrywają wszystkie 3 elementy tego zgłoszenia. Eval: verdict-unverified-scope-filters-
  other-layers-own-scope + rozszerzony verifier-prompt-carries-probe-facts-and-forbids-rerun.
trigger: halt
rule_ref: ORC-069
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-069-infrastructure-guards

## Occurrences

- 2026-09-27 juz-ide-api-1 (TS-SEC-112) run `wf_7e99fcb4-a5d` warstwa `infrastructure:guards` — Warstwa infrastructure:guards (TS-SEC-112): weryfikator zwracał GO z niepustym unverified_scope w 3 identycznych rundach (bez żadnej zmiany kodu między rundami — changed_files:[] w rundach 2 i 3), bo unverified_scope wskazywał na pliki spoza dirs tej jednostki (calibration-signal-shutdown.service.ts→shutdown, system-log-retention-sweeper.scheduler.ts→logging, pełny review specs→test-implementer) — dokładnie przypadek, który ORC-011 nazywa 'poza zakresem, nie brakujący'. Mechanizm decideVerdict (ORC-069) nie odróżnia unverified_scope z powodu prawdziwej dziury od unverified_scope z powodu plików legalnie poza dirs jednostki, więc zjadał próby bez związku z jakością kodu i eskalował mimo zerowego realnego defektu (potwierdzone: 3 guardy poprawnie wołają CalibrationSignalRegistrarService.recordSignal(), hashowanie HMAC scentralizowane w rejestratorze zgodnie z D4 — zweryfikowane osobiście grepem na plikach, nie tylko z raportu agenta).
