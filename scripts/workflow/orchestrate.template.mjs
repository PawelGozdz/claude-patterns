export const meta = {
  name: 'orchestrate',
  description: 'Pętla implement→verify→fix po warstwach z runtime.yml, bramka końcowa, staged not committed',
  phases: [
    { title: 'Warstwy', detail: 'implement → sonda → verify → fix, sekwencyjnie po warstwach' },
    { title: 'Bramka końcowa', detail: 'VETO na całości zmiany' },
  ],
}

// scripts/workflow/orchestrate.template.mjs — KANONICZNY skrypt Workflow dla /orchestrate.
// (TASK-KAIZEN-002 / K93; audyt 2026-09-07 §E7)
//
// ─── Dlaczego plik, a nie named workflow w `.claude/workflows/` ────────────────────
// Rozważane były dwie lokalizacje. Wybrano plik + `scriptPath`, bo:
//   1. `Workflow({scriptPath, resumeFromRunId})` jest udokumentowanym, sprawdzonym wejściem
//      narzędzia. Katalog rejestru named workflows nie jest w tym harnessie udokumentowany
//      ani obecny (`.claude/workflows/` nie istnieje ani globalnie, ani w żadnym projekcie),
//      a oparcie silnika na zgadniętej konwencji ładowania to dokładnie ta klasa błędu,
//      którą repo już raz zapisało jako „zweryfikowane funkcje kontra halucynacje".
//   2. `scripts/orchestrate-prepare.mjs` (K92) wypisuje ABSOLUTNĄ ścieżkę tego pliku w polu
//      `scriptPath`. Satelita nie musi więc nic symlinkować, a `setup-project.sh` nie zyskuje
//      kolejnego kroku instalacyjnego, który mógłby się rozjechać.
//   3. `resumeFromRunId` działa z `scriptPath` tak samo — a wznowienie po awarii jest w tym
//      przebiegu normą, nie wyjątkiem.
//
// ─── Kontrakt ─────────────────────────────────────────────────────────────────────
// WSZYSTKIE parametry przychodzą w `args` = JSON z `orchestrate-prepare.mjs`. Zero ścieżek,
// zero nazw agentów, zero komend wpisanych na sztywno. Skrypt Workflow NIE MA dostępu do
// filesystemu — karty reguł (`patterns[].content`) wczytał za niego krok przygotowania.
//
// ─── Czego ten plik jest zapisem ──────────────────────────────────────────────────
// Reguł ORC-* z `commands/orchestrate.md` (uzasadnienia: docs/decisions/orchestrate-rule-history.md).
// Egzekwuje je `hooks/workflow-lint.js` WL1-WL16 — ten plik jest jego fixture'em „musi przejść",
// więc każda zmiana kształtu tutaj jest widoczna w evalu, a nie dopiero w przebiegu za $40.
//
// ─── Świadome odstępstwo od „verifiery równolegle" ────────────────────────────────
// Warstwy idą SEKWENCYJNIE, a verify NIGDY nie jest zrównoleglony — WL2 (CONFORMANCE §3:
// 9/9 martwych wywołań verify szło przez zrównoleglenie). `inner_loop` w runtime.yml ma
// jeden slot weryfikatora na warstwę, więc nie ma czego zrównoleglać; gdyby kiedyś było,
// obowiązuje kolejność, nie wachlarz.

// ══════════════════════════════════════════════════════════════════════════════════
// CORE START — czysta logika bez `agent()`. Testowana bez Workflow przez
// `scripts/workflow/orchestrate-core.mjs` (wycina TEN blok z tego pliku i eksportuje).
// Nie przenoś stąd niczego do osobnego modułu: skrypt Workflow nie ma `import`.
// Sentinele poniżej są PARSOWANE — nie zmieniaj ich treści bez zmiany orchestrate-core.mjs.
// ══════════════════════════════════════════════════════════════════════════════════
// >>> CORE

// Domyślne budżety — miękkie bezpieczniki, nie sufit ambicji. Nadpisuje je `args.budgets`
// (runtime.yml → `budgets:`), bo blok wie o stacku więcej niż ten plik.
const DEFAULTS = { implTurns: 40, verifyCalls: 15, probeTurns: 8, diffProbeTurns: 5, maxAttempts: 3 }

// Routing modeli — JAWNIE, nie dziedziczeniem. `agent()` bez `model:` bierze model głównej
// pętli, więc na drogiej sesji każda sonda liczy kontekst po najwyższej stawce (a kontekst
// to ~91% rachunku przebiegu). Jakość chronią weryfikatory, nie drogi implementer.
function modelFor(role) {
  if (role === 'probe') return { model: 'haiku', effort: 'low' }
  if (role === 'implement') return { model: 'sonnet' }
  if (role === 'verify') return { model: 'sonnet' }
  return {} // bramka końcowa — dziedziczy model sesji, zwykle najmocniejszy
}

function budgetFor(a, slot, fallback) {
  const b = (a && a.budgets && a.budgets[slot]) || {}
  const n = b.max_tool_calls != null ? b.max_tool_calls : b.max_turns
  return typeof n === 'number' && n > 0 ? n : fallback
}

// `inner_loop.verify`/`final_gate.agent` w runtime.yml dopuszczają zapis "agent-a | agent-b"
// (alternatywa — patrz clean-arch.yml: "flutter-quality-verifier | flutter-ui-verifier"),
// ale agent() przyjmuje jeden agentType. Bez tego rozbicia string leciał całościowo jako
// nazwa agenta, agent() rzucał natychmiast, ask() łapał to jako "cichą śmierć", i po dwóch
// takich próbach warstwa kończyła ESCALATE_AND_HALT mimo że verifier nigdy się nie odpalił
// (zaobserwowane w juz-ide-mobile-app, 2026-09-09). Minimalna łatka: pierwsza alternatywa
// zawsze wygrywa, druga jest dziś martwa — wybór per warstwa albo uruchomienie obu i
// scalenie werdyktów to osobna decyzja projektowa, nie bugfix.
function firstAgentName(raw) {
  if (!raw) return null
  return String(raw).split('|')[0].trim() || null
}

// Kolejność warstw = kolejność z runtime.yml. Pominięte to te z `layers_done` w artefakcie
// (checkpoint wznowienia) oraz warunkowe `optional: true`, których `create_when` nie trafia.
function layerPlan(a, createWhenHits) {
  const hits = createWhenHits || {}
  return (a.layers || []).map((l) => {
    if (l.skip) return { layer: l, run: false, reason: l.skipReason || 'layers_done' }
    if (l.optional && hits[l.id] !== true) {
      return { layer: l, run: false, reason: 'warstwa warunkowa — create_when nie trafił: ' + (l.createWhen || '') }
    }
    return { layer: l, run: true, reason: null }
  })
}

