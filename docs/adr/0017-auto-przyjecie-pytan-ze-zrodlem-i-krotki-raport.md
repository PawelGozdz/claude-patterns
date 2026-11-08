# ADR 0017 — `/analyze`: automatyczne przyjęcie pytań ze zweryfikowanym źródłem, jedno potwierdzenie i krótki raport

**Status**: accepted (2026-11-07), zaimplementowane w `develop`, niezacommitowane; projekty muszą ponownie zmaterializować `runtime.yml`.
**Zmienia**: [ADR 0016](0016-rozstrzyganie-otwartych-pytan-w-analyze.md): ANL-056 („decyduje człowiek, `answered_by: auto` nie istnieje") i ANL-057 (partia 5, „ok wszystkie" tylko dla pytań ze źródłem), oraz zdanie z ADR 0016, że `orchestrate-prepare.mjs` się nie zmienia. Reguła ANL-040 (format raportu) jest przepisana, nie dublowana.
**Nie zmienia**: ANL-034 (`status: approved` tylko na polecenie człowieka), zamka `premise_failed`/`card_conflict` (ANL-049/050), ANL-054/055/058.
**Context source**: siedem równoległych analiz w juz-ide-api, 2026-11-07, odczytane z sesji; decyzja @founder: „jeśli wiesz jak usprawnić, zrób od razu w claude-patterns develop" (wariant A+B+C poniżej). Nowe reguły: [ANL-060](../decisions/orchestrate-rule-history.md#anl-060) i przepisane ANL-040/056/057.

---

## Problem

