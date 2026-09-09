# Decisions Log — claude-patterns

> Chronologiczny, append-only log **dlaczego** robimy zmiany tak a nie inaczej.
> Dopisuj wpis przy KAŻDEJ istotnej poprawce. Lekki — ADR-y (`docs/adr/`) zostają dla
> dużych decyzji architektonicznych; ten log łapie bieżące „czemu" + dowody + odrzucone opcje.
>
> **Format wpisu:**
> ```
> ## YYYY-MM-DD — Tytuł
> **Zmiana:** co zrobiliśmy
> **Dlaczego:** powód + dowód (liczby/obserwacje)
> **Odrzucone:** alternatywy i czemu nie
> **Status:** done | experimental | reverted | pending
> ```

---

> **Luka 2026-07-05 → 2026-08-12 dopisana wstecznie 2026-09-07** (TASK-KAIZEN-002 K73) —
> log stał 64 dni mimo istotnych zmian w tym oknie. Wpisy niżej są skrótowe, zrekonstruowane
> z commitów i `docs/completed-tasks/`/`project-orchestration/completed-tasks/`, dat nie
> zgadywano — pochodzą z `git log`.

## 2026-09-07 — Broadcast (ADR 0006): RETIRE

**Zmiana:** pilot cross-instance kanału nie przeszedł własnego kryterium go/no-go, bo nie było
czego oceniać: kanał zebrał zero wpisów, a kill-switch `/opt/projects/.claude-swarm/STOP` padł
2026-08-09 na koszcie sesji stand-by, jedenaście dni przed terminem oceny. Przez następny miesiąc
hooki mimo to odpalały się w pięciu satelitach na każdy prompt i każdą edycję, a 47 testów było
utrzymywanych dla zera konsumentów. Usunięto 18 plików (9 modułów `hooks/lib/broadcast/`, 3 hooki,
2 komendy, skill stand-by, eval, szablon manifestu, `docs/BROADCAST.md`) oraz wpięcia
z `settings.local.json` sześciu instancji; kod zostaje w historii gita pod SHA `4d4eac5`.

**Wniosek do zapamiętania:** pilot z hookiem odpalanym globalnie musi mieć wyłącznik sprzężony
z kryterium oceny. Zatrzymanie samego stand-by nie zatrzymało kosztu, tylko zabrało obserwację.

**Status:** retired (K99, `TASK-KAIZEN-002`); ADR 0006 `Status: retired (2026-09-07)`.

## 2026-09-07 — Silnik `/orchestrate` przestaje być prozą (K92–K94)

**Zmiana:** przebieg składa się teraz z deterministycznego kroku przygotowania
(`scripts/orchestrate-prepare.mjs` — bramki wejścia, warstwy, karty reguł, checks, budżety,
zero LLM) i jednego kanonicznego skryptu Workflow (`scripts/workflow/orchestrate.template.mjs`),
zamiast odtwarzania 543 linii prozy w skrypt przy każdym uruchomieniu. `commands/orchestrate.md`
(543→134 l.) i `commands/analyze.md` (290→92 l.) są rejestrami reguł: 60 ORC i 34 ANL, każda
z jawnym mechanizmem albo etykietą „tylko prompt".

**Dlaczego tak:** skrypt ładuje się przez `scriptPath` z K92, a nie jako named workflow —
katalog rejestru named workflows nie istnieje w tym harnessie, a `scriptPath` znosi potrzebę
symlinku w satelitach. Uzasadnienia reguł, z datami, ID przebiegów i kosztami, przeniesione 1:1
do [`docs/decisions/orchestrate-rule-history.md`](decisions/orchestrate-rule-history.md).
Ubocznie: WL6 w `workflow-lint` przestał strzelać w sondę przyrostu wymaganą przez WL15.
Widoczne po drodze: `/analyze` ma 32/34 reguł „tylko prompt" — to teraz jawny dług, nie ukryty.

**Status:** done (K92–K94, `TASK-KAIZEN-002`); OQ8 (`extends` per klucz) → K113.

## 2026-09-07 — `rules/common` zostaje jako JAWNY fork ECC (nie retire, nie `requires_ecc`)

**Zmiana:** `rules/common/` dostaje `UPSTREAM_VERSION` i `scripts/sync-ecc-rules.sh`
(`--diff` / `--check` / `--apply`) z trzema jawnie zadeklarowanymi kategoriami plików:
siedem ŚLEDZONYCH (mają być identyczne z ECC), dwa FORKI z podanym powodem
(`performance.md` — konkretne generacje modeli, po których realnie wybieramy model w
slotach bloków; `development-workflow.md` — Exa MCP zamiast Context7, którego nie ma
w `.mcp.json` żadnego satelity) i jeden LOKALNY (`searching.md`, powstał 2026-09-04
razem z hookiem `block-root-grep`). Pierwszy sync wykonany: `agents.md`,
`coding-style.md`, `testing.md` podciągnięte do wersji ECC. Osobno: `rules/tsx/`
przestał być sierotą — wchodzi przez `overlay.rules` nowego bloku `nextjs`, a
`rules/nestjs-ddd/repository.md` dostał brakujące RP12/N7 (K87, `TASK-KAIZEN-002`).

