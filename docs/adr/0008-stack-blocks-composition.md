# ADR 0008 — Kompozycja bloków stacku: jeden `/analyze` i jeden `/orchestrate`, konfiguracja per projekt

**Status**: implemented (2026-08-12) — wdrożone we wszystkich 10 repozytoriach; stary tor
(`/analyze-ddd`, `/orchestrate-ddd`, `presets/`, `patterns/_stack-defaults/`, symlinki
`preset.yml`) usunięty tego samego dnia. Decyzje D1-D7 i OQ1-OQ7 bez zmian.
**Context source**: dyskusja 2026-08-08/10 — pytanie o klasyfikację projektu `../sso`
(TypeScript + NestJS, bez Kysely, bez DDD), które ujawniło, że `stack_profile` nie ma
odpowiedzi dla projektów spoza sześciu przewidzianych kombinacji.

> **Wdrożone.** Ten ADR opisuje stan obowiązujący, nie plan. Decyzje D1-D7 zatwierdzone, pytania OQ1-OQ8
> rozstrzygnięte (sekcja na końcu). Plan wykonawczy (pilot na `juz-ide-api-4`):
> [`docs/tasks/TASK-BLOCKS-001.md`](../tasks/TASK-BLOCKS-001.md).

---

## Kontekst

### Problem obserwowany

1. **`stack_profile` jest monolityczną etykietą, do której przywiązane są trzy niezależne
   mechanizmy**: `patterns/_stack-defaults/<profil>.yml` (dobór wzorców w `/orchestrate`
   Phase 0.5a'), `presets/<profil>.yml` (cała maszyneria bramek `/analyze-ddd` +
   `/orchestrate-ddd`) i `case` w `scripts/setup-project.sh` (które katalogi wzorców
   symlinkować). Profil `nestjs-ddd` skleja framework (NestJS), architekturę (DDD)
   i bibliotekę persystencji (Kysely) w jeden nierozdzielny pakiet.
2. **Projekt `../sso` nie ma poprawnej klasyfikacji.** Jest NestJS-owy, ale bez DDD
   i bez Kysely. `/analyze-ddd` deklaruje w kroku 0, że działa w każdym stacku, ale jego
   treść (decision cards agregat/VO, stage `ddd-modeling`, sync `BUSINESS_RULES.yaml`)
   jest merytorycznie DDD-owa. Fallback chroni przed crashem, nie przed niedopasowaniem:
   nic nie powstrzymuje odpalenia DDD-panelu na projekcie, który DDD nie ma.
3. **Duplikacja komend**: `/orchestrate` obok `/orchestrate-ddd`, `/analyze-ddd` bez
   generycznego odpowiednika. Każda poprawka procesu wymaga pamiętania o dwóch miejscach.
4. **Budżety wykonania agentów są rozsypane** po prozie komend („masz budżet ~15 wywołań"
   w `/analyze-ddd`), regułach `workflow-lint.js` (WL6, WL10) i frontmatterze agentów
   (`maxTurns`). Incydenty: `code-quality-verifier` padł po 106k tokenów bez żadnego
   outputu (2026-07-20); implementer szukał nieistniejącej funkcji aż do klifu `maxTurns`
   (TS-SEC-ONBEHALF-001). Nie ma jednego miejsca, w którym można te limity podkręcić.
5. **`retrieve_patterns` nie zna stacku wołającego projektu.** Chunki mają metadane
   `scope`/`project` (wzorce project-specific są filtrowane), ale nie mają informacji
   „to jest wzorzec Kysely" — projekt na TypeORM dostaje w wynikach wzorce Kysely
   i odwrotnie.

### Stan zastany — na czym budujemy

- **Precedens kompozycji już istnieje w repo.** `skills:` w `project.yml` to płaska,
  wybieralna lista kategorii; `finance/*` idzie dalej: granularne pod-bloki
  (`finance/core`, `finance/wealth-management`, ...) z jawnym grafem zależności
  w `skills/finance/PLUGINS.md`, egzekwowanym przez agenta.
- **Mechanizm per-projektowej listy wzorców już istnieje**: `EXPLICIT_PATTERNS`
  w `setup-project.sh` (jawna lista `patterns:` w `project.yml` ma pierwszeństwo nad
  `stack_profile` przy symlinkowaniu). Nikt go dotąd nie używał; brakuje odpowiednika
  po stronie `_stack-defaults` i po stronie bramki DDD.
