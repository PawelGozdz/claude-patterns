---
id: DEV-orc-062-domain-rules
status: dismissed
dismissed_reason: >
  Nie błąd silnika claude-patterns — config projektu (checklist z
  docs/tasks/_inbox/README.md §2.1). marketing-hub/package.json root:
  "lint:check": "pnpm -r run lint:check" (rekurencyjne, całe monorepo). Blok
  .claude/blocks/layers-monorepo.yml deklarował dla warstwy `domain` gołe checks:
  ["typecheck","lint:check"] zamiast zawężonych do pakietu — dokładnie przypadek
  opisany w już istniejącej regule ORC-016 ("w monorepo zawężaj checks do
  dotkniętego pakietu"; reguła udokumentowana, nie zastosowana w tym bloku).
  NAPRAWIONE 2026-09-26 w marketing-hub: dodano `typecheck:api`/`lint:check:api`/
  `test:api`/`typecheck:web`/`lint:check:web`/`test:web`/`build:web` w root
  package.json (wzorem istniejących `test:l2`/`test:l3`), zawężone `checks:` we
  wszystkich warstwach `layers-monorepo.yml` poza `final_gate` (świadomie
  szeroki, ORC-022), runtime.yml zmaterializowany ponownie.
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-062-domain-rules

## Occurrences

- 2026-09-26 marketing-hub (TS-MH-010) run `wf_9a3a2b19-de0` warstwa `domain:rules` — domain:rules: implementer ocenił 2 błędy import/order we własnych nowych plikach (untracked) jako 'poza zakresem', bo sonda wypisuje też 56 ostrzeżeń z shared/**; weryfikacja no-op → BLOCKED_BY_PRIOR. Sonda powinna odróżniać errors od warnings i wskazywać pliki z zakresu warstwy.

## Nota retro (2026-09-26)

Ten plik wydzielony ręcznie z `DEV-orc-062.md`, który przed naprawą sygnatury w
`report-deviation.mjs` zlewał różne przyczyny pod jednym `rule_ref` — patrz
`DEV-orc-062-testing-l1-l2.md` dla drugiego, niepowiązanego problemu, który
przypadkiem trafił do tego samego pliku pod już zamkniętym statusem `dismissed`.