**Dlaczego tak:** audyt nazwał ten katalog „niejawnym forkiem ECC" i to było
niedoszacowanie — to był fork PRZETERMINOWANY. Cztery pliki są bajt w bajt identyczne,
ale trzy kolejne okazały się ścisłymi PODZBIORAMI nowszego upstreamu (nasze kopie
z 2026-03-29, ECC z 2026-06-29): brakowało KISS/DRY/YAGNI w `coding-style`, sekcji AAA
w `testing`, dwóch wierszy w tabeli agentów. Nikt tego nie zauważył przez pół roku, bo
nic nie porównywało tych plików z niczym.

Wariant „usunąć kopie i wskazać `requires_ecc: rules/common`" odpada z dwóch powodów,
z których każdy wystarcza. Po pierwsze reguły ECC nie ładują się z katalogu wtyczki —
ECC instaluje je własnym `rules/install.sh` do `.claude/rules/`, czyli dokładnie tam,
gdzie 13 satelitów ma symlink `.claude/rules/common` → `claude-patterns/rules/common`;
byłyby dwa instalatory piszące w to samo miejsce. Po drugie usunięcie katalogu zrywa te
symlinki natychmiast we wszystkich projektach naraz (ta sama klasa ryzyka, którą ADR
0009 nazywa warunkiem poprawności cięcia). Fork z wersją i skryptem kosztuje jedno
uruchomienie na kwartał i nie rusza topologii instalacji.

**Odrzucone:** (1) `rules_from_ecc: [common]` jako nowe pole bloku — pole opisujące
zależność, której nic nie egzekwuje, to deklaracja bez egzekwowania, czyli dokładnie
warstwa rozjazdu, którą zamyka `TASK-KAIZEN-002`. (2) Generowanie `rules/nestjs-ddd/*`
z kart reguł (`*_summary.md`) skryptem `generate-rules-from-cards.mjs` — karty i reguły
mają różne adresatów i różny kształt: karta jest tabelą ID↔skutek naruszenia, wklejaną
do prompta implementera i cytowaną rule-by-rule przez verifiera, a plik reguł to
kontrakt ALWAYS/NEVER czytany przez człowieka przed implementacją, z linkami do
wzorca-rodzica i sekcją „Why". Deterministyczna transformacja jednego w drugie
zgubiłaby to, po co ta druga forma istnieje. Zamiast generatora: zamknięta konkretna
luka, którą audyt wskazał palcem (RP12/N7 w `repository.md`). (3) Dopisanie `common/`
do `overlay.rules` siedmiu bloków, żeby „nie było nieprzywołane" — `rules/common`
i tak linkuje `setup-project.sh` bezwarunkowo (`KEEP_RULE_LINKS`), i to jest właściwe
miejsce dla reguł uniwersalnych: nie zależą od składu bloków.

**Status:** done (K87). Do rozważenia osobno: wpięcie `sync-ecc-rules.sh --check`
w pre-commit — dziś nie, bo bramka czytałaby katalog wtyczki spoza repo i padałaby
na maszynie bez ECC.

## 2026-09-07 — ADR 0009: wynik spike'a Fazy 0 i wiążąca lista RETIRE/KEEP

**Zmiana:** werdykt GO ze spike'a ECC (2026-06-28) leżał od czerwca poza repo, w
`/opt/projects/_spike/`, przez co każde podejście do cięcia generyków zaczynało się od
odtwarzania tego samego researchu. [ADR 0009](adr/0009-wynik-spike-fazy-0-i-lista-retire.md)
przenosi go do repo razem z listą wykonawczą: 11 komend, 2 agentów i 8 hooków do retire (każdy
z potwierdzonym odpowiednikiem ECC i listą konsumentów w kodzie), reszta z uzasadnieniem KEEP.

**Dlaczego tak:** trzy pozycje z §8 REFACTOR-ANALYSIS zostały obalone: finance/legal/marketing
to KEEP, `adr`/`blog`/`capture`/`claude-updates` to KEEP, a `rules/nestjs-ddd/` to luka do
napisania, nie retire. Zbieżność nazw nie jest zbieżnością zakresu: `/security-review`,
`/security-check` i `/cost-report` zostają, bo `ecc:security-scan` skanuje konfigurację
harnessu, nie kod aplikacji, a `ecc:cost-report` czyta lokalny plik zamiast Analytics API
organizacji. §8 REFACTOR-ANALYSIS jest od dziś historyczne.

**Status:** accepted (K72, `TASK-KAIZEN-002`); wykonanie cięcia: K96–K98.

## 2026-09-07 — ADR 0007 rozstrzygnięty: manifest instalacji i wykrywanie dryfu

**Zmiana:** `proposed` od 2026-08-02, przez miesiąc D1/D2 były hipotezą, a D4 jedyną wdrożoną
decyzją. Zamknięte jako **accept w zawężeniu** (K66, `TASK-KAIZEN-002`), ze statusem per
decyzja w nagłówku ADR.

