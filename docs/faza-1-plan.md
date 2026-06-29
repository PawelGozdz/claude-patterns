# Faza 1 — Plan refaktoru: claude-patterns → DDD-overlay na ECC

> Status: PLAN (do zatwierdzenia przed wykonaniem). Wejście: spike Faza 0 = GO (live).
> Powiązane: `docs/REFACTOR-ANALYSIS.md`, `docs/spike-faza-0-plan.md`, `/opt/projects/_spike/notes/`.

## Zasada bezpieczeństwa (najważniejsza)
Symlinki = natychmiastowa propagacja = **cięcie globalne łamie WSZYSTKIE projekty naraz**.
Dlatego sekwencja: **buduj nowe OBOK starego → udowodnij na JEDNYM projekcie → migruj projekty
pojedynczo → tnij generyki DOPIERO gdy żaden projekt ich nie używa.** Wszystko na branchu, nic
nie kasujemy destrukcyjnie (git history + `_retired/` jako bufor).

---

## 1A — Branch + baza ECC (additive, zero ryzyka)
- `git checkout -b refactor/ecc-overlay` + tag obecnego stanu (`pre-ecc-overlay`).
- `setup-global.sh`: dodać krok instalacji pluginu ECC (`/plugin marketplace add affaan-m/ECC` +
  `install ecc@ecc`) — udokumentowany jako prerequisite (instalacja pluginu jest interaktywna,
  więc raczej instrukcja + check „czy ecc obecny" niż pełna automatyzacja).
- Dodać do globalnego env/README: `ECC_GATEGUARD=off` dla projektów DDD (ustalenie ze spike'u).
- **Artefakt:** branch + zaktualizowany setup-global.sh + sekcja „ECC base" w README.

## 1B — Preset-materializer = setup-project.sh v2 (additive, rdzeń)
- Nowy katalog `presets/` z deklaratywnym YAML per stack (start: `presets/nestjs-ddd.yml` —
  szkielet już sprawdzony w spike: `requires_ecc`, `overlay{agents,patterns,rules,skills,hooks}`,
  `loop{engine,stages}`, `env{ECC_GATEGUARD,ECC_DISABLED_HOOKS,DELEGATION_MODE}`).
- Przepisać `setup-project.sh`: czyta `project.yml.stack_profile` → wczytuje `presets/<profile>.yml`
  → materializuje overlay (symlinki do `<repo>/.claude/agents|knowledge/patterns|rules` + generuje
  `<repo>/.claude/settings.json` z naszymi hookami i env). Zastępuje obecny `case $STACK_PROFILE`.
- Zachować wsteczną kompatybilność: stary tryb działa aż projekt przejdzie na v2.
- **Artefakt:** `presets/nestjs-ddd.yml` + setup-project.sh v2 + test na sandboxie/kopii.

## 1C — Napisać rules/nestjs-ddd/ (additive, wypełnia lukę ze spike S2d)
Luka: nie mamy DDD-specyficznych rules (ani my, ani ECC). Napisać zwięzłe rule-files:
aggregate, entity, value-object, repository, domain-service, result-pattern (Result<T>, brak throw),
acl-registry, cross-context-communication. To NIE duplikuje patterns/ (te są „jak", rules są „zawsze/nigdy").
- **Artefakt:** `rules/nestjs-ddd/*.md` + wpięcie w preset (overlay.rules).

## 1D — /orchestrate-ddd jako pętla (additive, HEADLINE)
- Nowa komenda/skill = specjalizacja: buduje runbook pętli ECC (`ecc:loop-operator` / natywny `/goal`),
  wstrzykując nasze stage'e: grounding (Rule Cards) → implement (gated check-delegation) →
  review (VETO verifiers) → STOP gdy `/security-review` PASS. Limity (max-runs/cost).
- Zostawić stary `/orchestrate` (jeden-przebieg) jako fallback do czasu walidacji.
- **Artefakt:** `commands/orchestrate-ddd.md` (+ ew. skill) + test pętli na sandboxie z TASK SP-001.

## 1E — Dowód na JEDNYM realnym projekcie (gate)
- Wybrać najmniejszy realny DDD (kopia/branch jednego z juz-ide-api-*). Uruchomić setup-project.sh v2.
- Pełny cykl: zaimplementować mały feature przez `/orchestrate-ddd` (loop), sprawdzić że VETO blokuje,
  grounding działa, gateguard wyłączony, ECC agenci dostępni. Zmierzyć koszt.
- **Gate:** jeśli OK → migracja reszty. Jeśli nie → poprawki w 1B-1D (nic jeszcze nie wycięte).
- **Artefakt:** raport walidacji + checklista migracji.

## 1F — Migracja projektów pojedynczo
- Po kolei: każdy projekt → setup-project.sh v2 → smoke-test. Jeden naraz, rollback per-projekt łatwy.
- **Artefakt:** lista zmigrowanych + ich status.

## 1G — Cięcie generyków (DOPIERO TERAZ, odwracalne)
Wg `/opt/projects/_spike/notes/02-overlap-matrix.md` — RETIRE tylko to, czego żaden zmigrowany
projekt już nie używa:
- agenci: advisory architekci (security-privacy, technical-architecture-lead, backend-tech-expert…)
- komendy: tdd, plan, code-review, verify, test-coverage, checkpoint, sessions, cost-report, evolve, instinct-*
- skille: 16 generic engineering (testing/quality/arch/backend/frontend/db/infra/optimization/meta/decision-frameworks)
- rules: common/* + per-language generic (zostaje tylko rules/nestjs-ddd/ + modular/DS/l10n)
- hooki: session/format/console/doc/push (ECC pokrywa)
- **KEEP (moat):** delegation+grounding triada, VETO verifiers, per-stack checks, PM, threat-model,
  finance/legal/marketing, integrations, 72 patterns + _summary.
- Metoda: `git mv` do `_retired/` (bufor), nie `rm`. Usunięcie z presetów = przestają się linkować.
- **Artefakt:** commit „retire generics" + zaktualizowany patterns/agents/skills README.

## 1H — Domknięcie
- Docs: zaktualizować CLAUDE.md, ARCHITECTURE.md, README (nowy model ECC-base + overlay).
- Pamięć: zaktualizować `refactor_ecc_base_direction` (z „GO warunkowy" na „wdrożone").
- Opcjonalnie: PR generyków (Rule Cards grounding + delegation enforcement) upstream do ECC (MIT).
- Sprzątnąć sandbox: `rm -rf /opt/projects/_spike`.

---

## Kolejność wykonania (rekomendowana)
1A → 1B → 1C → 1D (wszystko additive, nic nie psuje) → **1E gate** → 1F → **1G cięcie** → 1H.
Pierwsze 4 kroki można robić bez ryzyka dla istniejących projektów. Cięcie (1G) dopiero po dowodzie.

## Otwarte decyzje przed startem
1. Czy automatyzować instalację pluginu ECC w setup-global, czy zostawić jako udokumentowany krok ręczny?
2. `/orchestrate-ddd` — od razu pełny RFC-DAG, czy najpierw prosty continuous-loop (rekomendacja: prosty najpierw)?
3. Który projekt na dowód 1E (najmniejszy realny DDD)?
