# Changelog

All notable changes to claude-patterns are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions match the
`version:` field in `METADATA.yml`.

These entries moved out of `CLAUDE.md` on 2026-09-07 (K105). They had grown to
a third of that file, which every session in this repo pays for on every turn,
and none of it is instruction — it is history.

## [Unreleased]

### Changed
- Domyślny adres embeddera (CT 301) w `knowledge-retriever` (`src/embedder.ts`, `docker-compose.yml`) wrócił z `:8000` na `:8301`. Kontener odpowiada na obu portach identycznymi wektorami; `KR_EMBED_URL` nadal nadpisuje domyślną wartość.

### Added
- Techniki z gstack (TASK-GSTACK-ADOPT-001):
  - `scripts/context-bill.mjs` (A4): rachunek kontekstu stałego (katalog `name`+`description`) i kosztu wywołania (ciało) per agent, skill i komenda, z raportem top N, `--json` i ratchetem `--check` względem `tests/flow-evals/context-budget/ceilings.json` (stan +5% oraz sufit sumaryczny katalogu); legalny wzrost wymaga `--capture` w tym samym commicie.
  - `scripts/sync-fragments.mjs` (B4): wspólne fragmenty z `templates/fragments/` wstrzykiwane między markery `<!-- fragment:NAZWA START/END -->` (`--check`, `--apply`).
  - Kernel dowodowy (A1): pięć reguł dla weryfikatorów i reguła cytatu (finding bez `plik:linia` nie blokuje) we fragmencie `evidence-kernel`, wstrzykniętym do 15 agentów z VETO. Kontrakt wyjścia bez zmian, ok. 1 KB kontekstu stałego na agenta.
  - Werdykt związany z hashem drzewa (A2, ORC-139): silnik liczy hash drzewa roboczego (`git write-tree` z tymczasowego indeksu) przed i po weryfikatorze oraz bramce końcowej; GO z rozjazdem jest odrzucane. Nowy `scripts/orchestrate-tree-hash.mjs` (krok 4 sprawdza przed `git add`, że staged kod to kod zweryfikowany).
  - `/analyze`: klasyfikacja decyzji MECHANICAL / TASTE / USER_CHALLENGE i `door_type` one-way / two-way ze znacznikiem `(recommended)` (B5, ANL-047, ANL-048), pola opcjonalne w szablonie artefaktu.
  - `/review-panel`: adaptacyjny dobór reviewerów (B3). Reviewer bez findingu w 10 ostatnich wywołaniach w projekcie jest pomijany; `NEVER_GATE` (security, compliance, pragmatist), `--full` i `--thorough` wymuszają pełny panel; pominięci są jawnie wymienieni w raporcie. Nowy `scripts/reviewer-stats.mjs` i dziennik `~/.claude/review-panel-stats/invocations.jsonl`.
  - Polityka powtórzeń evali zależna od rodzaju testu (B2, `tests/flow-evals/lib/eval-policy.mjs`) i kontrola sędziów LLM przed użyciem (B1, `tests/flow-evals/judge-controls/`, `docs/EVAL-JUDGE-CONTROLS.md`).
  - `/checkpoint handoff`: punkty „Remaining Work" mają znacznik pochodzenia `(uruchomiono)` / `(przeczytano)` / `(zgadnięto)`; zgadnięte trafiają po wznowieniu do „Zweryfikuj najpierw" (C2).
  - Higiena repozytorium (C1): `LICENSE` (MIT), `SECURITY.md`, obraz Qdrant przypięty do `v1.18.2`, skan zależności `scripts/cron/osv-scan.sh` z `.osv-scanner.toml` i walidacją wyjątków (`ignoreUntil` + powód), kontrola zgodności wersji METADATA.yml z `package.json` i `package-lock.json` w `count-assets --check`.
  - `scripts/ci/validate-prompt-structure.mjs` (A3): wymagane kroki i ich kolejność w `/analyze`, `/orchestrate` i `/review-panel`, piny na tokeny czytane maszynowo oraz lint archeologii (numery issue/PR, narracja o incydentach, daty poza `## Changelog`) z ratchetem per plik w `tests/flow-evals/prompt-structure/`; `--capture` odmawia wzrostu baseline'u bez `--allow-growth`.
- Sonda `/orchestrate` cytuje `tail` zamiast go streszczać (ORC-137, TASK-ORCH-PATTERN-GAPS-001): błędy lintu kopiowane razem z linią nagłówkową pliku, żeby runda naprawcza trafiała w właściwy plik. Karta `refine-providers` PRV2 opisuje wariant D7 (`<RedirectToSignIn>` jako fallback `<Authenticated>` z flagą jednokrotności i wyłącznikiem `auth_retry`). Claim: `DEV-orc-026` w dół o 50% (`engine=0acca0b`).
- Karty reguł zgodne ze stosem (ORC-136, TASK-ORCH-CARDS-STACK-MISMATCH-001): blok `node` niesie `security-invariants-pattern-plain` i `safe-error-propagation-pattern-plain` zamiast kart NestJS/DDD, `conventions-pattern` zdjęty z `always`; `orchestrate-prepare` nie ładuje kart warstwy z `layers_skip`; karta loggera ma zakres per token. Claim: `DEV-orc-044-implementation` w dół o 50% (`engine=11de3f4`).
- Silnik `/orchestrate` usuwa pliki za implementera bez Bash (ORC-135, TASK-ORCH-IMPLEMENTER-FILE-DELETE-001): pole `deleted_files` w wyniku implementera i krok mechaniczny `git rm` zamiast tombstone `export {}` lub „brak zmian". Ścieżki spoza zakresu warstwy, bezwzględne, z `..`, z metaznakiem powłoki i brudne przed startem są odrzucane; usunięte pliki nie wchodzą do `git add`, a weryfikator i bramka końcowa dostają ich listę. Claim: `DEV-orc-087-domain` w dół o 50% (`engine=cbe74d7`).
- `npm run telemetry:weekly` i `telemetry:weekly:dry`: raport tygodniowy odpalany ręcznie z logiem na terminalu, bez crona (wrapper `scripts/cron/telemetry-weekly.sh` zostaje, nic go nie instaluje).
- Reguła deklaruje metrykę (TASK-OBS-017, ADR 0015 D6, ADR 0011 aneks): pole `claim` (`metric`, `direction`, `threshold`, `engine`,
  opcjonalnie `process`) w rekordzie skrzynki `promoted` i linia `**Claim:**` we wpisie rule-history; nowy stan skrzynki `resolved`
  (zamknięty, `report-deviation` otwiera go ponownie przy nowym wystąpieniu). `telemetry-report.mjs --claims` daje werdykt
  `confirmed | no_effect | regressed | insufficient_data` (min. 20 przebiegów po obu stronach okna wokół hasha silnika);
  `--weekly` zapisuje `telemetry/reports/<RRRR>-W<ww>.md` (4 sekcje: delta tydzień do tygodnia z silnikami, claimy, jakość danych,
  reguły bez claimu) i zmienia status rekordów (`confirmed` → `resolved`, `regressed` → reopen) wyłącznie przy werdykcie
  zaufanym: w oknie „po" co najmniej połowa przebiegów szła pod hashem claimu (silnik zmienia się niemal z każdym commitem,
  23 hasze w dwa tygodnie). Zmianę statusu zapisuje raport, commituje człowiek. Pre-commit ostrzega (nie blokuje) o nowej regule
  ORC/ANL bez claimu; `telemetry-freshness` pilnuje, że raport tygodniowy powstał; wrapper crona `scripts/cron/telemetry-weekly.sh`
  (wpis w crontabie dodaje człowiek). Pierwszy claim: ORC-117 (`retryCost` ↓ 20%, silnik 57f8f64, proces orchestrate) —
  **na dziś `no_effect` (21,9% → 23,3%), udział silnika w oknie „po" 4,8%, więc status bez zmian**. Claimów dla ORC-098/100 nie ma:
  powstały 04.10, a hasze silnika są w rollupach dopiero od 10.10. Eval `telemetry-report` +10 przypadków (20), `reporting-hygiene` +2 (9).