**Dlaczego tak:** przez ten miesiąc powstały `materialize-runtime.mjs` (ADR 0008) i
`audit-projects.mjs`, więc pytanie „gdzie to wpiąć" ma tańszą odpowiedź niż „rozbudować
`setup-project.sh`".
- **D1** — manifest `.claude/config/installed.yml` pisze **materializacja**, nie setup.
  Setup odpala się raz; manifest zapisany tylko tam byłby przestarzały od pierwszej
  rematerializacji. Bez `components` (audyt wylicza je na żywo) i bez `setup_script_version`.
- **D2** — raport dryfu mieszka w `audit-projects.mjs`, nie w `setup-project.sh --check`.
  Progi: brak manifestu = OSTRZEŻENIE, rozjazd SHA = INFO, rozjazd MAJOR kontraktu = BŁĄD.
- **D3** — jedna wersja kontraktu (`METADATA.yml`), nie lista per plik; `runtime.yml` ma
  własne `schema_version` tam, gdzie wersjonowanie per plik było potrzebne.

**Odrzucone:** `SETUP-EPOCH` (OQ5) — ręcznie podbijany licznik to ta sama dyscyplina, która
w tym repo zawiodła dwa razy. OQ2 wbrew rekomendacji: nie `/pulse`, tylko dwa pre-commity
(centrala przy zmianie `blocks/**.yml`, satelita przy zmianie `project.yml`/`.claude/blocks/*.yml`).
`/pulse` nie odpalił się ani razu między incydentem „10/10 runtime.yml nieaktualnych"
z 2026-08-12 a jego powtórką z 2026-09-07.