// Karty dla warstwy: wzorce przypisane wprost do niej + wszystko, co weszło globalnie.
// Implementer dostaje KARTĘ (forma decyzyjna, ~2-8 KB); pełny wzorzec (20-36 KB) trafia tu
// tylko wtedy, gdy karty po prostu nie ma — i `orchestrate-prepare` mówi o tym w warnings.
// `layerId` to id warstwy BAZOWEJ: pod-warstwa z `units[]` (`infrastructure:audience`) niesie
// `base: 'infrastructure'` i dostaje karty swojej warstwy, nie pustą listę.
function cardsFor(a, layerId) {
  const all = a.patterns || []
  const own = all.filter((p) => p.origin === 'layer:' + layerId)
  const rest = all.filter((p) => p.origin !== 'layer:' + layerId && !String(p.origin || '').startsWith('layer:'))
  return own.concat(rest)
}

function baseId(layer) {
  return layer.base || layer.id
}

function renderCards(cards, heading) {
  if (!cards.length) return ''
  const body = cards.map((p) =>
    '--- ' + p.path + (p.card ? ' (karta reguł)' : ' (PEŁNY wzorzec — karty brak)') + ' ---\n' + p.content,
  ).join('\n')
  return '\n=== KARTY REGUŁ — ' + (heading || 'obowiązujące dla tej warstwy') + ' ===\n' + body +
    '\n=== koniec kart ===\n\n' +
    'Masz komplet reguł POWYŻEJ. NIE czytaj pełnych wzorców i nie szukaj ich w repo ani ' +
    'w innych projektach. Gdy brakuje Ci PRZYKŁADU istniejącej implementacji (sygnatura ' +
    'helpera, użycie biblioteki, referencyjny handler), zadaj JEDNO celowane zapytanie ' +
    'retrievalu kodu (max 2 na cały Twój przebieg, zero gdy karta wystarcza). Gdy karta ' +
    'nie rozstrzyga Twojego przypadku — napisz w raporcie `gap: <czego brakuje>` ' +
    'i zaimplementuj najbliższy wariant zgodny z kartą. Luka w karcie to nasz błąd, ' +
    'nie Twój powód do eksploracji.\n'
}

// Koszt implementera to w ~90% cache-read, czyli kontekst rosnący z każdą turą (metryki
// 2026-09-15: ~2,5 M tokenów cache-read na krok implementera). Każdy wynik Grepa i każdy pełny
// Read zostaje w kontekście do końca i jest płacony przy każdej kolejnej turze. Lokalizowanie
// idzie więc do Explore (Haiku, osobny kontekst — wraca sam wniosek), a własny Read/Grep tylko
// tam, gdzie implementer faktycznie edytuje. Agenci stackowi mają to w swoich plikach; ten blok
// obowiązuje też `general-purpose`, który żadnego pliku agenta nie ma.
const SEARCH_BUDGET =
  '\n\nSZUKANIE W REPO — trzy zasady, bo Twój kontekst jest kosztem:\n' +
  '1. LOKALIZOWANIE („gdzie jest X", „które pliki dotykają Y", „czy istnieje helper Z", ' +
  '„jak wygląda podobny handler") → JEDNO zbiorcze wywołanie subagenta Explore (Task, ' +
  'subagent_type: Explore) z listą wszystkich pytań naraz; z jego odpowiedzi bierzesz ścieżki ' +
  'i linie, nie treść. Sam nie grepuj po src/ ani po całym pakiecie.\n' +
  '2. CZYTANIE → Read wyłącznie plików, które będziesz edytować, i tych, których sygnatury ' +
  'importujesz; plik > 300 linii czytaj z offset/limit wokół miejsca, które Cię interesuje.\n' +
  '3. WŁASNY Grep/Glob tylko celowany: konkretny symbol w konkretnym katalogu, z limitem ' +
  'wyników — nigdy wzorzec ogólny po całym drzewie.\n' +
  'Zbiorczy Explore na starcie warstwy jest tańszy niż trzy własne grepy; dziesięć własnych ' +
  'grepów jest droższych niż cała implementacja.'

// Zakaz cofania — obowiązuje KAŻDY prompt implementera i KAŻDY prompt naprawczy.
// Cofnięcie to jedyny sposób, w jaki zweryfikowana praca znika NIE ZOSTAWIAJĄC ŚLADU
// w diffie, który człowiek ogląda przed commitem.
const NO_REVERT =
  '\n\nZAKAZ COFANIA: `git checkout`, `git restore`, `git stash` i `git reset` są zakazane ' +
  'na KAŻDEJ ścieżce, zero wyjątków — także „to tylko mój plik" i „przywracam, jak było". ' +
  'Plik, który uważasz za spoza swojego zakresu, ZGŁOŚ w raporcie i zostaw nietknięty. ' +
  'Do zapisania i przywrócenia stanu używaj `cp`, nigdy gita.'

// Zakres warstwy, jaki widzi implementer, weryfikator i sonda. Analiza może go ZAWĘZIĆ
// (`layers_scope` w artefakcie → `layer.scope.dirs`): warstwa wchodzi, ale tylko wskazane
// ścieżki. To nie to samo co `skip` — tam implementer nie startuje wcale (ANL-037).
function effectiveDirs(layer) {
  if (layer.scope && Array.isArray(layer.scope.dirs) && layer.scope.dirs.length) return layer.scope.dirs
  return layer.dirs || []
}

function scopeBlock(layer) {
  const dirs = (layer.dirs || []).join(', ') || '(cały projekt)'
  const narrowed = layer.scope && layer.scope.dirs && layer.scope.dirs.length
    ? '\n  ZAWĘŻENIE Z ANALIZY (layers_scope): tylko ' + layer.scope.dirs.join(', ') +
      (layer.scope.reason ? '\n  powód: ' + layer.scope.reason : '') +
      '\n  Reszta katalogów tej warstwy jest POZA ZAKRESEM tego tasku — nie dotykaj jej, ' +
      'nawet jeśli widzisz tam ten sam problem; zgłoś w raporcie.'
    : ''
  // Pliki towarzyszące (marketing-hub TS-MH-005): zawężenie do `role-permissions.map.ts`
  // zostawiało `role-permissions.adapter.spec.ts` obok „poza zakresem", a `pnpm -r test`
  // stawał na nim na czerwono w każdej kolejnej warstwie.
  return 'ZAKRES WARSTWY\n  id: ' + layer.id + '\n  katalogi: ' + dirs +
    (layer.role ? '\n  rola: ' + layer.role : '') + narrowed +
    '\nPlik spoza tych katalogów jest POZA ZAKRESEM, nie brakujący.' +
    '\nWYJĄTEK — pliki towarzyszące: test (*.spec.*, *.test.*) w tym samym katalogu i z tym samym ' +
    'rdzeniem nazwy co plik z zakresu (x.map.ts → x.adapter.spec.ts) należy do zakresu. Gdy ' +
    'zmieniasz kontrakt pliku, zaktualizuj jego test obok.'
}

