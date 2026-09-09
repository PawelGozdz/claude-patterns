---
id: TASK-VYTCHES-BLOCKS-001
title: Setup vytches-ddd na kompozycji bloków (ADR 0008) — runtime.yml + triage agentów
status: in-progress
priority: high
created: 2026-08-10
created_date: 2026-08-10
updated_date: 2026-09-07
owner: unassigned
repos: [vytches-ddd, claude-patterns]
---

# Setup `vytches-ddd` według nowych standardów (bloki + runtime.yml)

Zadanie przygotowane 2026-08-10 w sesji, która zrobiła to samo dla
`juz-ide-mobile-app`. Rozpisane tak, żeby dało się je wykonać **bez odtwarzania
researchu** — wszystkie ustalenia poniżej są zweryfikowane w kodzie, nie zgadywane.

> **▶ Stan na 2026-09-07 (przegląd w ramach K75 / `TASK-KAIZEN-002`).** Większość jest
> zrobiona — task zostaje otwarty **wyłącznie dla F2 (triage 12 agentów lokalnych)**.
>
> | kryterium ukończenia | stan | dowód |
> |---|---|---|
> | `runtime.yml` istnieje, zmaterializowany bez ostrzeżeń | ✅ | `/opt/projects/vytches-ddd/.claude/config/runtime.yml`, `materialized_at: 2026-09-07`, `stack_blocks: [ts-library, library-layers, nx-monorepo, approval-gate]` |
> | agenci z `runtime.yml` osiągalni w `.claude/agents/` | ✅ | `library-api-guardian`, `library-quality-verifier` na miejscu; reszta to `ecc:*` i `general-purpose` |
> | hooki z `runtime.yml` wpięte w `settings.json` | ✅ | `check-approval-before-impl`, `check-human-voice` obecne w `.claude/settings.json` |
> | **triage 12 agentów; zero duplikatów lokalny↔współdzielony** | ❌ | nadal 12 plików w `.claude/agents/`, w tym `library-api-guardian.md` i `library-quality-verifier.md` — czyli dokładnie te dwa duplikaty, które F2 miała usunąć |
> | 5 wzorców z konwencją ✅/❌ + karty `_summary.md` | ✅ | `patterns/typescript-library/` — 5 wzorców, 5 kart |
> | reseed wykonany | ? | niezweryfikowane w tym przeglądzie (wymaga żywego Qdranta) — sprawdź `./scripts/reseed-patterns.sh` + `retrieve_patterns` przed zamknięciem |
>
> Bloki z F1 powstały w kształcie innym niż proponowany: zamiast dwóch bloków są cztery
> (`ts-library`, `library-layers`, `nx-monorepo`, `approval-gate`) — warstwy zostały
> wydzielone z `ts-library` do osobnego bloku osi „architecture", bo materializer wymaga,
> żeby `orchestrate.layers` wnosił blok tej osi (`materialize-runtime.mjs:424`).

## Cel

Przenieść `vytches-ddd` ze stanu „tylko `project.yml`" na kompozycję bloków
(ADR 0008): `stack_blocks` → zmaterializowany `.claude/config/runtime.yml`,
z którego czytają `/analyze` i `/orchestrate-blocks`. Wzorem `juz-ide-api-4`
(DDD), `iam` (płaski serwis) i `juz-ide-mobile-app` (Flutter).

## Zasady projektowe (ustalone 2026-08-10 — czytaj PRZED F1)

Ten setup ma inny charakter niż flutterowy i mobile-app'owy. Tam brakowało kontroli
i trzeba było je dobudować. **Tutaj kontrole już istnieją i są deterministyczne** —
projekt ma 60+ skryptów npm, w tym `validate:api` (api-extractor), `validate:exports`,
`validate:bundles`, `validate:types`, `architecture:check`, `deps:circular`, `ddd:lint`,
`example-matrix:check`, `docs-compile-gate:check`, `llm:verify`, `test:package`,
`test:smoke`, `test:consumer`, `quality:baseline`.