**Ref:** `docs/adr/0007-local-setup-management.md` („Realizacja"), `scripts/materialize-runtime.mjs`,
`scripts/audit-projects.mjs`, `templates/git-hooks/pre-commit-satellite.sh`.

## 2026-09-07 — Audyt repo → TASK-KAIZEN-002 (63 pozycje) + Fala 0 zamknięta (10/10)

**Zmiana:** audyt całego repo (`docs/audits/2026-09-07-repo-audit.md`) połączył siedem
audytów obszarowych z czytaniem silników `/analyze`/`/orchestrate` i ADR-ów; każde
znalezisko P1 zweryfikowane osobną komendą. Wynik: `docs/tasks/TASK-KAIZEN-002.md`, 63
pozycje w 7 falach (K50-K112), numeracja kontynuuje TASK-KAIZEN-001. Fala 0 (K50-K59,
poprawki jednolinijkowe) domknięta tego samego dnia: `agent_type` jako fallback w koszcie
subagentów, wyjątek dla subagentów w `check-approval-before-impl` (`isSubagent()` w
`hooks/lib/utils.js`), błąd składni YAML w `patterns/python/METADATA.yml`, wpięcie
`block-root-grep`/`check-focus-wrapper`, `tech-lead` na Sonnet, placeholdery `<N>` w
`business-rules-auditor`, usunięcie `mcp__zen__*` z 16 agentów, przykład
`nextjs-project.yml`, banner CURRENT DIRECTION w `CLAUDE.md`, rematerializacja
`runtime.yml` w 11 satelitach.

**Dlaczego:** trzy warstwy rozjazdu zastane w repo — deklaracja bez egzekwowania
(`hooks.json` 2/22 realnie wpięte do `settings.json`, `overlay.rules` bez konsumenta,
`sync-runtime-hooks.mjs` zbudowany a nigdzie niewołany), decyzje podjęte a niewykonane
(spike Fazy 0 dał GO 2026-06-28, wynik leży poza repo), ślepa telemetria
(`agent-usage.jsonl` 36460/36461 wierszy `unknown`, metryki workflow martwe od
2026-08-15, eval `library-reference-schema` pada 5/14 bez alarmu).

**Odrzucone:** cięcie generyków (Fala 5) przed naprawą telemetrii (Fala 2) — bez danych
decyzje RETIRE/KEEP byłyby zgadywaniem, nie weryfikacją.

**Status:** in-progress (Fala 0 done, Fala 1 w toku).
**Ref:** `docs/audits/2026-09-07-repo-audit.md` · `docs/tasks/TASK-KAIZEN-002.md`.

---

## 2026-09-04 — Cztery nowe wzorce domenowe + hook `block-root-grep` + reguła `searching.md`

**Zmiana:** nowe wzorce `try-confirm-cancel`, `dto-mapper`, `moderated-edit-buffer`,
`named-policy` (plik + karta + `METADATA.yml` + `README.md`), doszlifowane
`command-handler`/`application-service`/`acl-registry`/`transactional-outbox`. Nowy hook
`hooks/block-root-grep.js` (PreToolUse na `Bash`) + `rules/common/searching.md`: od
Claude Code ≥2.1.259 `grep -r`/`rg`/`git grep` po korzeniu repo wywołuje prompt o zgodę
przez regułę deny `Read(.env)` — nawet w trybie bypassPermissions — więc hook odrzuca taką
komendę z instrukcją (Grep tool albo zawężenie do `src/`). Osobno: `check-focus-wrapper.js`
ostrzega o `GestureDetector` bez `Focus`/`SoftPressable`.

**Dlaczego:** cztery wzorce wyekstrahowane z realnej produkcji, dotąd nieopisane w korpusie;
problem `grep -r` na korzeniu obserwowany bezpośrednio jako blokujący flow (prompt o zgodę
za każdym razem, nawet gdy operator wie, że repo nie ma sekretów w drodze grepa).

**Status:** done.
**Ref:** commity `f9ae7ff`, `1cecef3`.

---

## 2026-08-27 — TASK-KAIZEN-001 zamknięty: 33/33 pozycji

**Zmiana:** kaizen backlog z trzech równoległych audytów (claude-patterns, juz-ide-api-1,
iam) domknięty w całości — fale K01-K49, w tym dokończone K40/K41. Wszystko zestage'owane
w claude-patterns; satelity zostawione bez stage'owania (własna, niezależna praca w gicie).

**Dlaczego:** te same trzy warstwy rozjazdu co w TASK-KAIZEN-002 (deklaracja vs
egzekwowanie, hooki niewpięte, dokumentacja za starą architekturą) — pierwsza runda
sprzątania po niej.

**Status:** done.
**Ref:** `docs/completed-tasks/TASK-KAIZEN-001.md` · commit `219048e`.

---

## 2026-08-18 — TASK-GUARDRAILS-001: pre-commit lokalny + eval retrievalu + dyscyplina promptów agentów

**Zmiana:** cztery strażniki zbudowane 2026-08-17 (`rag-freshness.mjs`,
`generate-pattern-routing.mjs` z obsługą bloków lokalnych, `lint-patterns.mjs --strict` z
baseline, `materialize-runtime.mjs` z hashem obejmującym generator) wpięte w pre-commit
lokalny zamiast wymagać ręcznego uruchamiania. Eval retrievalu rozszerzony o geo + always.
Dyscyplina zmian promptów agentów (changelog wymagany). Spike regresji promptfoo (sekcja 4)
świadomie odłożony — wypalił, nie wpięty do pre-commita.

**Dlaczego:** cztery strażniki istniały, ale każdy wymagał RĘCZNEGO uruchomienia —
dokładnie ten typ dyscypliny, który już raz zawiódł (incydent juz-ide-api-2:
`code-quality-verifier` zawetował brak plików warstwy jeszcze nieuruchomionej).

**Odrzucone:** wpięcie promptfoo do pre-commita w tej sesji — spike nie dał wystarczająco
stabilnego sygnału.

**Status:** done (sekcje 1-3); pending (sekcja 4, promptfoo).
**Ref:** `docs/completed-tasks/TASK-GUARDRAILS-001.md` · commit `fd2353e`.

---

## 2026-08-15 — TASK-OBS-002: metryki workflow per-krok + konformancja z runtime.yml

**Zmiana:** zapis globalny — ile tokenów/$ zużyła każda operacja/krok workflow, ile było
kroków, sukces czy fail i co się stało z danymi przy failu — do
`~/.claude/metrics/workflow-steps.jsonl`; nowy korpus evali regresji w konwencji
TASK-EVAL-001 (bez zmiany sposobu ich uruchamiania).

**Dlaczego:** potrzeba śledzenia regresji/usprawnień (np. czy diff-sonda z `/orchestrate`
§2a′ p.6a faktycznie eliminuje spalone próby) i porównania realnego przebiegu z planem
zapisanym w `runtime.yml`.

**Status:** done w chwili wdrożenia — zapis ustał 2026-08-15T16:30 (ostatni wpis w pliku),
bo hook `workflow-metrics-postrun.js` siedzi w `hooks.json`, którego nikt nie aplikuje do
`settings.json` (ten sam korzeń co A1 w audycie 2026-09-07; naprawa: TASK-KAIZEN-002 K60/K76).
**Ref:** `project-orchestration/completed-tasks/TASK-OBS-002.md` · commit `19eb027`.

---

## 2026-08-12/13 — ADR 0008 wdrożone: kompozycja bloków jedynym torem we wszystkich 10 repo

**Zmiana:** pilot na `juz-ide-api-4` (TASK-BLOCKS-001) przeszedł 2026-08-10; migracja
objęła wszystkie 10 repozytoriów 2026-08-12 (`e72b36e`) — stary tor (`/analyze-ddd`,
`/orchestrate-ddd`, `presets/`, `patterns/_stack-defaults/`, symlinki `preset.yml`)
usunięty tego samego dnia. Materializator przepisany z regexów na prawdziwy parser YAML
(paczka `yaml`, `Document` API zachowuje komentarze `# source:`). Dzień później
(`af4bcd2`, 2026-08-13): tagi taksonomii (`**Tags**`) na 100/100 wzorców + 34 karty reguł,
deduplikacja list wzorców w agentach (184→11 odwołań), nowe bloki `python`/`ml-pipeline`/
`polyglot-store`, `blocks-equivalence-check.mjs` usunięty razem z `presets/`/
`_stack-defaults/`, które porównywał.

**Dlaczego:** `stack_profile` sklejał trzy niezależne mechanizmy (dobór wzorców w
`/orchestrate`, cała maszyneria bramek `/analyze-ddd`+`/orchestrate-ddd`, wybór katalogów
symlinkowanych w `setup-project.sh`) w jedną nierozdzielną etykietę; projekt `../sso`
(NestJS bez DDD, bez Kysely) nie miał poprawnej klasyfikacji w sześciu przewidzianych
profilach.

**Odrzucone:** siódmy monolityczny profil `nestjs` (taktycznie tani, nie odpowiada na
źródłowy problem kombinatoryki framework × architektura × persystencja × walidacja);
pełna kompozycja procesu (skład panelu i kolejność warstw nie mają semantyki unii —
wyznacza je łącznie framework i architektura, nie niezależnie).

**Status:** done.
**Ref:** [ADR 0008](adr/0008-stack-blocks-composition.md) · `docs/completed-tasks/TASK-BLOCKS-001.md` ·
commity `b798443`, `e72b36e`, `af4bcd2`.

---

## 2026-07-05 — Repozytorium zamiast raw DB token (RP12/N7) + kryterium tier audytu eventów (AH11)

**Zmiana:**
- `patterns/infrastructure/repository-pattern_summary.md` — nowa **RP12** (MUST) + **N7** (MUST NOT):
  cron/scheduler/application-service musi wstrzykiwać port repozytorium, NIGDY surowy
  `DATABASE_TOKEN`/`Kysely<Database>` do bezpośrednich zapytań; brakująca metoda na porcie = dodaj
  metodę, nie obejście.
- `hooks/lib/pattern-routing.js` — dodane `FILENAME_RULES` dla `*.cron.ts`/`*.scheduler.ts`/
  `*.job.ts` → `infrastructure/repository-pattern.md` (wcześniej te pliki przechodziły przez
  routing jako `null` — żaden wzorzec nie był auto-wstrzykiwany).
- `patterns/application/audit-handler-pattern_summary.md` — nowa sekcja "Klasyfikacja NOWEGO
  domenowego eventu do audytu" + **AH11**: uogólnione z ADR-0027 (juz-ide-api-1) kryterium
  tier 1/2/3 (PII/security → obowiązkowy; config-dependent → selektywny; techniczny → brak),
  żeby decyzja nie wymagała czytania projektowego ADR, którego inne projekty mogą nie mieć.
  Brak jawnej klasyfikacji = traktuj jak Tier 1 (fail-safe na GDPR).

**Dlaczego:** human review pierwszego live przebiegu `/orchestrate-ddd` (juz-ide-api-1,
TS-SEC-ANTI-SPOOF-003) znalazł `DeviceNoncePurgeCron` z `@Inject(DATABASE_TOKEN)` zamiast portu
repozytorium — sprawdzone: WSZYSTKIE 18 innych cronów/schedulerów w tym repo idą przez
repozytorium/port/command-bus, więc to była luka w regule, nie w implementacji. Przy okazji
review padło pytanie o regułę dla error-mapperów (już istnieje, **DE3**, oznaczona "łamana w ~90%
przypadków") oraz dla audit-logów przy nowych eventach domenowych — okazało się, że
`audit-handler-pattern_summary.md` już referuje ADR-0027 (AH4/N1: "Tier 1 event musi mieć
handler"), ale samo KRYTERIUM tier nigdy nie zostało uogólnione do karty — żyło wyłącznie
w projektowym ADR-0027, niedostępnym dla innych projektów używających tej samej karty.

**Odrzucone:** seedowanie analogicznej reguły dla stacku Python/Neo4j (`rules/python/
patterns-modular.md`, `python-quality-verifier.md`) — już ma równoważny anti-pattern
("Direct DB driver imports outside `core/db/`" — psycopg/neo4j/redis muszą zostać w `db/`),
więc nie ma tu luki do zamknięcia.

**Status:** done.
**Ref:** `patterns/infrastructure/repository-pattern_summary.md` (RP12/N7) ·
`patterns/application/audit-handler-pattern_summary.md` (AH11) · `hooks/lib/pattern-routing.js` ·
`docs/adr/0027-audit-event-selection-strategy.md` (juz-ide-api-1, źródło uogólnienia).

---

## 2026-07-04 — Pierwszy live przebieg /orchestrate-ddd (juz-ide-api-1): full-diff-injection anty-wzorzec → WL6

**Zmiana:** `commands/orchestrate-ddd.md` (Krok 3, pseudokod pętli warstw) + nowa reguła
**WL6** (WARN) w `hooks/workflow-lint.js` + regresyjny test case w
`tests/flow-evals/workflow-lint/run.js`. Do warstwy N wstrzykujemy **listę zmienionych plików**
warstwy N-1 (`git diff --stat`/`--name-only`), NIGDY pełny tekst diffa — implementer sam czyta
świeże pliki przez `Read`.

**Dlaczego:** pierwszy live end-to-end przebieg `/orchestrate-ddd` w juz-ide-api-1
(TS-SEC-ANTI-SPOOF-003, walidacja z watcherem+hookiem zapowiedziana w Filarze 0/2026-07-02) —
Domain layer zaimplementowany i zweryfikowany GO, ale Application layer **2× z rzędu zwrócił
pustkę** (0 plików, różne agentId) mimo poprawnego kodu domeny. Diagnoza z `journal.jsonl`: po
naprawie eksportu diffa (żeby uwzględniał nowe pliki) diff Domain urósł do ~3191 linii i był
wklejany w całości do promptu implementera Application — mimo jawnej instrukcji „to tylko
orientacyjne, przeczytaj pliki sam", zjadał budżet tury na przetwarzanie zamiast pisania kodu.
**Pozytyw:** twarda reguła „po DWÓCH nieudanych próbach wznowienia → STOP" (2026-07-02) zadziałała
dokładnie jak zaprojektowano — zero spinning, czysta eskalacja z konkretną diagnozą, Domain layer
pozostał staged i nienaruszony.

**Odrzucone:** zwiększenie max_attempts/budżetu tury jako obejście — leczyłoby objaw (agent ma
więcej tur na przetworzenie zbędnego tekstu), nie przyczynę (zbędny tekst w ogóle nie powinien
trafiać do promptu).

**Status:** done (fix + test regresyjny 4/4 zielone). Walidacja end-to-end z Filaru 0-2
(2026-07-02) częściowo potwierdzona: watcher/gate/eskalacja działają na żywo; pełne domknięcie
zadania TS-SEC-ANTI-SPOOF-003 (dokończenie warstwy Application) — pending, osobna akcja człowieka.
**Ref:** `commands/orchestrate-ddd.md` Krok 3 · `hooks/workflow-lint.js` WL6 ·
`tests/flow-evals/workflow-lint/run.js` · journal `wf_da74753f-ee1` (juz-ide-api-1).

---

## 2026-07-04 — Częściowy powrót wiringu z Q8: backend-technology-expert do panelu nestjs-ddd

**Zmiana:** `presets/nestjs-ddd.yml::phase_research.panel` + fallback w `commands/analyze-ddd.md` —
dodany nowy etap `tech-analysis-specialist: backend-technology-expert`, OBOK (nie zamiast)
istniejącego `tech-analysis: ecc:architect`.

**Dlaczego:** Q8 (`TASK-RAG-002.analysis.md`, 2026-07-02) cofnęło DWA agenty naraz —
`backend-technology-expert` (zastępujący `ecc:architect`) i `technical-architecture-lead`
(zastępujący `tech-lead` na etapie synthesis) — bo ten drugi ma narzędzie `Task` (ryzyko
zapętlenia, panel wymaga liści bez delegacji). Weryfikacja 2026-07-04: `backend-technology-expert`
NIE ma toola `Task` (Tools: Read, WebFetch, WebSearch, mcp__zen__*) — nie dzieli ryzyka, które
uzasadniało revert. Bezpieczny do wpięcia niezależnie od `technical-architecture-lead`, który
zostaje POZA panelem (wciąż ma Task, wciąż czeka na "naprawę systemu" z Q8).

**Odrzucone:** zastąpienie `ecc:architect` przez `backend-technology-expert` (zamiast dodania
obok) — user wybrał więcej perspektyw (oba równolegle) zamiast zawężenia do jednego głosu.

**Status:** done.
**Ref:** `docs/tasks/TASK-RAG-002.analysis.md` Q8, `presets/nestjs-ddd.yml`, `commands/analyze-ddd.md`.

---

## 2026-07-02 — Restrukturyzacja RAG w 4 filary: observability → regresja → eval+wpięcie → wersjonowanie

**Zmiana:** pełna analiza przez /analyze-ddd (`docs/tasks/TASK-RAG-002.analysis.md`, approved) →
split na 4 taski i wykonanie Filarów 0–2 w jednej sesji:
- **Filar 0 (TASK-OBS-001, commit 8d5c700):** zewnętrzny watcher transkryptów
  (`scripts/workflow-watcher.js` → RUN-STATE.md na żywo) + watchdog produktywności per-kontrakt-etapu
  (`hooks/productivity-watchdog.js`, PreToolUse deny + kill-switch) + reguła no-rerun
  (`resumeFromRunId`). → **ADR 0003**.
- **Filar 1 (TASK-AGENT-CONFORMANCE-001, commit 51ef956):** bramka „kod istnieje" (pusty git diff
  → ESCALATE), verify() sekwencyjnie, werdykty przez `schema` (null → natychmiastowy ESCALATE),
  maxTurns weryfikatora 15→30, usunięte martwe `mcp__zen__*`, reguła całych plików; Rule Card
  spec-policy: **SP3 → SP3a/SP3b** (Business Rule vs Calculation Policy) + **N4** (`@BusinessRule`
  bez realnej delegacji = VETO; dekorator PROJEKTOWY juz-ide-api-1, nie @vytches/ddd).
- **Filar 2 (TASK-RAG-002 zwężony, commit 51ef956):** reseed globalnych kolekcji → **eval OFFLINE
  PRZED wpięciem** na golden-secie 20 zapytań: hit@1=0.55 · **hit@5=0.85** · MRR=0.66 → próg 0.6
  przekroczony → wpięcie `retrieve_patterns`/`retrieve_examples` do `tools:` obu implementerów.
  Harness: `tests/flow-evals/` (hooki 10/10 + retrieval). → **ADR 0004**.
- **Filar 3 (TASK-RAG-003, projekt):** wersjonowanie (pin `.claude/config/knowledge-pins.json`
  W REPO projektu), best_practices przez deterministyczną bramkę AST+git+proweniencja. → **ADR 0005**.

**Dlaczego:** regresja 15min→4h i $120-bez-wartości NIE była problemem RAG (niewpięty) — to
maszyneria egzekwowania + ciche padanie Workflow (TS-SEC-VERIFICATION-LEVELS-002: 4 przebiegi,
~5.2M tokenów, 0 ukończeń). Kolejność wg malejącego bólu. Dowód działania watchdoga: smoke-test
na transkryptach tej awarii pokazał weryfikatory 60k–279k burn bez jednego zdarzenia postępu.

**Odrzucone:** twardy cap tokenów (duży kontekst bywa legalny — metryka relatywna per kontrakt
etapu); Redis (wąskie gardło to pętle, nie latencja); Postgres od startu (pin JSON wystarcza);
LLM-judge jako scorer evalów (deterministyczne fixtures/AST); wpięcie RAG przed pomiarem (§9
rag-design); wiring technical-architecture-lead do panelu (ma tool Task → ryzyko zapętlenia;
COFNIĘTY do czasu naprawy — Q8).

**Status:** Filary 0–2 done; **niezweryfikowane na żywo end-to-end** — pierwszy przebieg
walidacyjny `/orchestrate-ddd` w juz-ide-api-1 (z watcherem + hookiem) jest twardym punktem
kontrolnym przed ogłoszeniem regresji naprawioną. Filar 3 pending.
**Ref:** ADR 0003/0004/0005 · `docs/tasks/TASK-{OBS-001,AGENT-CONFORMANCE-001,RAG-002,RAG-003}.md` · commity 9ef460c → 7a19b23 → 8d5c700 → 51ef956.

---

## 2026-06-30 — RAG: code-only + dedykowany Qdrant + swappable embedder (drop pattern-embedding)

**Zmiana:** knowledge-retriever zawężony do **code retrieval** (find existing impl). Pattern-embedding
USUNIĘTY. Store = **dedykowany** Qdrant (docker-compose, :6401, izolowany od prod). Embedder **pluggable**
(env: ct301 e5-large / openai-compat). `reseed.sh` = lekki (docker up→build→reindex z configu); swap modelu
= zmień env + rerun (recreate z nowym dim). Wpięte w /analyze-ddd (0.6) i /orchestrate-ddd (implement).

**Dlaczego:** embedding ⟺ vector store ⟺ code retrieval — stoją albo padają razem. Embedding *wzorców*
(72 pliki) = koszt bez wartości (decision cards + README wskazują wzorzec bez semantyki). Embedding *kodu*
(6800 plików) = realna wartość (dowód: bug ANTI-SPOOF — zła sygnatura, „to nie istnieje" — kosztował dzień).
Współdzielony prod-Qdrant „do czego innego" → izolacja (kolizja kolekcji, sprzężenie niezawodności).

**Odrzucone:** embedding wzorców do FlatStore (koszt bez zysku); współdzielony prod-Qdrant (kolizja/sprzężenie);
lokalny transformers.js/sqlite-vec (gorszy model + bałagan w node_modules).

**Status:** done + zwalidowane e2e na `mentions` (dedykowany Qdrant :6401, CT 301 embed, retrieve 0.84-0.88).
Patterns/decisions → markdown (decision cards). Faza 3 (hybrid+rerank+evals) = pending.

---

## 2026-06-29 — Right-size default: aparat multi-agentowy za ciężki dla małych tasków

**Zmiana:** domyślny flow dla małych/znanych tasków = **bezpośrednia implementacja + JEDNA
kompletna weryfikacja (find-all-once)**, BEZ pętli/panelu/re-spawnu. Multi-agent (`/orchestrate-ddd`,
panel) tylko dla dużych/nieznanych/równoległych. To czyni „loops-performance-lesson" **defaultem**, nie wyjątkiem.

**Dlaczego:** cały dzień + mnóstwo tokenów na 1 mały task (TS-SEC-ANTI-SPOOF-002). Z logów marnotrawstwo:
(1) **re-weryfikacja tego samego** (te same 2 agenty, te same 3 blokery, 2×), (2) **odkrywanie blokerów
falami** (verify→fix→verify→nowy bloker), (3) **ciężki kontekst per-agent** (ECC 33k always-on + czytanie
6800 plików od zera, brak RAG), (4) **lęk weryfikacyjny → ręczne re-spawny** („na pewno? upewnijcie się").

**Fix (kolejność dźwigni):** right-size default · find-all-once verify (jedna, znajdź WSZYSTKO) ·
RAG (cięcie re-readingu — największy lever na tokeny) · `ECC_HOOK_PROFILE=minimal` dla subagentów ·
ufać jednej weryfikacji (po to jest VETO gate).

**Odrzucone:** „dorzucić więcej agentów/weryfikacji" — to powiększa problem. Kierunek = **upraszczać**.
**Status:** decyzja done; egzekwowanie w komendach (find-all-once verifier, right-size routing) = pending.

---

## 2026-06-29 — Advanced RAG jako knowledge-retriever MCP (embedded, local-first)

**Zmiana:** zaprojektowany Advanced RAG jako **MCP server w TS** (`knowledge-retriever`) z magazynem
**embedded** (sqlite-vec, plik lokalny), lokalnymi embeddingami, hybrid search + rerank. Zastępuje
statyczne wstrzykiwanie wzorców semantycznym retrievalem; killer use-case = retrieval KODU w `/analyze-ddd`.
Pełny projekt: `docs/rag-design.md`.

**Dlaczego:** dziś retrieval regułowy → bloat kontekstu (33k always-on) + brak recall (agent grepuje
6800 plików na ślepo → halucynacje „to nie istnieje", jak w ANTI-SPOOF gdzie 70% już było w kodzie).
RAG na kodzie daje trafne Codebase Facts i wzorcowe istniejące implementacje (mniej błędów typu „stara sygnatura").

**Odrzucone:**
- **Hosted vector DB** (Qdrant/Pinecone/Weaviate) — over-engineering, infra do utrzymania, dane wychodzą. Wybrane: embedded sqlite-vec (zero serwera, GDPR-safe).
- Embeddingi przez API — kod/PII opuszczałby maszynę. Wybrane: lokalne (fastembed/ONNX, multilingual).
- RAG na patternach jako priorytet — mały korpus (72), niekrytyczny. Priorytet: **kod** (duży korpus).

**Status:** pending (design gotowy; MVP = flat cosine na patternach → potem code retrieval na sqlite-vec).
**Bonus:** domyka luki z oferty — MCP provider w TS + Advanced RAG + cost/quality + prywatność.

---

## 2026-06-29 — Loops (/orchestrate-ddd) wolne na małych taskach → rezerwujemy dla dużych

**Zmiana:** `/orchestrate-ddd` (autonomiczna pętla impl) zostaje **eksperymentalny / do dużych
zadań**. Do codziennej pracy: `/analyze-ddd` (research) + **ręczna/single-pass implementacja**
(`/orchestrate` albo bezpośrednio). Pętla NIE jest domyślną drogą dla małych zmian.

**Dlaczego:** pierwszy realny przebieg (juz-ide-api-1, TS-SEC-ANTI-SPOOF-002):
**40 min, 5 plików, eskalacja po 3 próbach** — handler.ts nie zbiegł.
- Pozytyw: **gate zadziałał** — wykrył 7 realnych bugów (privilege-escalation userId ADR-0021,
  zła sygnatura findByAddress ×3 callsite) i NIE wypchnął zepsutego kodu (staged partial + raport z liniami).
- Negatyw: za wolno i brak zbieżności na trudnym pliku. Przyczyny:
  (1) granularność per-warstwa → handler padał, więc cała warstwa re-implementowana 3× (waste na tym co przeszło);
  (2) ciężkie subagenty × 3 rundy (ECC 33k always-on + patterns + analysis per agent) + check-delegation wymusza subagentów;
  (3) fixer nie wchłonął decyzji z analysis.md (dalej stara sygnatura mimo flagi).

**Odrzucone:**
- „Loops do wszystkiego" — narzut pętli > zysk dla małych znanych zmian (zgodne z loop-engineering: pętle świecą przy dużych/równoległych/walk-away).
- Wznawianie pełnego Workflow na eskalacji — ryzyko kolejnych 10+ min bez zbieżności. Lepiej: znane violations+linie → jeden celowany fix.

**Status:** done (decyzja); tuning pętli = pending.
**Tuning do zrobienia (gdy wrócimy do pętli):** per-file (nie per-layer) granularność ·
targeted-fix-on-escalation (verifier violations → jeden pass) · niższe max_attempts (2) · lżejszy kontekst subagentów.
**Ref:** memory `loops-performance-lesson`, `docs/orchestrate-ddd-design.md`.

---

## 2026-06 — Wcześniejsze decyzje (pointery, pełny kontekst w dedykowanych plikach)

- **ECC jako baza + DDD-overlay (nie hard-fork)** — `docs/REFACTOR-ANALYSIS.md` §5. Dlaczego: ECC utrzymywany przez full-timera (222k★), namespaced overlay model pozwala nadążać za upstream; fork = śmierć przez staranie.
- **Dwie komendy /analyze-ddd + /orchestrate-ddd (twarda bramka research→impl)** — `docs/adr/0002`. Dlaczego: granica między komendami fizycznie nieprzekraczalna przez autonomię; Workflow > /goal (deterministyczny stop); artefakt = kontrakt handoff.
- **Artefakt analizy w `project-orchestration/analysis/` (nie tasks/)** — bo tasks/ tylko na taski; threat-model osobno w `docs/security/threat-models/`, połączone linkiem `threat_model:`.
- **threat-model: + Attack Trees + CVSS + MITRE ATT&CK (full tier)** — komplementarne metody (enumeration/scoring/TTP); OCTAVE/Trike/VAST odrzucone (zakres org / redundancja / już-to-robimy); Kill Chain → `/incident`.
- **Template SSoT w claude-patterns, sync (nie symlink w docs/)** — `docs/` to przenośna treść; opt-out `LOCAL-CUSTOMIZED`.
- **Migracja additywna, cięcie generyków (1G) na końcu** — symlinki propagują natychmiast; nie tnij przed live-walidacją.