// Czerwień sondy, której implementer nie może naprawić w swoim zakresie, nie jest „brakiem
// zmian" — to blokada. Bez tej instrukcji implementer zwracał no-op, weryfikator no-op
// oceniał samo twierdzenie (bez wyniku sondy) i warstwa dostawała GO (TS-MH-005: 4/4 warstwy).
const RED_PROBE_RULE =
  '\n\nCZERWONA SONDA: poprzednia próba skończyła się czerwonym typecheckiem/testami (szczegóły ' +
  'w POPRAWCE niżej). Napraw to, jeśli przyczyna leży w Twoim zakresie. Jeśli leży POZA nim ' +
  '(plik innej warstwy, wcześniejszy błąd w repo) — NIE poprawiaj cudzego pliku i zwróć ' +
  'changed_files: [] z no_changes_reason „POZA ZAKRESEM: <plik:linia> — <co jest czerwone>". ' +
  'Przebieg zatrzyma się jako BLOCKED_BY_PRIOR do decyzji człowieka; to poprawny wynik, ' +
  'nie porażka.'

function buildImplPrompt(a, layer, attempt, violations, silentDeaths, probeRed) {
  const spec = 'ZADANIE ' + a.task.id + (a.task.title ? ' — ' + a.task.title : '') +
    (a.task.taskFile ? '\nSpec: ' + a.task.taskFile + ' (przeczytaj go)' : '') +
    (a.task.analysisFile ? '\nAnaliza (zatwierdzona): ' + a.task.analysisFile : '')
  const decisions = (a.task.decisions || []).length
    ? '\n\nDECYZJE ZATWIERDZONE PRZEZ CZŁOWIEKA — stosuj, nie re-decyduj:\n' +
      a.task.decisions.map((d) => '- ' + d.id + ' ' + (d.topic || '') + ': ' + (d.choice || '')).join('\n')
    : ''
  const turns = budgetFor(a, 'implement', DEFAULTS.implTurns)
  const soft = '\n\nBUDŻET: ~' + turns + ' tur. Gdy się kończy — NATYCHMIAST oddaj wynik ' +
    'w wymaganej formie ze stanem częściowym. Częściowy wynik jest wart więcej niż brak wyniku. ' +
    // TS-MH-005: 4/4 ciche śmierci implementera infra na dokładnie 40. turze, po 13-35 wywołaniach
    // Bash — głównie pętle kompilacji. Sonda robi to samo raz, tanio, zaraz po implementerze.
    'Nie uruchamiaj kompilacji ani testów w pętli — sonda zrobi to zaraz po Tobie, a czerwień ' +
    'wróci do Ciebie jako lista poprawek.'
  const silent = silentDeaths
    ? '\n\nUWAGA: ' + silentDeaths + ' poprzednia(e) próba(y) tej warstwy skończyły się BEZ wyniku ' +
      '— budżet tur wyczerpany. Zakres jest najpewniej za duży. Zrób NAJMNIEJSZY kompletny ' +
      'fragment i oddaj wynik, zamiast zaczynać całość od nowa. Pliki mogły zostać częściowo ' +
      'zmodyfikowane przez poprzednią próbę — SPRAWDŹ ich stan przed edycją, nie zakładaj czystego drzewa.'
    : ''
  const fix = violations
    ? '\n\nPOPRAWKA (próba ' + attempt + ') — napraw dokładnie te naruszenia i nic poza nimi:\n' + violations
    : ''
  const noop = '\n\nGDY WARSTWA NIE WYMAGA ZMIAN: jeśli po przeczytaniu specu i analizy stwierdzisz, że ' +
    'ten task nie dotyka tej warstwy (np. zmiana czysto infrastrukturalna, model domenowy bez zmian), ' +
    'NIE pisz niczego na siłę. Zwróć changed_files: [] i no_changes_reason z konkretnym uzasadnieniem: ' +
    'co sprawdziłeś i dlaczego nic tu nie trzeba (odwołaj się do decyzji D-x lub jednostek pracy z analizy). ' +
    'Pusta lista BEZ no_changes_reason liczy się jako niewykonana praca.'
  // Przy poprawce (violations) nie powtarzamy bloku SZUKANIE — implementer ma listę
  // plik/linia/reguła, nie ma czego lokalizować; blok tylko dokładałby kontekstu.
  return spec + decisions + '\n\n' + scopeBlock(layer) + '\n' + renderCards(cardsFor(a, baseId(layer))) +
    (violations ? '' : SEARCH_BUDGET) + soft + silent + (probeRed ? RED_PROBE_RULE : '') + fix + noop + NO_REVERT
}

// Pliki w drzewie roboczym — JEDNO polecenie dla bramki „kod istnieje", diff-sondy po cichej
// śmierci i listy plików bramki końcowej, żeby nie rozjechały się ponownie.
//   • `git diff --name-only <baza>` — śledzone, zmienione względem bazy, staged i unstaged
//     razem (sam `git diff --name-only` porównuje working tree z INDEKSEM, więc plik w pełni
//     zestage'owany — `A` — był niewidoczny);
//   • `git ls-files --others --exclude-standard` — nieśledzone, KAŻDY plik osobno (`git status
//     --short` zwija nowy katalog do jednej pozycji `?? contexts/audience/`).
// ai-gateway TS-AIG-015 i marketing-hub TS-MH-003/005: fałszywe „żaden plik nie zmieniony"
// przy zadaniach tworzących same nowe pliki.
function treeFilesCmd(base) {
  return 'git diff --name-only ' + (base || 'HEAD') + '; git ls-files --others --exclude-standard'
}

function buildTreeProbePrompt(base) {
  return 'W repo uruchom dokładnie: ' + treeFilesCmd(base) + '\nNIC więcej — nie czytaj plików, ' +
    'nie analizuj, nie poprawiaj. Zwróć połączoną listę ścieżek z obu poleceń (bez duplikatów).'
}