**Zasada 1 — nie dubluj skryptu agentem.** Bramki bloków mają WOŁAĆ istniejące skrypty,
a nie stawiać obok nich agenta LLM, który „na oko" sprawdza to samo. Agent LLM jest
droższy, wolniejszy i mniej wiarygodny niż api-extractor przy pytaniu „czy to breaking
change". Jeśli podczas budowy bloku masz ochotę napisać agenta sprawdzającego coś, co
sprawdza już skrypt — zamiast tego wepnij skrypt.

**Zasada 2 — agent tam, gdzie skrypt nie sięga.** Zostają trzy pytania, na które żaden
lint nie odpowie: czy zmiana publicznego API jest *uzasadniona* (a nie tylko formalnie
wykryta), czy przykład uczy właściwego użycia, czy granica pakietu ma sens dziedzinowy.
Tam i tylko tam ma pracować agent.

**Zasada 3 — dokumentacja tej biblioteki to infrastruktura RAG dla czterech repo.**
Kolekcja `library_reference_global` (983 pkt) karmi się przykładami TS i `LLMGUIDE.md`
Z TEGO repozytorium i jest tagowana `lib_version`. Przykład, który rozjedzie się z kodem,
staje się „prawdą" dla agentów w `juz-ide-api-1/2/3/4`. To najwyższa stawka w tym
projekcie i jednocześnie coś, czego lokalny lint nie złapie — patrz F6.

## Plan działania (kolejność wykonania)

**Faza A — audyt (delegowany, 3 agenci równolegle).** Bez tego budujesz na ślepo;
przy Flutterze dopiero audyt wykrył martwą warstwę RASP i hook l10n zadeklarowany
w configu, ale nieistniejący.
- A1: co realnie zawiera 5 wzorców `patterns/typescript-library/` i 2 współdzielonych
  agentów — jakość, zgodność z konwencją ✅/❌, luki
- A2: co robi 12 lokalnych agentów tego repo — które się dublują ze współdzielonymi,
  które są realną wiedzą, które pustą deklaracją (patrz triage w F2)
- A3: które z 60+ skryptów npm są realnymi bramkami, co dokładnie sprawdzają i jakim
  kodem wyjścia sygnalizują porażkę — to wejście do F1

**Faza B — budowa w `claude-patterns`** (na podstawie audytu): dwa bloki, awans agentów,
uzupełnienie brakujących wzorców i kart `_summary.md`, ewentualny hook, reseed.

**Faza C — wpięcie w tym repo:** `project.yml`, materializacja `runtime.yml`,
`settings.json`, symlinki agentów. Krótkie i mechaniczne.

## Stan zastany (zweryfikowany 2026-08-10)

**Czym jest ten projekt** — `@vytches/ddd-workspace` v0.26.0, **prywatny monorepo Nx**,
19 pakietów, 695 plików testowych. Kluczowe rozróżnienie: pozostałe repo **używają**
DDD, ten je **dostarcza**. Bloki `ddd/*` (agregaty, CQRS, ACL) tu NIE pasują — mówią
„jak stosować wzorzec", a tutaj problemem jest stabilność publicznego API, granice
pakietów i to, że zmiana sygnatury psuje cztery repo konsumenckie naraz.

**19 pakietów**: `acl`, `aggregates`, `contracts`, `cqrs`, `di`, `domain-primitives`,
`domain-services`, `enterprise`, `events`, `messaging`, `nestjs`, `policies`,
`projections`, `repositories`, `resilience`, `testing`, `utils`, `validation`,
`value-objects`.

**Konfiguracja Claude Code** (stan 2026-08-10; ~~przekreślone~~ = nieaktualne po wykonaniu F4):
- `.claude/config/project.yml` — ~~`stack_profile: typescript-library`~~ → dziś
  `stack_blocks: [ts-library, library-layers, nx-monorepo, approval-gate]`, `pm_system: true`
- ~~**BRAK** `runtime.yml`~~ → `runtime.yml` zmaterializowany. Symlink `preset.yml` nigdy nie
  powstał i już nie powstanie — presety usunięto w całym repo 2026-08-12
  ([ADR 0008](../adr/0008-stack-blocks-composition.md)), więc migracji nie ma z czego robić
- 12 agentów LOKALNYCH w `.claude/agents/` (lista i triage niżej)
- skille: `api-design`, `coding-standards`, `e2e-testing`, `tdd-workflow`,
  `ts-library-patterns`, `verification-loop`, `skill-stocktake`, `grantflow`, `log-time`