- Raport nad rollupami (TASK-OBS-014, ADR 0015 D6): `scripts/telemetry-report.mjs` czyta wyłącznie `telemetry/rollups/`
  (liczniki sumowane po hostach). Widoki `--by engine|process|role|project|week`, `--engine <hash>` (okno 7 dni z danymi przed i po
  pierwszym dniu silnika: first-pass, fałszywe GO, NO_GO bramki, udział kosztu powtórek, cichy zgon, gęstość odstępstw per
  sygnatura; szum poniżej 20% albo 2 pp, próba poniżej 10 = `insufficient_data`; podaje też udział przebiegów pod tym silnikiem
  w oknie „po"), `--data-quality`, `--json`, `--md`. Wspólny czytnik `telemetry-rollup-reader.mjs` zastąpił pętlę w
  `flow-live.loadBaseline`. Eval `telemetry-report` (10 przypadków, pre-commit). Na danych z października `--data-quality`
  pokazuje: 78% przebiegów bez `engine`, 43% kroków bez kosztu, 53% odstępstw w `other`.
- Taksonomia przyczyn i wynik PAUSE (TASK-OBS-013, ADR 0012 aneks, ADR 0015 D5): `cause` dostaje `pattern_card` i `plan`;
  `defaultCategory(trigger, ruleRef)` mapuje `ANZ-LAYER-*` → `plan`, `ANZ-PATTERN-*` → `pattern_card`.
  `report-deviation --trigger agent_note` bez `--category` to błąd użycia (exit 1); opis `deviation_note` w szablonie Workflow
  i `commands/orchestrate.md` mówią, jak kategorię wybrać. `/analyze` z `analyze.exit: PAUSE` zamyka przebieg `--outcome ok`
  (było `halted`: 61 z 62 przebiegów). Nowy `scripts/inbox-reclassify-other.mjs` (podgląd; zapis tylko z `--apply`) i dwie
  reguły treści w `validate-commands.js`; eval `telemetry-events` +3 przypadki (14). **Skrzynka: udział `other` 209/244 (85,7%) →
  34/244 (13,9%)** po reklasyfikacji 175 rekordów w dwóch falach zatwierdzonych przez człowieka (86: `karta`/`card` → `pattern_card`,
  `layers_scope`/`dirs` → `plan`; 89: `verifier`, `typecheck`, `test`, `lint`, `infra`, `budget`, `config`, `scope`, w tym 18 z kategorią
  poprawioną ręcznie wbrew propozycji słów kluczowych). Zmienia się wyłącznie linia `category:` (81 rekordów dostało ją, bo dotąd
  jechały na domyślnej z triggera).
- Fałszywe GO i koszt taska w rollupie (TASK-OBS-012, ADR 0012 aneks): pierwszy krok bramki końcowej niesie `step.blamed`
  / `step.unblamed` (warstwy wskazane przez naruszenia; `final-gate-blame.mjs`, kolektor + `telemetry-backfill-gate-blame.mjs`
  uzupełniający 216 przebiegów z `wf_*.json`). Rollup: `verdicts`/`agents` per rola (`goJudged`, `falseGo`, `noGoJudged`,
  `falseNoGo`), `finalGate` per proces i lokalny blok `tasks` (przebiegi, koszt do pierwszego GO, czas); eksport wysyła
  z `tasks` tylko rozkłady, `findLeaks` łapie też `BOT-005a`, `TS-SIM-002A`, `DS009-…`. Eval `telemetry-gate-blame`, rozszerzone
  `telemetry-rollups` i `telemetry-export`. **Październik: 51 fałszywych GO na 406 ocenionych (12,6%, dolna granica)**;
  per agent (≥ 20 ocenionych): `code-quality-verifier` 17,1% (28/164), `refine-quality-verifier` 13,0% (3/23),
  `bot-code-verifier` 8,6% (3/35), `aig-code-verifier` 6,6% (7/106), `scope-invariants-verifier` 3,7% (1/27).
  Dla 124 naruszeń bramki nie da się wskazać warstwy (dokumenty, luki, przyczyna maszynowa), więc to nie jest pełna miara.
- Blokady z hooków w telemetrii (TASK-OBS-011, ADR 0012 aneks): nowy `process: hook`; 9 hooków blokujących
  (`block-root-grep`, `block-subagent-commit`, `pre-workflow-lint`, `check-delegation`, `check-patterns-read`,
  `check-subagent-pattern-reads`, `check-approval-before-impl`, `check-security-considerations`,
  `productivity-watchdog`) zapisuje przez `hooks/lib/hook-telemetry.js` jedno `step.end` z `outcome: halted`
  i `step.role` = `<hook>:<reguła>` WYŁĄCZNIE przy zablokowaniu (bez treści komendy, ścieżek i `session_id`).
  Zapis best-effort, ok. 5 ms tylko przy blokadzie, `HOOK_TELEMETRY=off` go wyłącza. Eval `hook-telemetry` (16 przypadków, wszystkie 9 hooków).
  Trzy hooki dostały stałe id reguł: `root-grep`, `subagent-git`, `task-pre-analysis` / `security-suggest` / `security-section-empty`.

- ADR 0015 i EP-OBSERVABILITY-002 (2026-10-22): przegląd telemetrii pokazał, że metryki kończą się na werdykcie bramki (samoocena), nie widzą skilli, komend ani agentów poza Workflow, nie sprawdzają, czy reguły ORC coś poprawiły, a 97 ze 106 kategorii w skrzynce to `other`. Kierunek: `kind: outcome.human` (decyzja człowieka po przebiegu, przetrwanie diffu, revert), `process: tool` i plan w każdej komendzie, blok `tasks` i fałszywe GO w rollupie, `telemetry-report.mjs` z deltą per wersja silnika, `claim` w regułach i skrzynce z automatycznym `resolved`. Sześć tasków TASK-OBS-012…017; dwa dotykające `hooks/` czekają na odmrożenie.

- Triage skrzynki zgłoszeń 2026-10-22…24, silnik `/orchestrate` ORC-120…132: `build` w `checks.finalGate` liczy się jak `typecheck` (ORC-120);
  `final_checks` z analizy, lint w sondzie po naprawie i uczciwy prompt rundy 2 (ORC-121); karta z tagami spoza uruchamianych warstw nie
  wchodzi do doboru (ORC-122); NO_GO wymuszone lukami podaje stan sondy, a po naprawie luki są oceniane od nowa (ORC-123); pliki brudne
  przed startem są chronione w promptach i sondach, po zniszczeniu pracy właściciela w ai-os-bot BOT-041 (ORC-124); ścieżka względna
  i bezwzględna to jeden plik (ORC-125); `deferred` jest dowodem dla GO_WITH_GAPS (ORC-126); plik wspólny jednostek nie jest luką jednostki
  (ORC-127); `prepare` ostrzega o plikach z decyzji bez właściciela (ORC-128), o tasku bez uruchamianych warstw (ORC-129) i o brudnym
  drzewie z pracą taska, z obejściem `--overrides {"dirtyAtStart": []}` (ORC-130); runda naprawcza obejmuje warstwy z `layers_done`,
  a pomiar przyrostu testów 0 po dodatnim nie daje fałszywego haltu (ORC-131); `prepare` zapisuje baseline brudnych plików w
  `.claude/run-state/` i przy wznowieniu na tym samym HEAD liczy jako cudze tylko pliki sprzed pierwszego uruchomienia (ORC-132); „brak zmian” przy pracy warstwy już w drzewie idzie do `verify-existing` z sondą (ORC-133); awaria sondy z braku pamięci kończy warstwę jako `machine`, nie jako czerwień kodu (ORC-134). Reguły analizy: katalog nowych testów w `include` runnera (ANL-044) i właściciel pliku rejestrującego nowy element w planie (ANL-045). Karta CV5 dopuszcza kolokację testów obok handlera, blok `python` nie ciągnie karty piramidy testów TypeScript.
- Karty wzorców: DS5/CH10 (asynchroniczne `policy.check`), WT4/WT5/WS2/N5 (refine-spa), RP8 (nieznany event zgłaszany przez logger
  repozytorium); kolekcje RAG `code_iam` i `code_marketing_hub`; `**/.claude/run-state/` w szablonie `.gitignore`. Agenci:
  `content-reviewer` maxTurns 60, `security-e2e-verifier` bez `Task(Explore)`, `state-reader` maxTurns 14 (limit z frontmattera wygrywał
  z budżetem 12 wywołań slotu `decision-gate`). `index-decisions.mjs` wyprowadza `needs_scope_check` z odwrotnego `supersedes`
  (juz-ide-api-2: BDR-090 → BDR-083/089 bez `superseded_by` w uchylanych wpisach).

- `governance` (juz-ide-api-2, 2026-10-21): (1) globy kanonu zostają globami — `runtime.yml → params_globs`, `scripts/resolve-params.mjs` rozwija je w chwili startu `/analyze` (ANL-042), `verify-project-setup` ostrzega o rozjeździe wzorzec ↔ lista, wspólny kod w `scripts/lib/path-globs.mjs`; (2) kanon dociera do `/orchestrate` — `orchestrate-prepare` składa `canon` (`canon_inject` + `strategy_ref`/`canon_ref` taska), bramka końcowa dostaje sekcję „Zgodność z kanonem” z VETO za naruszenie inwariantu (ORC-119, `security-e2e-verifier`); (3) `strategy_fit_when_extra` i `strategy_fit_always_for` zamiast lokalnego bloku z drugim stage'em (ANL-043). Eval: `tests/flow-evals/governance/run.js`.
- ORC-118: sonda warstwy z samymi komendami dosłownymi (`make typecheck`) nie dostaje już linii „skryptu nie ma w package.json → skipped"; `skipped` znaczy tylko brak samej komendy, niezerowy EXIT istniejącej to `fail` (aegis-flow TS-004, ślepa sonda w warstwie `api`).
- `orchestrate-prepare`: ostrzeżenie, gdy `dirs` jednostki lub `layers_scope` zawiera samą nazwę pliku, której nie ma w korzeniu repo (ai-gateway TS-AIG-102: `CLAUDE-LOCAL.md` leży w `.claude/config/`); ANL-038 przypomina, że `dirs` to ścieżki od korzenia.
- ANL-008: ostrzeżenie, że podkatalogi `.claude/knowledge/patterns/` bywają symlinkami (`grep -r`/`find` bez `-L` ich nie widzą) — aegis-flow TS-004 uznał istniejący `python/testing-pattern.md` za brakujący.

- `zod-schema-validation-pattern` (+ `_summary`): wyjątek od `.strict()` (ZOD1/N3) dla schematów odpowiedzi cudzych API (adaptery, klienci dostawców); ANL-038: plik wspólny kilku jednostek (barrel, rejestr) do `dirs` każdej z nich (framework-polityczny FP-005).

- ORC-117: `GO` z `unverified_scope` i `minor_findings` robi jedno przejście naprawcze implementera przed `reverify` (wcześniej drobne ustalenia przepadały, a ta sama linia wracała jako HIGH i wyczerpywała próby warstwy; aegis-flow TS-017). Nowa funkcja `minorPassBeforeReverify` + test.

- Domyślny adres embeddera (CT 301) w `knowledge-retriever` (`src/embedder.ts`, `docker-compose.yml`): `:8301` → `:8000`. Port 8301 nie nasłuchuje (API ML Inference działa na 8000), więc reseed i `retrieve_patterns` dostawały ECONNREFUSED.

- `blocks/nextjs.yml`: sloty `tech-analysis` (nextjs-architecture-expert) i `impl-analysis` (nextjs-quality-verifier) dostały `when:` (słownictwo UI/routingu/Next.js) — bez niego szły przy każdym zadaniu, także backendowym (framework-polityczny FP-005, `DEV-anz-layer-mismatch`).
- `reseed-patterns.sh` kończy się błędem i nie zapisuje stanu świeżości, gdy seed się nie powiódł (embedder niedostępny):
  wcześniej `rag-freshness --record` maskował rozjazd RAG po nieudanym reseedzie.
- Ostrzeżenie, gdy sonda bramki końcowej pomija zadeklarowaną kontrolę (ORC-116), np. `typecheck: skipped`.
- Bramka przyrostu testów (ORC-035) pomija `reverify` (ORC-115): pętla po GO z `unverified_scope` nie kończy już warstwy
  ESCALATE przez zerowy przyrost na nietkniętym drzewie.
- Skrypt silnika emitowany do scratchpada sesji, nie do `.claude/run-state/` (ORC-114): `eslint .` w korzeniu projektu nie
  linituje go już jako kodu projektu.
- `create_when` warstw opcjonalnych jest regexem (ORC-113): `astro-content` i `library-layers` przepisane (wcześniej zdania, więc
  warstwy nigdy nie wchodziły), README bloków i schemat opisują kontrakt, `orchestrate-prepare` ostrzega przed opisem prozą.
- Własność pliku między jednostkami jednej warstwy (ORC-112): przy remisie na grubym `dirs` rozstrzyga `scope.dirs`, więc
  odroczenie czerwonego typechecku (ORC-082) działa też dla `units[]` bez ręcznych `--overrides`.
- `units[].repair: true` w analizie (ORC-111): jednostka testowa, która tylko dopasowuje istniejące testy, nie podlega
  bramce przyrostu bloków (ORC-035). Wcześniej jedynym obejściem było `tests:false` w `--overrides`.
- Sonda typecheck rozpoznaje `dart analyze`/`flutter analyze` (ORC-110): czerwień Fluttera dostaje ścieżki i da się ją
  odroczyć do późniejszej warstwy. Blok `astro-content`: warstwa `site` obejmuje `src/i18n/`, `src/content-system/`,
  `src/types/`, `src/scripts/`, `src/screens/`.
- Ślad oceny zalążków wpisów (ADR 0013, D8): `blog-seed-emit.mjs --check --run-id` zapisuje `checked` (projekt
  włączony) albo `skipped:<disabled|embargo|config>`; nowe `--no-topic --run-id` zapisuje `skipped:no_topic` bez
  pliku. `--check` bez `--run-id` (ręczny audyt) nic nie zapisuje. `/analyze` i `/orchestrate` wołają oba warianty,
  więc lejek odróżnia „oceniono, brak tematu" od „krok pominięty". Agregat liczy `skipped:<powód>` pod blogiem
  `unknown`. Eval `blog-seeds` (18 przypadków).
- Bramki pre-commit w telemetrii (TASK-OBS-010, ADR 0012 aneks): nowy `process: pre-commit`; `pre-commit-guards.mjs`
  zapisuje `run.start` + `step.end` per bramka + `run.end` (`step.role` = stała nazwa bramki, `outcome` ok/failed,
  `m.durationMs`), bez nazw plików z etykiet dynamicznych. Zapis best-effort po zebraniu wyników, ok. 2 ms.
  `appendEventsDedup` ma opcję `dedup: false` (bez skanu historii). Logika w `lib/precommit-telemetry.mjs`, eval `pre-commit-telemetry`.
- Audyt floty i setup w telemetrii (TASK-OBS-004, ADR 0012 krok 4): `audit-projects` zapisuje `run.start`/`run.end`
  oraz `step.end` per projekt × kontrola, także OK (`step.role` = nazwa kontroli, `failed` + `cause: config` przy
  BŁĘDZIE lub OSTRZEŻENIU); nie przy `--gate`, wyłączane `--no-telemetry`. `setup-project.sh` zgłasza do skrzynki
  (`setup_drift`, `--once-per-project`) overlay bez katalogu, nieudaną materializację i ręcznie edytowany README
  wzorców. Założone TASK-OBS-010 (bramki pre-commit) i TASK-OBS-011 (blokady z hooków).
- `scripts/telemetry-export.mjs` + `lib/telemetry-export.mjs` (TASK-OBS-008): paczka agregatów dla serwera zespołu. Biała lista pól (bez `taskRef`, `runId`, ścieżek, sygnatur odstępstw), skan wycieków, stabilne `id` per projekt|dzień|host do upsertu po stronie odbiorcy. Wysyłki jeszcze nie ma. Eval `telemetry-export`.
- `scripts/flow-top.mjs` (TASK-OBS-008): przebieg Workflow na żywo w terminalu: pasek planu N/M (plan z `telemetryPlan` w skrypcie, więc działa też bez wyniku końcowego), wiersz per jednostka z NO-GO naprawione/otwarte, bieżący agent, koszt i porównanie udziału napraw ze średnią z rollupów. Logika w `scripts/lib/flow-live.mjs` (te same konwertery co agregaty), eval `flow-top`.
- Hook `workflow-metrics-stop` (zdarzenie Stop): domyka zbiór metryk Workflow po zakończeniu przebiegu w tle. `postrun` odpalał się przy starcie i pomijał przebiegi w toku (ai-gateway 2026-10-15: 45 kroków, ok. $11 poza metrykami). Instrukcja: `docs/TELEMETRY-HOWTO.md`.
- Next.js: 5 nowych wzorców z kartami reguł, zweryfikowane z nextjs.org/docs 16.4 (2026-10-12):
  `auth-boundaries` (DAL jako granica, `proxy.ts` tylko filtr wstępny, autoryzacja w akcji i
  handlerze, DTO), `route-handlers` (Route Handler vs Server Action, webhooki z HMAC,
  `revalidateTag(tag, profile)`), `env-secrets` (`NEXT_PUBLIC_` zamrożone w buildzie, jeden
  zwalidowany moduł `server-only`), `security-headers-csp` (CSP statyczny vs nonce w `proxy.ts`,
  koszt: wszystkie strony dynamiczne, brak PPR), `observability` (`instrumentation.ts`,
  `onRequestError` z redakcją cookie/authorization/query). Karty `_summary.md` dla wszystkich
  12 wzorców `nextjs/` (wcześniej żaden nie miał karty, więc nie wchodził do iniekcji w zwartej formie).
- `blocks/nextjs.yml`: wyzwalacze dla nowych wzorców. Dopasowanie słów to podciąg
  (`orchestrate-prepare.mjs`), więc użyto fraz wielowyrazowych (`environment variable`,
  `security header`) zamiast gołych `env`/`header`.
- Higiena raportowania (TASK-OBS-007, ADR 0011 B1/B4/B5): pre-commit wypisuje zgłoszenia skrzynki
  bez ruchu (`promoted` > 7 dni, `proposed` > 14 dni; ruch = najnowsze z `last_seen`/`reopened_at`/
  `first_seen`; nigdy nie blokuje); `audit-projects` raportuje jako INFO agentów, kategorie wzorców
  i skille obecne w `.claude/`, a niewnoszone przez kompozycję (`surplusIssues`);
  `telemetry-freshness` pilnuje `~/.claude/metrics/audit-daily.log` (ostatni dzień roboczy 07:30 + 2 h
  zapasu); `scripts/cron/audit-daily.sh` sam szuka node (PATH, potem najnowszy z nvm) zamiast zaszytej
  `v24.14.1`. Eval `reporting-hygiene`. Wpis crona do podmiany ręcznie — patrz nagłówek skryptu.
- Plan przebiegu i wersja silnika w `run.start` (TASK-OBS-006, ADR 0012): `orchestrate-prepare`
  emituje `telemetryPlan` (warstwy × implementer/verifier + bramka) i `engine` (hash commitu
  claude-patterns), skrypt zwraca je w wyniku, collector dopina do `run.start`; `telemetry-emit
  run-start` też dopisuje `engine`. Schemat: opcjonalne pole `engine`. Agregat dzienny:
  `engines.<hash>.<proces>` tylko dla przebiegów z `engine`. Cena `claude-haiku-5-5` w
  `~/.claude/metrics/prices.json` (poza repo, stawki do 100k tokenów promptu).
- Agregaty dzienne telemetrii i indeks skrzynki (TASK-OBS-005, ADR 0012 krok 5):
  `scripts/telemetry-aggregate.mjs` zapisuje `telemetry/rollups/<projekt>/<dzień>.<host>.json`
  (liczniki per proces × rola × wynik × przyczyna, p50/p90 czasu, koszt, first-pass yield, udział
  i skuteczność napraw, `run.end` per wynik, gęstość odstępstw; bez `taskRef`, `runId`, ścieżek).
  `scripts/generate-inbox-index.mjs` generuje `docs/tasks/_inbox/index.json` ze znacznikiem
  GENERATED; `--check` w pre-commit odpala się, gdy commit rusza skrzynkę. Czytnik nagłówków
  skrzynki wyniesiony do `scripts/lib/inbox.mjs` (wspólny z `report-deviation`). Eval
  `tests/flow-evals/telemetry-rollups/` (13 przypadków), wpis cron `45 7 * * 1-5` po audycie.
- Metryki `/analyze` (TASK-OBS-003, ADR 0012 krok 3): przebieg analizy zostawia zdarzenia v1
  (`run.start` z planem, `step.end` per agent panelu, `run.end`). Dwa nowe hooki —
  `telemetry-agent-start` (PostToolUse(Agent): agent → slot z markera `[slot:<id>]`) i
  `telemetry-agent-stop` (SubagentStop: wynik z transkryptu, błąd API → `failed`/`infra`, pusta
  odpowiedź → `died`/`silent`). Stan w `telemetry/sessions/` (poza gitem, plik na agenta),
  `telemetry-emit run-start/run-end` otwiera i zamyka przebieg (`skipped` dla pominiętych
  slotów, osierocone przebiegi zamyka kolejny `run-start`), reguła ANL-041 w `commands/analyze.md`.
  Test na żywym Claude wykrył, że SubagentStop bywa szybszy niż PostToolUse — obsłużone.
  Hooki są w `hooks/hooks.json`, do `~/.claude/settings.json` wpina je `sync-global-hooks --apply`.
  `transcript-usage.js` zwraca teraz też `toolCalls`, `apiError`, `firstTs/lastTs`, a model
  `<synthetic>` nie jest już liczony jako model kroku.
- Two global blocks, `refine-spa` (framework axis) and `monorepo-layers` (architecture
  axis, requires `ddd/core`), promoted from a local draft in `marketing-hub`
  (`.claude/blocks/web.yml` + `layers-monorepo.yml`, TS-MH-002, 2026-09-15) — step zero
  before `grant-flow` adopts a Refine admin panel (wdrozenie/POSTEP.md "Faza 4",
  2026-09-27). `refine-spa` overlays the already-global `agents/stacks/refine-spa/`
  (`refine-implementer`, `refine-quality-verifier`) and adds 4 patterns in
  `patterns/refine-spa/` (security invariants, structure, providers, testing —
  `⚠ project-specific: marketing-hub`, the only real consumer so far). `monorepo-layers`
  brings `orchestrate.layers` for a pnpm `apps/api`+`apps/web`+`packages/contracts`
  monorepo (domain→application→infrastructure→web optional→testing), with the `web`
  layer VETO'd by `refine-quality-verifier`. Deliberately kept as a **hard requirement**
  on the apps/api+apps/web shape rather than parameterized — `grant-flow` today is a flat
  single package, and generalizing the block's `checks:` (which assume named pnpm
  workspace packages) for a structure with zero validated real adopters would be
  guesswork; full rationale in `blocks/monorepo-layers.yml`'s header comment. Whether/how
  `grant-flow` restructures into this shape is left to its own session.