// Sonda: deterministyczne bramki uruchomione RAZ, tanio, bez czytania kodu. Verifier
// dostaje jej wynik jako FAKT i ma zakaz ponawiania — inaczej ten sam typecheck wykonuje
// się kilkadziesiąt razy, a każde 16-23 KB wyjścia zostaje w kontekście na resztę przebiegu.
function buildProbePrompt(a, layer) {
  const cmds = (layer.checks || []).map((c) => 'npm run ' + c)
  const scoped = effectiveDirs(layer).join(' ')
  // Pathspecy monorepo: `layer.dirs` to nazwy typu "__tests__/"/"domain/", nigdy katalogi
  // TOP-LEVEL repo (prawdziwa ścieżka to src/contexts/<ctx>/domain/...). Literalny pathspec
  // `-- domain/` czy `-- __tests__/` dopasowuje TYLKO katalog o tej dokładnej ścieżce od
  // korzenia repo — czyli nic, w monorepo z zagnieżdżeniem. Magic pathspec `:(glob)**/x/**`
  // dopasowuje x niezależnie od głębokości. Bez tego `newTestBlocks` liczy 0 zawsze,
  // niezależnie od realnej zawartości (zweryfikowane, TASK-KAIZEN-002 audyt 2026-09-09).
  // Zawężenie z `layers_scope` może wskazać pojedynczy PLIK (…/error-codes.ts) — wtedy
  // bez końcowego `/**`, bo `plik.ts/**` nie dopasuje niczego.
  // Dla pliku dochodzą testy z jego katalogu (pliki towarzyszące — patrz scopeBlock).
  const globScoped = effectiveDirs(layer)
    .map((d) => {
      if (!/\.[a-z0-9]+$/i.test(d)) return "':(glob)**/" + d.replace(/\/$/, '') + "/**'"
      const sp = splitPath(d)
      return "':(glob)**/" + d + "' ':(glob)**/" + sp.dir + sp.stem + ".*.spec.*' ':(glob)**/" + sp.dir + sp.stem + ".*.test.*'"
    })
    .join(' ') || '.'
  const run = cmds.length
    ? cmds.map((c) => c + ' > /tmp/check-' + layer.id + '.log 2>&1; echo "EXIT:$?"').join('\n')
    : '(brak checks w runtime.yml dla tej warstwy — NIE uruchamiaj żadnego test runnera ani ' +
      'typechecku z własnej inicjatywy, choćby "dla pewności"; zgłoś "skipped" dla obu pól. ' +
      'Incydent 2026-09-09: sonda odpaliła całą suitę (301s, 34003 testy) mimo pustych checks ' +
      'i oberwała fałszywym NO_GO od niepowiązanego, znanego-flaky testu entropii.)'
  const delta = layer.tests
    ? '\nPolicz przyrost bloków wykonywalnych w zmianie w drzewie roboczym (samo LICZENIE, ' +
      'wynik to jedna liczba, nie treść zmian). Dwie pułapki naraz w jednym poleceniu: ' +
      '`git add -N` (intent-to-add, NIE stage\'uje treści) żeby nowe nieotrackowane pliki ' +
      'weszły do zwykłego diffa jak reszta; magic pathspec `:(glob)**/x/**` żeby ' +
      'dopasować katalog x na dowolnej głębokości monorepo, nie tylko od korzenia:\n' +
      // `test\(` samo nie łapie `testWidgets(` (Flutter/Dart) — po "test" jest "W", nie "(".
      // `group(` to odpowiednik `describe(` w pakiecie test Dart. Bez obu dwóch sonda liczy
      // 0 nawet przy realnych, przechodzących testach (fałszywy NO_GO, juz-ide-mobile-app,
      // 2026-09-09). WL6: `git diff` i `| grep -c` MUSZĄ być w jednej linii źródła tego
      // pliku — reguła czyta tylko pierwszą fizyczną linię za "git diff" (K93 regresja,
      // 2026-09-09: rozbicie na dwie linie dla pathspecu zgasiło wykrywanie licznika).
      // `diff HEAD`, nie gołe `diff`: bez bazy porównanie idzie working tree ↔ indeks, więc
      // plik zestage'owany przez agenta (`A`/`AM`) liczył 0 (ai-gateway TS-AIG-015, 3 próby
      // i ESCALATE na gotowych testach). `.each/.only/.skip/.concurrent` przed `(`, bo
      // `describe.each(` to nadal blok wykonywalny.
      '  git add -N -- ' + globScoped + ' 2>/dev/null; git diff HEAD -U0 -- ' + globScoped + " | grep -cE '^\\+\\s*(it|test|testWidgets|describe|group)(\\.(each|only|skip|concurrent))?\\(' \n" +
      'i zwróć go jako newTestBlocks.'
    : ''
  return 'Uruchom dokładnie to i NIC więcej:\n' + run +
    '\nPrzy EXIT:0 NIE otwieraj pliku logu wcale. Przy niezerowym — zwróć ostatnie 40 linii w `tail`.' +
    delta +
    '\nNIC nie czytaj, nie analizuj, nie poprawiaj, nie komentuj kodu.' +
    (scoped ? '\nZakres zmiany: ' + scoped : '') +
    '\nSkryptu nie ma w package.json → zwróć "skipped" dla tej pozycji, nie zgaduj zamiennika.'
}

// Sonda stanu drzewa po cichej śmierci implementera. Cicha śmierć zwykle znaczy „praca
// wykonana, budżet spalony na oddaniu wyniku", nie „praca niezrobiona".
function buildDiffProbePrompt(base) {
  return buildTreeProbePrompt(base)
}

// Jeden kanoniczny builder promptu weryfikatora — WL10 liczy go RAZ dla wszystkich wywołań.
// Ręczne składanie promptu per-warstwa jest dokładnie tym, co zawiodło w incydencie
// TS-REP-PIPELINE-001-F3a-remediation.
function buildVerifierPrompt(a, layer, probe, changedFiles, mode, noopClaim, priorViolations) {
  const calls = budgetFor(a, 'verify', DEFAULTS.verifyCalls)
  if (mode === 'verify-noop') {
    const spec = 'ZADANIE ' + a.task.id + (a.task.title ? ' — ' + a.task.title : '') +
      (a.task.taskFile ? '\nSpec: ' + a.task.taskFile : '') +
      (a.task.analysisFile ? '\nAnaliza (zatwierdzona): ' + a.task.analysisFile : '')
    // Twierdzenie „brak zmian" po NO_GO weryfikatora oceniane BEZ tamtych naruszeń to ta sama
    // dziura co no-op po czerwonej sondzie: świeży weryfikator widzi tylko twierdzenie.
    const prior = priorViolations
      ? '\n\nPOPRZEDNIA RUNDA ZGŁOSIŁA NARUSZENIA w tej warstwie (implementer twierdzi teraz, ' +
        'że nic nie trzeba zmieniać). GO tylko wtedy, gdy KAŻDE z nich jest nieaktualne albo ' +
        'faktycznie poza zakresem — napisz to przy każdym:\n' + priorViolations
      : ''
    return 'TRYB: implementer twierdzi, że ta warstwa NIE wymaga zmian dla tego taska. Nie oceniasz ' +
      'kodu — oceniasz TWIERDZENIE. Przeczytaj spec i analizę (decyzje, jednostki pracy), sprawdź ' +
      'celowanym odczytem, czy w zakresie warstwy jest cokolwiek, co task każe zmienić.\n\n' +
      spec + '\n\n' + scopeBlock(layer) + '\n\nUZASADNIENIE IMPLEMENTERA:\n' + noopClaim + prior + '\n\n' +
      'GO = zgadzasz się, warstwa faktycznie nie ma nic do zrobienia (w uzasadnieniu napisz, co ' +
      'sprawdziłeś). NO_GO = task WYMAGA zmian w tej warstwie — w naruszeniach wypisz KONKRETNIE ' +
      'co (plik/moduł, czego brakuje); to trafi do implementera jako lista poprawek.\n' +
      'TWARDY LIMIT: ' + calls + ' wywołań narzędzi. Werdykt na podstawie tego, co wiesz, gdy budżet ' +
      'się kończy; brak werdyktu wywraca cały przebieg.'
  }
  const facts = probe
    ? 'FAKTY Z SONDY (już wykonane, traktuj jak dane wejściowe):\n' +
      '  typecheck: ' + probe.typecheck + '\n  testy: ' + probe.tests +
      (probe.newTestBlocks != null ? '\n  nowe bloki testowe: ' + probe.newTestBlocks : '') +
      '\nNIE uruchamiaj typechecku ani testów ponownie — zostały już wykonane, a ich powtórzenie ' +
      'niczego nie ustala i kosztuje pełne wyjście w Twoim kontekście.\n'
    : 'Sonda nie zwróciła wyniku — odnotuj to w uzasadnieniu werdyktu.\n'
  const files = changedFiles && changedFiles.length
    ? 'ZMIENIONE PLIKI (lista, nie treść — treść czytaj celowanym odczytem tam, gdzie oceniasz):\n  ' +
      changedFiles.join('\n  ') + '\n'
    : ''
  const existing = mode === 'verify-existing'
    ? 'TRYB: praca leży już w drzewie roboczym (implementer zakończył bez raportu). Oceniaj STAN ' +
      'FAKTYCZNY, nie raport. Braki zgłoś jako naruszenia do punktowej poprawki.\n'
    : ''
  return existing + scopeBlock(layer) + '\n\n' + facts + files +
    renderCards(cardsFor(a, baseId(layer))) +
    '\nOceń zgodność zmiany z regułami powyżej. Zwróć werdykt GO albo NO_GO i listę naruszeń ' +
    '(plik, linia, reguła, co poprawić).\n' +
    'CZYTAJ TYLKO zmienione pliki z listy (Read z offset/limit, gdy plik > 300 linii); plik spoza ' +
    'listy otwieraj wyłącznie, gdy zmieniony plik go importuje i bez niego nie da się ocenić ' +
    'reguły. Nie grepuj po całym drzewie „dla kontekstu" — każdy wynik zostaje w Twoim kontekście ' +
    'do końca i jest płacony przy każdym kolejnym wywołaniu.\n' +
    'TWARDY LIMIT: ' + calls + ' wywołań narzędzi. Gdy budżet się kończy — wydaj werdykt ' +
    'natychmiast, na podstawie tego, co już wiesz. Werdykt częściowy z uzasadnieniem jest ' +
    'poprawnym wynikiem; brak werdyktu wywraca cały przebieg.'
}

