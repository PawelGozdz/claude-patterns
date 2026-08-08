# TASK-RAG-004 — spójność retrievalu: ścieżki względne, kanoniczny ref, inwalidacja

> **STATUS: draft** (2026-08-02) — plan do review, nic nie zaimplementowane.
>
> **Numeracja:** `TASK-RAG-003` zapowiadał `TASK-RAG-004` jako kontynuację swoich sekcji
> 0a/1/2/3/4 (examples-as-contract, knowledge-pins, best_practices, multi-stack). Ten task
> przejmuje numer 004, bo jest **twardym prerequisitem** tamtego zakresu — tą samą logiką,
> którą RAG-003 zastosował wobec RAG-002 („nie rozbudowujemy retrievalu, którego wartość nie
> została udowodniona"): nie rozbudowujemy retrievalu, którego **poprawność** jest złamana.
> Backlog RAG-003 → **`TASK-RAG-005`**.

**Źródło:** feedback z realnego użycia w `juz-ide-api-*` (sesja 2026-08-02) + weryfikacja w kodzie.

---

## Diagnoza (zweryfikowana w kodzie, nie zgadywanie)

1. **Jedna kolekcja kodu dla czterech drzew roboczych.** `code_juz_ide_api` jest zapisana w
   `.claude/config/knowledge.json` wszystkich czterech instancji (`juz-ide-api-1..4`), a
   `reseed.config.json:4` seeduje ją **wyłącznie** z `../juz-ide-api-1/src`. Instancje siedzą na
   czterech różnych branchach (api-1 `ae2802f0b`, api-2 `8106b1b43`, api-3 `ae2802f0b`,
   api-4 `f2d40098a`).
2. **Ścieżki absolutne.** `indexer.ts:47` robi `walk(resolve(d), …)`, więc `chunk.source` to
   `/opt/projects/juz-ide-api-1/src/…`. Agent w api-2 dostaje trafienie wskazujące fizycznie na
   plik z cudzego drzewa — plik ISTNIEJE i da się go przeczytać, więc błąd jest cichy.
   `types.ts:9` deklaruje intencję („relative file path (code)") — implementacja się z nią rozjechała.
3. **Asymetryczne skażenie.** Tylko api-2 ma `watchDirs: ["src"]`, więc tylko api-2 dosypuje przez
   `POST /reindex-file` → `reindexFile()` chunki ze **swojego** drzewa do wspólnej kolekcji.
   Stąd obserwowane „połowa trafień z innego repo" i jej zmienność w czasie (reseed = `recreate()`
   czyści osad, po czym narasta od nowa).
4. **Indeks dostarcza treść, nie lokalizację.** `Hit.text` zwraca pełny tekst chunku
   (`store-qdrant.ts:27`). Indeks zwracający treść degraduje się katastrofalnie przy nieświeżości
   (agent działa na kodzie, którego nigdzie nie ma); indeks zwracający wskaźnik degraduje się
   łagodnie (gorszy ranking, ale treść czytana z dysku jest prawdziwa).
5. **Brak inwalidacji dla patternów.** `reseed-patterns.sh` to ręczny, pełny `recreate()`.
   CLAUDE.md sam pisze *„Easy to forget"*. Warunek poprawności oparty na ludzkiej pamięci zawiedzie.
6. **Eval nie pokrywa tej klasy.** `hit@5=0.85` z TASK-RAG-002 mierzył golden-set dla
   `patterns_global`. Poprawność cross-worktree w `retrieve_code` nie jest mierzona wcale.

### Czego NIE trzeba naprawiać (sprawdzone)

- `patterns/<kategoria>` w instancjach to **symlinki** do `claude-patterns/patterns/<kategoria>` —
  edycja patternu propaguje się natychmiast do wszystkich. Pliki nie dryfują.
- `patterns_global` **już używa ścieżek względnych** (`global-indexer.ts:67`). R1 nie dotyczy patternów.
- `PAYLOAD_INDEX_FIELDS` (`schema.ts:53`) **już zawiera `source`** — `deleteBySource` i
  `group_by:"source"` są zaindeksowane. Nic do dodania.
- `learned/` (13 plików) jest dziś bajt-w-bajt identyczny we wszystkich czterech instancjach —
  propaguje się przez git, działa.
- `patterns-local/` jest pusty (sam README) we wszystkich czterech — martwy kanał, do usunięcia
  przy okazji (poza zakresem tego taska).

---

## Zasada porządkująca

> **Pliki są źródłem prawdy. Baza wektorowa jest indeksem NAD nimi — zwraca lokalizację, nie treść.**
>
> Snippet w odpowiedzi to **dowód trafienia** („dlatego to pasuje"), nie materiał do skopiowania.
> (Decyzja usera, 2026-08-02.)

Konsekwencja, która ratuje wspólną kolekcję: przy ścieżkach względnych agent w api-2 dostaje
`src/contexts/geo/foo.ts:120-160`, czyta ten plik **u siebie** i dostaje wersję ze swojego brancha.
Indeks odpowiada na pytanie *„gdzie w tej bazie kodu mieszka to pojęcie"* — stabilne między
branchami. Nie odpowiada na *„jaka jest treść"*.

---

## R1 — ścieżki repo-relative + snippet jako dowód trafienia

**Zakres: wyłącznie kolekcje kodu (`code_*`).** Patterns/examples zostają bez zmian.

### R1.1 Ścieżki względne w indekserze
- [ ] `indexer.ts::walk(dir, acc)` → `walk(dir, acc, repoRoot)`; `chunkFile(…, relative(repoRoot, full))`.
- [ ] `buildCodeIndex(dirs, collection)` → `buildCodeIndex({repoRoot, dirs, collection, repo, sha})`.
- [ ] Nowe pola payloadu w `types.ts::Chunk`/`Hit` + `store-qdrant.ts::add`/`toHit`:
      `repo?: string` (np. `"local-hero"`), `indexedSha?: string`.

> **⚠ PUŁAPKA — `reindexFile` i `deleteBySource`.** `deleteBySource` (`store-qdrant.ts:76`) filtruje
> po **dokładnej** wartości `source`. `reindexFile` dostaje dziś ścieżkę absolutną. Po przejściu na
> ścieżki względne trzeba konwertować abs→rel **przed** `deleteBySource`, inaczej delete nie trafi w
> nic i osierocone chunki będą się cicho kumulować przy każdej edycji pliku.
> `reindexFile(absPath, collection)` → `reindexFile(absPath, collection, repoRoot)`.

> **⚠ PUŁAPKA — zmiana ID chunków.** `chunk.id` = `` `${source}#${index}` `` → seed dla UUID v5
> (`store-qdrant.ts:58`). Zmiana `source` z absolutnego na względny **zmienia wszystkie ID**.
> `buildCodeIndex` robi `recreate()`, więc pełny reseed jest czysty — ale **ścieżka przez sam
> `reindexFile` stworzyłaby duplikaty** obok starych chunków z absolutnymi ścieżkami.
> Kolejność jest obowiązkowa: najpierw pełny reseed wszystkich kolekcji `code_*`, dopiero potem
> włączenie inkrementalnego reindexu.

### R1.2 Kształt odpowiedzi `retrieve_code`
- [ ] `Hit` dla kodu: `{ path, startLine, endLine, section, score, evidence, evidenceTruncated, repo, indexedSha, indexedAt }`.
- [ ] `evidence` = pierwsze N linii chunku (`KR_CODE_EVIDENCE_LINES`, domyślnie 12) + flaga
      `evidenceTruncated: true`, gdy ucięte. Bez zmian dla `retrieve_patterns`/`retrieve_examples`.
- [ ] Opis toola (`index.ts:50-54`) przepisany wprost: *„`evidence` to fragment uzasadniający
      trafienie — NIE kopiuj go. Otwórz `path` w SWOIM drzewie roboczym (Read) i pracuj na treści
      z dysku. Ścieżka jest względna do korzenia repo."*

> **⚠ RYZYKO — największe w całym taskcie.** Ucięcie snippetu **bez** równoczesnej zmiany instrukcji
> agentów jest **gorsze niż stan dzisiejszy**: agent dostanie 12 linii kodu bez kontekstu i zadziała
> na nich tak, jakby to była całość. Zmiana kontraktu i zmiana instrukcji muszą wejść **razem, w
> jednym commicie**. Nie ma tu bezpiecznej kolejności częściowej.

### R1.3 Instrukcje agentów (sprzężone z R1.2, ten sam commit)
- [ ] `agents/stacks/nestjs-ddd/implementers/{domain-application,infrastructure,test}-implementer.md` —
      sekcja o `retrieve_code`: reguła „trafienie → Read pliku pod `path` → dopiero potem pisz".
- [ ] `agents/stacks/flutter-clean-arch/flutter-implementer.md`,
      `agents/stacks/nestjs-ddd/sql-postgres-optimizer.md` — to samo.
- [ ] `commands/analyze-ddd.md`, `commands/orchestrate-ddd.md` — jw. w opisie kroku RAG.
- [ ] **Główny agent orkiestrujący**: prompty komponowane ad hoc do subagentów wracają dziś do
      sformułowania *„możesz, ale jeśli MCP niedostępny, pomiń"* — dokładnie tego, co TASK-RAG-002
      zdiagnozował jako przyczynę zerowej adopcji, tylko poziom wyżej i poza naprawioną powierzchnią.
      Regułę decyzyjną (nieznana nazwa symbolu → `retrieve_code`; znana → prosto do Read/Grep)
      przenieść do `commands/orchestrate-ddd.md` jako tekst **wstrzykiwany do promptu subagenta**,
      zamiast liczyć na to, że główny agent ją odtworzy z pamięci.

**Definition of done R1:** zapytanie z kontekstu api-2 zwraca `src/…` (bez prefiksu drzewa),
`evidence` ≤ 12 linii, a instrukcje implementerów mówią wprost o Read.

---

## R2 — indeksowanie kanonicznego refa zamiast żywego drzewa roboczego

### R2.1 Nowy kształt `reseed.config.json`
```jsonc
{
  "collections": {
    "code_juz_ide_api": {
      "repo": "/opt/projects/juz-ide-api-1",   // dowolny klon — tylko dostawca obiektów gita
      "ref": "develop",                         // ŹRÓDŁO PRAWDY indeksu
      "dirs": ["src"],
      "repoName": "local-hero"
    }
  }
}
```
- [ ] Wsteczna zgodność: stara forma (tablica katalogów) nadal działa = indeksowanie drzewa roboczego,
      ale loguje `WARN: indexing a live worktree — WIP may leak into a shared collection`.

### R2.2 Indeksowanie z refa
- [ ] `git -C <repo> rev-parse <ref>` → `sha` (do payloadu + manifestu).
- [ ] `git -C <repo> archive <ref> -- <dirs>` → rozpakowanie do katalogu tymczasowego → `walk()` z
      `repoRoot` = ten katalog (ścieżki względne wychodzą czyste z definicji) → sprzątanie temp.
- [ ] `mirror/collections.json`: dopisać `{ repo, ref, sha, indexedAt }` obok `model`/`dim`.

### R2.3 Zamknięcie kanału skażenia
- [ ] Usunąć `watchDirs` z `juz-ide-api-2/.claude/config/knowledge.json` — po R2 indeks jest
      **celowo** stanem `develop`, a nie czyjegoś WIP-u, więc wstrzykiwanie edycji z drzewa roboczego
      przestaje mieć sens.
- [ ] `hooks/README.md` + `hooks/knowledge-freshness-postwrite.js` (docblock): zapisać wprost, że
      freshness dla **kodu** jest wyłączony w modelu „indeks = kanoniczny ref", i dlaczego.

> **Do decyzji (OQ1).** Alternatywa dla twardego wyłączenia: freshness pisze do prywatnej nakładki
> `code_<instancja>_wip`, a `retrieve_code` odpytuje baseline + nakładkę i scala. Daje świeżość
> własnego WIP-u bez skażania innych, kosztem drugiej kolekcji per instancja i logiki scalania.
> **Rekomendacja: na teraz wyłączyć.** Po R1 własny WIP i tak jest dostępny przez Read/Grep, który
> dla „wiem, czego szukam" jest szybszy i pewniejszy od wektorów.

### R2.4 Kadencja reseedu
- [ ] `scripts/reseed-code.sh` (siostra `reseed-patterns.sh`) — reseed wszystkich kolekcji `code_*`
      z ich refów, jedna komenda.
- [ ] Uruchamiany po merge'u do `develop` (ręcznie lub z CI). **Nie** przy każdej edycji pliku.

**Definition of done R2:** `mirror/collections.json` ma SHA dla `code_juz_ide_api`, żadna instancja
nie ma włączonego freshness dla kodu, reseed jest odtwarzalny z samego refa.

---

## R3 — inwalidacja + widoczna nieświeżość

Dwa różne korpusy, dwa różne właściwe sygnały — to nie niespójność, tylko konsekwencja tego, że
patterns mają jedną kanoniczną lokalizację, a kod ma N drzew roboczych.

### R3a — patterns: inkrementalny reindex przy edycji
- [ ] Wydzielić z `global-indexer.ts::buildPatternsIndex` (linie 60-78) funkcję
      `chunkPatternFile(abs): Chunk[]` (dziś inline: `relative(REPO_ROOT, abs)` + `chunkMarkdown`).
- [ ] `reindexPatternFile(abs)`: `deleteBySource(rel)` → `chunkPatternFile` → `embedAll` → `add`.
      ~15 linii, cały budulec już istnieje.
- [ ] `POST /reindex-file` (`index.ts:157`): routing po rozszerzeniu — `.md` pod
      `patterns/**`|`rules/**` → `patterns_global`; `.ts`/`.dart` → kolekcja kodu.
- [ ] Hook `knowledge-freshness-postwrite.js` szuka dziś `.claude/config/knowledge.json` w górę
      drzewa. Repo `claude-patterns` musi dostać własny plik z markerem (np.
      `{"patternsGlobal": true, "watchDirs": ["patterns", "rules"]}`) i rozszerzenie filtra o `.md`.
- [ ] Zarejestrować hook w `.claude/settings.json` **repo claude-patterns** (matcher `Edit|Write|MultiEdit`).
- [ ] Sprawdzić, że rule cards `_summary.md` wchodzą — `SKIP_META_FILES` (`global-indexer.ts:36`)
      ich nie wyklucza, ale to warto potwierdzić testem, bo to najczęściej czytany artefakt.
- [ ] `reseed-patterns.sh` zostaje jako narzędzie pełnej odbudowy (zmiana modelu embeddingów,
      naprawa rozjazdu) — przestaje być **warunkiem poprawności**.

### R3b — kod: nieświeżość jako rozjazd SHA, nie mtime
Daemon jest współdzielony i po R1 nie wie, w którym drzewie roboczym siedzi caller — `stat()` pliku
źródłowego jest więc dla kodu niewykonalny. Właściwym sygnałem jest rozjazd commitów.

- [ ] Odpowiedź `retrieve_code` niesie `indexedSha` + `indexedAt` (z R1.1/R2.2).
- [ ] `commands/analyze-ddd.md` / `commands/orchestrate-ddd.md`: porównać `indexedSha` z lokalnym
      `git rev-parse HEAD`; przy rozjeździe wstrzyknąć do promptu subagenta zdanie:
      *„indeks odzwierciedla `develop@<sha>`, Twój branch jest inny — trafienia traktuj jako
      wskazówkę baseline'ową, treść zawsze z Read"*.

### R3c — patterns: `stale` przy zapytaniu
Dla patternów `stat()` **działa** (jedna kanoniczna lokalizacja, daemon widzi pliki).
- [ ] `retrieve_patterns`: `stat()` pliku źródłowego trafienia; jeśli `mtime > indexedAt` → `stale: true`.
      Siatka bezpieczeństwa na wypadek, gdyby hook z R3a nie zadziałał (daemon padł, hook wyłączony).

### R3d — eval na tę właśnie klasę błędu
- [ ] `tests/flow-evals/retrieval`: przypadek cross-worktree — zapytanie w kontekście api-2,
      asercja że zwrócona ścieżka **rozwiązuje się w api-2** i treść pod nią zgadza się z HEAD api-2,
      nie api-1. To dokładnie to, czego dzisiejszy `hit@5=0.85` nie mierzy.
- [ ] Przypadek regresji na R3a: edytuj plik patternu → bez reseedu `retrieve_patterns` zwraca nową treść.

**Definition of done R3:** edycja patternu jest widoczna w `retrieve_patterns` bez ręcznego reseedu;
odpowiedź `retrieve_code` niesie SHA indeksu; eval cross-worktree jest zielony.

---

## Kolejność i rollback

| # | Krok | Odwracalność |
|---|---|---|
| 1 | R1.1 + R1.2 + R1.3 **w jednym commicie** (kontrakt + instrukcje agentów razem) | `git revert` + reseed ze starym kodem |
| 2 | R2.1–R2.3, potem **pełny reseed wszystkich `code_*`** | stary `reseed.config.json` nadal wspierany (R2.1) |
| 3 | Włączyć inkrementalny reindex dopiero **po** kroku 2 (patrz pułapka ID w R1.1) | wyłączenie hooka |
| 4 | R3a + R3c (patterns) | wyłączenie hooka, `reseed-patterns.sh` odtwarza stan |
| 5 | R3b + R3d | brak ryzyka — czysto addytywne |

Krok 1 i 2 muszą iść w tej kolejności: reseed ze starym kodem indeksera zapisze ścieżki absolutne.

---

## Poza zakresem (świadomie)

- **`git worktree` zamiast czterech klonów** (~450 MB zduplikowanych obiektów, cztery `.git`).
  Warte zrobienia dla higieny, ale **niezależne** — po R1+R2 warstwa wiedzy jest worktree-agnostyczna
  z definicji i nie obchodzi jej, czy to klony czy worktree'y.
- Usunięcie martwego `patterns-local/` z instancji.
- Backlog RAG-003 (examples-as-contract, knowledge-pins, best_practices, multi-stack) → `TASK-RAG-005`.

## Otwarte pytania

- **OQ1** — freshness kodu: twarde wyłączenie (rekomendacja) czy nakładka `code_<instancja>_wip`?
- **OQ2** — `KR_CODE_EVIDENCE_LINES = 12`: do kalibracji na realnych przebiegach. Za mało → agent
  nie oceni trafności i zrobi zbędny Read; za dużo → wraca pokusa kopiowania.
- **OQ3** — czy `retrieve_patterns` też ma ucinać `text`? Rule cards są krótkie i samodzielne,
  więc skłaniam się do **nie** — ale wtedy dwa toole mają różny kontrakt i trzeba to powiedzieć
  wprost w opisach, żeby agent nie uogólnił jednego na drugi.
- **OQ4** — czy `repoName` (`local-hero`) ma być w payloadzie od razu, czy dopiero gdy pojawi się
  druga kolekcja z tego samego repo? Dziś jest nieużywany poza diagnostyką.