- Faza 5B of the juz-ide design system rollout — 4 skills, 2 agents, 3 commands in the
  `design-system` block, plus a documented exception to the "no Flutter here" convention
  for cross-stack audit/governance tooling (`blocks/design-system.yml` comment updated):
  `flutter-theme` (Flutter equivalent of `design-tokens`; documents what
  `juz_ide_tokens`/`generate-dart.ts` generates — `ColorScheme.fromSeed`, `TextTheme`,
  `JuzIdeTokens` `ThemeExtension` — and what it doesn't, deferring to
  `patterns/flutter/design-token-pattern.md` for animation/shadow/icon tokens),
  `token-change` (`/token-bump <patch|minor|major>` — 9-step procedure + the
  patch/minor/major decision table, dist-tag channels, deprecation lifecycle),
  `design-audit` (`/design-audit [repo…]` — dispatches `pattern-auditor` + `token-drift`
  per repo, decides when a mechanical migration PR is safe vs. report-only),
  `canvas-backup` (`/canvas-backup <url>` — backs up a Claude Design canvas's source
  files + rendered PNGs to `design-archive/<date>/`, with a
  `scripts/render-artboards.mjs` Playwright renderer); agents `pattern-auditor`
  (screens outside `ui-patterns`, duplicated components, missing edge states) and
  `token-drift` (token literals, deprecated-token usage, `@juz-ide/tokens`/
  `juz_ide_tokens` version skew across repos) in `agents/stacks/design-system/`.