// Lista plików przychodzi z DRZEWA (sonda treeFilesCmd względem bazy przebiegu), nie z sumy
// raportów warstw: warstwa zakończona no-op oddaje `files: []`, więc bramka nie widziała
// infrastruktury, migracji ani kontraktów (TS-MH-005 — weryfikator sam zajrzał do HEAD).
// Karty: wszystkie wzorce przebiegu — bramka oceniała całość zmiany bez reguł.
function buildFinalGatePrompt(a, checks, changedFiles, treeSource) {
  const calls = budgetFor(a, 'final-gate', DEFAULTS.verifyCalls)
  const dirty = (a.dirtyAtStart || []).length
    ? 'Pliki BRUDNE JUŻ PRZED startem przebiegu (nie są pracą tego taska, chyba że je zmienił — ' +
      'oceń tylko, jeśli są na liście wyżej i dotyczą taska):\n  ' + a.dirtyAtStart.join('\n  ') + '\n'
    : ''
  const source = treeSource === 'layers'
    ? '(UWAGA: sonda drzewa nie zwróciła wyniku — lista złożona z raportów warstw, może być ' +
      'niepełna; sprawdź `' + treeFilesCmd(a.baseSha) + '` sam, jednym wywołaniem.)\n'
    : ''
  return 'BRAMKA KOŃCOWA dla ' + a.task.id + ' — oceniasz CAŁOŚĆ zmiany, nie ostatnią warstwę. ' +
    'To ostatnie miejsce, w którym wychodzi regresja MIĘDZY warstwami.\n\n' +
    (checks.length ? 'Deterministyczne bramki do wykonania raz, na całości: ' + checks.join(', ') + '\n' : '') +
    (changedFiles.length ? 'Pliki objęte zmianą (z drzewa, względem bazy przebiegu):\n  ' + changedFiles.join('\n  ') + '\n' : '') +
    source + dirty +
    renderCards(a.patterns || [], 'wszystkie wzorce tego przebiegu') +
    '\nZwróć werdykt GO albo NO_GO i listę naruszeń.\n' +
    'TWARDY LIMIT: ' + calls + ' wywołań narzędzi. Gdy budżet się kończy — wydaj werdykt ' +
    'natychmiast na podstawie zebranych dowodów.' + NO_REVERT
}

// Decyzja po weryfikacji. Trzy różne awarie, trzy różne reakcje — zlanie ich w jedno
// („no to spróbuj jeszcze raz") jest tym, co pali trzecią pełną próbę na gotowym kodzie.
function decideVerdict(verdict, attempt, maxAttempts) {
  if (!verdict) return { next: 'silent', reason: 'brak wyniku weryfikatora' }
  const v = String(verdict.verdict || '').toUpperCase()
  // GO z niepustym unverified_scope to CZWARTA awaria, nie czysty GO: weryfikator uczciwie
  // przyznał (konwencja "TURN BUDGET" w promptach weryfikatorów), że nie zdążył sprawdzić
  // części zakresu, ale bez tej rozróżnicy GO przechodziło identycznie jak pełna weryfikacja —
  // obietnica z tych promptów ("orchestrator dispatches a narrowed follow-up pass") nigdzie
  // się nie realizowała (marketing-hub TS-MH-010, testing:l1-l2, jednostka 105 plików: GO mimo
  // 11 czerwonych testów, czerwień wyszła dopiero jako BLOCKED_BY_PRIOR na kolejnej jednostce).
  const unverified = Array.isArray(verdict.unverified_scope) ? verdict.unverified_scope.filter(Boolean) : []
  if (v === 'GO' && unverified.length) {
    if (attempt >= maxAttempts) {
      return { next: 'escalate', reason: 'GO z niezweryfikowanym zakresem po ' + maxAttempts + ' próbach — nigdy nie sprawdzono: ' + unverified.join(', ') }
    }
    return { next: 'fix', reason: 'weryfikator dał GO, ale nie zdążył sprawdzić (unverified_scope): ' + unverified.join(', ') + ' — kolejna próba dostaje świeży budżet tur na dokończenie weryfikacji' }
  }
  if (v === 'GO') return { next: 'go', reason: null }
  if (attempt >= maxAttempts) {
    return { next: 'escalate', reason: 'wyczerpane ' + maxAttempts + ' prób, ostatni werdykt NO_GO' }
  }
  return { next: 'fix', reason: formatViolations(verdict.violations) }
}

function formatViolations(violations) {
  if (!violations || !violations.length) return '(weryfikator nie wypisał naruszeń — poproś go o nie w kolejnej rundzie)'
  return violations.map((x, i) => (i + 1) + '. ' + (typeof x === 'string' ? x : JSON.stringify(x))).join('\n')
}

