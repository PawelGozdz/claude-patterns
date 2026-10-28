# Kontrola sędziów i polityka powtórzeń w evalach

Dotyczy `tests/flow-evals/` · źródło: `TASK-GSTACK-ADOPT-001` (B1, B2) · tło: [ADR 0004](adr/0004-modular-eval-pyramid.md)

**Zasada:** sędzia (LLM albo heurystyka oceniająca artefakt) wchodzi do obiegu dopiero po tym, jak przejdzie
paczkę kontrolną. Dopuszczenie sędziego jest warunkiem wstępnym dla L2 z [TASK-EVAL-001](tasks/TASK-EVAL-001.md) (Faza 2).
Bez tego nie wiemy, czy ocena cokolwiek widzi, czy tylko wygląda na ocenę.

## 1. Paczka kontrolna

Katalog `tests/flow-evals/judge-controls/packs/<id>/`:

| plik | zawartość |
|------|-----------|
| `positive.md` | poprawny artefakt (celowo niedoskonały, żeby sędzia miał z czego odjąć punkt) |
| `negative.md` | ten sam szkielet, same nagłówki, zero treści |
| `defect.md` | `positive.md` z JEDNYM wstawionym defektem (do 2 zmienionych linii) |
| `pack.json` | `id`, `artifact` (skąd wzięty), `scale`, `rubric.dimensions[]`, `variants`, `defect` |

`defect` w `pack.json` ma `dimension` (wymiar rubryki, który defekt psuje), `marker` (tekst obecny w `defect.md`,
nieobecny w `positive.md`) i `description`. Loader (`loadPack`) odrzuca paczkę, w której negative ma treść,
defekt jest za duży albo identyczny z positive, a marker nie pasuje.

Jedyna paczka na dziś: `verifier-report`, czyli tabela `file | rules_checked | violations | verdict` z raportu
`code-quality-verifier`. Defekt: wiersz z naruszeniem ma werdykt PASS (wymiar `verdict_consistency`).

## 2. Co sprawdza runner

`runJudgeControls(judge, pack)` woła sędziego 3 razy na wariant (9 wywołań) i bierze medianę per wymiar.
Sędzia jest dopuszczony (`ADMITTED`), gdy przejdą wszystkie cztery kontrole:

| kontrola | warunek |
|----------|---------|
| `accepts_positive` | większość werdyktów PASS i każda mediana >= progu (domyślnie 3 w skali 1–5) |
| `positive_not_inflated` | positive nie ma maksimum we wszystkich wymiarach naraz (5/5 wszędzie = podejrzane) |
| `rejects_negative` | większość werdyktów FAIL i więcej niż połowa wymiarów z medianą poniżej progu |
| `detects_defect` | mediana wymiaru dotkniętego defektem poniżej progu i niższa niż w positive |

Raport niesie `reasons` (przy `NOT_ADMITTED` tylko powody odmowy), mediany per wariant, pojedyncze próbki
i `collateralDrops` (inne wymiary, które też spadły; to informacja, nie warunek).

## 3. Jak podpiąć realnego sędziego

1. Napisz moduł `.mjs` z domyślnym eksportem o sygnaturze
   `async (artifact, rubric) => ({ scores: { <id wymiaru>: liczba }, verdict: 'PASS' | 'FAIL' })`.
   `rubric` to `{ dimensions: [{id, description}], scale: {min, max} }`. Zwróć dokładnie te wymiary co w rubryce,
   w granicach skali; inaczej runner rzuci `BAD_JUDGE_OUTPUT`.
2. Uruchom (to płatny krok: 9 wywołań modelu na paczkę, nigdy w pre-commit):
   `node tests/flow-evals/judge-controls/run.js --judge ./moj-sedzia.mjs --pack verifier-report`
3. Wynik trafia na stdout i jako wiersz do `tests/flow-evals/judge-controls/admissions.jsonl`; exit 0 tylko
   dla `ADMITTED`. Zmiana promptu albo modelu sędziego unieważnia dopuszczenie, więc powtórz kontrolę.
4. Dopiero dopuszczonego sędziego wolno użyć w evalu L2.

Nowa paczka: skopiuj `packs/verifier-report/`, wymień artefakt i rubrykę, wstaw jeden defekt i uruchom
`node tests/flow-evals/judge-controls/run.js` (E1 sprawdza format wszystkich paczek w `packs/`).

Atrapy w `fixtures/stub-judges.mjs` (dobra, ślepa, sufitowa) dowodzą, że kontrola działa w obu kierunkach:
ślepy sędzia, który patrzy tylko na strukturę, przepuszcza defekt i **musi** zostać niedopuszczony.
Eval nie woła modelu.

## 4. Polityka powtórzeń (B2)

`tests/flow-evals/lib/eval-policy.mjs` ustala z góry, ile prób robimy i jak składamy werdykt:

| rodzaj | próby | werdykt |
|--------|-------|---------|
| `rule` | 1 | każda porażka = porażka |
| `behavior` | 3 | PASS gdy >= 2/3 i żadna próba nie naruszyła kontraktu wyjścia |
| `judge` | 3 | mediana per wymiar, PASS gdy każda mediana >= progu |

`panelVerdict(kind, results)` zwraca `{ verdict, passed, total, reason }`. Zły rodzaj, zła liczba prób albo
wynik bez jawnego pola `contractViolation` rzuca `EvalPolicyError`, nic nie jest domyślnie poprawiane.

**Bez retry poza jednym zapisanym rerunem.** Powtórzenie przypadku jest dozwolone raz na (run, przypadek) i musi
przejść przez `recordRerun(rerunLogPath(evalDir), { runId, caseId, kind, reason })`, które dopisuje wiersz do
`reruns.jsonl` obok wyników. Drugi rerun tego samego przypadku rzuca `RERUN_EXHAUSTED`. `collectAttempts` wykonuje
dokładnie tyle prób, ile przewiduje polityka, i nie połyka wyjątków.

Testy: `node tests/flow-evals/eval-policy/run.js`, `node tests/flow-evals/judge-controls/run.js`.