- Block `design-system` (axis `ui`, ADR 0010) for the juz-ide design system — replaces
  the `claude-plugins` plugin from the rollout plan (ADR 0001 rejects plugins). Adds the
  skill category `skills/design-system/`: `design-tokens` (full token list generated from
  the `design-system` repo by `scripts/generate-reference.mjs`, never hand-copied),
  `ui-patterns` (screen patterns approved by the user on 2026-09-26), `screen-build`,
  `visual-check` (Playwright capture script, light/dark × desktop/mobile) and
  `new-screen` with its `/new-screen` command wrapper; agent
  `agents/stacks/design-system/ui-reviewer.md` (read-only screenshot review); hook
  `hooks/check-ui-tokens.js`, which runs the project's ESLint plus design rules on a
  saved `.ts`/`.tsx` and reports through `additionalContext` JSON on stdout.
- New axis value `ui` in `schemas/block.schema.json`. The schema no longer claims that two
  blocks on one axis conflict — the materializer never enforced that (ADR 0010).

### Changed
- Agent `backend-technology-expert` (TASK-PANEL-NODE-ADVISOR-001): nie niesie już stacku jednego
  projektu (NestJS, BullMQ, Redis, PostGIS, `@vytches/ddd`, „rynek polski", stałe wagi kryteriów).
  Krok 0 ustala kontekst z `runtime.yml`, `CLAUDE.md` i ADR-ów; raport zaczyna się sekcją
  `## Założenia`; wybór technologii zaczyna się od tego, co stack już uruchamia; wagi pochodzą
  z projektu albo ranking jest jakościowy; walidacja biznesowa tylko przy istniejącym kontekście
  biznesowym. Frontmatter poza `description` i format raportu bez zmian; diff `runtime.yml`
  w 21 projektach pusty. Sekcja Memory discipline wyjęta z szablonu ADR, w którym tkwiła przez pomyłkę.
- `scripts/index-decisions.mjs`: parser statusu ADR czyta `**Status:** x`, `- **Status:** x`,
  `> … · **Status:** x` i `- Status: **Accepted**` oraz polskie formy rodzaju nijakiego i męskiego
  (`zaakceptowane`, `proponowane`, `przyjęte`…). Wcześniej 8 projektów miało nieczytelne statusy, a w
  framework-polityczny i grant-flow, które mają `decision-gate`, ADR-y traktowano jako aktywne bez sprawdzenia.
- `scripts/generate-claude-md.sh`: domyślne `/orchestrate`, `/scaffold`, `/progress` w tabeli
  Entry Points, gdy `project.yml` nie ustawia `entry_points.*` (13 projektów miało puste komórki).
- Next.js, wzorce istniejące (sprawdzone z nextjs.org/docs 16.4): `auth-pattern` to teraz WARIANT
  z ręczną sesją i wchodzi tylko na `jwt/jose/bcrypt/…`, nie na każde `auth/login` (dokumentacja
  zaleca bibliotekę, a wzorzec uczył projekty na Better Auth własnego JWT); domyślnie wchodzi
  `auth-boundaries`. Przykłady bez Prismy (`db.x.findMany` → funkcje DAL `server-only`).
  `forms-actions`: `route.ts` nadal właściwy dla webhooków i klientów zewnętrznych, nie tylko
  „Server Actions zamiast API". `testing`: usunięto nieistniejące `next/vitest`/`nextVitest()`;
  Vitest nie obsługuje async Server Components (E2E). `data-fetching`: `force-cache` to jawny
  opt-in cache'ujący także żądania z `cookie`/`authorization`, a nie „no-op". Uzupełniono
  `Layer`/`Status`/✅❌ w 7 plikach (baseline lintu 37 → 30).
- `/orchestrate` ORC-104: luka `unverified_scope` należąca do bardziej specyficznej jednostki (np. specyfikacje w `queues/__tests__/` przy jednostce z `queues/`) nie jest już liczona jako luka warstwy nadrzędnej; polecenie sondy startuje z korzenia repo niezależnie od cwd agenta; `layers_done` zapisujemy także po zatrzymaniu przebiegu. Z juz-ide-api-1 TS-AUTH-CAPABILITIES-INIT-001.
- `/orchestrate` ORC-103: runda naprawcza po bramce końcowej porównuje odcisk drzewa przed i po (naprawa bez zmiany plików = ostrzeżenie, bez ponownej bramki); sonda uruchamia padające pliki testowe raz osobno i łagodzi niestabilne testy z ostrzeżeniem; BLOCKED_BY_PRIOR nazywa wcześniejszą warstwę-właściciela i podpowiada `layers_done`. Z zgłoszeń marketing-hub TS-MH-007, grant-flow TS-PROJ-COMPANY-001, ai-gateway TS-AIG-073.
- `/orchestrate` ORC-102: frontmatter analizy, który nie parsuje się jako YAML, zatrzymuje `prepare` (exit 2) zamiast po cichu gubić `units[]`, `decisions[]`, `layers_scope` i `minor_fixes`; hook `check-human-voice` ostrzega o tym przy zapisie analizy. Wykryte: 101 z 926 analiz we flocie miało taki frontmatter (ai-gateway TS-AIG-084).
- `/orchestrate` ORC-100/ORC-101: warstwa zamykana z tymi samymi lukami po powtórnej weryfikacji kończy jako GO_WITH_GAPS bez pozostałych prób (ORC-100); drobne poprawki z analizy leżące poza zakresem każdej warstwy (dokumentacja, KANBAN, karty) wykonuje jedno przejście ostatniego implementera przed bramką końcową zamiast pytania „ja czy ty?” (`report.docFixes`, ORC-101).
- `/orchestrate` ORC-099: czerwone testy, których wszystkie padające pliki należą do późniejszych warstw, są odraczane (`tests: deferred`) jak typecheck w ORC-082; sonda zwraca `testFailFiles` i `testFilesFailed`, a niepełna lista nie odracza (ai-gateway AIG-082).
- `/orchestrate` ORC-098b: wpis `dirs` będący plikiem ma właściciela (dokładne dopasowanie, najwyższa ranga), a remis samych późniejszych warstw odracza czerwony typecheck (ai-os-bot BOT-025, ai-gateway AIG-068). `scripts/report-deviation.mjs --list` pomija uszkodzony frontmatter z ostrzeżeniem zamiast się wywracać.
- `/orchestrate` ORC-098: bramka końcowa nie kończy się już NO_GO z samego `unverified_scope`. Silnik uruchamia `final_gate.checks` własną sondą i oddaje wynik bramce jako fakty; GO z lukami + zero naruszeń + zielona sonda = przebieg kończy się „staged, not committed” z lukami w raporcie (`report.gaps`, warstwa `final-gate`). Brak, ślepa lub czerwona sonda nadal daje NO_GO. Evale: `final-gate-gaps-acceptable-…`, `final-gate-prompt-passes-probe-facts-…`.
- `skills/design-system/ui-patterns` — wzorzec „Lista” wskazuje klocki `@juz-ide/react-ui` ≥ 0.6.0
  (`PageHeader`, `ListFilters`, `ListState`, `StatusPill`, `listPagination`), z regułą „filtry poza `ListState`”
  i zakazem filtra bez parametru w API przy stronicowaniu po stronie serwera; „Znane odstępstwa”:
  `UsersAndRolesScreen` (`marketing-hub`) naprawiony 2026-10-03 (chipy ról po stronie serwera; bez
  wyszukiwarki celowo — D11). Źródło: pierwsze realne listy w `grant-flow` (wdrozenie/POSTEP.md, faza 4).
- `pattern-auditor` and `token-drift` (block `design-system`) revised after the first `/design-audit` run on live
  repos (`marketing-hub`, `grant-flow`, `juz-ide-mobile-app`, 2026-10-03), which verified the procedure end to end
  and exposed gaps in the agent definitions: severity mapping and "do przeglądu" / "udokumentowane" sections in
  `pattern-auditor`, screen discovery by router routes, components from `@juz-ide/react-ui` judged by contract,
  infrastructure screens exempt from the 4 edge states, read-only `find`/`grep` fallback without Glob/Grep;
  `token-drift`: where the deprecation list lives, a definition of "magic spacing", caller-supplied latest version,
  `react-ui` version check, dark-mode category N/A for web.
- `ui-patterns` "Znane odstępstwa" rewritten to the 2026-10-03 audit state (shell, 404 and bootstrap error are now
  in both web apps via `@juz-ide/react-ui`).
- `ui-patterns` (block `design-system`) gained the pattern "Powłoka aplikacji" (app shell:
  full-height layout, 216 px sidebar, menu states, content padding 28/32, mobile drawer instead
  of antd `zeroTrigger`, shell header ≠ page header, ban on literal colors/navy in `AppLayout`),
  based on tooling Variant A and the tokens 0.3.0 Layout/Menu roles. Dark shell is marked as
  derived, not chosen in the canvas. Approved by the user 2026-10-02 (wdrozenie/POSTEP.md).
- `skills/finance/` and `skills/legal/` re-synced from upstream after four
  months. Legal picked up 11 renamed upstream folders (licenses unchanged,
  still Apache-2.0); finance gained 7 skills and reference material for most
  existing ones.
- The three `sync-*-skills.sh` scripts now protect files carrying the
  `<!-- LOCAL — not synced from upstream -->` marker, work without `rsync`
  installed, and resolve upstream skills by their `name:` field rather than by
  folder name.
- DDD rules moved out of the global `~/.claude/CLAUDE.md` into the per-project
  CLAUDE.md, emitted only when the composition includes the `ddd/core` block.
- `schemas/hooks.schema.json` corrected — it had the event name and the entry
  `type` swapped, so it rejected every real hooks configuration in the repo.
- `patterns/flutter/design-token-pattern.md` (+ its rule card) and
  `skills/flutter/flutter-brand-motion/SKILL.md` — added a status note: `juz-ide-mobile-app`'s
  Flutter design-token rollout (`wdrozenie` Faza 5, część A, 2026-09-26) now provides
  `juz_ide_tokens` (`JuzIdeTheme`/`JuzIdeTokens`) as the canonical source for color/typography/
  spacing in new code; `LocalHeroDesignTokens`/`AppTypography` remain canonical only for motion,
  shadow/border helpers, icons, and un-migrated `v1_*`/`brutalist_*` widgets. Flags
  `.claude/rules/dart/design-system.md` (DS-007) in `juz-ide-mobile-app`, enforced by the
  `flutter-quality-verifier`/`flutter-ui-verifier` agents, as not yet reconciled with the new
  system — content-only, no rule/tag changes, not yet reseeded.

### Added
- `orchestrate-prepare.mjs --overrides <file.json>` and `--emit-script <path>`:
  overrides merge into the output (unknown key = exit 1), and the emitted script
  embeds the args, passes `workflow-lint` (exit 4 otherwise) and becomes the
  `scriptPath` (ORC-065).
- `patterns_exclude[]` in the analysis artifact drops false keyword hits from
  pattern selection (ANL-038).
- Rule cards for `zod-schema-validation` and `rate-limit-guard`.
- `schemas/block.schema.json` — describes `blocks/*.yml`, derived from the real
  blocks and checked against `BLOCK_KEYS` in `materialize-runtime.mjs`.
- `docs/CONTRIBUTING.md` — the "how to add a …" procedures, moved from CLAUDE.md.

### Changed
- `/orchestrate` implementer and verifier prompts now carry a search budget:
  locating goes to one batched `Explore` (Haiku) call, `Read` only touches
  files being edited (offset/limit above 300 lines), own `Grep` only targeted.
  Metrics to 2026-09-15 put ~90% of implementer cost in cache-read — context
  growing with every turn — and the stack agents already said "delegate
  discovery"; `general-purpose` (libraries, `node`) never heard it. Baseline
  for the comparison (since 2026-08-15, per step): `domain-application-implementer`
  2.2 M cache-read / $0.81, `infrastructure-implementer` 2.1 M / $0.74,
  `general-purpose` 2.8 M / $0.87 — check `workflow-metrics-report.mjs --by agentType`.
- `domain-application-implementer.md` still told the agent to call
  `Task(codebase-explorer)`, an agent that has not existed since 2026-06-27;
  the call failed and the implementer fell back to grepping itself.

- `agents/stacks/refine-spa/` — `refine-implementer` and `refine-quality-verifier`
  (VETO) for Vite + React + Refine + Ant Design panels behind an identity
  gateway. First consumer: marketing-hub (TS-MH-002); linked through a block's
  `overlay.agents: [stacks/refine-spa/]`.
- `layers[].verify` — a layer may name its own verifier; `inner_loop.verify`
  stays the default. Needed the moment one repo holds an API and a web panel:
  the DDD `code-quality-verifier` has nothing to say about a React provider.

### Removed
- `commands/scaffold.md` and `commands/progress.md` (unused). Also removed: their rows in
  `commands/README.md` and `templates/core.md`, the `entry_points.scaffold` / `entry_points.progress`
  keys in `templates/project.yml.example` and `templates/examples/*-project.yml`, and the
  `CMD_SCAFF` / `CMD_PROG` placeholders in `scripts/generate-claude-md.sh`. Counters: 37 → 35
  commands. Projects with a generated `CLAUDE.md` keep the two stale rows until regenerated;
  `project.yml` entries for these keys are now ignored. `pcu` keeps its own project-local
  `progress.md` (not affected).

### Fixed
- `validate-commands.js`: katalogi systemowe w backtickach (`/tmp`, `/etc`, …) nie są już brane za martwe referencje do komend (fałszywy alarm na wpisie ORC-106 w `commands/orchestrate.md`).
- `templates/gitignore-claude.template`: added `.claude/config/installed.yml` (installation
  manifest, local state). `setup-project.sh` step 5c appends it to the project `.gitignore`;
  previously the file showed up as untracked after setup (`_inbox` record closed).
- `blocks/nextjs.yml`: comment recording that two `tech-analysis` stages under `[nextjs, node]`
  are intentional (framework vs backend perspective); no behaviour change (TASK-PANEL-NODE-ADVISOR-001).
- `templates/stacks/python{,-modular,-pipeline,-ml}.md`: the "Agent Ecosystem" table named
  agents that exist nowhere (`python-implementer`, `api-designer`, `security-verifier`,
  `code-quality-verifier`, `codebase-explorer`, `endpoint-scaffolder`, `test-generator`,
  `pipeline-designer`), so every generated Python `CLAUDE.md` advertised a fleet it didn't have.
  Now lists what `agents/stacks/python/` ships plus the `ecc:*` agents `runtime.yml` actually
  uses. Found via aegis-flow; already-generated project `CLAUDE.md` files keep the old table
  until regenerated with `scripts/generate-claude-md.sh`.
- `templates/stacks/flutter.md` (and its symlink `flutter-clean-arch.md`): same defect —
  `state-manager`, `code-quality-verifier`, `ui-verifier`, `widget-scaffolder` etc. don't exist.
  Table now lists the seven `agents/stacks/flutter-clean-arch/` agents with their real roles
  (two VETO verifiers, performance advisory, security final gate).
- `lint:check` temporarily removed from `checks` in `ddd/layers`, `flat-service` and
  grant-flow's local block: the checks added a day earlier ran lint on `domain`/`application`
  for the first time, surfacing real pre-existing debt (277-2463 errors, up to ~5 minutes per
  run) unrelated to any task, which halted every run with ESCALATE_AND_HALT. `typecheck` stays.
  Fixed one real, isolated `import/order` violation in marketing-hub instead of weakening its
  check. See TASK-ORCH-LINT-BASELINE-001 for the per-project re-enable criterion.
- `/orchestrate` could report GO for work nobody checked (marketing-hub
  TS-MH-005, 4 of 4 infrastructure layers). After a red probe the implementer
  could answer "nothing to do here", and the no-op verifier judged that claim
  without seeing the probe result. A red probe now closes the no-op path: the
  layer ends as `BLOCKED_BY_PRIOR` and the run stops for a human decision
  (ORC-062, `workflow-lint` WL17).
- The "code exists" gate, the silent-death diff probe and the test-block counter
  did not see new files (untracked or fully staged), so tasks that only add files
  ended in a false ESCALATE (ai-gateway TS-AIG-015, marketing-hub TS-MH-003/005).
  All three now share one command that lists untracked files one by one and
  compares against `HEAD`. The counter also catches `describe.each(` and
  `it.each(` (ORC-063, WL18).
- The final gate got its file list from layer reports (no-op layers report
  none) and no pattern cards. It now lists files from the working tree relative
  to the run's `baseSha`, receives every card of the run and is told which files
  were already dirty before the run started (ORC-063).
- The final gate lost its regression tests whenever analysis skipped the testing
  layer; on `ddd/layers` it ran no checks at all. Blocks can now declare
  `final_gate.checks`, which always run. `ddd/layers` and `flat-service` declare
  `typecheck, lint:check, test`, and the `ddd/layers` layers got their own
  `checks` (ORC-022).
- `units[]` in the analysis artifact was silently ignored: four planned
  infrastructure passes became one. Prepare now expands each unit into a
  sub-layer `<layer>:<unit>` and rejects malformed entries with exit 2 (ORC-064).
- `orchestrate-prepare.mjs --json` piped into another process was cut at 64 KB:
  `process.exit()` right after `stdout.write` dropped the unflushed buffer, and
  real args are ~140-190 KB. It now sets `process.exitCode` instead.
- `library-layers` declares `final_gate.checks: ["test"]`.
- A test file next to a scoped file (same directory, same name stem) now counts
  as in scope, so narrowing to `x.map.ts` no longer strands `x.adapter.spec.ts`.

- Optional layers never ran. `layerPlan()` read `a.createWhenHits`, but
  `orchestrate-prepare.mjs` never computed it, so every `optional: true` layer
  reported "create_when nie trafił" — including `api-surface` in
  `library-layers`, which has therefore never executed. Prepare now matches
  `create_when` against the same haystack the pattern triggers use.
- `env:` declared by blocks never left `runtime.yml`. `materialize-runtime.mjs`
  merged it correctly, but nothing copied it into `.claude/settings.json`, so
  `ECC_GATEGUARD: off` in `ts-library`, `ddd/core` and `clean-arch` was a
  statement, not a setting — every project on those blocks still ran GateGuard.
  `sync-runtime-hooks.mjs` now syncs `env` the same way it syncs hooks: adds
  missing keys, unions list-valued ones (`ECC_DISABLED_HOOKS`), leaves hand-set
  scalars alone and reports the conflict.
- `ts-library` also disables ECC's `pre:config-protection`. It blocks every edit
  to an existing `eslint.config.*`, which is right for a service and wrong for a
  published library whose lint config is part of the product — `platform`
  (2026-09-13) could not fix the `eslint.config.js` it was scaffolding.
- `setup-project.sh` never copied the PM dashboards into a fresh project: step 5
  creates `project-orchestration/analysis/TEMPLATE.md` first, so step 7 saw the
  directory, said "already exists" and skipped `TEAM-STATE.md`, `KANBAN.md`,
  `tasks/`. It now tests for `TEAM-STATE.md` and copies without overwriting.
- `/orchestrate` escalated on layers the task never touched: three "zero
  changes" attempts on `domain` (or `application`, for infrastructure-only
  work) looked identical to an implementer that did nothing. Two fixes — the
  analysis now declares `layers_skip: [{ id, reason }]` (ANL-036; prepare
  rejects unknown ids and missing reasons), and an implementer may return
  `changed_files: [] + no_changes_reason`, which the layer verifier confirms
  (`verify-noop` → GO without files) or rejects with concrete gaps.
