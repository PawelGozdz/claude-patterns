---
id: TASK-ORC-GATE-COST-001
title: 'Bramka końcowa: wyłącznik pętli NO-GO, powtórna bramka na delcie, eksperyment z diffem w prompcie i pilotaż katalogu pułapek'
type: feature
status: in-progress
priority: P2
story_points: 8
created_date: 2026-11-10
updated_date: 2026-11-10
assignee: '@unassigned'
labels: [orchestrate, gate, cost, telemetry]
depends_on: [TASK-OBS-018]
related: [TASK-OBS-018, TASK-OBS-019, TASK-ORC-FINAL-GATE-CHUNKS-001, TASK-COST-CONTEXT-001]
source: 'analiza telemetrii i transkryptów juz-ide-api, 2026-11-09/10 (docs/DECISIONS-LOG.md, wpis 2026-11-09)'
---

# TASK-ORC-GATE-COST-001: koszt bramki końcowej i pętli NO-GO

## 🎯 Goal

Zmniejszyć koszt `/orchestrate` tam, gdzie go widać w danych, bez osłabiania bramki: zatrzymać runy, które odbijają się
od tego samego ustalenia, taniej powtarzać bramkę po poprawce, ograniczyć czytanie plików po kolei przez bramkę i
przenieść powtarzalne błędy z drogiej bramki do tanich kontroli przed nią. Każdy etap jest warunkowany pomiarem
(jak w `TASK-COST-CONTEXT-001`) i może wejść osobno.

## Dane wyjściowe (telemetria, 2026-10-01..11-10)

- Koszt `orchestrate`+`analyze`: $4200. Bramka `security-e2e-verifier` (Opus): 175 kroków, **$892 (21%)**, ok. $5,29 za
  krok, mediana **43 wywołań narzędzi** przy limicie 60 (to efekt ORC-152: werdykt najpóźniej po 70% limitu).
- Pierwsza bramka w runie (n=130): NO-GO 47%, GO 44%, `died` 9%. Kolejne bramki w runie: 45 sztuk, **$194**, średnio
  $4,31 wobec $5,37 pierwszej.
- Powtarzane runy: 171 zadań, 417 runów (2,4 na zadanie); 74 zadania biegły więcej niż raz i kosztowały $2751; runy
  zakończone `no_go` to $1276. 10% najdroższych zadań to 51% kosztu. `TS-REP-NEIGHBOR-SIGNALS-001`: 7 kolejnych runów
  NO-GO po dwie odrzucone bramki. Brak odcisku ustaleń uniemożliwia sprawdzenie, czy to było to samo ustalenie
  (stąd zależność od `TASK-OBS-018`).
- Weryfikator warstwy nie przewiduje wyniku bramki: przy samych GO bramka dała NO-GO w 46% runów (31 z 68). Nie
  usuwamy go (decyzja z 2026-11-10: zysk poniżej 2% kosztu, utrata 6 wykrytych błędów).
- Bramka zostaje na Opusie z `effort: max` (decyzja 2026-11-09): ok. 1,8 tys. tokenów wyjścia na wywołanie, koszt to liczba
  tur i czytany kontekst, a nie głębokość myślenia.

## Stan po TASK-OBS-018 (zamknięte 2026-11-10, w `develop`)

Dane i narzędzia, na których stoją etapy poniżej:

- `step.ruleHits` (`[{ruleId, line?}]`) i `step.rulesChecked` w zdarzeniach `step.end` ról `verifier` i `gate`; `step.checks`
  (wynik sondy per kontrola, w tym `shadowLint`) w roli `probe`. Prompty weryfikatora i bramki proszą o `findings`
  (`FINDINGS_FIELD`), schemat jest celowo luźny. Opis: ORC-156 w `docs/decisions/orchestrate-rule-history.md`, aneks w ADR 0012.
- `scripts/lib/telemetry-rules.mjs`: `ruleSignature(ruleHits)` (odcisk: posortowane unikalne `ruleId` bez `new`, 12 znaków hex,
  `null` gdy brak znanych identyfikatorów), `normalizeRuleHits`, `normalizeRuleId`. Odcisk **nie jest polem zdarzenia**: liczy się
  go przy odczycie.
- Rollup ma blok `rules` per rola i agent (`reports`, `hits`): `reports` do `n` roli to pokrycie raportowaniem, a udział
  `hits.new` to miara luk katalogu pułapek (E4).
- **Dane pojawią się dopiero po nowych przebiegach.** Zdarzenia sprzed merge'a nie mają `ruleHits`, więc E1 w trybie
  ostrzegawczym nie ma na czym działać, dopóki instancje nie wykonają `/orchestrate` na nowym prompcie i nie ruszy kolektor.
  Historia zdarzeń zaczyna się w połowie września (lipiec i sierpień są tylko w surowym `~/.claude/metrics/workflow-steps.jsonl`,
  bez `findings`).