- **`yml_get`/`yml_list` w `setup-project.sh` to ręczny parser grep/sed** czytający
  wyłącznie pola wcięte o 2 spacje. Komentarz przy bloku `broadcast:`
  w `templates/project.yml.example` wprost ostrzega, że listy blokowe nie działają.
  Każda nowa logika parsowania w bashu to najsłabsze technicznie miejsce systemu.
- ADR 0001 odrzucił „fat manifest" w `project.yml` (rozszerzenia przez konwencję
  położenia plików, nie przez listy w konfigu). ADR 0007 (proposed) szuka manifestu
  instalacji odpowiadającego na pytanie „co i kiedy zainstalowano w tym repo".

---

## Decyzje

### D1 — Blok jako jednostka kompozycji; sub-bloki dla dużych tematów

Wprowadzamy `blocks/` w claude-patterns: jeden plik YAML na blok. Blok deklaruje
wszystko, co wnosi do projektu:

```yaml
# blocks/ddd/core.yml
name: ddd/core
requires: []                      # graf zależności, wzór: skills/finance/PLUGINS.md
patterns:
  always: [cross-layer/domain-errors-pattern.md]
  triggers:
    - keywords: [aggregate, entity, value object]
      include: [domain/aggregate-pattern.md, domain/value-object-pattern.md]
analyze:
  panel:
    - { agent: ddd-application-expert, when: "aggregate|entity|domain" }
  exit: PAUSE                     # blok ddd/core włącza twardą bramkę approval
orchestrate:
  layers: [domain, application]
  verifier: code-quality-verifier
hooks: [check-patterns-read, check-approval-before-impl]
budgets:
  panel: { max_tool_calls: 15, on_limit: emit-partial }
```

Nazewnictwo: płaskie nazwy dla bloków prostych (`nestjs`, `kysely`, `typeorm`, `zod`),
namespace dla tematów z realnymi pod-sekcjami. DDD jest takim tematem — proponowany
podział startowy (weryfikacja: OQ1):

| sub-blok | zawartość | requires |
|---|---|---|
| `ddd/core` | agregat, encja, VO, domain errors, Result, czystość domeny | — |
| `ddd/cqrs` | command/query handlery, sagi | `ddd/core` |
| `ddd/events` | domain events, transactional outbox, integration events | `ddd/core` |
| `ddd/acl` | ACL Registry, komunikacja cross-context | `ddd/core`, `ddd/events` |

Zapis `ddd` bez ukośnika w `stack_blocks` jest aliasem na pełny zestaw sub-bloków.
Zależności (`requires:`) egzekwuje `setup-project.sh` przy materializacji (D3):
brakująca zależność to twardy błąd setupu, nie cicha degradacja w trakcie taska.

Deklaracja w projekcie to jedna linia w `project.yml`:

```yaml
stack_blocks: [nestjs, zod, typeorm]                 # sso — bez ddd
stack_blocks: [nestjs, ddd, kysely]                  # juz-ide-api-*
stack_blocks: [nestjs, ddd/core, ddd/cqrs, kysely]   # wariant bez events/acl
```

Granica wobec ADR 0001: `stack_blocks` to deklaracja „z czego się składam" (jedna
linia), nie manifest „jak działam". Definicje pozostają w blokach; project.yml nie
wraca do odrzuconego modelu fat-manifest.

### D2 — Szkielet + sloty: jeden `/analyze`, jeden `/orchestrate`

`/analyze` i `/orchestrate` stają się dwoma globalnymi, generycznymi silnikami bez
wiedzy o żadnym stacku. Każdy ma stały szkielet ze slotami:

- **analyze**: discovery (patterns + RAG + decision cards) → panel (sloty) → synteza →
  artefakt → `exit` (PAUSE albo przejście dalej)
- **orchestrate**: plan → pętla [implement → verify → fix] per warstwa (sloty) →
  bramka końcowa (slot) → stage-not-commit

Bloki obsadzają sloty; proces nie jest składany swobodnie. Definicje workflow (skład
panelu, kolejność warstw, VETO) nie mają semantyki unii, ale stałe gniazda
w niezmiennym szkielecie mają. Blok bez sekcji `analyze:` po prostu nie dotyka panelu.