- `project-orchestration/` istnieje (KANBAN, TEAM-STATE, TECH-DEBT, analysis/, completed-tasks/)

**Oprzyrządowanie wydawnicze obecne w `package.json`** (ważne — bramki mają się o nie oprzeć,
a nie wymyślać własne): `@microsoft/api-extractor` (raport publicznego API), `@changesets/cli`,
`semantic-release`, oraz skrypty `validate:api`, `validate:exports`, `validate:bundles`,
`validate:types`, `architecture:check`, `deps:circular`, `ddd:lint`, `test:contracts`,
`test:consumer`, `test:package`, `test:smoke`, `quality:baseline`, `bench`, `llm:verify`.

**Co JUŻ istnieje w `claude-patterns` — nie budować od nowa**:
- `patterns/typescript-library/` — 5 wzorców: `public-api-pattern.md`,
  `backward-compatibility-pattern.md`, `package-boundary-pattern.md`,
  `build-publish-pattern.md`, `library-testing-pattern.md`
- `agents/stacks/typescript-library/` — `library-api-guardian.md`, `library-quality-verifier.md`
  (2 z 12 lokalnych agentów zostały już wcześniej awansowane do współdzielonych)
- ~~`patterns/_stack-defaults/typescript-library.yml`~~ — katalog `_stack-defaults/`
  usunięty 2026-08-12 (ADR 0008); dobór wzorców robi dziś `patterns:` w blokach
  (`blocks/ts-library.yml`, `blocks/nx-monorepo.yml`)
- `blocks/approval-gate.yml` — gotowa twarda bramka PAUSE dla projektów bez `ddd/core`

## Zakres

### F1. Nowe bloki w `claude-patterns/blocks/`

Schemat i konwencje: `claude-patterns/blocks/README.md`. Uwaga na ograniczenia
silnika (`scripts/materialize-runtime.mjs`, stan 2026-09-07): `orchestrate.layers` może
pochodzić z **dokładnie jednego** bloku (`:418`) i ten blok musi mieć `axis: architecture`
(`:424`) — dlatego warstwy biblioteki mieszkają w osobnym `blocks/library-layers.yml`, nie
w `ts-library.yml`; `requires_ecc` i `ralphinho` biorą pierwsze wystąpienie;
`overlay`/`env`/`hooks` sumują się; panel **nie deduplikuje** — ten sam etap w dwóch
blokach pojawi się dwukrotnie, **z jednym wyjątkiem**: pozycja z bloku lokalnego
(`.claude/blocks/`) o tym samym `stage` zastępuje bazową (`:261`). Listy inline
(`hooks: [...]`) muszą być w JEDNEJ linii.