// Czy plik należy do zakresu tej warstwy. Bez tego zawężenia każdy cudzy zapis w drzewie
// wyglądałby jak praca wykonana przez martwego implementera.
// Rozbicie ścieżki na katalog (z końcowym '/', albo '') i rdzeń nazwy — część przed pierwszą
// kropką: `role-permissions.map.ts` → `role-permissions`.
function splitPath(p) {
  const s = String(p)
  const cut = s.lastIndexOf('/')
  const name = cut === -1 ? s : s.slice(cut + 1)
  return { dir: cut === -1 ? '' : s.slice(0, cut + 1), stem: name.split('.')[0] }
}

// Plik towarzyszący = test (*.spec.* / *.test.*) w tym samym katalogu i z tym samym rdzeniem
// nazwy co plik z zakresu: `role-permissions.map.ts` → `role-permissions.adapter.spec.ts`,
// `env.schema.ts` → `env.schema.spec.ts`. Zakres podany katalogiem obejmuje je i tak.
function isCompanion(scopeFile, file) {
  if (!/\.[a-z0-9]+$/i.test(scopeFile) || !/\.(spec|test)\.[a-z0-9]+$/i.test(file)) return false
  const s = splitPath(scopeFile)
  const f = splitPath(file)
  if (!s.stem || s.stem !== f.stem) return false
  return s.dir === '' ? true : f.dir.slice(-s.dir.length) === s.dir
}

function layerTouches(layer, file) {
  const dirs = effectiveDirs(layer)
  if (!dirs.length) return true
  const f = String(file)
  return dirs.some((d) => {
    const s = String(d).replace(/\/+$/, '')
    return f.indexOf(s) !== -1 || isCompanion(s, f)
  })
}

// Implementer po CZERWONEJ sondzie twierdzi „nic do zrobienia" → to nie jest no-op do
// potwierdzenia, tylko blokada. Weryfikator no-op nie widzi sondy i przyjąłby twierdzenie
// (TS-MH-005: 4/4 warstwy infra dostały GO na odziedziczonej czerwieni). Zwraca `settled`
// albo null, gdy ścieżka no-op jest dozwolona.
function blockedByPrior(layer, probeRed, noopClaim) {
  if (!probeRed || !noopClaim) return null
  return {
    id: layer.id,
    status: 'BLOCKED_BY_PRIOR',
    reason: 'sonda na czerwono, a implementer twierdzi, że w zakresie warstwy nie ma nic do ' +
      'naprawy: ' + noopClaim + '\n' + probeRed,
    files: [],
  }
}

// Statusy, po których przebieg staje (kolejne warstwy trafiłyby na to samo).
function haltsRun(status) {
  return status === 'ESCALATE_AND_HALT' || status === 'BLOCKED_BY_PRIOR'
}

// Lista plików dla bramki końcowej: drzewo (gdy sonda odpowiedziała) ∪ raporty warstw.
function finalFileList(treeFiles, layerFiles) {
  const out = []
  for (const f of (treeFiles || []).concat(layerFiles || [])) {
    const s = String(f).trim()
    if (s && out.indexOf(s) === -1) out.push(s)
  }
  return out
}

// Sonda mierzy PRZYROST, nie tylko zieloność. „typecheck pass + testy pass + niepusty diff"
// jest spełnialne samym komentarzem — 133 dopisane linie opisujące kontrole, których nie ma.
function deltaGateFails(layer, probe, changedFiles) {
  if (!layer.tests || !probe) return null
  if (probe.newTestBlocks == null) return null
  if (probe.newTestBlocks > 0) return null
  if (!changedFiles || changedFiles.length === 0) return null
  return 'warstwa testowa zmieniła pliki, ale przyrost bloków wykonywalnych = 0 — ' +
    'to komentarze albo opis zamiast testów. NO_GO niezależnie od zielonego typechecku.'
}

const CHECKS_SCHEMA = {
  type: 'object',
  required: ['typecheck', 'tests'],
  properties: {
    typecheck: { type: 'string', enum: ['pass', 'fail', 'skipped'] },
    tests: { type: 'string', enum: ['pass', 'fail', 'skipped'] },
    newTestBlocks: { type: 'number' },
    tail: { type: 'string' },
  },
}

const DIFF_PROBE_SCHEMA = {
  type: 'object',
  required: ['files'],
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    dirty: { type: 'boolean' },
  },
}