Dobór agentów: roster deterministyczny z bloków, aktywacja warunkowa deklaratywna.
Model nie decyduje, których specjalistów powołać; blok deklaruje
`when: "auth|pii|migration"` i silnik włącza agenta, gdy task pasuje (ten sam mechanizm
co dzisiejszy threat-model preflight i `trigger_includes`). To utrzymuje spójność
z filozofią repo: bramki i hooki zamiast osądu modelu.

Bramka DDD przestaje zależeć od nazwy profilu: `exit: PAUSE` + hook
`check-approval-before-impl` wnosi blok `ddd/core`. Projekt bez tego bloku dostaje
`/analyze` kończące się artefaktem bez twardego STOP i `/orchestrate` bez wymogu
`status: approved`.

`/analyze-ddd` i `/orchestrate-ddd` zostają jako deprecated aliasy (konwencja repo:
nigdy nie usuwamy bez deprecation notice) tłumaczące się na nowe komendy z aliasem
profilu — zachowanie identyczne, dopóki bloki odtwarzają dzisiejszy preset.

### D3 — Materializacja: `setup-project.sh` skleja raz, silnik czyta jeden plik

`setup-project.sh` czyta `stack_blocks`, rozwiązuje zależności, skleja bloki
(unia `patterns.always` z dedupem, konkatenacja `triggers`, obsadzenie slotów,
scalenie budżetów) i zapisuje wynik do **`.claude/config/runtime.yml`**. Silniki
`/analyze` i `/orchestrate` czytają wyłącznie ten jeden plik.

Powody:
- sklejanie w bashu przy każdym uruchomieniu komendy byłoby nową logiką w najsłabszym
  miejscu systemu (ręczny parser YAML); robimy to raz, przy setupie;
- wynik jest inspektowalny — widać dokładnie, co projekt dostał i skąd (każda pozycja
  z adnotacją `source: blocks/ddd/core.yml`);
- **twarda bramka wejścia**: brak `runtime.yml` → `/analyze` i `/orchestrate` odmawiają
  z komunikatem „projekt nie ma skomponowanego setupu". To czyni pilot bezpiecznym:
  nowe komendy są fizycznie martwe we wszystkich repo poza pilotażowym.

Relacja do ADR 0007: `runtime.yml` jest dokładnie tym manifestem instalacji, którego
tamten ADR szuka. Zapisujemy w nim `schema_version`, datę materializacji i hash plików
źródłowych bloków — wykrywanie dryfu (bloki zmienione po materializacji) sprowadza się
do porównania hashy. Rozstrzygnięcie, czy dryf ma być raportowany czy blokujący,
należy do ADR 0007, nie tutaj.

### D4 — Budżety wykonania jako pierwszoklasowa konfiguracja

Sekcja `budgets:` w blokach i w `project.yml` (projekt nadpisuje bloki) trafia do
`runtime.yml` i jest egzekwowana trzema warstwami:

1. **miękko** — silnik automatycznie wstrzykuje do prompta każdego agenta „masz ~N
   wywołań narzędzi; gdy się kończą, natychmiast wypisz częściowy raport" (dziś robi to
   ręcznie proza `/analyze-ddd` i bywa pomijane);
2. **twardo** — `maxTurns` / `effort` ustawiane per slot przy wywołaniu agenta;
3. **backstop** — reguły lint workflow (odpowiedniki WL6/WL10) czytające te same
   wartości z `runtime.yml`.

Warstwy twarde są tępe (klif = martwy agent bez raportu); warstwa miękka ratuje output.
Żadna konfiguracja nie likwiduje problemu całkowicie — celem jest jedno miejsce
podkręcania zamiast trzech plików prozy.

### D5 — Seeding i MCP: bloki jako metadane chunków, bez zmiany formatu wzorców

**Format plików wzorców zostaje bez zmian** (`**Layer**`, `**Status**`, wymagane bullety
✅/❌, opcjonalny `**Scope**: project-specific`, rule cards `*_summary.md`). Członkostwo
wzorca w blokach **nie jest** deklarowane w pliku wzorca.

Zamiast tego block YAML jest jedynym źródłem prawdy, a `reseed-patterns.sh` buduje przy
seedowaniu odwrotny indeks ścieżka-wzorca → lista bloków i taguje każdy chunk
`blocks: ["ddd/core", "nestjs"]`. Konsekwencje:

- zero edycji w 72 istniejących plikach wzorców, zero ryzyka dryfu dwóch deklaracji;
- wzorzec niewymieniony w żadnym bloku dostaje `blocks: []` = uniwersalny, zwracany
  zawsze (naturalny stan dla `cross-layer/`);