- **ORC-139 nie odcina powtórnej bramki** (sprawdzone 2026-11-10): wiązanie z hashem drzewa (`treeBinding` w
  `orchestrate.template.mjs`, `scripts/orchestrate-tree-hash.mjs`) chroni *świeżość werdyktu GO* przy stagingu, a nie cache'uje
  bramki ani nie wykrywa jej powtórzenia na tym samym drzewie. Hasha drzewa nie ma w zdarzeniach (jest w raporcie przebiegu,
  `report.treeHash`). Wniosek: E1 zaczyna od odcisku ustaleń; kryterium „drzewo bez zmian od ostatniego NO-GO" wymagałoby
  zapisania hasha bramki (zmiana schematu), więc to opcja na później, nie część E1.
- Punkty zaczepienia dla E1: `scripts/orchestrate-prepare.mjs` (ma `warnings` i `die(EXIT.*)`; zna `taskId`), odczyt zdarzeń
  przez `eventsDir()`/`readEvents()` z `scripts/lib/telemetry-events.mjs` (zdarzenia wszystkich instancji tej maszyny leżą w
  jednym katalogu, `taskRef` jest pisany wielkimi literami z nazwy workflow), `deviation` przez `scripts/report-deviation.mjs`
  (trigger trzeba zmapować w `defaultCategory`).
- **`TASK-OBS-019` jest niezależne i niczego tu nie blokuje.** Gdy powstanie (czeka na format lintu i potwierdzenie z juz-ide-api),
  doda `file` w lokalnych zdarzeniach i `shadowLintHits`; E1 może wtedy dopasowywać po miejscu, ale zostaje na poziomie `ruleId`.

## Zakres (cztery niezależne etapy)

### E1. Wyłącznik pętli