// Schema implementera zawiera wyłącznie FAKTY („co zmieniłem"), nigdy self-ocenę
// („czy zrobiłem dobrze") — sukces mierzy bramka git-diff i niezależny weryfikator.
const IMPL_SCHEMA = {
  type: 'object',
  required: ['changed_files', 'summary'],
  properties: {
    changed_files: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    notes: { type: 'string' },
    gap: { type: 'string' },
    // „ta warstwa nie wymaga zmian dla tego taska" — z uzasadnieniem. Pusta lista plików BEZ
    // tego pola to niewykonana praca (powtórka); Z tym polem — twierdzenie do zweryfikowania.
    no_changes_reason: { type: 'string' },
    // Pole FAKTOGRAFICZNE (nie self-ocena, więc nie podlega WL1): „trafiłem na sytuację, którą
    // reguły/wzorce nie opisują" — nie blokuje pracy, tylko zgłasza się do docs/tasks/_inbox/
    // w claude-patterns przez krok 5 /orchestrate (ORC-066), zamiast ginąć w logu przebiegu.
    deviation_note: { type: 'string' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict'],
  properties: {
    verdict: { type: 'string', enum: ['GO', 'NO_GO'] },
    violations: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
    // Patrz IMPL_SCHEMA.deviation_note — to samo pole, dostępne też weryfikatorowi/bramce
    // końcowej (jedyny schemat obu, patrz VERDICT_SCHEMA powyżej w komentarzu buildera).
    deviation_note: { type: 'string' },
    // Ścieżki, których weryfikator NIE zdążył sprawdzić (budżet tur) — patrz sekcja "TURN
    // BUDGET" w promptach weryfikatorów. Pole FAKTOGRAFICZNE (nie self-ocena — WL1 OK).
    // decideVerdict() i jednorazowa bramka końcowa traktują GO z niepustym unverified_scope
    // jak NIE-czysty GO, nie jak pełną weryfikację (patrz komentarz przy decideVerdict).
    unverified_scope: { type: 'array', items: { type: 'string' } },
  },
}

// <<< CORE
// ══════════════════════════════════════════════════════════════════════════════════
// CORE END
// ══════════════════════════════════════════════════════════════════════════════════

// Helper: KAŻDE wywołanie agenta idzie przez niego. Ze schemą brak StructuredOutput RZUCA
// WYJĄTEK, a nie zwraca null — guard `if (!wynik)` go nie złapie, a nieobsłużony kończy
// CAŁY przebieg jako `failed`. Helper sprowadza oba tryby awarii do jednego: null.
// Nazwa dowolna, ale MUSI wołać `await agent(` — po tym rozpoznaje go workflow-lint.
async function ask(prompt, opts) {
  try {
    return await agent(prompt, opts)
  } catch (e) {
    log((opts && opts.label ? opts.label : 'agent') + ': brak wyniku — ' + (e && e.message ? e.message : String(e)))
    return null
  }
}

const a = args || {}
const maxAttempts = (a.verifiers && a.verifiers.maxAttempts) || DEFAULTS.maxAttempts
const plan = layerPlan(a, (a.createWhenHits) || {})
const report = { taskId: a.task && a.task.id, layers: [], finalGate: null, exit: a.exit || 'STAGE_NOT_COMMIT' }
const allChangedFiles = []

phase('Warstwy')

for (const step of plan) {
  const layer = step.layer
  if (!step.run) {
    log('warstwa ' + layer.id + ' pominięta — ' + step.reason)
    report.layers.push({ id: layer.id, status: 'SKIPPED', reason: step.reason })
    continue
  }

  let violations = null
  let silentDeaths = 0
  let mode = 'implement'
  let layerFiles = []
  let settled = null
  let noopClaim = null
  // Wynik ostatniej CZERWONEJ sondy tej warstwy (null po zielonej). Po czerwieni ścieżka
  // no-op jest zamknięta — patrz blockedByPrior().
  let probeRed = null
  // ORC-066: ostatnia niepusta adnotacja „to nie jest udokumentowane" od implementera albo
  // weryfikatora tej warstwy — dopisywana do `settled` tuż przed `report.layers.push`, żeby
  // krok 5 /orchestrate mógł ją zgłosić do docs/tasks/_inbox/ w claude-patterns.
  let deviationNote = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // ── 1. implementacja (albo, po cichej śmierci, weryfikacja istniejącego stanu)
    if (mode === 'implement') {
      const implOpts = Object.assign(
        { label: layer.id + '-impl', agentType: layer.agent, maxTurns: budgetFor(a, 'implement', DEFAULTS.implTurns), schema: IMPL_SCHEMA },
        modelFor('implement'),
      )
      let impl = null
      try {
        impl = await ask(buildImplPrompt(a, layer, attempt, violations, silentDeaths, probeRed), implOpts)
      } catch (e) {
        log(layer.id + ': implementer rzucił mimo helpera — ' + (e && e.message ? e.message : String(e)))
        impl = null
      }

      if (!impl) {
        // Cicha śmierć: ZANIM powtórzysz pełną implementację, sprawdź, czy praca już nie leży
        // w drzewie. Ślepa powtórka pali drugie ~40 tur na gotowym kodzie.
        const diffOpts = Object.assign(
          { label: layer.id + '-diff-probe', maxTurns: DEFAULTS.diffProbeTurns, schema: DIFF_PROBE_SCHEMA },
          modelFor('probe'),
        )
        let probeDiff = null
        try {
          probeDiff = await ask(buildDiffProbePrompt(a.baseSha), diffOpts)
        } catch (e) {
          probeDiff = null
        }
        const touched = probeDiff && probeDiff.files ? probeDiff.files.filter((f) => layerTouches(layer, f)) : []
        if (touched.length) {
          log(layer.id + ': implementer zamilkł, ale ' + touched.length + ' plików warstwy jest zmienionych — weryfikuję stan, nie powtarzam pracy')
          mode = 'verify-existing'
          layerFiles = touched
        } else {
          silentDeaths++
          if (silentDeaths >= 2) {
            settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: 'dwa kolejne wyjścia bez wyniku — zakres za duży na budżet, podziel warstwę' }
            break
          }
          continue
        }
      } else {
        silentDeaths = 0
        layerFiles = impl.changed_files || []
        noopClaim = (!layerFiles.length && typeof impl.no_changes_reason === 'string' && impl.no_changes_reason.trim())
          ? impl.no_changes_reason.trim() : null
        if (typeof impl.deviation_note === 'string' && impl.deviation_note.trim()) deviationNote = impl.deviation_note.trim()
      }
    }

    // ── 1b. „nic do zrobienia" z uzasadnieniem — twierdzenie, nie wynik. Weryfikator je
    // potwierdza (GO bez plików) albo obala (naruszenia → punktowa poprawka). Bez tej gałęzi
    // trzy próby „zero zmian" kończyły się ESCALATE na warstwie, której task w ogóle nie dotyka
    // (juz-ide-api-2, 2026-09-14). Analiza powinna to przewidzieć w layers_skip (albo zawęzić
    // przez layers_scope, gdy warstwa jest dotknięta częściowo); to jest siatka.
    if (noopClaim && mode === 'implement') {
      const blocked = blockedByPrior(layer, probeRed, noopClaim)
      if (blocked) {
        log(layer.id + ': BLOCKED_BY_PRIOR — czerwień sondy poza zakresem warstwy, decyzja człowieka')
        settled = blocked
        break
      }
      const noopVerifier = firstAgentName(layer.verify || (a.verifiers && a.verifiers.layer))
      if (!noopVerifier) {
        log(layer.id + ': implementer zgłasza brak zmian („' + noopClaim + '"), brak slotu verify — przyjmuję')
        settled = { id: layer.id, status: 'GO', files: [], note: 'no-op (niezweryfikowany): ' + noopClaim }
        break
      }
      const noopOpts = Object.assign(
        { label: layer.id + '-verify-noop', agentType: noopVerifier, maxTurns: budgetFor(a, 'verify', DEFAULTS.verifyCalls), schema: VERDICT_SCHEMA },
        modelFor('verify'),
      )
      let noopVerdict = null
      try {
        noopVerdict = await ask(buildVerifierPrompt(a, layer, null, [], 'verify-noop', noopClaim, violations), noopOpts)
      } catch (e) {
        noopVerdict = null
      }
      if (noopVerdict && typeof noopVerdict.deviation_note === 'string' && noopVerdict.deviation_note.trim()) deviationNote = noopVerdict.deviation_note.trim()
      const noopDecision = decideVerdict(noopVerdict, attempt, maxAttempts)
      if (noopDecision.next === 'go') {
        log(layer.id + ': brak zmian potwierdzony przez weryfikatora — ' + noopClaim)
        settled = { id: layer.id, status: 'GO', files: [], attempts: attempt, note: 'no-op: ' + noopClaim }
        break
      }
      if (noopDecision.next === 'escalate') {
        settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: noopDecision.reason }
        break
      }
      violations = noopDecision.next === 'silent'
        ? 'weryfikator nie ocenił twierdzenia o braku zmian — wykonaj pracę warstwy albo uzasadnij precyzyjniej'
        : 'twierdzenie „brak zmian" ODRZUCONE przez weryfikatora:\n' + noopDecision.reason
      log(layer.id + ': ' + violations)
      noopClaim = null
      mode = 'implement'
      continue
    }

    // ── 2. bramka „kod istnieje" — mierzymy drzewo, nie raport agenta
    const gateOpts = Object.assign(
      { label: layer.id + '-diff-gate', maxTurns: DEFAULTS.diffProbeTurns, schema: DIFF_PROBE_SCHEMA },
      modelFor('probe'),
    )
    let gate = null
    try {
      gate = await ask(buildTreeProbePrompt(a.baseSha), gateOpts)
    } catch (e) {
      gate = null
    }
    const changed = gate && gate.files ? gate.files.filter((f) => layerTouches(layer, f)) : []
    if (!changed.length && mode !== 'verify-existing') {
      violations = 'bramka „kod istnieje": żaden plik w zakresie warstwy nie został zmieniony'
      log(layer.id + ': ' + violations)
      if (attempt >= maxAttempts) {
        settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: violations }
        break
      }
      continue
    }
    if (changed.length) layerFiles = changed

    // ── 3. sonda deterministyczna (typecheck/testy/przyrost) — RAZ, tanio, przed verify
    const probeOpts = Object.assign(
      { label: layer.id + '-checks', maxTurns: DEFAULTS.probeTurns, schema: CHECKS_SCHEMA },
      modelFor('probe'),
    )
    let probe = null
    try {
      probe = await ask(buildProbePrompt(a, layer), probeOpts)
    } catch (e) {
      probe = null
    }

    if (probe && (probe.typecheck === 'fail' || probe.tests === 'fail')) {
      violations = 'deterministyczna bramka na czerwono (typecheck: ' + probe.typecheck +
        ', testy: ' + probe.tests + ')\n' + (probe.tail || '')
      log(layer.id + ': sonda NO_GO — bez analizy kodu, prosto do poprawki')
      probeRed = violations
      mode = 'implement'
      if (attempt >= maxAttempts) {
        settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: violations }
        break
      }
      continue
    }

    probeRed = null
    const deltaFail = deltaGateFails(layer, probe, layerFiles)
    if (deltaFail) {
      violations = deltaFail
      log(layer.id + ': ' + deltaFail)
      mode = 'implement'
      if (attempt >= maxAttempts) {
        settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: deltaFail }
        break
      }
      continue
    }

    // ── 4. weryfikacja — sekwencyjnie, ze schemą, w try/catch, z twardym limitem
    // `layers[].verify` (per warstwa, np. refine-quality-verifier dla apps/web w monorepo)
    // ma pierwszeństwo przed slotem inner_loop.verify.
    const verifyAgent = firstAgentName(layer.verify || (a.verifiers && a.verifiers.layer))
    if (!verifyAgent) {
      log(layer.id + ': brak slotu weryfikatora w runtime.yml — warstwa zamknięta na sondzie')
      settled = { id: layer.id, status: 'GO', files: layerFiles, note: 'brak slotu verify' }
      break
    }
    const verifyOpts = Object.assign(
      { label: layer.id + '-verify', agentType: verifyAgent, maxTurns: budgetFor(a, 'verify', DEFAULTS.verifyCalls), schema: VERDICT_SCHEMA },
      modelFor('verify'),
    )
    let verdict = null
    try {
      verdict = await ask(buildVerifierPrompt(a, layer, probe, layerFiles, mode), verifyOpts)
    } catch (e) {
      verdict = null
    }
    if (verdict && typeof verdict.deviation_note === 'string' && verdict.deviation_note.trim()) deviationNote = verdict.deviation_note.trim()

    const decision = decideVerdict(verdict, attempt, maxAttempts)
    if (decision.next === 'go') {
      settled = { id: layer.id, status: 'GO', files: layerFiles, attempts: attempt }
      break
    }
    if (decision.next === 'escalate') {
      settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: decision.reason, files: layerFiles }
      break
    }
    if (decision.next === 'silent') {
      silentDeaths++
      if (silentDeaths >= 2) {
        settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: 'weryfikator dwukrotnie bez wyniku' }
        break
      }
      mode = 'verify-existing'
      continue
    }
    violations = decision.reason
    mode = 'implement'
  }

  if (!settled) settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: 'pętla warstwy zamknęła się bez werdyktu' }
  if (deviationNote) settled.deviation_note = deviationNote
  report.layers.push(settled)
  for (const f of settled.files || []) if (allChangedFiles.indexOf(f) === -1) allChangedFiles.push(f)

  if (haltsRun(settled.status)) {
    log(settled.status + ' na warstwie ' + layer.id + ' — ' + settled.reason)
    return report
  }
  log('warstwa ' + layer.id + ' — GO. Dopisz jej id do layers_done w artefakcie analizy (checkpoint wznowienia).')
}