@founder skarży się, że `/analyze` produkuje ścianę tekstu i wymusza serię potwierdzeń („zatwierdzam", „ok", „dobra"). Z siedmiu sesji:

- około 32 pojedyncze decyzje i około 25 potwierdzeń jeszcze do dania;
- w trzech sesjach, które odpowiedziały w całości, człowiek przyjął 100% rekomendacji (6/6, 3/3, 2/2), głównie `basis: new-pattern`;
- z 26 sklasyfikowanych pytań 11 skill mógł rozstrzygnąć sam (dwudrzwiowe, z precedensem albo kanonem, bez skutku bezpieczeństwa), 2 były graniczne, 13 naprawdę wymagało człowieka (one-way, `USER_CHALLENGE`, retencja/RODO, zmiana kryterium akceptacji).

Przyczyny:

1. Parser nie pozwalał zatwierdzić zbiorczo pytań `new-pattern` ani przyjąć „przyjmuję rekomendacje"; osobne „zatwierdzam" ustawiało status, ale nie zapisywało odpowiedzi, więc jeden agent potrzebował czterech wiadomości, a człowiek zapytał „przecież dałem ci zatwierdzam, czego jeszcze potrzeba?".
2. `batch_size: 5`: dziewięć pytań to dwie rundy.
3. Skill pytał o rzeczy spoza formatu ask/rec („Mam jeszcze zaktualizować artefakt…?", „Chcesz, żebym przygotował treść…?", „wolisz zatwierdzić przed opinią prawnika czy po?").
4. Końcowy raport w czacie miał 30–50 linii meta-procesu („Co sprawdziłem", „Czego nie sprawdziłem", „Odstępstwa od procesu", „Warto wiedzieć", „Co ustalił panel", „Jeszcze ręcznie po przebiegu"), narrację przy każdym wywołaniu, wypisany diff artefaktu z syntezą i tabelą STRIDE/DREAD, trzecią linię „Opcje:", znaczniki podstawy i regulamin składni odpowiedzi.
5. Człowiek dwa razy dopytywał „co to zmienia w aplikacji / czy da się to zrobić bez innego taska?", bo raport tego nie mówił.

## Decyzja

### A. Automatyczne przyjęcie pytań z potwierdzonym źródłem (ANL-060)

Pytanie dostaje `answer` = opcja `(recommended)` i `answered_by: auto`, gdy spełnia WSZYSTKIE warunki:

1. `basis: canon` albo `precedent` ze zweryfikowanym cytatem (`verify-answer-sources.mjs` exit 0);
2. `door_type: two-way`;
3. `class` inna niż `USER_CHALLENGE`;
4. `domain: tech` (produkt i prawo nigdy);
5. sparowana decyzja (`decision:`) bez `premise_failed` i `card_conflict`;
6. w `ask`, `rec` i `q` brak słów-kluczy: retencja, RODO/GDPR, dane osobowe, prawo/regulamin, bezpieczeństwo, uwierzytelnianie, autoryzacja, szyfrowanie, PII (lista zachowawcza; fałszywe trafienie kosztuje jedno „ok");
7. `analyze.resolve.auto_accept: true` i człowiek nie cofnął wcześniej tej odpowiedzi (`auto_reverted`).

Człowiek widzi te pytania jedną linią „Przyjęte automatycznie: N (cofnij: 1–N, lista w artefakcie)" i cofa je słowami „cofnij 2" (`reply.reverted`): pytanie wraca do listy, dostaje `auto_reverted: true` i nigdy więcej nie jest przyjmowane samo. `one-way`, `USER_CHALLENGE`, `new-pattern` bez `bulkEligible`, produkt/prawo i `basis: none` nie są przyjmowane automatycznie nigdy. ANL-034 bez zmian: `status: approved` tylko na polecenie człowieka. Utrwalenie decyzji (ANL-058) następuje dopiero po jego odpowiedzi na analizę i obejmuje te przyjęte automatycznie, których nie cofnął.

Egzekucja: `scripts/verify-answer-sources.mjs` liczy `autoEligible` i `auto.pending` (te same warunki w jednym miejscu: `scripts/lib/answer-evidence.mjs`, `autoEligibility`), a `answered_by: auto` na pytaniu bez uprawnień albo z `answer` innym niż opcja `(recommended)` to exit 2. `scripts/orchestrate-prepare.mjs` powtarza sprawdzenie warunków przy starcie `/orchestrate` (exit 2); samego cytatu nie weryfikuje drugi raz, bo utrwalenie decyzji w KANON przesuwa numery linii, a cytat sprawdził skrypt w chwili przyjęcia. Flaga `analyze.resolve.auto_accept` (blok `decision-registry`, parametr `resolve_auto_accept`, domyślnie `true`; brak klucza w starym `runtime.yml` = `false`; `false` = zachowanie sprzed zmiany). `resolve_stats` dostaje `auto_total`, `auto_reverted`, `auto_reverted_ratio`; odpowiedzi automatyczne nie wchodzą do `rec_*`, bo zawyżałyby akceptację.

### B. Jedno potwierdzenie

- `bulkEligible` obejmuje także `new-pattern`, o ile pytanie jest dwudrzwiowe, nie jest `USER_CHALLENGE`, nie ma flag decyzji i ma `domain: tech`. `canon`/`precedent` ze zweryfikowanym cytatem zostają `bulkEligible` w każdej domenie. `one-way` i `USER_CHALLENGE` tylko jawnie („ok 4", „2: odpowiedź").
- Parser `--reply` rozumie „ok", „ok wszystkie", „przyjmuję/biorę rekomendacje", „tak, zatwierdzam rekomendacje" (diakrytyki i interpunkcja bez znaczenia) jako przyjęcie rekomendacji pytań `bulkEligible`. Bez „poza" i gdy po tej odpowiedzi nic nie zostaje otwarte (też nic poza partią), znaczy to również zatwierdzenie (`reply.approve.granted`).
- „zatwierdzam" (bez „rekomendacje") = przyjęcie rekomendacji pytań `bulkEligible` plus `status: approved` w jednym kroku. Gdy zostało pytanie `one-way` albo `USER_CHALLENGE` bez odpowiedzi (albo pytania poza partią), parser zwraca `hold` z numerami i `approve.granted: false`: statusu nie ruszamy. `answer` nadal zapisuje się z `reply.answers[]` (tekst opcji, nie „ok").

### C. Krótki raport i mniej rund

- `batch_size` domyślnie 10 (z 5).
- Raport w czacie (ANL-040, jedyny obowiązujący format także przy wielu analizach naraz): linia `<TASK-ID>: <jedno zdanie biznesowe, co to zmienia w aplikacji albo w pracy zespołu>`; linia „Przyjęte automatycznie" (gdy N > 0); pytania dla człowieka jako `ask` i `rec` (dwie linie, bez „Opcje:", bez znaczników podstawy poza „nowy wzorzec"); jedna linia instrukcji „ok = przyjmij rekomendacje i zatwierdź · ok poza 3 · 3: odpowiedź".
- Zakaz w czacie: sekcje „Co sprawdziłem / Czego nie sprawdziłem / Odstępstwa od procesu / Warto wiedzieć / Co ustalił panel / Jeszcze ręcznie", narracja o panelu i telemetrii, treść artefaktu (synteza, STRIDE/DREAD, lista decyzji `MECHANICAL`), pytania spoza formatu ask/rec. Agent robi daną rzecz albo ją pomija; nie pyta.
- Meta-proces trafia do sekcji `## Przebieg` artefaktu (szablon `templates/task-analysis-template.md`); człowiek czyta ją tylko, gdy chce.

## Dlaczego ta zmiana odwraca decyzję z ADR 0016

ADR 0016 odrzucił `answered_by: auto` („decyzja zawsze człowieka"). Dane z siedmiu sesji pokazują, że przy pytaniach ze źródłem, dwudrzwiowych i technicznych „zawsze człowieka" oznacza pustą pracę: człowiek przyjął 100% rekomendacji w sesjach, które odpowiedziały w całości, a koszt to kilka wiadomości na analizę. @founder zatwierdził wariant z automatycznym przyjęciem, więc odwracamy to zawężenie, nie cały kontrakt: wszystko, co niesie ryzyko (one-way, `USER_CHALLENGE`, produkt/prawo, retencja/RODO, brak zweryfikowanego źródła), zostaje u człowieka.

## Ryzyka i łagodzenie

| Ryzyko | Łagodzenie |
|---|---|
| Rubber-stamp: człowiek przyjmuje „ok" bez czytania, bo raport jest krótki | Zostają mu tylko pytania, które naprawdę wymagają decyzji (one-way, `USER_CHALLENGE`, produkt/prawo, nowy wzorzec bez źródła); pełna lista i meta-proces są w artefakcie |
| Autoakceptacja: agent przyjmuje pytanie, które powinien zadać | Tylko zweryfikowany cytat (skrypt, nie agent), `two-way`, `tech`, bez słów-kluczy RODO/bezpieczeństwo, bez flag decyzji; `answered_by: auto` poza warunkami to exit 2 w `verify-answer-sources` i w `prepare` |
| Człowiek nie zauważa, co zostało przyjęte | Linia „Przyjęte automatycznie: N" w raporcie, lista `ask` → odpowiedź w `## Przebieg`, „cofnij N" przywraca pytanie |
| Zawyżone `rec_accepted` w metryce jakości | Odpowiedzi auto idą do `auto_*`, nie do `rec_*`; `auto_reverted_ratio` jest miarą zbyt luźnych warunków (wysoki = zaostrzyć) |
| „zatwierdzam" przyjęte jako zgoda na niewidziane pytania | `approve.granted` tylko gdy nic nie zostaje: pytania `one-way`/`USER_CHALLENGE` bez odpowiedzi i pytania poza partią blokują zatwierdzenie (`blockedBy` z numerami) |
| Fałszywe trafienie listy słów-kluczy | Zachowawcze: pytanie idzie do człowieka, koszt to jedno „ok" |

## Odrzucone

- **Auto również dla `new-pattern`**: brak zweryfikowanego źródła, to jest dokładnie to, na co człowiek ma patrzeć. `new-pattern` w domenie `tech` idzie hurtem („ok"), ale nie sam.
- **Auto dla `product`/`legal`** nawet ze źródłem: decyzje właściciela produktu; źródło potwierdza kierunek, nie zgodę.
- **Ponowna weryfikacja cytatu w `prepare`**: po utrwaleniu decyzji numery linii w KANON mogą się przesunąć i zablokować `/orchestrate` na poprawnej odpowiedzi.
- **Osobna komenda do cofania**: „cofnij N" jest słowem w tej samej odpowiedzi.

## Rollout

Zmiany są w `claude-patterns` (`develop`, niezacommitowane). Projekt, który używa `analyze.resolve` (juz-ide-api), musi ponownie zmaterializować `runtime.yml` (`node scripts/materialize-runtime.mjs <projekt>`), żeby dostać `batch_size: 10` i `auto_accept: true`; bez tego skrypty używają domyślnego `batch_size` 10 i traktują `auto_accept` jako wyłączone. Stara kopia `project-orchestration/analysis/TEMPLATE.md` w projekcie nie ma sekcji `## Przebieg`. `runtime.yml` w innych repozytoriach nie jest edytowany z tego repozytorium.

---

## Poprawka 2026-11-08

Test ADR 0017 na trzech realnych analizach pokazał trzy usterki. Poprawka bez nowego ADR: zmienia tylko wykonanie ANL-040, ANL-051 i ANL-034 w ramach tej samej decyzji (mniej pytań i mniej rund dla człowieka). Rollout jak wyżej; `runtime.yml` bez zmian.

1. **Luka w przeglądzie nigdy nie jest pytaniem (ANL-051).** Kontrola decyzji nie przeczytała trzech plików, a skill zrobił z tego `open_question` („czy powtórzyć przegląd?"), czyli oddał człowiekowi pracę procesu. Teraz: skill sam doczytuje brakujące pliki (jedno celowane doczytanie); gdy się nie da, wpisuje „Luka przeglądu: …" do `## Przebieg`. `verify-answer-sources` odrzuca (exit 2) pytanie bez `decision:` i bez `rec` oraz pytanie o proces analizy (kontrola, bramka, budżet, „nie przeczytała"; wzorzec w `scripts/lib/answer-evidence.mjs`, `PROCESS_RE`, zachowawczy). Zastępuje ANL-051 z 2026-10-28, gdzie niepełna bramka szła do `open_questions`.
2. **Linia instrukcji zgodna ze stanem (ANL-040).** „ok = przyjmij rekomendacje i zatwierdź" było nieprawdą, gdy zostawały pytania `one-way`/`USER_CHALLENGE` (parser zwraca `hold`, nie `approve`). Linię liczy teraz skrypt (`instruction` w wyniku `verify-answer-sources`, `instructionLine` w `scripts/lib/answer-reply.mjs`): `ok` tylko gdy wszystkie pytania partii są `bulkEligible`, inaczej np. `ok 1,2 · 3: odpowiedź`; przy `remaining` > 0 ogon „Zostało N pytań…". Dodatkowo: przy zerze brak linii „Przyjęte automatycznie"; w `rec` zakaz znaczników podstawy (canon/precedent/basis…) poza „nowy wzorzec" (exit 2 w `verify-answer-sources`); w czacie zakaz akapitu syntezy (synteza tylko w artefakcie).
3. **Po zatwierdzeniu agent nie implementuje (ANL-034).** Po „ok"/„zatwierdzam" skill poszedł dalej i edytował kod, `package.json` i lockfile. Teraz twardo: po zatwierdzeniu zmienia WYŁĄCZNIE artefakt analizy (`status: approved`, odpowiedzi) i zapisy ANL-058; nie edytuje kodu, `package.json`, lockfile, plików zadań ani luk, nie ustawia `status: done`, nie commituje, nie merguje. Implementacja to `/orchestrate`. Zamek tylko w prompcie (drugi zamek `orchestrate-prepare` dotyczy statusu, nie edycji plików).

**Znane ograniczenie.** Odpowiedź „ok 1,2 · 3: odpowiedź" zapisuje odpowiedzi, ale nie zatwierdza analizy (zgodnie z ANL-034 `approved` tylko na „ok" bez pozostałych pytań albo „zatwierdzam"): przy pytaniach `one-way` zostaje jeszcze jedno słowo, „zatwierdzam". Zmiana tego wymaga decyzji @founder.

Eval: `tests/flow-evals/analyze-resolve` (testy „luka przeglądu", „rec: znacznik podstawy", „instruction", „reguły w komendzie"). Sufit `commands/analyze.md` w `ceilings.json` bez zmian: tekst skrócony w komendzie (wymiana na odsyłacz do `docs/analyze-resolve.md`).

---

## Poprawka 2026-11-08 (2)

Powtarzające się problemy z przebiegów w ośmiu instancjach juz-ide-api. Poprawka bez nowego ADR: dotyczy wykonania `/analyze` i `/orchestrate` w ramach tej samej decyzji (mniej zwrotów do człowieka, mniej pracy do cofania po zatwierdzeniu). Zmiany wstecznie zgodne: nazwy i ścieżki skryptów, format artefaktu, `orchestrate-tree-hash.mjs` i `report-deviation.mjs` bez zmian; `verify-answer-sources` bez nowej flagi działa jak dotąd.

1. **Frontmatter artefaktu (ANL-061, ANL-010).** `rag: skipped (…: …)` z nieocytowanym `: ` kończył się błędem YAML dopiero w `/orchestrate`; ` #` w wartości ucinał ją po cichu. Teraz `verify-answer-sources.mjs <artefakt> --check-frontmatter` biegnie zawsze na końcu `/analyze` (krok 2.a), niezależnie od `analyze.resolve`, i kończy się exit 2 z numerem linii. Szablon ma pola `rag:` i `stack_blocks:`, ANL-010 wymaga `rag: "skipped (powód)"`.
2. **Bramka końcowa (ORC-152).** Pierwszy przebieg dostał ten sam termin co ponowienie ORC-087: werdykt najpóźniej po 70% limitu, potem tylko wynik; zakres tylko z listy zmian. Definicja `security-e2e-verifier` znała jedną z dwóch nazw sekcji bezpieczeństwa, więc „brak sekcji" mógł odpalić generowanie threat-modelu w bramce; teraz obie nazwy, a w `/orchestrate` brak sekcji to `unverified_scope`. Chunkowanie diffów >~40 plików opisane jako zalecenie (`docs/orchestrate-manual-mode.md`), bez zmian w silniku. Przyczyna z lektury definicji, bez transkryptu.
3. **Workflow niedostępny (ORC-153).** Dokument `docs/orchestrate-manual-mode.md` i jedna linia w komendzie: sekwencyjnie warstwa po warstwie, wynik częściowy = `NO_GO` `machine`, `final_gate.checks` samodzielnie, zakaz commitów, lista utraconych gwarancji w raporcie.
4. **Bramka decyzji niepełna (ANL-051, ANL-017).** Parametr istniał: `budgets.decision-gate` (12 wywołań) przy 72 wpisach `needs_scope_check` w juz-ide. Domyślnie 30; wpisy zawężone do tagów taska, a przy >15 dwa sekwencyjne wywołania. Istniejące `runtime.yml` dostają zmianę po `materialize-runtime.mjs`.
5. **Hook `config-protection` (ANL-062, ORC-154).** Pliki konfiguracji lintu/formatera (lista z hooka; `tsconfig*` do niej nie należy) `/analyze` nie wpisuje do zakresu agenta, zmiana idzie do „Kroków ręcznych po przebiegu"; `prepare` ostrzega; zablokowana edycja w przebiegu to wpis „otwarte" plus `report-deviation --category config`, bez obchodzenia hooka.
6. **Sekcja `## 🔒 Security Pre-Analysis` (ANL-063).** `/analyze` może dopisać do pliku zadania tę jedną sekcję (z modelu zagrożeń), gdy stage `threat-model` zapisał TM; to jedyny nowy zapis w liście ANL-001 poza polem z ANL-058.

**Rollout.** Projekty muszą ponownie zmaterializować `runtime.yml`, żeby dostać budżet `decision-gate: 30`. Żywe przebiegi `/orchestrate` nie są dotykane: zmiany promptu bramki i `NO_REVERT` obejmują tylko nowe emisje skryptu.

**Czego nie wdrożono.** Logiki chunkowania bramki w silniku; zmiany `maxTurns` ani `scaledBudget`; automatycznego dopisywania „Kroków ręcznych"; sprawdzania ` #` w polach innych niż `rag`/`stack_blocks`.

Eval: `analyze-resolve` (frontmatter, reguły w komendzie, budżet bramki), `orchestrate-prepare` (`units-config-protected-file-in-dirs-warns`), `orchestrate-script` (`final-gate-first-pass-verdict-by-70-percent-and-scoped-reads`).