- reseed waliduje ścieżki z bloków i raportuje wiszące odwołania — dziś brakująca
  ścieżka w `_stack-defaults` to cicha omisja, po zmianie będzie jawne ostrzeżenie;
- `retrieve_patterns` dostaje opcjonalny parametr `blocks:`; wywołujące komendy czytają
  listę bloków projektu z `.claude/config/knowledge.json` (rozszerzanego przez
  `setup-project.sh` o pole `stack_blocks`). Brak parametru = dzisiejsze zachowanie,
  pełna kompatybilność wsteczna. Twardy filtr czy boost rankingu — OQ2.

Wymiar `blocks` jest ortogonalny do istniejącego `scope`: `scope` mówi „kto może ten
wzorzec widzieć" (project-specific vs uniwersalny), `blocks` mówi „przy jakim stacku
jest trafny".

### D6 — Bloki lokalne w projekcie, ten sam schemat

Projekt może mieć własne bloki w `.claude/blocks/*.yml`, wskazywane w `stack_blocks`
prefiksem `./`:

```yaml
stack_blocks: [nestjs, zod, ./sso-keycloak]
```

Blok lokalny używa identycznego schematu; różni się tym, że ścieżki wskazują do wnętrza
projektu (`.claude/knowledge/patterns/local/...`, agenci z `.claude/agents/`, hooki
z `.claude/hooks/`). Po materializacji `runtime.yml` zawiera rozwiązane ścieżki —
silnik nie rozróżnia, co było centralne, a co lokalne. Wzorce lokalne nie są seedowane
do kolekcji globalnej (obowiązuje istniejący mechanizm kolekcji per projekt).

### D7 — Pilot na `juz-ide-api-4`, migracja przez aliasy, bez big-bangu

- Nowe komendy i schemat powstają obok istniejących; `/analyze-ddd`,
  `/orchestrate-ddd`, `_stack-defaults/`, `presets/` pozostają nietknięte do końca
  pilota.
- Jedynym projektem z `runtime.yml` jest `juz-ide-api-4` (bliźniak api-1: realna praca
  DDD, a rollback to `rm .claude/config/runtime.yml`).
- Warunkiem rozpoczęcia migracji pozostałych repo jest test równoważności: bloki
  `[nestjs, ddd, kysely]` po sklejeniu dają funkcjonalnie ten sam zestaw wzorców,
  agentów, hooków i bramek co dzisiejszy `nestjs-ddd` (preset + stack-defaults).
- `stack_profile: nestjs-ddd` zostaje po migracji jako alias na listę bloków —
  istniejące `project.yml` nie wymagają zmiany w dniu przełączenia.
- Kryteria go/no-go pilota i fazy: `TASK-BLOCKS-001`.

---

## Alternatywy odrzucone

**Pełna kompozycja procesu (merge `phase_research`/`phase_implementation` z połówek
bloków).** Definicja workflow nie ma semantyki unii: skład panelu i kolejność warstw są
wyznaczane łącznie przez framework i architekturę, nie niezależnie. Sloty w stałym
szkielecie dają kompozycję tam, gdzie jest dobrze określona, i tylko tam.