// ── 5. bramka końcowa: checks z final_gate ∪ checks warstw, które weszły — raz, na całości.
// Lista plików z DRZEWA względem bazy przebiegu, nie z raportów warstw (no-op oddaje []).
phase('Bramka końcowa')

const treeOpts = Object.assign(
  { label: 'final-tree-probe', maxTurns: DEFAULTS.diffProbeTurns, schema: DIFF_PROBE_SCHEMA },
  modelFor('probe'),
)
let tree = null
try {
  tree = await ask(buildTreeProbePrompt(a.baseSha), treeOpts)
} catch (e) {
  tree = null
}
const treeSource = tree && tree.files ? 'tree' : 'layers'
const finalFiles = finalFileList(tree && tree.files, allChangedFiles)
if (treeSource === 'layers') log('sonda drzewa przed bramką końcową bez wyniku — lista plików z raportów warstw (może być niepełna)')

const finalAgent = firstAgentName(a.verifiers && a.verifiers.finalGate)
if (!finalAgent) {
  log('brak slotu final_gate w runtime.yml — kończę na werdyktach warstw')
} else {
  const finalOpts = Object.assign(
    { label: 'final-gate', agentType: finalAgent, maxTurns: budgetFor(a, 'final-gate', DEFAULTS.verifyCalls), schema: VERDICT_SCHEMA },
    modelFor('final'),
  )
  let final = null
  try {
    final = await ask(buildFinalGatePrompt(a, (a.checks && a.checks.finalGate) || [], finalFiles, treeSource), finalOpts)
  } catch (e) {
    final = null
  }
  report.finalGate = final || { verdict: 'NO_GO', violations: ['bramka końcowa nie zwróciła werdyktu'] }
  // Bramka końcowa nie ma pętli retry (jeden strzał) — GO z niepustym unverified_scope nie może
  // więc "skonsumować próby" jak w decideVerdict(); jedyna bezpieczna reakcja to potraktować to
  // jak NO_GO, żeby uczciwie przyznana luka trafiła do człowieka zamiast do cichego stage'owania.
  const finalUnverified = Array.isArray(report.finalGate.unverified_scope) ? report.finalGate.unverified_scope.filter(Boolean) : []
  if (String(report.finalGate.verdict).toUpperCase() === 'GO' && finalUnverified.length) {
    report.finalGate.verdict = 'NO_GO'
    report.finalGate.violations = (report.finalGate.violations || []).concat(
      'GO z niezweryfikowanym zakresem (unverified_scope), bramka końcowa nie ma retry: ' + finalUnverified.join(', '))
  }
  if (String(report.finalGate.verdict).toUpperCase() !== 'GO') {
    log('ESCALATE_AND_HALT — bramka końcowa: ' + formatViolations(report.finalGate.violations))
    return report
  }
}

// ── 6. wyjście: staged, NIE zacommitowane. Commit robi człowiek.
report.staged = finalFiles
log('Gotowe. Stan: staged, not committed — ' + finalFiles.length + ' plików. Commit robi człowiek.')
return report