- Decisions D1–Dn reached agent prompts empty when the analysis spelled the
  field `decision` instead of `choice`; `orchestrate-prepare.mjs` now fails
  the gate and names the field to rename.
- `layers_skip` silently dropped partial work: an analysis that skipped
  `application` "for 7 of 8 contexts" got `skip: true` for the whole layer,
  and the one context that mattered — a live data leak fix — would never have
  reached an implementer (juz-ide-api-2, 2026-09-18). New `layers_scope:
  [{ id, dirs, reason }]` narrows a layer instead of dropping it (implementer
  prompt, verifier prompt, probe pathspec and file attribution all follow the
  narrowed `dirs`, single files included); prepare now rejects a skip whose
  reason says "partially" ("wyjątek", "N z M", "tylko dla", …) and a layer
  listed in both fields (ANL-037).
- `templates/project.yml.example` still advertised `entry_points.orchestrate: "/o"`,
  a command that no longer exists; every project scaffolded from it (nest-kit,
  platform, auth, grant-flow) inherited the dead value. Now `/analyze` +
  `/orchestrate`, and the four project.yml files are corrected in place.
- `verify-project-setup.mjs` reported "setup kompletny" for a project whose
  `runtime.yml` had no `orchestrate` section at all (ai-gateway: `node + zod +
  approval-gate`, no architecture-axis block). `/orchestrate` would have fallen
  back to `GENERIC_LAYERS` — one `general-purpose` layer with no verifier and
  no final gate. The verifier now fails on missing `orchestrate.layers` or an
  empty `inner_loop.verify`, and warns on an empty `final_gate.agent`.
  ai-gateway itself now composes `flat-service`.