`orchestrate-prepare.mjs` przed startem runu sprawdza lokalne surowe zdarzenia (`telemetry/events/`) tego `taskRef`.
Gdy dwa ostatnie runy skończyły się NO-GO bramki z tym samym `ruleSignature` (z `TASK-OBS-018`), start jest odmowny, a
komunikat podaje wspólne `ruleId` i co trzeba zmienić (specyfikacja, `analysis.md`, decyzja). Wyjście: jawny
`--allow-repeat`. Najpierw tryb ostrzegawczy: log „zablokowałbym" bez blokady.
Sprawdzone 2026-11-10: ORC-139 nie odcina powtórnej bramki na identycznym drzewie (patrz „Stan po TASK-OBS-018"), więc kryterium
E1 to wyłącznie odcisk ustaleń (`ruleSignature` z `ruleHits` bramki); odcisk `null` (same `new` albo brak raportu) nigdy nie
zatrzymuje runu. Porównujemy dwa ostatnie runy tego `taskRef`, nie pojedyncze próby w runie.
**Pomiar:** w trybie ostrzegawczym policzyć, ile runów zostałoby zatrzymanych i czy następny run bez zmian dał inny wynik.
Blokadę włączać dopiero, gdy fałszywych zatrzymań jest 0 na próbie ≥ 20.

### E2. Powtórna bramka na delcie

Druga i kolejne bramki w runie dostają: poprzednie ustalenia (`ruleHits` + `violations`), diff od ostatniej bramki i
polecenie „sprawdź, czy naprawiono te punkty, i przejrzyj tylko deltę". Cel: koszt poniżej $2,5 (dziś $4,31).
**Pomiar:** A/B na re-bramkach (połowa pełna, połowa delta); zgodność werdyktu ≥ 95%, a każde ustalenie, które pełna
bramka znalazła poza deltą, jest wypisane i oceniane ręcznie przed włączeniem.

### E3. Diff w prompcie bramki (eksperyment na jednej instancji)

Dziś `buildFinalGatePrompt` (`orchestrate.template.mjs:854`) podaje tylko listę zmienionych plików, więc agent czyta je po
kolei. Eksperyment: dołączyć diff (z limitem rozmiaru) i pozwolić na `Read` tylko do kontekstu poza diffem.
Koordynować z `TASK-ORC-FINAL-GATE-CHUNKS-001` (diff powyżej ~40 plików).
**Pomiar:** mediana wywołań narzędzi (dziś 43), koszt bramki (dziś $5,29), odsetek NO-GO pierwszej bramki i odsetek
`unverified_scope` nie mogą pogorszyć się względem bazy. Gdy NO-GO spada, uznać to za utratę jakości, nie za oszczędność.

### E4. Pilotaż katalogu pułapek

Źródło: 55 wpisów pamięci `security-e2e-verifier` (identyczne w 8 instancjach juz-ide-api), których implementerzy nie
widzą (nie mają katalogu pamięci). Klasyfikacja: **A** mechaniczne (grep/AST, np. `onFailed` bez `@OnWorkerEvent`) →
reguły `tools/conformance`; **B** semantyczne domenowe → krótkie karty (objaw, gdzie boli, jak sprawdzić, poprawka)
wstrzykiwane implementerom istniejącym mechanizmem kart reguł, routing po warstwie i plikach, **limit ok. 3 tys. tokenów
na start implementera** (każdy wstrzyknięty token jest czytany przy każdym wywołaniu); **C** środowiskowe i procesowe →
krótki runbook uruchamiany hookiem po pasującym komunikacie błędu. Wstępna ocena z indeksu: ok. 12 / 35 / 8; przed
pracą potwierdzić czytając pliki wpisów.
**Pomiar:** udział `ruleId` = `new` w ustaleniach bramki (miara luk katalogu) oraz odsetek NO-GO pierwszej bramki
(baza 47%, n=130) po ok. 100 runach.

## Poza zakresem

Zmiana modelu, `effort` albo `maxTurns` bramki i implementerów (decyzje z 2026-11-09 w `docs/DECISIONS-LOG.md`; dane nie
uzasadniają zmiany), rozgrzewka agentów i rozmiar kontekstu startowego (`TASK-COST-CONTEXT-001`).

## Kryteria akceptacji

- [x] E1 (tryb ostrzegawczy): zdarzenie „zablokowałbym" z odciskiem (`ruleId` przez złączenie, patrz Wynik); blokada włączana osobną
      flagą; `--allow-repeat` działa; test w evalu `orchestrate-prepare`. Włączenie blokady czeka na dane (≥ 20 zatrzymań, 0 fałszywych).
- [ ] E2: prompt kolejnej bramki zawiera poprzednie ustalenia i diff od ostatniej bramki; pierwszy przebieg bramki bez zmian;
      wynik A/B opisany w sekcji Wynik.
- [ ] E3: wynik eksperymentu (cztery metryki z bazą) opisany w sekcji Wynik; wdrożenie tylko przy braku spadku NO-GO.
- [ ] E4: klasyfikacja 55 wpisów w pliku zadania; reguły z klasy A w `tools/conformance` z testami; karty klasy B w
      limicie tokenów; pomiar po ok. 100 runach.
- [ ] Konwencja repo: `count-assets.mjs --check-docs`, walidatory CI, `CHANGELOG.md`, `METADATA.yml`.

## Wynik

### E1. Wyłącznik pętli (tryb ostrzegawczy), 2026-11-10, ORC-157

**Zrobione.**
- `scripts/lib/orchestrate-loop-guard.mjs`: `assessRepeat` (czysta ocena na liście zdarzeń), `loadTaskEvents` (od najnowszego pliku
  miesięcznego, staje po dwóch runach), `recordRepeat` (zdarzenie `deviation`, deterministyczne `id`), `checkLoop` (wejście dla prepare,
  nie rzuca). O runie rozstrzyga ostatnia bramka końcowa (`final:final:gate#N`, starsze `final-gate-r2`); bramki `final-fix-*` nie.
- `orchestrate-prepare.mjs`: po bramce analizy wywołuje `checkLoop`; flagi `--block-repeat` (exit 5) i `--allow-repeat`. Bez flag tylko
  ostrzeżenie w `warnings[]` i zdarzenie `repeat_no_go` (`cause: verifier`, mapowanie w `defaultCategory`).
- `scripts/loop-guard-replay.mjs`: pomiar na historii (zatrzymania słuszne i fałszywe, pokrycie odciskiem).
- Testy: 13 przypadków w `tests/flow-evals/orchestrate-prepare/run.js` (ten sam odcisk ×2 → ostrzeżenie i jedno zdarzenie, bez dubla
  przy powtórce; blokada exit 5; `--allow-repeat`; różne odciski; odcisk `null` z samych `new`; brak raportu; inny `taskRef`; wielkość liter;
  tylko dwa ostatnie runy ×2; bramka poprawki `final-fix`; stare id `final-gate-r2`; jeden wcześniejszy run) i asercja `defaultCategory` w
  `telemetry-events`. Sprawdzone mutacjami (bez wykluczenia `final-fix`, bez porównania odcisków, `--allow-repeat` ignorowane: każda
  zaczerwienia właściwe przypadki). Eval prepare od teraz izoluje telemetrię (`CLAUDE_TELEMETRY_DIR` w katalogu tymczasowym).

**Dane.** Po merge'u OBS-018 w `telemetry/events/*.jsonl` jest **0** zdarzeń z `step.ruleHits` (5 plików, 56 tys. zdarzeń). Z 196 NO-GO
bramki końcowej żadne nie ma odcisku, więc E1 napisano i przetestowano na zdarzeniach syntetycznych.

**Pomiar** (`node scripts/loop-guard-replay.mjs`, 270 tasków, 296 startów od trzeciego runu): zablokowałbym **0**, słusznie 0, fałszywie 0.
Próba za mała na jakąkolwiek decyzję (próg: ≥ 20 zatrzymań i 0 fałszywych). Skrypt sprawdzony na zdarzeniach syntetycznych (jedno
zatrzymanie słuszne, jedno fałszywe: następny run dał GO).

**Odstępstwa od opisu zadania.**
- Test jest w evalu `orchestrate-prepare`, nie w `orchestrate-script`: logika siedzi w prepare, nie w szablonie Workflow.
- Zdarzenie „zablokowałbym" niesie odcisk w `signature` (`repeat-no-go.<12 hex>`), a nie listę `ruleId`: schemat `deviation` jej nie ma, a
  `ruleHits` wolno trzymać tylko w krokach `verifier`/`gate` (inaczej rollup liczyłby je podwójnie). `ruleId` odzyskuje się złączeniem po
  odcisku; lista `ruleId` jest w ostrzeżeniu prepare.
- Dopasowanie po `taskRef` obejmuje wszystkie instancje maszyny (zdarzenia leżą w jednym katalogu), zgodnie z opisem E1. Jeśli pomiar
  pokaże fałszywe zatrzymania przy przenoszeniu taska między instancjami, zawęzić do `project`.
- Worktree `_claude-patterns-gate-cost` nie istniał; praca w głównym drzewie, gdzie branch był już wyciągnięty.

**Co dalej dla E1.** Włączenie blokady wymaga danych: po nowych przebiegach (z `FINDINGS_FIELD`) uruchomić `loop-guard-replay.mjs` i
zdecydować po ≥ 20 zatrzymaniach. Domyślne `--block-repeat` to osobna reguła (ORC-159+).

### E4, krok 1: klasyfikacja wpisów pamięci bramki (2026-11-10, tylko odczyt)

Źródło: `juz-ide-api-1/.claude/agent-memory/security-e2e-verifier/` (nic nie zmieniane). Wpisy przeczytane w całości przez agenta
klasyfikującego, wyrywkowo sprawdzone (audit_eventdata, l2_for_raw_sql_repos, run_full_context_suite, dto_rename: klasyfikacja się
potwierdziła).

**Pamięć nie jest identyczna w 8 instancjach**, wbrew opisowi zadania. Zgodne są api-1, 2, 4, 8, develop i test; api-3, 5, 6 i 7 się
rozjechały: dwa wpisy istnieją tylko w jednej instancji (`erasure-claim-vs-author-columns` w api-3, `global-key-allowlist-hits-all-producers`
w api-7, oba klasa B) i sześć wpisów ma lokalne poprawki (1–5 linii: route_removal, split_release i anonymization_relink w api-5/6,
decision_mandated_guard_test w api-7, stack_carries_message w api-3, duplicated_gate_predicate w api-6). Unikalnych wpisów jest **57**.
Przed przeniesieniem treści trzeba je scalić, nie kopiować z api-1.

**Wynik: A 6 / B 39 / C 12** (55 wpisów z api-1 plus 2 jednoinstancyjne; indeks sugerował 12 / 35 / 8). Mniej A, niż myślał indeks: większość
„mechanicznych" reguł wymaga kontekstu spoza jednego pliku (kto wywołuje, co jest w module, co w migracji).

| # | wpis | kl. | uwaga |
|---|---|---|---|
| 1 | anonymization_relink_via_side_store | B | cross-layer, anonimizacja: audyt/outbox z userId re-linkuje wiersze |
| 2 | audit_eventdata_canonical_collision | A | klucz kanoniczny (`reason`, `actorId`...) w `eventData` literału przekazanego do `createAuditEntry`; FP niskie |
| 3 | backfill_skip_keeps_stale_gate_column | B | infrastructure, migracje/backfill |
| 4 | baseCommandHandler_silentfail_with_saferun | A | `safeRun(() => *.commandBus.execute())` w `*integration*.handler.ts`; FP niskie |
| 5 | check_claude_settings_in_final_gate | C | `git status` vs lista bramki; tylko bramka |
| 6 | column_meaning_flip_legacy_rows | B | infrastructure, geo punkt P |
| 7 | companion_geometry_left_exact | B | infrastructure, geo punkt P |
| 8 | decision_mandated_guard_test_absent | B | testing; granica z C (procedura grepu po bramce) |
| 9 | dev_db_ctype_c_lower_ascii_only | C | dev DB `lc_ctype=C`: `lower()`/ILIKE tylko ASCII; implementer i bramka |
| 10 | displaced_point_feeds_boundary_guardrail | B | application, geo punkt P |
| 11 | docs_decisions_unowned_by_code_layers | B | docs; też A: `@BusinessRule` bez wpisu w BUSINESS_RULES.yaml |
| 12 | dto_rename_breaks_app_api_layer | B | presentation: kontrolery/mappery/OpenAPI poza `layers_scope`; frontmatter bez `description` |
| 13 | duplicated_gate_predicate_drift | B | infrastructure, bramki fail-closed |
| 14 | error_metadata_leak_two_layers | C | kryterium oceny wagi; guardian już istnieje; tylko bramka |
| 15 | fail_closed_gate_spec_setup_kind | B | application; też A: `@Inject(Klasa)` bez providera (FP średnie) |
| 16 | failclosed_field_never_populated | B | cross-layer: martwa funkcja przy zielonych testach |
| 17 | founder_q_answers_carry_conditions | C | `answer:`/`minor_fixes:` spoza promptu warstwy; tylko bramka, dopóki prompt ich nie przekazuje |
| 18 | geo_acl_error_message_carries_coordinates | B | application, PII w logach |
| 19 | guard_one_moderation_path_and_remediation_dead_end | B | cross-layer, authz/moderacja |
| 20 | ignored_field_becomes_filter | B | testing, fixtury e2e/L2 |
| 21 | l2_for_raw_sql_repos | C | bramka nie odpala L2 (reguła usera); część o typach kolumn jest też dla implementera/test-implementera |
| 22 | legacy_duplicate_handler_spec | A | `describe('<Klasa>')` w ≥2 specach; FP średnie (unit + L2 bywa legalne) |
| 23 | multilayer_hardfail_pattern | B | infrastructure, sekrety (Zod superRefine + check w callsite) |
| 24 | new_path_into_guarded_state_skips_shared_gate | B | domain, przejścia stanu (resume/unsuspend → ACTIVE) |
| 25 | no_head_when_proving_absence | C | `ls\|head` jako dowód braku; tylko bramka |
| 26 | onfailed_requires_onworkerevent | A | `onFailed` w `BaseQueueProcessor` bez `@OnWorkerEvent('failed')`; FP niskie |
| 27 | optin_refactor_drops_implicit_consumers | B | cross-layer |
| 28 | out_of_src_import_shifts_build_root | A | import względny wychodzący poza `src/` (poza specami); FP niskie |
| 29 | p_linkage_defeats_identity_masking | B | infrastructure, geo punkt P |
| 30 | readonly_load_promoted_to_write | B | application, authz/spójność ID |
| 31 | revived_dead_path_meets_new_state | C | metoda przeglądu rundy ≥2; granica z B (niepewne) |
| 32 | round2_fix_claim_check_unstaged_delta | C | tylko bramka |
| 33 | route_removal_leaves_test_tooling_refs | A | ścieżki w `authorization-matrix.yaml` i `test/load` bez trasy; FP średnie (prefiks `/api`, parametry) |
| 34 | run_full_context_suite_not_scoped | C | hook `block-unscoped-tests` już to egzekwuje; frontmatter zepsuty |
| 35 | shared_integration_handler_multi_trigger | B | application, workery |
| 36 | shared_point_store_caller_chosen_address | B | application, geo punkt P |
| 37 | sibling_handler_read_before_authz | B | application, authz |
| 38 | signal_policy_halflife_is_retention | B | infrastructure, retencja |
| 39 | silent_security_guards | B | domain; napięcie z #16/#46 (zakres: niezmiennik detekcji vs sygnał błędu) |
| 40 | source_scan_guardian_comments | B | testing, guardiany |
| 41 | split_release_not_null_write_gap | B | infrastructure, migracje |
| 42 | stack_carries_message_sink_side | B | infrastructure, PII w sinkach |
| 43 | stale_scratchpad_gate_logs | C | tylko bramka |
| 44 | tier1_audit_substituted_by_log | B | application, audyt Tier 1 |
| 45 | two_release_backfill_in_one_tree | B | infrastructure, migracje |
| 46 | two_sided_mechanism_verify_other_side | B | cross-layer |
| 47 | tx_boundary_claims_in_docs | B | docs, granice transakcji |
| 48 | unmapped_error_falls_to_422_fallback | B | presentation, mapowanie błędów |
| 49 | workflow_no_grep_tool | C | „No such tool" dla Grep/Glob w workflow; bramka i implementer w workflow |
| 50 | write_time_safety_drops_read_snap | B | infrastructure, geo punkt P (legacy, cache) |
| 51 | project_insufficient_tokens_maps_422 | B | presentation; scalić z #48 |
| 52 | project_map_markers_cache_and_preview_filter_gap | B | infrastructure; stan z TS-MAP-CLUSTER-SCALE-001, zweryfikować w kodzie |
| 53 | project_rate_limit_failopen_default | B | presentation |
| 54 | project_security_posture_doc | C | fakt kontekstowy z 2026-06-26, prawdopodobnie nieaktualny |
| 55 | reference_redaction_service_gap | B | infrastructure, PII w logach; nazwa pliku „gap", treść to korekta (`name: redaction-service-three-layers-corrected`) |
| 56 | erasure_claim_vs_author_columns (tylko api-3) | B | docs/infrastructure, RODO: kolumny autora (`created_by`, `published_by`) poza heurystyką `*_user_id` |
| 57 | global_key_allowlist_hits_all_producers (tylko api-7) | B | application, outbox: klucz w globalnej allowliście trafia w każdego producenta |

**Reguły A do `tools/conformance`** (6, kolejność wg zysku i niskiego ryzyka FP): #26 `onFailed` bez dekoratora, #4 `safeRun`+`commandBus.execute`
w handlerach integracyjnych, #2 klucz kanoniczny w `eventData`, #28 import spoza `src/`, #22 duplikat `describe` handlera (FP średnie),
#33 ślady usuniętej trasy (FP średnie). Każda wymaga testu dodatnio i ujemnie; dwie ostatnie najpierw w trybie `warn`.

**Plan kart B** (39 wpisów, 13 kart po ≤ 400 słów; wpisy #48 i #51 scalone): geo punkt P (źródło/kolumny, konsumenci), bramki fail-closed
(rejestracja i setup specs, duplikaty predykatów i opt-in), PII w logach i sinkach, RODO (anonimizacja, audyt Tier 1, retencja, kolumny autora),
migracje i backfill, authz (kolejność odczytu, ID, moderacja), HTTP (błędy, DTO, rate limit), agregaty (niezmienniki), sekrety i workery,
testy (guardiany, fixtury, artefakty decyzji), docs (artefakty decyzji, transakcje).

**Limit tokenów** (szacunek słowa × 1,5, NIE zmierzony na gotowych kartach): karty dla implementera per warstwa wraz z kartami cross-layer
(#1, #16, #19, #27, #46): domain ok. 0,9 tys., application ok. 1,7 tys., infrastructure ok. 2,3 tys., testing ok. 1,0 tys.; presentation ok.
0,5 tys. i docs ok. 0,3 tys. bez cross-layer. Wszystko mieści się w ok. 3 tys., ale infrastructure jest najbliżej limitu i po dodaniu #56/#57
oraz po scaleniu wariantów z api-3/5/6/7 będzie na granicy. Wymaga pomiaru na prawdziwych kartach przed wdrożeniem.

**Runbook C** (12; z nich tylko dla bramki: #5, #14, #17, #21 (część), #25, #31, #32, #43, #54): dla implementera zostają realnie trzy
(#9 dev DB ASCII, #34 niescopowane testy, #49 brak Grep/Glob w workflow). Dla bramki nie ma sensu budować hooka po komunikacie błędu;
wystarczy, że zostaną w jej pamięci. Z E4 wypada więc „C jako runbook uruchamiany hookiem" poza trzema wpisami.

**Dublowanie** do scalenia przy tworzeniu kart: #48+#51 (mapowanie błędów 422); #11, #17, #8 (artefakt wymagany decyzją nie powstał, trzy
warianty); #18, #42, #55, #14 (wyciek message/PII, cztery kanały); #16 i #46 (producent albo druga strona nigdy nie powstaje).
**Sprzeczności i napięcia:** #14 uznaje zielonego guardiana za dowód pokrycia mapperów, #42 pokazuje sink, którego guardian call-site nie
chroni (zakres: tylko mappery); #39 zaleca ciche `Result.empty()`, a #16, #46, #4 uznają cichą utratę sygnału za błąd (rozstrzyga zakres:
niezmiennik detekcji w agregacie vs sygnał błędu). Dev DB: #9 wskazuje kontener `local-hero-db-4`, #21 i #20 `local-hero-db-1` (port 5431),
więc runbook musi wskazać kanoniczny.

**Higiena wpisów.** Zepsute frontmattery: `description: undefined` (#2), pusty `description` (#12), `description` wieloliniowe urwane do
`odpala user` (#34). Martwy link `[[verify-writer-before-live-verdict]]` w #35 (nie ma go wśród wpisów). Nazwa pliku #55 mówi „gap", treść to korekta.
Weryfikacji w kodzie przed zamianą na kartę wymagają #52 i #54 (mogą być nieaktualne).

**Wniosek dla reszty E4.** (1) Reguły A (6) to małe, niezależne, przetestowalne kawałki: można je robić od razu. (2) Karty B potrzebują decyzji, kto
jest właścicielem katalogu (jedno źródło w claude-patterns zamiast ośmiu kopii), inaczej pamięci dalej będą się rozjeżdżać; pierwszy pilotaż
sensownie zacząć od jednej grupy (np. geo punkt P, 7 wpisów, lub bramki fail-closed). (3) Pomiar E4 (udział `ruleId = new`, NO-GO pierwszej
bramki, baza 47% n=130) wymaga ok. 100 nowych przebiegów, więc potrwa tygodnie.

### E4, krok 2: reguły klasy A w `tools/conformance` (2026-11-10, ORC-158)

**Zrobione (4 z 6).** `body-detectors.mjs` (cztery detektory AST wpięte w `analyzeBody`) i reguły domyślne w `rules.json`:
`BQ-ONFAILED-DECORATOR` (#26), `BQ-SAFERUN-COMMANDBUS` (#4), `AUDIT-EVENTDATA-CANONICAL` (#2), `BUILD-NO-IMPORT-OUTSIDE-SRC` (#28). Każda
z markerem wyjątku z powodem, w ratchecie jak `CH-NO-THROW` (stary dług nie blokuje). 36 przypadków w evalu `conformance` (dodatnio,
ujemnie, wyjątek, dług w baseline, monorepo); cztery mutacje detektorów zaczerwieniają właściwe przypadki.

**Pomiar na prawdziwym kodzie** (`--dir src` w juz-ide-api-1, tylko odczyt): `BQ-ONFAILED-DECORATOR` 0, `BQ-SAFERUN-COMMANDBUS` 0,
`BUILD-NO-IMPORT-OUTSIDE-SRC` 0, **`AUDIT-EVENTDATA-CANONICAL` 13**. Dwa sprawdzone (reputation `USER_SUSPENDED`, auth `USER_DELETED`) są
prawdziwe: `eventData.reason` bez `suspensionReason`/`removalReason`/`deactivationReason` w `data`, więc kanoniczne `reason` (`undefined`)
nadpisuje powód i znika z wpisu audytu. To realny dług w juz-ide-api (wpisy Tier-1 bez powodu), do decyzji tam; ratchet zostawia go w baseline.
Trzy reguły z zerem trafień nie dowodzą, że działają; działanie dowodzą testy. Pozostałe 11 sprawdzone 2026-11-11 programowo (AST: czy to samo
pole jest też podane w polu typowanym `data`, z którego `BaseAuditHandler` wypełnia klucz kanoniczny): **13 z 13 prawdziwych, 0 fałszywych**.
W żadnym wywołaniu nie ma `suspensionReason`/`removalReason`/`deactivationReason`/`actorType`/`expiresAt`/`verificationLevel`, więc wartość
z `eventData` jest nadpisana przez `undefined`. Dotyczy: `reason` (USER_DELETED, LOCAL_LAYER_SCOPING_DENIED, GROUP_ARCHIVED, GROUP_MEMBER_LEFT,
GROUP_LEADER_TRANSFERRED, DEVICE_KEY_REVOKED, RISK_FLAG_RAISED, USER_SUSPENDED, USER_UNSUSPENDED), `expiresAt` (SESSION_CREATED), `actorType`
(BEHAVIOR_SIGNAL_RECORDED), `previousVerificationLevel` i `verificationLevel` (SIGNAL_POLICY_MIN_VERIFICATION_LEVEL_CHANGED). To analiza
statyczna; nie uruchamiano testów ani bazy, więc nie sprawdzono, czy któryś test lub konsument audytu polega na dzisiejszym zachowaniu.

**Odstępstwa.**
- #22 (duplikat `describe` handlera) i #33 (ślady usuniętej trasy) NIE weszły: oba wymagają porównania wielu plików, a silnik reguł ciała
  analizuje jeden. Plan z klasyfikacji („dwie ostatnie najpierw w trybie `warn`") odpada razem z założeniem: to osobny check międzyplikowy.
- Reguły są domyślne w `rules.json`, więc instancje dostają je przez symlink. Lista `keys` w `AUDIT-EVENTDATA-CANONICAL` odwzorowuje
  `BaseAuditHandler` z juz-ide-api; w innym projekcie reguła jest nieszkodliwa (brak `createAuditEntry`), a inną bazę da się wskazać w
  `.claude/conformance.json`.
- Możliwy fałszywy alarm: handler podaje ten sam powód także w polu typowanym (kolizja wtedy nieszkodliwa). Nieobsługiwane: `eventData`
  zbudowane w helperze.

### E4, krok 3: ustalenia z właścicielem juz-ide-api i pilotaż karty B (2026-11-11)

**Odpowiedzi orkiestratora-2 (api-develop)** na pytania o E4:
- **Reguły międzyplikowe (#22 duplikat `describe`, #33 ślady usuniętej trasy) mają żyć w juz-ide-api**, nie w claude-patterns: dotyczą
  formatów plików tamtego repo, a `tools/lint-ddd` to ESLint per plik, więc nie pasuje. Forma (strażnik L1 jak `*.guardian.spec.ts` albo skrypt)
  to decyzja właściciela; zadania na to jeszcze nie ma i w oknie wstrzymania (BDR-134) mieściłoby się w klasie b. Z zakresu tego zadania wypadają.
- **Pamięć bramki: kanoniczna jest wersja commitowana w `juz-ide-api-develop`** (56 plików). Rozjazdy w api-3/5/6/7 (3, 3, 2, 3 pliki) są
  niezacommitowane, a skrypt synchronizacji robi ff-only, więc same się nie scalą; co z nich wejdzie do wersji kanonicznej, rozstrzyga właściciel.
  Do kart brać `develop`; rozjazdy czytać przez `git -C /opt/projects/juz-ide-api-N diff .claude/agent-memory/security-e2e-verifier`.
- **Resolver czyta `patterns-local`** (sprawdzone w kodzie: `orchestrate-prepare.mjs` `resolvePatternFile`, `hooks/inject-implementer-rule-cards.js`):
  ścieżka od `.` jest liczona od korzenia projektu, karta to `<temat>-pattern_summary.md` obok wzorca; wzór produkcyjny to iam (runtime.yml,
  linie 18–19). Dziś `juz-ide-api/.claude/knowledge/patterns-local/` ma tylko `README.md`, a `runtime.yml` niczego stamtąd nie wskazuje.

**Zmiana podziału w stosunku do kroku 1.** Zakładałam, że ogólne karty (migracje, BullMQ, błędy 422, PII w logach) pójdą do claude-patterns.
Wg reguły repo (wzorzec z dowodami z jednego projektu = `project-specific` do czasu drugiego adoptera) **wszystkie 39 kart B zostaje
w juz-ide-api (`patterns-local`)**; claude-patterns dostarcza format, pilotaż i pomiar. Do `patterns/` trafią po drugim adopterze.

**Pilotaż: `TASK-ORC-GATE-COST-001-cards/`** (szkic do przejęcia, nie pliki działające tutaj): karta `migration-release-safety-pattern_summary.md`
(MG1–MG7, N1–N3; z wpisów #3, #41, #45), pełny wzorzec obok i README z instrukcją wpięcia po stronie juz-ide-api (wzór iam). Nie ruszałam
repo juz-ide-api.

**Pomiar rozmiaru: karta ma 448 słów, 3308 znaków, ok. 945 tokenów** (znaki/3,5; istniejące karty `mapper` 5719 B, `cli-runner` 6044 B). To
**ok. 1,8× więcej, niż oszacowałam w kroku 1** (250 słów dla tej grupy), więc tamte sumy per warstwa były zaniżone. Przy takiej proporcji
warstwa infrastructure (ok. 13 wpisów własnych + cross-layer) przekroczy limit ok. 3 tys. tokenów na start implementera, jeśli wszystkie jej
karty wejdą naraz. Wniosek: karty ładować warunkowo (`patterns.triggers` po słowach kluczowych zadania), nie przez `patterns.always`, i mierzyć
rozmiar każdej przed dopisaniem; limit dotyczy sumy kart faktycznie wstrzykniętych do danego implementera, nie wszystkich kart warstwy.

**Dane E1 po merge OBS-018/019.** W prawdziwych zdarzeniach są pierwsze 3 wpisy z `ruleHits` (2026-11-10, juz-ide-api-develop: weryfikator ×2
i bramka, wszystkie GO, puste listy), czyli prompt działa i agenci raportują strukturalnie. NO-GO bramki z odciskiem: nadal 0, więc
`loop-guard-replay` dalej daje 0 zatrzymań (próg decyzji o blokadzie: ≥ 20 zatrzymań i 0 fałszywych).

### E2, E3

(do uzupełnienia po wykonaniu)
