---
id: DEV-anz-pattern-mismatch-web
status: promoted
resolution: >
  ORC-122 (2026-10-22): orchestrate-prepare pomija karty z always/triggerów, których tagi leżą wyłącznie w
  przestrzeniach (api/web) spoza uruchamianych warstw; karta bez tagów, z any:* albo wskazana w patterns[]
  analizy zostaje, odpadnięcie daje ostrzeżenie. Task czysto web nie dostaje już kart api:* z półki nestjs.
trigger: analyze_note
category: other
sources:
  - analyze
rule_ref: ANZ-PATTERN-MISMATCH
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - marketing-hub
---

# DEV-anz-pattern-mismatch-web

## Occurrences

- 2026-10-22 marketing-hub (TS-MH-026) warstwa `web` — Dla taska czysto web dobór wzorców trafił 7 wzorców API (repository, controller-schema, zod-schema-validation, named-policy, domain-errors, conventions, logger) po słowach schema/endpoint/uprawnien i przez patterns.always; wszystkie w patterns_exclude. Blok refine-spa nie ma własnej półki always, więc web-task dziedziczy półkę NestJS