**Dobór agentów przez model w trakcie analizy** („orchestrate sam ocenia, czy problem
wymaga agenta od modelowania domenowego / postgres / security"). Niepowtarzalny między
przebiegami, nieaudytowalny, sprzeczny z filozofią repo (deterministyczne bramki, VETO,
hooki zamiast osądu modelu). Warunkowa aktywacja `when:` daje ten sam efekt
deklaratywnie.

**Linia `**Blocks**:` we frontmatterze każdego wzorca.** Wymaga edycji 72 plików
i tworzy drugie źródło prawdy obok block YAML — klasyczny dryf dwóch deklaracji.
Odwrotny indeks przy seedowaniu kosztuje jedną funkcję w reseed i nie dotyka wzorców.

**Siódmy monolityczny profil `nestjs` jako rozwiązanie docelowe.** Taktycznie tani
(jeden plik `_stack-defaults/nestjs.yml`) i pozostaje dostępny jako doraźne odblokowanie
sso przed pilotem, ale nie odpowiada na problem źródłowy: każda nowa kombinacja
framework × architektura × persystencja × walidacja to kolejny profil.

**Rozszerzanie `project.yml` o pełny manifest konfiguracji** (agenci, hooki, fazy per
projekt bez bloków). Odrzucone już w ADR 0001; bloki utrzymują granicę: project.yml
deklaruje skład, definicje żyją w blokach.

---

## Konsekwencje

**Pozytywne**: znika duplikacja `/orchestrate` vs `/orchestrate-ddd`; `../sso` (i każdy
przyszły projekt spoza sześciu kombinacji) jest klasyfikowalny jedną linią; bramka DDD
włącza się przez deklarację bloku, nie przez pamięć operatora; budżety wykonania mają
jedno miejsce konfiguracji; `retrieve_patterns` przestaje zwracać wzorce cudzego stacku;
`runtime.yml` domyka lukę manifestu z ADR 0007.

**Negatywne / koszty**: nowy schemat (bloki + runtime.yml) do utrzymania i wersjonowania;
`runtime.yml` może dryfować względem źródeł między materializacjami (mitygacja: hash +
ADR 0007); dekompozycja `nestjs-ddd` na bloki wymaga starannego testu równoważności;
liczba plików rośnie (kilkanaście małych YAML zamiast dwóch dużych); parsowanie
`stack_blocks` w bashu pozostaje ryzykiem do czasu ewentualnego przepisania `yml_get`.

---

## OTWARTE PYTANIA — rozstrzygnięte 2026-08-10

- **OQ1 — granice sub-bloków `ddd/*`.**
  **Odpowiedź:** podział z D1 (core/cqrs/events/acl) przyjęty. Transactional outbox
  należy do `ddd/events` (to sposób dostarczania zdarzeń; implementację pod konkretną
  bazę dowozi triggerem blok persystencji, np. `kysely`). Specyfikacje i polityki
  zostają w `ddd/core`. Zasada: tniemy grubo, dzielimy dopiero gdy realny projekt
  potrzebuje pół klocka. Rewizja granic po pilocie (F4), zanim powstanie więcej bloków.
- **OQ2 — filtr `blocks` w `retrieve_patterns`: twardy czy boost.**
  **Odpowiedź:** boost rankingu, nie twardy filtr. Szum jest tańszy niż ślepota:
  źle skonfigurowany projekt przy twardym filtrze w ogóle nie zobaczy właściwego
  wzorca i nikt nie będzie wiedział czemu; przy boost dostanie go niżej w wynikach.
  Zaostrzenie do twardego filtra możliwe po obserwacji trafień z pilota.
- **OQ3 — konflikt budżetów.**
  **Odpowiedź:** wygrywa niższy limit (konserwatywnie); `project.yml` nadpisuje bez
  ograniczeń. Reguła jednozdaniowa, przewidywalna; za ciasny limit naprawia jedna
  linia w projekcie.
- **OQ4 — cap na sumę `always`.**
  **Odpowiedź:** ostrzeżenie przy >8 pozycjach, bez blokowania. Blokada psułaby setup,
  ignorowanie oznacza pełzający koszt tokenów w każdym tasku. Ostrzeżenie wypisuje,
  który blok dołożył co (adnotacje `source:`) — decyzja człowieka trwa chwilę.
  Zaostrzenie, jeśli pilot pokaże realny wzrost kosztów.
  **Doprecyzowanie (dyskusja 2026-08-10):** rozważono agenta-proxy („mini-orchestrator
  decydujący, co doczytać per task") — odrzucone. Dynamiczny dobór już ma dwóch
  właścicieli: deterministyczne `triggers` oraz MCP `retrieve_patterns` (sekcje
  ✅/❌ we wzorcach pełnią rolę „description co robi, a czego nie"; D5 poprawia
  celność tagami bloków). Agent-proxy dokładałby koszt i latencję do każdego
  zadania, byłby niepowtarzalny między przebiegami, a dla reguł z półki `always`
  (security, konwencje błędów) trafność <100% jest niedopuszczalna. Model docelowy
  to trzy półki: twardy rdzeń `always` (malutki), `triggers` (deterministyczne),
  MCP (cała reszta, semantycznie). Ostrzeżenie >8 = sygnał „zdegraduj wzorzec
  z półki always na triggers/MCP", nie zaproszenie do budowy routera.
- **OQ5 — wersjonowanie schematu bloków.**
  **Odpowiedź:** jedna stała `schema_version` w claude-patterns, zapisywana do
  `runtime.yml`; przy niezgodności silniki odmawiają z komunikatem „odpal setup
  ponownie". Naprawa to jedno uruchomienie skryptu — nic mądrzejszego nie budujemy.
  Wykrywanie dryfu treści (hash źródeł) pozostaje w gestii ADR 0007.
- **OQ6 — los `presets/nestjs-ddd.yml`.**
  **Odpowiedź:** preset zamrożony (tylko bugfixy) do końca migracji, potem skasowany
  z deprecation notice. Alias `nestjs-ddd` żyje w `blocks/_aliases.yml`, nie
  w presecie. Zaakceptowany koszt przejściowy: poprawka procesu DDD w czasie pilota
  musi trafić w dwa miejsca (preset dla starych repo, bloki dla api-4).
  **Migracja po udanym pilocie rusza od razu**, w kolejności: `juz-ide-api-1`,
  `juz-ide-api-2`, `juz-ide-api-3`, następnie `iam`, `vytches-ddd` i pozostałe
  repozytoria — bez okresu wyczekiwania między pilotem a resztą.
- **OQ7 — kolizje `triggers` między blokami.**
  **Odpowiedź:** żadnego mechanizmu teraz. Unia zbiorów + obserwacja na pilocie;
  najgorszy skutek kolizji („wczytało się kilka wzorców za dużo") łapie już
  ostrzeżenie z OQ4, a naprawa leży w treści bloków (węższe keywordy), nie w silniku.

## OQ8 — override/subtract w kompozycji (rozstrzygnięte 2026-09-07, K95)

**Pytanie.** Kompozycja umie tylko dodawać. Czy blok ma dostać sposób na (a) ODJĘCIE wpisu
wniesionego przez inny blok i (b) CZĘŚCIOWE nadpisanie sekcji dziedziczonej przez `extends`?

**Skąd się wzięło.** Projekt `iam` obchodzi oba braki, każdy inaczej:

- `.claude/blocks/iam-security.yml` dokłada własny wzorzec bezpieczeństwa pod Fastify obok
  `cross-layer/security-invariants-pattern.md` z bloku `node`. Oba trafiają do `runtime.yml`,
  a który wygrywa przy sprzeczności składni — rozstrzyga komentarz w nagłówku pliku bloku.
- `.claude/blocks/iam-verifiers.yml` dziedziczy po `flat-service` (`extends`) wyłącznie po to,
  żeby podmienić dwóch agentów: `inner_loop.verify` i `final_gate.agent`. Ponieważ `extends`
  nadpisuje sekcję `orchestrate` W CAŁOŚCI, blok musiał skopiować także `layers` i `exit` —
  czyli fragment, którego nie zamierzał zmieniać. Skutek: przyszła zmiana warstw
  w `flat-service` nie dotrze do `iam`, i nikt się o tym nie dowie.

**Rozstrzygnięcie (a) — odejmowanie: mechanizm JEST, brakuje tylko jego użycia.**
`patterns.remove:` istnieje od K44 (TASK-KAIZEN-001) i robi dokładnie to, o co chodzi:
blok jawnie wyklucza ze zsumowanego `always` wzorzec dodany przez INNY blok, a odejmowanie
stosuje się po całej pętli po blokach, więc kolejność w `stack_blocks` nie ma znaczenia.
`iam-security.yml` nie używa go dziś i twierdzi w komentarzu, że „silnik materializacji sumuje
`patterns.always`, nie potrafi odjąć wpisu wniesionego przez inny blok" — to zdanie jest
nieaktualne. **Nie wprowadzamy osobnego `exclude:`**: byłby to drugi mechanizm o tej samej
semantyce, a jedyny realny adopter potrzebuje tego, co już jest.

Do zrobienia po stronie projektu (nie silnika): `iam-security.yml` dopisuje

```yaml
patterns:
  remove:
    - cross-layer/security-invariants-pattern.md
```

i usuwa akapit komentarza o niemożności odejmowania.

Odejmowania na półce `overlay.*` **nie wprowadzamy** — nie ma dziś ani jednego przypadku,
w którym projekt chciałby usunąć katalog overlay wniesiony przez centralny blok. Otwieranie
drugiej osi odejmowania bez adoptera to konfiguracja, której nikt nie przetestuje.

**Rozstrzygnięcie (b) — `extends` merguje sekcję `orchestrate` per klucz: TAK.**
Klucze nieobecne w bloku lokalnym dziedziczą z bazy, lokalne nadpisują. Głębokość: JEDEN
poziom (`layers`, `inner_loop`, `final_gate`, `exit` — a nie wnętrze `inner_loop`), tak jak
`extends` dopuszcza jeden poziom dziedziczenia i z tego samego powodu: głębsze scalanie robi
z kompozycji labirynt, w którym „skąd wziął się ten agent" przestaje być odpowiadalne.

Trzy argumenty za, mimo że dotyczy to dziś jednego projektu:

1. **To nie jest nowa semantyka, tylko domknięcie istniejącej.** `analyze.panel` już merguje
   per pozycję (`stage` lokalny zastępuje bazowy, nowe dochodzą, `drop: true` usuwa).
   `orchestrate` jest jedyną dużą sekcją, która tego nie robi — asymetria, nie decyzja.
2. **Koszt implementacji jest proporcjonalny**: około ośmiu linii w `applyExtends()`
   (`scripts/materialize-runtime.mjs`), bez nowego pojęcia w schemacie bloku.
3. **Zmiana jest wstecznie zgodna.** Jedyny blok z `extends` w całej flocie
   (`iam-verifiers.yml`) deklaruje dziś pełną sekcję `orchestrate`, więc po zmianie
   materializuje się identycznie. Dopiero potem może skasować skopiowane `layers` i `exit`
   — i od tego momentu zaczyna dostawać zmiany bazy.

**Implementacja: pozycja K113 (planned)** w `docs/tasks/TASK-KAIZEN-002.md`. Ten ADR opisuje
decyzję, nie stan wdrożony — do czasu K113 `extends` nadal nadpisuje `orchestrate` w całości.

**Kiedy to wraca na stół.** Gdy pojawi się drugi adopter `flat-service` albo pierwszy projekt
chcący odjąć pozycję z `overlay.*` — wtedy warto sprawdzić, czy jeden poziom scalania nadal
wystarcza.

## Aneks A (2026-08-11): pole `axis` i przypisanie warstw do osi architektury

Decyzje D1-D7 powyżej pozostają w statusie `accepted` i bez zmian treści — ten aneks
dokumentuje doprecyzowanie schematu bloku odkryte dopiero przy realnej kompozycji
(`vytches-ddd`), nie cofa żadnej z nich.

Blok deklaruje teraz pole `axis:` — jedną z sześciu wartości: `framework`,
`architecture`, `persistence`, `validation`, `security`, `process`. Reguła egzekwowana
przy materializacji (`scripts/materialize-runtime.mjs`): **`orchestrate.layers` może
wnieść wyłącznie blok o `axis: architecture`**. Nadal obowiązuje wcześniejsza zasada
D1/D3 — dokładnie jeden blok w całym składzie może wnieść `orchestrate.layers`; `axis`
zawęża, *który* blok ma do tego prawo, nie zmienia liczby.

Powód: `blocks/ts-library.yml` miał `axis: framework`, a mimo to wnosił
`orchestrate.layers`. Skutek był namacalny, nie teoretyczny — skład
`stack_blocks: [ts-library, flat-service]` kończył się błędem materializacji
„`orchestrate.layers` definiują dwa bloki", bo `flat-service` (architektura) też
wnosi warstwy. Efekt: biblioteki TS nie dało się złożyć z żadnym innym układem
katalogów niż ten, który `ts-library` narzucał na sztywno — mimo że `ts-library` z
definicji reprezentuje framework/rodzaj projektu, nie decyzję o strukturze katalogów.
Naprawa: warstwy przeniesiono do nowego bloku `blocks/library-layers.yml`
(`axis: architecture`, `requires: [ts-library]`); `ts-library` wnosi od tej pory
wyłącznie wzorce, panel analizy, overlay i env. Alias `typescript-library` w
`blocks/_aliases.yml` ma teraz trzy człony: `[ts-library, library-layers,
nx-monorepo]`.

`axis: architecture` nie jest równoznaczne z obowiązkiem deklarowania warstw —
`ddd/cqrs`, `ddd/events`, `ddd/acl` i `nx-monorepo` są blokami osi architektury bez
`orchestrate.layers`.

Przykładowy YAML w D1 (`blocks/ddd/core.yml`) nie zawiera pola `axis:` — powstał przed
wprowadzeniem tego pola. Aktualny schemat, łącznie z `axis:`, jest udokumentowany w
`blocks/README.md`.