- **`ts-library.yml`** (oś frameworka) — publikowana biblioteka TS.
  `patterns.always`: konwencje + `public-api-pattern.md`. Triggery: semver/breaking →
  `backward-compatibility-pattern.md`, build/eksport → `build-publish-pattern.md`,
  test → `library-testing-pattern.md`. `analyze.panel`: architekt + `backend-technology-expert`.
  **To ten blok wnosi `orchestrate.layers`** — proponowane warstwy:
  `implementation` (packages/*/src) → `testing` → `api-report` (wygenerowanie i przejrzenie
  raportu api-extractor). `final_gate`: `library-api-guardian` (nieumyślny breaking change
  jest tu najgroźniejszą klasą błędu).
- **`nx-monorepo.yml`** (oś architektury) — granice pakietów i graf zależności.
  `patterns.always`: `package-boundary-pattern.md`. Panel: etap sprawdzający cykle
  i przecieki między pakietami (oprzeć na `deps:circular` + `architecture:check`).
- **`approval-gate`** — użyć istniejącego, nie pisać nowego.

Proponowany skład: `stack_blocks: [ts-library, nx-monorepo, approval-gate]`.
Rozważyć alias `typescript-library: [ts-library, nx-monorepo]` w `blocks/_aliases.yml`.

### F2. Triage 12 agentów lokalnych

Kryterium awansu do `claude-patterns/agents/stacks/typescript-library/`: agent jest
użyteczny dla **dowolnej** publikowanej biblioteki TS, nie tylko dla tej. Kryterium
pozostania lokalnym: agent zna domenę *tej* biblioteki (wzorce DDD jako produkt).

| agent lokalny | proponowana decyzja | uzasadnienie |
|---|---|---|
| `library-api-guardian` | już awansowany — usunąć lokalny, zostawić symlink | duplikat współdzielonego |
| `library-quality-verifier` | już awansowany — jw. | duplikat współdzielonego |
| `architecture-guardian` | awans | granice pakietów/cykle — uniwersalne dla monorepo |
| `testing-excellence` | awans | piramida testów biblioteki, testy kontraktowe |
| `documentation-master` | awans | dokumentacja publicznego API |
| `developer-experience` | awans | DX konsumenta biblioteki |
| `performance-optimizer` | awans | benchmarki, rozmiar bundla |
| `security-audit` | awans | audyt zależności, powierzchnia publiczna |
| `ddd-compliance-guardian` | **lokalny** | zna kanon DDD *tej* biblioteki |
| `ddd-patterns-expert` | **lokalny** | jw. |
| `library-expert` | **lokalny** | zna wnętrze tego konkretnego API |
| `tech-lead` | sprawdzić duplikat | `claude-patterns/agents/universal/tech-lead.md` już istnieje |

**Zanim awansujesz** — sprawdź frontmatter każdego agenta: musi zaczynać się od `---`
w PIERWSZEJ linii. Komentarz przed frontmatterem sprawia, że agent jest niewidoczny
(znana pułapka, patrz pamięć `agent-frontmatter-first-line-trap`). Marker
`<!-- LOCAL -->` zawsze POD frontmatterem.

Po awansie: usunąć plik lokalny, założyć symlink do `claude-patterns`, dopisać do
`.gitignore` (ten projekt nie śledzi symlinkowanych agentów — sprawdź konwencję).

### F3. Audyt konwencji w 5 istniejących wzorcach

`claude-patterns/CLAUDE.md` wymaga: `**Layer**:`, `**Status**:` oraz sekcji
`## When to Use` z blokami `**Use this pattern for:**` (✅) i `**Do NOT use for:**` (❌).
Wzorce flutterowe tego nie miały i wymagały retrofitu — **sprawdź, czy te 5 ma**.
Test (uwaga: `\s` nie działa w grep BRE):

```bash
cd /opt/projects/claude-patterns/patterns/typescript-library
for f in *-pattern.md; do
  printf '%-42s L=%s S=%s ✅=%s ❌=%s\n' "$f" \
    "$(grep -cm1 '^\*\*Layer\*\*:' $f)" "$(grep -cm1 '^\*\*Status\*\*:' $f)" \
    "$(grep -c '✅' $f)" "$(grep -c '❌' $f)"
done
```

Brakujące karty reguł `*_summary.md` — dorobić (wzór: `patterns/infrastructure/repository-pattern_summary.md`).

### F4. Materializacja i wpięcie

1. `project.yml` → dopisać `stack_blocks: [...]` (zostawić `stack_profile` — nie usuwać)
2. `node /opt/projects/claude-patterns/scripts/materialize-runtime.mjs /opt/projects/vytches-ddd`
3. Sprawdzić `runtime.yml`: brak ostrzeżeń o wiszących ścieżkach wzorców, panel w sensownej
   kolejności, `hooks:` obecne, każdy agent z panelu **istnieje** w `.claude/agents/`
4. Wpiąć hooki do `.claude/settings.json` (materializacja ich NIE wpina — to znana luka
   `setup-project.sh`, ta sama co w `iam` i mobile-app)
5. `./scripts/reseed-patterns.sh` w `claude-patterns` — bez tego nowe/zmienione wzorce są
   niewidoczne dla `retrieve_patterns`

### F5. Rozważyć (nie przesądzone)

- **Hook wykrywający dryf publicznego API** — czy zmiana w `packages/*/src/index.ts`
  ma odpowiadający wpis w changeset/raporcie api-extractor. Uwaga: jeśli piszesz hook
  z globami, `matchesPattern` w `hooks/lib/ddd-config.js` ma błąd — `**` obejmuje najwyżej
  jeden segment ścieżki (podstawienie `*`→`[^/]*` psuje wcześniej wstawione `(.*/)?`).
  Użyj prostego `pathContains` zamiast globa albo napraw funkcję świadomie.
- **Wzorzec „testuj opublikowany artefakt, nie źródło"** — projekt ma `test:package`,
  `test:smoke`, `test:consumer`; w `patterns/` nie ma nic o tej klasie testów.
- Czy `nestjs` wśród 19 pakietów wymaga osobnego traktowania (adapter frameworka
  w bibliotece frameworkowo-neutralnej).
### F6. Indeksowanie w bazie wektorowej (zweryfikowane 2026-08-10)

Stan faktyczny — Qdrant na `:6401`, trzy rodzaje kolekcji:

| kolekcja | źródło | charakter | rozmiar |
|---|---|---|---|
| `patterns_global` | `patterns/**/*.md` + `rules/**/*.md` | preskryptywny (karty reguł, anty-wzorce) | 1 080 pkt |
| `library_reference_global` | **runnable przykłady TS z `@vytches/ddd`** + wyselekcjonowany `LLMGUIDE.md`, tagowane `lib_version` | referencja biblioteki dla konsumenta | 983 pkt |
| `code_<projekt>` | realny kod źródłowy | deskryptywny („jak jest u nas") | np. `code_juz_ide_api` 34 248 pkt |

Dwie pierwsze seeduje `scripts/reseed-patterns.sh` (`seed:global --all`). Trzecią —
`npm run index:code` w `mcp-server/knowledge-retriever`, nazwa kolekcji podawana
**jawnie** (z `.claude/config/knowledge.json` projektu), nigdy zgadywana z nazwy
katalogu — `code_juz_ide_api` celowo obsługuje api-1…4 jako grupę bliźniaczą.

**Co to znaczy tutaj:**
1. Wzorce — dzieją się automatycznie przez reseed, nic dodatkowego.
2. `library_reference_global` **już dotyczy tej biblioteki** — trzyma jej przykłady
   i przewodnik API dla projektów konsumenckich. Jest tagowany `lib_version`, więc
   **każde wydanie powinno pociągać reseed**; dziś nic tego nie wymusza. Rozważyć
   wpięcie w `release:*` albo w bramkę wydania.
3. **BRAK `code_vytches_ddd`** — agent pracujący wewnątrz biblioteki nie może przeszukać
   jej własnej implementacji przez 19 pakietów. Do założenia:
   `node dist/indexer.js --collection code_vytches_ddd --dir ../../../vytches-ddd/packages`
   plus `.claude/config/knowledge.json` w tym repo. Decyzja do podjęcia: czy indeksować
   testy (695 plików) i pakiet `enterprise`, czy tylko `packages/*/src`.

**Pułapka udokumentowana w kodzie** (`src/global-indexer.ts`): `recreate()` kasuje całą
kolekcję, więc oba źródła `library_reference_global` muszą być zebrane PRZED jednym
`recreate()+add()`. Seedowanie ich osobno wyczyściłoby pierwsze.

## Wyniki Fazy A + B (wykonane 2026-08-10 w `claude-patterns`)

Audyt obalił dwa założenia z planu powyżej. Zostawiam oryginalny tekst nietknięty, żeby
było widać, co się zmieniło i dlaczego.

**Korekta 1 — bramką końcową jest `library-quality-verifier`, nie `library-api-guardian`.**
F1 proponował api-guardiana. Ten agent nie ma `Bash` ani mechanizmu VETO — jest jawnie
ADVISORY, więc jako `final_gate` mógłby najwyżej przeczytać kod i zgadywać. VETO i `Bash`
ma quality-verifier, czyli realnie uruchomi bramki repo. Api-guardian trafił do panelu
`/analyze` jako etap `api-surface-analysis` — tam jego doradcza rola jest właściwa.

**Korekta 2 — tabela awansów 12 agentów w F2 jest w większości nieaktualna.**
Trzej agenci (`library-api-guardian`, `library-quality-verifier`, `tech-lead`) to już
**symlinki** do `claude-patterns`, nie kopie — rozjazd jest strukturalnie niemożliwy,
nic z nimi nie trzeba robić. Z pozostałych dziewięciu do awansu nie kwalifikuje się
praktycznie żaden: `architecture-guardian`, `developer-experience`, `library-expert`,
`performance-optimizer`, `testing-excellence` mają twarde odwołania do konkretnych
pakietów tej biblioteki, więc jako uniwersalne byłyby kłamstwem. Do naprawy lokalnie,
nie do awansu:
- `ddd-compliance-guardian` — w ciele pliku (linie 27-31) wklejony duplikat metadanych
  jako zwykły tekst; odwołuje się też do agentów, których już nie ma (`strategic-vision`,
  `enterprise-sales`, `community-growth`)
- `security-audit` — ma `Edit, MultiEdit` bez `disallowedTools`, mimo roli audytora;
  treść to głównie ogólny OWASP-boilerplate bez uziemienia w realnym kodzie
- `library-expert` — `permissionMode: dontAsk` + `Edit, MultiEdit, Write` i **brak**
  `disallowedTools`; ten sam wzorzec ryzyka

Frontmatter wszystkich 12 zaczyna się poprawnie w pierwszej linii — pułapka niewidocznego
agenta tu nie wystąpiła.

**Korekta 3 (najważniejsza) — dziewięć skryptów npm wygląda na bramkę, a nią nie jest.**
Zasada „nie dubluj skryptu agentem" zakłada, że skrypt działa. Te nie działają:

| skrypt | co jest nie tak |
|---|---|
| `validate:bundles`, `quality:bundle`, `quality`, `quality:verbose` | `process.exit` wykonuje się **tylko pod flagą `--ci`**, której żaden z nich nie przekazuje → zawsze exit 0 mimo naruszeń |
| `architecture:ci` | `deps:circular && quality:bundle && echo '✅ passed'` — drugi człon nigdy nie faluje, więc gate'uje wyłącznie cykle, a i tak drukuje „passed" |
| `test:consumer` | glob celuje w `examples/playground/**`, katalog **nie istnieje**; `--passWithNoTests` daje PASS przy zerze testów |
| `test:bundle` | woła `scripts/analyze-bundles.js`, **pliku nie ma** |
| `test:package` | bez argumentu kończy się `exit 1` z usage, zanim cokolwiek przetestuje |
| `test:exports` | duplikat `validate:exports` — ten sam plik, podwójny koszt |
| `bench` | zero `expect()` w plikach bench — raport wydajności, nie bramka |

Realnie działające bramki: `@nx/enforce-module-boundaries` (ESLint `error`, 16 tagów
`scope:*`), `deps:circular`, `ddd:lint`, `validate:exports`, `validate:types`,
`test:contracts`, `llm:verify --strict`, `docs-compile-gate:check`, `example-matrix:check`,
`test:smoke`, `validate:api`. **api-extractor jest skonfigurowany tylko dla 4 z 19
pakietów** (`contracts`, `events`, `value-objects`, `enterprise`) — dla pozostałych
bramkę breaking-change częściowo łatają snapshoty `test:contracts`.

Naprawa tych skryptów to osobne zadanie w `vytches-ddd` — nie mieszać z setupem bloków.

**Korekta 4 — `ts-library.yml` nie zostaje osią frameworka z warstwami; warstwy
przeniesione do nowego bloku.** Po wprowadzeniu pola `axis:` (patrz `blocks/README.md`
i Aneks A w `docs/adr/0008-stack-blocks-composition.md`) okazało się, że
`ts-library.yml` (oś frameworka) mimo to wnosił `orchestrate.layers` — a materializacja
teraz twardo zabrania blokowi spoza osi architektury deklarować warstwy. Problem nie
był teoretyczny: `stack_blocks: [ts-library, flat-service]` kończyło się błędem
„`orchestrate.layers` definiują dwa bloki", więc biblioteki TS nie dało się złożyć z
żadnym innym układem katalogów niż ten narzucony przez `ts-library`. Warstwy
(`implementation → testing → api-surface`) przeniesiono do nowego bloku
`blocks/library-layers.yml` (`axis: architecture`, `requires: [ts-library]`);
`ts-library` wnosi teraz wyłącznie wzorce, panel analizy, overlay i env. Alias
`typescript-library` w `blocks/_aliases.yml` ma odtąd trzy człony: `[ts-library,
library-layers, nx-monorepo]`. Opis niżej w „Co powstało" i we fragmencie „**To ten
blok wnosi `orchestrate.layers`**" wyżej w tym dokumencie opisuje stan **przed** tą
korektą — celowo zostawiony bez zmian jako zapis historii.

**Co powstało w `claude-patterns`** (staged, niecommitowane; stan **po** Korekcie 4):
- `blocks/ts-library.yml` — oś frameworka; wzorce, panel api-surface-analysis, overlay,
  env — **bez `orchestrate.layers`** (patrz Korekta 4)
- `blocks/library-layers.yml` — oś architektury, `requires: [ts-library]`; warstwy
  `implementation → testing → api-surface` (ostatnia opcjonalna, wchodzi gdy diff
  rusza publiczne wejścia), `checks` wołają wyłącznie skrypty z listy działających,
  `final_gate: library-quality-verifier`, `ECC_GATEGUARD: off`
- `blocks/nx-monorepo.yml` — oś architektury; panel `boundary-analysis` z celowo wąskim
  `when:`, bo zgodność importów z grafem pilnuje już ESLint — agent ma odpowiadać wyłącznie
  na pytanie, czy sam graf ma sens dziedzinowy
- `blocks/_aliases.yml` — alias `typescript-library: [ts-library, nx-monorepo]`
- 5 wzorców `patterns/typescript-library/` zretrofitowanych do konwencji (`**Layer**`,
  `**Status**`, bloki ✅/❌) + **5 nowych kart reguł `*_summary.md`** (PA, BC, PB, BP, LT)
- `build-publish-pattern.md` uzupełniony o `nx release`, `publint`/`arethetypeswrong`,
  subpath exports i `peerDependencies`; `library-testing-pattern.md` — o testowanie
  spakowanego artefaktu (`npm pack` / Verdaccio), czyli tego, co konsument faktycznie dostaje
- `library-quality-verifier.md` — naprawione cztery martwe ścieżki wzorców w sekcji
  „Pattern Knowledge Base"; teraz wskazuje karty reguł i ich ID

Materializacja zweryfikowana na atrapie projektu: `stack_blocks: [typescript-library,
approval-gate]` → 3 bloki, `analyze.exit: PAUSE`, zero ostrzeżeń o wiszących ścieżkach.

**Zostaje do zrobienia w `vytches-ddd`** (F4 + naprawy): `stack_blocks` w `project.yml`,
materializacja, wpięcie hooka `check-approval-before-impl` do `settings.json` (materializacja
go NIE wpina — znana luka), triage/naprawa 9 agentów lokalnych, `code_vytches_ddd`
w Qdrancie, oraz naprawa bramek-widm z korekty 3.

## Kryteria ukończenia

- [ ] `.claude/config/runtime.yml` istnieje, zmaterializowany bez ostrzeżeń
- [ ] Każdy agent wymieniony w `runtime.yml` jest osiągalny w `.claude/agents/`
- [ ] Hooki z `runtime.yml` faktycznie wpięte w `.claude/settings.json`
- [ ] Triage 12 agentów wykonany; zero duplikatów lokalny↔współdzielony
- [ ] 5 wzorców zgodnych z konwencją ✅/❌ + karty `_summary.md`
- [ ] `reseed-patterns.sh` wykonany, `retrieve_patterns` zwraca nowe wzorce
- [ ] Zmiany **staged, NIE commitowane** — review i commit robi człowiek

## Uwagi wykonawcze

- Repo jest na branchu `refactor/VF-037-cross-context-isolation-regression-suite`
  z pracą w toku — nie mieszać tego setupu z tamtymi zmianami.
- Bramka GateGuard (`ECC_GATEGUARD`) blokuje pierwszy zapis każdego nowego pliku,
  żądając uzasadnienia. Blok `ddd/core` wyłącza ją przez `env`, ale `ts-library`
  tego nie odziedziczy — rozważyć, czy dodać `ECC_GATEGUARD: "off"` do `ts-library.yml`,
  czy zostawić bramkę włączoną dla biblioteki (argument za: zmiany w publicznym API
  powinny być uzasadniane).