### Deferred
- The marketing skills sync. Upstream renamed 20 of the 42 skills we vendor;
  applying it needs the routing tables updated in the same change. Rename map
  is recorded in `skills/marketing/UPSTREAM_VERSION`.

## [3.5] — 2026-05-07

### Added

#### Legal System (NEW) — license-fragmented vendoring

Vendored **12 legal skills** from two upstream sources, applying per-skill
license verification because the legal skill ecosystem is heavily AGPL-3.0
(copyleft, would contaminate claude-patterns' MIT model).

**Sources**:
- [evolsb/claude-legal-skill](https://github.com/evolsb/claude-legal-skill) — 1 skill, MIT (contract-review CUAD)
- [lawvable/awesome-legal-skills](https://github.com/lawvable/awesome-legal-skills) — 11 skills filtered to Apache 2.0 (Anthropic + OpenAI authors)

**Not vendored**: 30 skills (25 AGPL-3.0 + 5 Anthropic-proprietary + 1
Manus-proprietary) — cataloged in `skills/legal/EXTERNAL.md` with
per-license install warnings and commercial-use guidance. Users install
these in their own project per their own license decisions.

**New skills folder** (`skills/legal/<skill>/` flat):
- 7 legal-domain skills: `contract-review`, `contract-review-anthropic`,
  `nda-triage-anthropic`, `compliance-anthropic` (GDPR/CCPA),
  `legal-risk-assessment-anthropic`, `canned-responses-anthropic`,
  `meeting-briefing-anthropic`
- 4 office tools (Apache 2.0): `docx/pdf/xlsx-processing-openai`,
  `security-review-openai`
- 1 meta-skill: `skill-creator-openai` (for authoring custom legal skills,
  e.g., Polish KSH or Kodeks Pracy specializations)

**New agent** (`agents/universal/`):
- `legal-strategist.md` — Sonnet coordinator with **jurisdiction-aware
  hedged voice** ("Under [GDPR Art. 6(1)(b)] and recent CNIL guidance,
  the most defensible position appears to be X. Confidence: medium.
  Jurisdiction: EU general; PL-specific UODO interpretation may differ.")
  Refuses to silently fabricate jurisdiction-specific content. Surfaces
  external skills from EXTERNAL.md when vendored coverage is missing.

**New command**: `commands/legal.md` — `/legal <task>`.

**New patterns** (`patterns/legal/`):
- `jurisdiction-aware-disclaimer-pattern.md` — 4-category disclaimer
  system (educational, GDPR/privacy, contract drafting, litigation/dispute)
  with jurisdiction layer. Sister to finance's regulatory-disclaimer.
- `external-skills-catalog-pattern.md` — how to manage license-fragmented
  skill ecosystems: vendor what's compatible, catalog the rest, sync
  script with `--verify-licenses` mode to catch upstream drift.
  Generalizable beyond legal.

**New script**: `scripts/sync-legal-skills.sh` — license-verifying sync.
The `--verify-licenses` flag is **load-bearing** — catches the case
where an upstream skill relicensed from MIT to AGPL (would require
removal from `skills/legal/`).

#### Strategic Consultation Update

`@product-owner` now consults `@legal-strategist` (in addition to
`@marketing-strategist` + `@finance-strategist`) during strategic work
that touches: GDPR, privacy, contracts, NDAs, ToS, IP, employment law,
or compliance. Trigger keywords expanded.

`/pulse`, `/sprint`, `/reprioritize` skills include the legal lens in
their multi-perspective synthesis.

---

## [3.4] — 2026-05-07

### Added

#### Finance System

Vendored 84 finance skills from
[JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills) (MIT)
with plugin-aware structure preserved.

**New skills folder** (`skills/finance/<plugin>/<skill>/`):
- 7 plugins with dependency graph: `core` (3 skills, math/stats foundations,
  required by all) → `wealth-management` (32), `compliance` (16),
  `advisory-practice` (12), `trading-operations` (9), `client-operations` (8),
  `data-integration` (4)
- 29 skills include `scripts/*.py` — runnable numpy/scipy implementations
- Each `SKILL.md` declares `## Layer N` (0-7) for knowledge depth
- `PLUGINS.md` documents the plugin map and dependency graph
- `UPSTREAM_VERSION` records the synced upstream commit + version

**New agent** (`agents/universal/`):
- `finance-strategist.md` — Sonnet coordinator with **data-driven hedged
  voice** ("Based on [evidence], the most viable approach appears to be X.
  Trade-offs: ... Confidence: medium.") rather than paralyzing
  "consult an advisor" deflection. Plugin-aware (enforces dependencies).
  Three access modes: through `@product-owner`, standalone, or via `/finance`.

**New command** (`commands/`):
- `finance.md` — `/finance <task>` entry point.

**New patterns** (`patterns/finance/`):
- `layered-knowledge-pattern.md` — 2-D organization (plugin × layer) for
  large skill collections. Generalizable beyond finance.
- `regulatory-disclaimer-pattern.md` — 6-category contextual disclaimer
  system (educational, general principles, regulatory, investment-specific,
  trading operational, business operations). Replaces boilerplate "this
  is not financial advice" deflections that get tuned out.

**New tests folder** (`tests/finance-evals/`):
- Vendored eval framework: `grade_responses.py` + 2 iterations of
  test responses + `evals.json`

**New script** (`scripts/`):
- `sync-finance-skills.sh` — per-plugin rsync from upstream with
  diff + confirm, preserves local meta files (README.md, PLUGINS.md,
  UPSTREAM_VERSION).

#### Strategic Consultation Integration

`@product-owner` now consults `@marketing-strategist` + `@finance-strategist`
in parallel during **strategic work** (roadmaps, sprint planning, milestones,
pricing analysis, growth questions). Skills `/pulse`, `/sprint`, `/reprioritize`
trigger this consultation automatically.

**Boundary**: code implementation skills (`/orchestrate` impl mode, `/tdd`,
`/scaffold`, `/build-fix`, `/verify`, `/code-review`) explicitly do NOT
consult business strategists. They are summoned only for strategy/analysis,
never for code work.

#### Marketing voice updated to match finance

`@marketing-strategist` voice refreshed to use the same data-driven hedged
format as `@finance-strategist` — replacing "I refuse to invent customer
quotes" framing with **"Based on industry benchmarks and [observed
trend]..." + contextual validation note**.

---

## [3.3] — 2026-05-07

### Added

#### Marketing System

Vendored 41 marketing skills from
[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)
(MIT) and wrapped them in claude-patterns conventions.

**New skills folder** (`skills/marketing/`):
- 41 skills across CRO, copy, SEO, paid, email, growth, strategy, RevOps
- `product-marketing-context` is foundational — runs first per project,
  creates `.agents/product-marketing-context.md` (agenci czytają też
  `docs/business/…` — patrz niżej)
- `UPSTREAM_VERSION` records the synced upstream commit + version

**New agent** (`agents/universal/`):
- `marketing-strategist.md` — Sonnet coordinator. Enforces context gate,
  routes to the right skill, never fabricates positioning facts.

**New command** (`commands/`):
- `marketing.md` — `/marketing <task>` entry point.

**New pattern** (`patterns/marketing/`):
- `product-marketing-context-pattern.md` — architectural rationale for the
  shared positioning document (the marketing equivalent of `BUSINESS_RULES.yaml`).

**New template** (`templates/`):
- `product-marketing-context.md` — copyable scaffold for `.agents/` (lub `docs/business/`).

**New tools folder** (`tools/marketing/`):
- 60 reference CLI scripts + 75+ integration guides + REGISTRY.md
- For analytics, email, ads, CRM, SEO, payments, referrals
- Reference materials only — not executed from claude-patterns

**New script** (`scripts/`):
- `sync-marketing-skills.sh` — pull upstream updates with diff + confirm,
  records version in `UPSTREAM_VERSION`.

**Design principle**: vendoring (full copy) over submodules — keeps the
"everything is here" promise of claude-patterns. Updates are explicit and
auditable via the sync script.

---

## [3.1] — 2026-04-03

### Added

#### Project Management System (NEW)

Added a complete project management system as a reusable pattern:

**New agents** (`agents/universal/`):
- `tech-lead.md` — Technical PM: tracks blocked/stale tasks, debt, dependencies
- `product-owner.md` — Business PM: customer value, mobile UX, milestone advisory

**New skills** (`skills/orchestration/`):
- `pulse/` — Full team sync (both agents + TEAM-STATE.md update)
- `pm-status/` — Quick read of TEAM-STATE.md (~$0, no agent)
- `task-health/` — Deep task audit (broken deps, stale, orphaned)
- `tech-debt/` — Debt analysis + TECH-DEBT.md update
- `sprint/` — Interactive sprint planning

**New pattern** (`patterns/orchestration/`):
- `project-management-system.md` — Complete system docs, setup guide, conventions

**New template** (`templates/project-orchestration/`):
- Ready-to-copy folder: TEAM-STATE.md, KANBAN.md, TECH-DEBT.md, README.md

**New hook** (`hooks/`):
- `pm-task-check.js` — PostToolUse hook: PM briefing when task files change

**Design principle**: `TEAM-STATE.md` is the shared brain — all agents read it
first and write to it after analysis. This creates continuity across long
tmux sessions (days/weeks) without relying on session-start hooks.
