---
id: TASK-ORCH-PATTERN-GAPS-001
title: 'Luki w kartach wzorców i precyzji sondy wykryte przez ORC-066 (marketing-hub TS-MH-010, ai-os-bot BOT-010)'
type: bugfix
status: todo
priority: P2
story_points: 5
created_date: 2026-09-26
updated_date: 2026-09-26
assignee: '@unassigned'
labels: [kaizen, orchestration, patterns, knowledge-base]
depends_on: []
related: []
source: >
  Zebrane 2026-09-26 z docs/tasks/_inbox/ (ORC-066) po jednym dużym przebiegu marketing-hub
  (TS-MH-010, wiele runów) i jednym z ai-os-bot (BOT-010). Każdy punkt to osobne, niepowiązane
  znalezisko — grupowane tu tylko żeby nie zakładać 5 osobnych plików dla drobnych, ale
  realnych luk w bibliotece wzorców/promptach, wykrytych tego samego dnia.
---

# TASK-ORCH-PATTERN-GAPS-001: luki w kartach wzorców i precyzji sondy

## 🎯 Goal

Pięć niepowiązanych, realnych znalezisk z jednego dnia pracy ORC-066 — żadne nie jest
błędem silnika `/orchestrate`, każde wymaga innej osoby/kontekstu do naprawy.

## 1. Brak karty wzorca: efekty uboczne komend z guarda + współbieżny zapis (VETO-1, ORC-056)

marketing-hub (TS-MH-010, run `wf_83d565e9-cc8`): `final_gate` (security-e2e-verifier)
wykrył KRYTYCZNY problem dopiero po przejściu przez 15 warstw z GO: JIT z guarda
dispatchuje komendę na KAŻDE żądanie → wpis audytu + wyścig `SELECT...FOR UPDATE` na głowie
łańcucha → 500 przy żądaniach równoległych. Żadna karta wzorca nie pokrywa tej klasy
problemu (efekty uboczne komend wywoływanych z guarda + współbieżne dopisywanie do
wspólnego łańcucha/agregatu).

**Poprawka:** rozważyć nową kartę wzorca (np. rozszerzenie `command-handler-pattern` albo
nowa `guard-side-effects-pattern`) po drugim niezależnym wystąpieniu (zgodnie z konwencją
tego repo — `docs/CONTRIBUTING.md`: "Scope: project-specific dopóki drugi projekt nie
przyjmie tego samego kształtu"). Na razie jedno wystąpienie — nie promować przedwcześnie.

## 2. Karta logger-pattern (LOG1-LOG3) zbyt ogólna

marketing-hub (TS-MH-010, warstwa `infrastructure:cli`): karta `LOGGER_SERVICE`/
`ILoggerService` nie pasuje do projektów z `nestjs-pino Logger` wprost (bez własnej
abstrakcji). Karta do zawężenia/dodania wariantu.

## 3. Karty DDD-scoped wstrzykiwane do projektów bez DDD (ai-os-bot)

ai-os-bot (BOT-010, run `wf_006352da-a49`): karty `conventions-pattern` (CV1-5),
`security-invariants` (SI1-5 kontroler/guard), `safe-error-propagation`,
`repository-pattern-plain`, `controller-schema-pattern-plain`, `zod-schema-validation`
wstrzyknięte jako `always`/`trigger` do promptu mimo że ai-os-bot to plain Node bot bez
kontrolerów/repozytoriów Kysely/schematów Zod w zmienionym zakresie. Obaj agenci (implementer
i verifier) zgłosili to jako niemożliwe do systematycznej oceny.

**Poprawka:** sprawdzić `overlay.patterns`/triggery w bloku `bot-verifiers.yml` (albo
`flat-service`, z którego dziedziczy) — prawdopodobnie zbyt szerokie dopasowanie triggerów
keyword-owych z `blocks/*.yml` trafiające projekt spoza DDD.

## 4. Karta refine-providers PRV2 nieaktualna

marketing-hub (TS-MH-010, warstwa `web`): PRV2 (`check()` bez `redirectTo` na 401) nie
opisuje aktualnego zachowania (nawigacja z `Authenticated` fallback, decyzja D7). Karta w
`agents/stacks/refine-spa/` (czy patterns/) do aktualizacji.

## 5. Sonda (Haiku) w tailu streszcza zamiast cytować ścieżki dosłownie (ORC-026)

marketing-hub (TS-MH-010, run `wf_c1bc4f18-d4f`, warstwa `infrastructure:auth-switch`):
sonda przypisała błąd import/order do `business-rule.decorator.ts` zamiast realnego
`permissions.guard.spec.ts` — fix-runda nie mogła trafić w błąd, 3 próby zjedzone, ESCALATE.

**Poprawka:** `buildProbePrompt`/instrukcja tail w `orchestrate.template.mjs` powinna
wymuszać cytowanie ścieżek z outputu narzędzia dosłownie, nie streszczanie przez Haiku.

## ✅ Kryterium ukończenia

- [ ] Punkt 1: decyzja o nowej karcie (albo świadome odłożenie do 2. wystąpienia) zapisana
- [ ] Punkty 2-4: karty wzorców zaktualizowane, `./scripts/reseed-patterns.sh` odpalony
- [ ] Punkt 5: `buildProbePrompt` wymusza dosłowne cytowanie ścieżek, eval zaktualizowany
- [ ] `docs/tasks/_inbox/DEV-agent_note-karta-logger-pattern...`,
      `DEV-agent_note-karty-wzorcow-ddd...`, `DEV-agent_note-refine-providers-prv2...`,
      `DEV-orc-026.md` przeniesione do `## Wynik` i usunięte z `_inbox/`
