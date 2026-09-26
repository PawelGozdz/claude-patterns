---
id: DEV-orc-062
status: dismissed
dismissed_reason: >
  Nie błąd silnika claude-patterns — config projektu (checklist z
  docs/tasks/_inbox/README.md §2.1). marketing-hub/package.json root:
  "lint:check": "pnpm -r run lint:check" (rekurencyjne, całe monorepo). Blok
  .claude/blocks/layers-monorepo.yml deklaruje dla warstwy `domain` gołe checks:
  ["typecheck","lint:check"] zamiast zawężonych do pakietu — dokładnie przypadek
  opisany w już istniejącej regule ORC-016 ("w monorepo zawężaj checks do
  dotkniętego pakietu"; reguła udokumentowana, nie zastosowana w tym bloku).
  Poprawka needed w marketing-hub: checks: ["pnpm --filter @marketing-hub/api
  run typecheck", "pnpm --filter @marketing-hub/api run lint:check"]. NAPRAWIONE
  2026-09-26 w marketing-hub: dodano `typecheck:api`/`lint:check:api`/
  `test:api`/`typecheck:web`/`lint:check:web`/`test:web`/`build:web` w root
  package.json (wzorem istniejących `test:l2`/`test:l3`), zawężone `checks:` we
  wszystkich warstwach `layers-monorepo.yml` poza `final_gate` (świadomie
  szeroki, ORC-022), runtime.yml zmaterializowany ponownie.
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 2
projects:
  - marketing-hub
---

# DEV-orc-062

## Occurrences

- 2026-09-26 marketing-hub (TS-MH-010) run `wf_bc5bf913-10b` warstwa `testing:l1-l2` — Globalny guard PII (audience VETO3, information_schema całego schematu) czerwony po nowej kolumnie user_directory.email z innego kontekstu; plik testu poza layers_scope — implementer poprawnie zatrzymał się, potrzebna decyzja.
- 2026-09-26 marketing-hub (TS-MH-010) run `wf_9a3a2b19-de0` warstwa `domain:rules` — domain:rules: implementer ocenił 2 błędy import/order we własnych nowych plikach (untracked) jako 'poza zakresem', bo sonda wypisuje też 56 ostrzeżeń z shared/**; weryfikacja no-op → BLOCKED_BY_PRIOR. Sonda powinna odróżniać errors od warnings i wskazywać pliki z zakresu warstwy.
