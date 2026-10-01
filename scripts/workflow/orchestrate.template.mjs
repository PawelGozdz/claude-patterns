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

function scopeBlock(layer, a) {
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
  // ORC-075: WYJĄTEK towarzyszący zakłada, że test tego pliku to praca TEJ warstwy — fałsz,
  // gdy ten sam przebieg ma osobną, późniejszą jednostkę `tests: true` (np. `testing:testing`
  // z units[], ORC-064), której `dirs` i tak pokrywają te same katalogi. Bez tego zastrzeżenia
  // implementer bez uprawnień do pisania testów (rola zakazuje delegacji, layer bez Task) i
  // weryfikator NO_GO'owali brak pliku towarzyszącego 3x, mimo że test-authoring już jest
  // zaplanowany w tym samym przebiegu (grant-flow TS-RATE-003, application:application).
  const testingUnits = layer.tests
    ? []
    : (a && Array.isArray(a.layers) ? a.layers : []).filter((l) => l && l.tests === true)
  const deferNote = testingUnits.length
    ? '\n  Jeśli katalog brakującego pliku towarzyszącego pokrywa się z zakresem osobnej ' +
      'jednostki tego przebiegu z `tests: true` (' + testingUnits.map((l) => l.id).join(', ') +
      ') — to JEJ praca, nie luka tej warstwy; nie zgłaszaj tego jako naruszenie tutaj.'
    : ''
  return 'ZAKRES WARSTWY\n  id: ' + layer.id + '\n  katalogi: ' + dirs +
    (layer.role ? '\n  rola: ' + layer.role : '') + narrowed +
    '\nPlik spoza tych katalogów jest POZA ZAKRESEM, nie brakujący.' +
    '\nWYJĄTEK — pliki towarzyszące: test (*.spec.*, *.test.*) w tym samym katalogu i z tym samym ' +
    'rdzeniem nazwy co plik z zakresu (x.map.ts → x.adapter.spec.ts) należy do zakresu. Gdy ' +
    'zmieniasz kontrakt pliku, zaktualizuj jego test obok.' + deferNote
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
  return spec + decisions + '\n\n' + scopeBlock(layer, a) + '\n' + renderCards(cardsFor(a, baseId(layer))) +
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
  // ORC-016 (2026-09-27 uzupełnienie kodem — do tej pory czysta proza): goły `npm run <check>`
  // w monorepo z turbo/nx (`dependsOn: ["^build"]`) buduje WSZYSTKIE zależności upstream, nie
  // tylko pakiet tej warstwy. Silnik Workflow nie ma dostępu do fs (patrz nagłówek pliku), więc
  // lookup najbliższego package.json robi SONDA (ma Bash) — jedna funkcja powłoki, nie Node.
  // Zaobserwowane jako powtarzalne uszkodzenie packages/contracts/src/generated/* w feature-flags
  // (2026-09-27, TASK-0010, 2x w tym samym przebiegu: root `lint`→`turbo run lint`, złej wersji
  // toolchainu AJV psującej build kontraktów, którego ta warstwa w ogóle nie dotykała).
  const dirs = effectiveDirs(layer)
  const firstDir = dirs.length
    ? (/\.[a-z0-9]+$/i.test(dirs[0]) ? splitPath(dirs[0]).dir : dirs[0]).replace(/\/+$/, '')
    : null
  const pkgLookup = firstDir
    ? '_pkgdir() { d="' + firstDir + '"; while [ "$d" != "." ] && [ "$d" != "/" ] && [ -n "$d" ]; do ' +
      '[ -f "$d/package.json" ] && { echo "$d"; return; }; d=$(dirname "$d"); done; echo "."; }; ' +
      'PKGROOT=$(_pkgdir)\n' +
      // ORC-085: nazwy `checks` z bloków monorepo to nazwy skryptów ROOTA (`typecheck:web`), a
      // sonda biegnie w katalogu pakietu, gdzie skrypt nazywa się `typecheck` — wszystko
      // wychodziło „skipped" (grant-flow TS-UI-003, apps/web). Kolejność: dokładna nazwa w
      // pakiecie → nazwa bez sufiksu po „:" w pakiecie → dokładna nazwa w korzeniu repo.
      // Sufiks wolno odciąć TYLKO gdy równa się nazwie katalogu pakietu (`:web` dla apps/web) i
      // tylko ostatni segment — inaczej `lint:check` → `lint` (z --fix) zmieniałoby pliki.
      '_chk() { s="$1"; b="${s%:*}"; sfx="${s##*:}"; bn=$(basename "$PKGROOT"); ' +
      'if [ "$PKGROOT" != "." ] && grep -q "\\"$s\\"[[:space:]]*:" "$PKGROOT/package.json" 2>/dev/null; then (cd "$PKGROOT" && npm run "$s"); ' +
      'elif [ "$PKGROOT" != "." ] && [ "$b" != "$s" ] && [ "$sfx" = "$bn" ] && grep -q "\\"$b\\"[[:space:]]*:" "$PKGROOT/package.json" 2>/dev/null; then (cd "$PKGROOT" && npm run "$b"); ' +
      'else npm run "$s"; fi; }\n'
    : ''
  const cmds = (layer.checks || []).map((c) => firstDir ? '_chk ' + c : 'npm run ' + c)
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
  // ORC-078 (docs/decisions/orchestrate-rule-history.md#orc-078): Flutter/Dart rozdziela
  // lib/ i test/ BEZ wspólnego segmentu (lib/core/design/x.dart -> test/core/design/
  // x_test.dart, NIE test/lib/core/design/...). `dirs` z prefiksem lib/ (pełna ścieżka od
  // korzenia repo, jak w --overrides) budowały pathspec `:(glob)**/lib/core/design/**`,
  // który nigdy nie trafia w drzewo testów — newTestBlocks liczyło 0 niezależnie od realnej
  // zawartości (juz-ide-mobile-app DESIGN-SYSTEM-009, DEV-orc-035-presentation). Dopisujemy
  // wariant BEZ segmentu lib/ OBOK oryginalnego (nie zamiast) — nie zawęża dopasowania dla
  // stacków, gdzie test/ faktycznie lustrzanie odwzorowuje lib/ z segmentem.
  const globScoped = effectiveDirs(layer)
    .flatMap((d) => (/^lib\//.test(d) ? [d, d.replace(/^lib\//, '')] : [d]))
    .map((d) => {
      if (!/\.[a-z0-9]+$/i.test(d)) return "':(glob)**/" + d.replace(/\/$/, '') + "/**'"
      const sp = splitPath(d)
      return "':(glob)**/" + d + "' ':(glob)**/" + sp.dir + sp.stem + ".*.spec.*' ':(glob)**/" + sp.dir + sp.stem + ".*.test.*'"
    })
    .join(' ') || '.'
  const run = cmds.length
    ? pkgLookup + cmds.map((c) => c + ' > /tmp/check-' + layer.id + '.log 2>&1; echo "EXIT:$?"').join('\n') +
      (firstDir
        ? '\nGdy $PKGROOT wyjdzie jako "." (brak package.json na ścieżce do zakresu warstwy) — ' +
          'checks poleciały na PEŁNYM repo; zaznacz to WPROST w swojej odpowiedzi (ORC-016: ' +
          'świadome pełne uruchomienie, nie milczące domyślne).'
        : '')
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
  // „Ostatnie 40 linii" gubi błąd, gdy PO nim w tym samym logu leży dużo ostrzeżeń z
  // katalogów spoza zakresu warstwy (monorepo, jeden `lint:check` na cały repo) — implementer
  // widzi tylko cudzy ogon i ogłasza no-op, mimo że błąd W JEGO zakresie jest wcześniej w tym
  // samym pliku (marketing-hub TS-MH-006, testing:knowledge, 2x z rzędu na tym samym tasku:
  // 3 błędy import/order w nowo dodanym pliku warstwy zgubione za ostrzeżeniami z shared/).
  // Grep po własnym zakresie NAJPIERW — błąd w Twoich plikach nie może zniknąć za cudzym
  // ogonem logu, niezależnie od jego długości; tail zostaje jako fallback dla błędów bez
  // ścieżki (np. konfiguracyjnych), których grep z natury nie złapie.
  const scopeGrep = effectiveDirs(layer)
    .map((d) => String(d).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const tailInstruction = scopeGrep
    ? ' Przy niezerowym: NAJPIERW `grep -E \'' + scopeGrep + '\' /tmp/check-' + layer.id + '.log` — ' +
      'linie z Twojego WŁASNEGO zakresu, w CAŁOŚCI, niezależnie od tego, ile linii to da. ' +
      'Dopiero gdy ten grep nic nie znajdzie (błąd bez ścieżki pliku, np. konfiguracyjny) — ' +
      'zwróć ostatnie 40 linii CAŁEGO logu w `tail`.'
    : ' Przy niezerowym — zwróć ostatnie 40 linii w `tail`.'
  // ORC-082 (uzupełnienie): surowe linie błędów TS jako OSOBNE pole. ORC-082 parsował `tail`, a `tail` agent
  // sondy potrafił sparafrazować („Missing method X…") — parser nie widział błędu, wyjątek
  // nie zadziałał i warstwa domain stanęła na BLOCKED_BY_PRIOR (juz-ide-api-1, 2026-09-30).
  const tsErrorsInstruction = cmds.length
    ? ' Przy niezerowym typecheck dodatkowo zwróć w `tsErrors` WYNIK DOSŁOWNIE (bez streszczania, ' +
      'parafrazy i komentarza): `grep -E \'error TS[0-9]+\' /tmp/check-' + layer.id + '.log | head -60`.'
    : ''
  return 'Uruchom dokładnie to i NIC więcej:\n' + run +
    '\nPrzy EXIT:0 NIE otwieraj pliku logu wcale.' + tailInstruction + tsErrorsInstruction +
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
  const calls = scaledBudget(a, 'verify', (changedFiles || []).length)
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
      spec + '\n\n' + scopeBlock(layer, a) + '\n\nUZASADNIENIE IMPLEMENTERA:\n' + noopClaim + prior + '\n\n' +
      'GO = zgadzasz się, warstwa faktycznie nie ma nic do zrobienia (w uzasadnieniu napisz, co ' +
      'sprawdziłeś). NO_GO = task WYMAGA zmian w tej warstwie — w naruszeniach wypisz KONKRETNIE ' +
      'co (plik/moduł, czego brakuje); to trafi do implementera jako lista poprawek.\n' +
      'TWARDY LIMIT: ' + calls + ' wywołań narzędzi. Werdykt na podstawie tego, co wiesz, gdy budżet ' +
      'się kończy; brak werdyktu wywraca cały przebieg.'
  }
  const facts = probe
    ? 'FAKTY Z SONDY — obiekt `checks` (już wykonane, traktuj jak dane wejściowe):\n' +
      '  checks.typecheck: ' + probe.typecheck + '\n  checks.tests: ' + probe.tests +
      (probe.newTestBlocks != null ? '\n  checks.newTestBlocks: ' + probe.newTestBlocks : '') +
      (probe.typecheck === 'deferred'
        ? '\n  (typecheck: czerwień wyłącznie w plikach PÓŹNIEJSZYCH warstw — odroczona do ich sond, ' +
          'nie jest naruszeniem tej warstwy; nie zgłaszaj jej)'
        : '') +
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
  // ORC-070 (docs/decisions/orchestrate-rule-history.md#orc-070): filtr mechaniczny w
  // decideVerdict() łapie tylko pozycje wyglądające na ścieżkę, przypisane do dirs INNEJ
  // warstwy — poniższy akapit adresuje przyczynę (ORC-011 już to mówi o `dirs`, ale nie o
  // samym polu `unverified_scope`), nie tylko objaw (juz-ide-api-1 TS-SEC-112,
  // infrastructure:guards: 3 identyczne rundy GO z unverified_scope wskazującym pliki spoza
  // dirs tej jednostki, zero realnej luki).
  const scopeReminder =
    'POLE `unverified_scope` (budżet tur): wyłącznie pliki z TWOJEGO WŁASNEGO zakresu (dirs ' +
    'powyżej), których nie zdążyłeś sprawdzić. Plik albo spec spoza Twojego zakresu — inna ' +
    'jednostka tego przebiegu go pokrywa — NIE jest niezweryfikowanym zakresem: pomiń go ' +
    'całkowicie, nie wpisuj tutaj (ORC-011: poza zakresem, nie brakujący).\n' +
    'FORMAT: jeden wpis tej tablicy = jedna ścieżka względem repo (np. `src/foo/bar.ts`), nic ' +
    'więcej — bez nawiasów, wyjaśnień, kilku plików w jednym stringu ani gołych nazw plików bez ' +
    'katalogu. Zdanie prozą zamiast ścieżki nie da się mechanicznie rozpoznać jako „poza ' +
    'zakresem" po drugiej stronie.\n'
  return existing + scopeBlock(layer, a) + '\n\n' + facts + files +
    renderCards(cardsFor(a, baseId(layer))) +
    '\nOceń zgodność zmiany z regułami powyżej. Zwróć werdykt GO albo NO_GO i listę naruszeń ' +
    '(plik, linia, reguła, co poprawić).\n' + scopeReminder +
    'CZYTAJ TYLKO zmienione pliki z listy (Read z offset/limit, gdy plik > 300 linii); plik spoza ' +
    'listy otwieraj wyłącznie, gdy zmieniony plik go importuje i bez niego nie da się ocenić ' +
    'reguły. Nie grepuj po całym drzewie „dla kontekstu" — każdy wynik zostaje w Twoim kontekście ' +
    'do końca i jest płacony przy każdym kolejnym wywołaniu.\n' +
    // ORC-085: grant-flow TS-UI-003 — weryfikator kończył po 7-12 z 15 wywołań z niepustym
    // unverified_scope: „czytaj tylko zmienione" + „TWARDY LIMIT" czytał jako zachętę do
    // pośpiechu. unverified_scope jest dla plików, na które BUDŻETU ZABRAKŁO.
    'Nie kończ przed wyczerpaniem budżetu, dopóki na liście są pliki, których nie przeczytałeś: ' +
    '`unverified_scope` służy plikom, na które zabrakło budżetu, nie plikom pominiętym z wyboru.\n' +
    'TWARDY LIMIT: ' + calls + ' wywołań narzędzi. Gdy budżet się kończy — wydaj werdykt ' +
    'natychmiast, na podstawie tego, co już wiesz. Werdykt częściowy z uzasadnieniem jest ' +
    'poprawnym wynikiem; brak werdyktu wywraca cały przebieg.'
}

// Lista plików przychodzi z DRZEWA (sonda treeFilesCmd względem bazy przebiegu), nie z sumy
// raportów warstw: warstwa zakończona no-op oddaje `files: []`, więc bramka nie widziała
// infrastruktury, migracji ani kontraktów (TS-MH-005 — weryfikator sam zajrzał do HEAD).
// Karty: wszystkie wzorce przebiegu — bramka oceniała całość zmiany bez reguł.
function buildFinalGatePrompt(a, checks, changedFiles, treeSource, knownGaps) {
  const calls = scaledBudget(a, 'final-gate', (changedFiles || []).length)
  // ORC-084: luki, które warstwy już zapisały jako GO_WITH_GAPS — bramka nie wymusza za nie NO_GO
  // (filterKnownLayerGaps), ale ma je sprawdzić celowanym odczytem, jeśli starczy budżetu.
  const gapsBlock = (knownGaps || []).length
    ? '\n\nZNANE LUKI WARSTW (warstwy zamknęły je jako GO_WITH_GAPS: zero naruszeń, sonda zielona, ' +
      'weryfikator nie zdążył ich przeczytać). Sprawdź je celowanym odczytem, jeśli starczy budżetu; ' +
      'niesprawdzone NIE powodują NO_GO — trafią do raportu dla człowieka:\n' +
      knownGaps.map((g) => '- ' + g.layer + ': ' + g.items.join(', ')).join('\n')
    : ''
  const dirty = (a.dirtyAtStart || []).length
    ? 'Pliki BRUDNE JUŻ PRZED startem przebiegu (nie są pracą tego taska, chyba że je zmienił — ' +
      'oceń tylko, jeśli są na liście wyżej i dotyczą taska):\n  ' + a.dirtyAtStart.join('\n  ') + '\n'
    : ''
  const source = treeSource === 'layers'
    ? '(UWAGA: sonda drzewa nie zwróciła wyniku — lista złożona z raportów warstw, może być ' +
      'niepełna; sprawdź `' + treeFilesCmd(a.baseSha) + '` sam, jednym wywołaniem.)\n'
    : ''
  // Warstwy dostają kanał na jawną adjudykację nieoczywistego zakresu (layer.scope.reason,
  // patrz scopeBlock()) — bramka końcowa go NIE MIAŁA, mimo że `a.task.decisions` już do niej
  // dociera (ten sam pole, którego buildImplPrompt() używa od dawna, tu po prostu nie było
  // renderowane). Bez tego jedyna droga naprawy „GO z unverified_scope na czymś trywialnym
  // (README, .gitignore, sam plik analizy)" na jednorazowej, bez-retry bramce była ręczna
  // interwencja człowieka — inaczej niż warstwy, które mają wbudowaną ścieżkę (feature-flags
  // TASK-0010, 2 z 4 eskalacji ORC-069 tego przebiegu były na final-gate). Człowiek dopisuje
  // decyzję do `decisions:` w analizie, resume tego samego taska ją zobaczy tutaj.
  const decisions = (a.task.decisions || []).length
    ? '\n\nDECYZJE ZATWIERDZONE PRZEZ CZŁOWIEKA — stosuj, nie re-decyduj. Jeśli któraś jawnie ' +
      'adresuje pozycję, którą inaczej wpisałbyś do unverified_scope (np. „D9: plik X jest ' +
      'dokumentacyjny/niefunkcjonalny, poza zakresem tej weryfikacji"), potraktuj to jako ' +
      'rozstrzygnięte przez człowieka, nie jako niezweryfikowaną lukę:\n' +
      a.task.decisions.map((d) => '- ' + d.id + ' ' + (d.topic || '') + ': ' + (d.choice || '')).join('\n')
    : ''
  return 'BRAMKA KOŃCOWA dla ' + a.task.id + ' — oceniasz CAŁOŚĆ zmiany, nie ostatnią warstwę. ' +
    'To ostatnie miejsce, w którym wychodzi regresja MIĘDZY warstwami.\n\n' +
    (checks.length ? 'Deterministyczne bramki do wykonania raz, na całości: ' + checks.join(', ') + '\n' : '') +
    (changedFiles.length ? 'Pliki objęte zmianą (z drzewa, względem bazy przebiegu):\n  ' + changedFiles.join('\n  ') + '\n' : '') +
    source + dirty + decisions + gapsBlock +
    renderCards(a.patterns || [], 'wszystkie wzorce tego przebiegu') +
    '\nZwróć werdykt GO albo NO_GO i listę naruszeń.\n' +
    'TWARDY LIMIT: ' + calls + ' wywołań narzędzi. Gdy budżet się kończy — wydaj werdykt ' +
    'natychmiast na podstawie zebranych dowodów.' + NO_REVERT
}

// ORC-071 (docs/decisions/orchestrate-rule-history.md#orc-071): weryfikator czasem PISZE
// PROZĄ, że pozycja unverified_scope jest poza jego zakresem ("... - poza zakresem tej
// jednostki (shared-infra)", "owned by domain unit"), zamiast realnej luki. Wydzielone na
// poziom modułu (ORC-076, docs/decisions/orchestrate-rule-history.md#orc-076) tak, żeby
// final gate — który NIE woła decideVerdict() (jest jednorazowy, bez pętli retry, patrz
// sekcja „6. bramka końcowa") — mógł stosować DOKŁADNIE ten sam filtr zamiast trzymać
// osobną, dużo bardziej naiwną kopię tej samej reguły.
const SELF_ADMITS_OUT_OF_SCOPE = /poza zakresem|out[- ]of[- ]scope|inn(?:ej|a) jednostk|owned by (?:another|a different|[\w-]+\s+(?:unit|layer|warstw\w*))/i
function filterSelfAdmittedOutOfScope(items) {
  return items.filter((item) => !SELF_ADMITS_OUT_OF_SCOPE.test(item))
}

// ORC-079 (docs/decisions/orchestrate-rule-history.md#orc-079): plik analizy/task TEGO
// przebiegu bywa wymieniony w unverified_scope ("sam plik analizy", "plik taska") —
// strukturalnie NIGDY nie jest kodem produkcyjnym do przeglądu final gate, to artefakt
// PROCESU tego przebiegu. Filtrujemy po ŚCIEŻCE (a.task.analysisFile/taskFile), nie po
// kolejnym wariancie frazy w SELF_ADMITS_OUT_OF_SCOPE — bezpieczniejsze, bo nie zależy od
// tego, JAK weryfikator to nazwie (ai-os-bot BOT-005a-tests, 2026-09-29: pozycja "plik
// analizy" nie zawierała żadnej z fraz self-admission, więc ORC-076 sam jej nie złapał).
function filterOwnTaskArtifacts(items, task) {
  const paths = [task && task.analysisFile, task && task.taskFile].filter(Boolean)
  if (!paths.length) return items
  return items.filter((item) => !paths.some((p) => item.includes(p)))
}

// ORC-080 (docs/decisions/orchestrate-rule-history.md#orc-080): buildFinalGatePrompt()
// renderuje a.task.decisions (ORC-072) i INSTRUUJE weryfikatora, że pozycja jawnie
// zaadresowana decyzją nie jest luką — ale to instrukcja promptu, nie mechanizm. Lekcja z
// ORC-071 ("instrukcja promptu nie jest wiążąca dla LLM") dotyczy też tego kanału: ai-os-bot
// BOT-005a-tests (2026-09-29, drugi przebieg tego samego taska) miał D7 jawnie adjudykujące
// pozycję, a bramka końcowa i tak zgłosiła TĘ SAMĄ pozycję jako unverified_scope. Filtr
// mechaniczny — jeśli pozycja WYMIENIA id decyzji (np. "D7"), odfiltruj ją niezależnie od
// tego, czy weryfikator "zastosował" ją w rozumowaniu, czy tylko przepisał numer.
function filterAdjudicatedByDecision(items, decisions) {
  const ids = (decisions || []).map((d) => d && d.id).filter(Boolean)
  if (!ids.length) return items
  const rx = ids.map((id) => new RegExp('\\b' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'))
  return items.filter((item) => !rx.some((r) => r.test(item)))
}

// Decyzja po weryfikacji. Trzy różne awarie, trzy różne reakcje — zlanie ich w jedno
// („no to spróbuj jeszcze raz") jest tym, co pali trzecią pełną próbę na gotowym kodzie.
// `layer`/`allLayers` opcjonalne — brak (np. stare wywołanie, testy jednostkowe funkcji w
// izolacji) po prostu wyłącza filtr ORC-070 i wraca do zachowania sprzed niego.
function decideVerdict(verdict, attempt, maxAttempts, layer, allLayers) {
  // ORC-083: `cause` odróżnia „kod ma błędy" ('code') od „maszyna nie domknęła weryfikacji"
  // ('machine') — tylko drugie jest odstępstwem orkiestracji wartym zgłoszenia (krok 5).
  if (!verdict) return { next: 'silent', reason: 'brak wyniku weryfikatora', cause: 'machine' }
  const v = String(verdict.verdict || '').toUpperCase()
  // GO z niepustym unverified_scope to CZWARTA awaria, nie czysty GO: weryfikator uczciwie
  // przyznał (konwencja "TURN BUDGET" w promptach weryfikatorów), że nie zdążył sprawdzić
  // części zakresu, ale bez tej rozróżnicy GO przechodziło identycznie jak pełna weryfikacja —
  // obietnica z tych promptów ("orchestrator dispatches a narrowed follow-up pass") nigdzie
  // się nie realizowała (marketing-hub TS-MH-010, testing:l1-l2, jednostka 105 plików: GO mimo
  // 11 czerwonych testów, czerwień wyszła dopiero jako BLOCKED_BY_PRIOR na kolejnej jednostce).
  const unverified = Array.isArray(verdict.unverified_scope) ? verdict.unverified_scope.filter(Boolean) : []
  // ORC-070: pozycja unverified_scope, która wygląda na ścieżkę (ma `/` albo `.`) i leży
  // WYŁĄCZNIE w dirs innej warstwy tego samego przebiegu, nigdy w dirs tej warstwy — to nie
  // luka TEJ warstwy, tylko cudza robota, którą zweryfikuje własny weryfikator tamtej warstwy.
  // Bez tego rozróżnienia weryfikator, który uczciwie wymienia sąsiedni katalog spoza swojego
  // layers_scope.dirs, sam sobie wymuszał NO_GO (grant-flow TS-RATE-003, domain:domain: 2 z 3
  // pozycji to domain/repositories/ i error-mapper wiring, należące do jednostek
  // application/infrastructure-persistence tego samego przebiegu — diagnostyka po fakcie
  // potwierdziła kod tej warstwy za kompletny i poprawny). Wolny tekst bez separatora ścieżki
  // (np. „VO rule-by-rule re-walk") zostaje liczony konserwatywnie dalej — nie da się
  // mechanicznie odróżnić duplikatu weryfikacji od realnej luki bez historii poprzednich jednostek.
  // ORC-071: weryfikator czasem PISZE PROZĄ, że pozycja jest poza zakresem ("... — poza
  // zakresem tej jednostki (shared-infra)"), zamiast podać czystą ścieżkę — dopasowanie po
  // dirs w ownUnverified wymaga pełnej ścieżki, więc goła nazwa pliku w nawiasie ("guards unit
  // files (reputation-threshold.guard.ts, ...)") nic nie dopasowuje i pozycja liczy się jako
  // realna luka, mimo że sam weryfikator już powiedział, że nie jest. Instrukcja formatu w
  // promptcie nie jest wiążąca dla LLM (juz-ide-api-1 TS-SEC-112, infrastructure:shared-infra,
  // wariant #2 tego samego dnia po dodaniu scopeReminder) — ufamy więc słowu weryfikatora: gdy
  // sam stwierdza brak zakresu, nie próbujemy tego jeszcze raz strukturalnie potwierdzać.
  // ORC-071 dodatek (grant-flow TS-RATE-003, infrastructure:infrastructure-persistence, 3.
  // wystąpienie tego samego kształtu): "owned by domain unit" nie łapało się na wąskie
  // "owned by (another|a different)" — werset szerszy o dowolną nazwę jednostki/warstwy przed
  // "unit"/"layer"/"warstw…", nie tylko "another"/"a different". (SELF_ADMITS_OUT_OF_SCOPE
  // przeniesiona na poziom modułu w ORC-076 — patrz komentarz nad definicją, wyżej.)
  const ownUnverified = layer
    ? unverified.filter((item) => {
      if (SELF_ADMITS_OUT_OF_SCOPE.test(item)) return false
      if (!/[/.]/.test(item)) return true
      if (layerTouches(layer, item)) return true
      const claimedElsewhere = (allLayers || []).some((l) =>
        l.id !== layer.id && effectiveDirs(l).length && layerTouches(l, item))
      return !claimedElsewhere
    })
    : unverified
  if (v === 'GO' && ownUnverified.length) {
    if (attempt >= maxAttempts) {
      return { next: 'escalate', cause: 'machine', gaps: ownUnverified, reason: 'GO z niezweryfikowanym zakresem po ' + maxAttempts + ' próbach — nigdy nie sprawdzono: ' + ownUnverified.join(', ') }
    }
    // ORC-074: to NIE jest 'fix' (kod nie ma czego naprawiać — weryfikator nie zgłosił
    // naruszeń, tylko brak czasu/kompetencji na część zakresu), więc kolejna próba nie
    // powinna wracać do implementera. `next: 'reverify'` każe pętli warstwy przejść od razu
    // w tryb 'verify-existing' (świeży budżet tur TYLKO dla weryfikatora) zamiast pełnego
    // implement→verify. Bez tego rozróżnienia (ai-os-bot BOT-014, warstwa `implementation`;
    // marketing-hub TS-MH-006, `infrastructure:wiring-security-format-fix`) 3 próby paliły
    // implementera na kodzie, który już był poprawny — 3-cia próba w obu przypadkach nie
    // miała żadnej zmiany w diffie, tylko pisemną analizę weryfikatora.
    return { next: 'reverify', reason: 'weryfikator dał GO, ale nie zdążył sprawdzić (unverified_scope): ' + ownUnverified.join(', ') + ' — kolejna próba dostaje świeży budżet tur wyłącznie na dokończenie weryfikacji, bez powrotu do implementera' }
  }
  if (v === 'GO') return { next: 'go', reason: null }
  if (attempt >= maxAttempts) {
    return { next: 'escalate', cause: 'code', reason: 'wyczerpane ' + maxAttempts + ' prób, ostatni werdykt NO_GO' }
  }
  return { next: 'fix', reason: formatViolations(verdict.violations) }
}

// ORC-084 (docs/decisions/orchestrate-rule-history.md#orc-084): warstwa, której weryfikator dał
// GO bez ani jednego naruszenia, ale nie domknął zakresu po wszystkich próbach, NIE zatrzymuje
// przebiegu — kończy jako GO_WITH_GAPS, a luki jadą w raporcie do bramki końcowej i człowieka.
// Warunek: sonda ODPOWIEDZIAŁA i nie jest czerwona (typecheck/testy pass|skipped|deferred);
// brak wyniku sondy = brak dowodu, że kod działa, więc halt jak dotąd.
function layerGapsAcceptable(decision, verdict, probe) {
  if (!decision || decision.next !== 'escalate') return false
  if (!Array.isArray(decision.gaps) || !decision.gaps.length) return false
  if (!verdict || String(verdict.verdict || '').toUpperCase() !== 'GO') return false
  if (Array.isArray(verdict.violations) && verdict.violations.length) return false
  return probeHasGreenEvidence(probe)
}

// „skipped" to brak dowodu, nie zieleń: ślepa sonda (wszystko skipped, np. złe nazwy
// skryptów — ORC-085) nie może uzasadniać przejścia dalej. Wymagamy co najmniej jednego
// faktycznego `pass` (typecheck albo testy) i zera `fail`.
function probeHasGreenEvidence(probe) {
  if (!probe) return false
  if (probe.typecheck === 'fail' || probe.tests === 'fail') return false
  return probe.typecheck === 'pass' || probe.tests === 'pass'
}

// ORC-086: weryfikator dwukrotnie bez wyniku (padł/przekroczył budżet) to awaria maszyny, nie
// werdykt o kodzie. Przy zielonej sondzie i niepustym zakresie warstwa idzie dalej jako
// GO_WITH_GAPS z luką „warstwa niezweryfikowana" (domyka bramka końcowa i człowiek), zamiast
// zatrzymywać przebieg. Bez dowodu zielonej sondy albo bez zmian w zakresie — halt jak dotąd.
function silentVerifierGapsAcceptable(probe, files) {
  return probeHasGreenEvidence(probe) && Array.isArray(files) && files.length > 0
}

// ORC-085: domyślne 15 wywołań na weryfikatora/bramkę dla jednostki ~37 plików (grant-flow
// TS-UI-003, web-bootstrap) zostawiało `unverified_scope` w 5 z 6 prób. Bez jawnego
// `budgets.<slot>` budżet rośnie z liczbą plików ponad 10 (po 1 wywołaniu na plik), do 50.
// Jawny wpis w runtime.yml zawsze wygrywa.
function scaledBudget(a, slot, nFiles) {
  const explicit = budgetFor(a, slot, null)
  if (explicit != null) return explicit
  return Math.min(50, DEFAULTS.verifyCalls + Math.max(0, (nFiles || 0) - 10))
}

// Bramka końcowa nie wymusza NO_GO za pozycje, które warstwa już zapisała jako znaną lukę
// (GO_WITH_GAPS) — trafiają do raportu dla człowieka, bez drugiego liczenia. Dopasowanie po
// ścieżce/tekście luki zawartym w pozycji bramki (albo odwrotnie).
function filterKnownLayerGaps(items, knownGaps) {
  const known = (knownGaps || []).flatMap((g) => (g && g.items) || []).map(String).filter(Boolean)
  if (!known.length) return { kept: items, absorbed: [] }
  const absorbed = []
  const kept = items.filter((item) => {
    const hit = known.some((k) => item.includes(k) || k.includes(item))
    if (hit) absorbed.push(item)
    return !hit
  })
  return { kept, absorbed }
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

// ORC-082 (docs/decisions/orchestrate-rule-history.md#orc-082): typecheck warstwy biegnie na
// całym pakiecie, więc zmiana portu/konstruktora w domain/application czerwieni pliki WŁAŚCIWE
// późniejszym warstwom (infrastructure, testing) — cudzą czerwień, której ta warstwa nie może
// naprawić (juz-ide-api-1, 3 zgłoszenia, 2 taski). Odroczona jest TYLKO czerwień, w której
// KAŻDY błąd TS ma ścieżkę w dirs późniejszej warstwy i żaden nie leży w dirs tej warstwy ani
// wcześniejszych. Błąd bez ścieżki (globalny/konfiguracyjny) albo nieparsowalny ogon = brak
// odroczenia. Odroczoną czerwień domyka sonda następnej warstwy i bramka końcowa (typecheck).
function typecheckErrorPaths(tail) {
  const text = String(tail || '')
  const total = (text.match(/\berror\s+TS\d+/g) || []).length
  const re = /^\s*(\S+\.(?:tsx?|mts|cts))[(:]\d+[,:]\d+\)?:?\s*(?:-\s*)?error\s+TS\d+/gm
  const paths = []
  let m
  while ((m = re.exec(text)) !== null) paths.push(m[1])
  return { total, paths }
}

function typecheckRedIsLaterLayers(probe, layer, allLayers) {
  if (!probe || probe.typecheck !== 'fail' || probe.tests === 'fail') return false
  const { total, paths } = typecheckErrorPaths(probe.tsErrors || probe.tail)
  if (!paths.length || paths.length !== total) return false
  const idx = (allLayers || []).findIndex((l) => l.id === layer.id)
  if (idx < 0) return false
  const later = allLayers.slice(idx + 1).filter((l) => effectiveDirs(l).length)
  if (!later.length) return false
  return paths.every((p) => !layerTouches(layer, p) && later.some((l) => layerTouches(l, p)))
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
    tsErrors: { type: 'string' },
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
const report = { taskId: a.task && a.task.id, layers: [], gaps: [], finalGate: null, exit: a.exit || 'STAGE_NOT_COMMIT' }
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
        // ORC-077 (docs/decisions/orchestrate-rule-history.md#orc-077): etykieta MUSI nieść
        // numer próby. Bez niego (do 2026-09-29) była stała per warstwa, a prompt tej sondy
        // (buildDiffProbePrompt(a.baseSha)) też nie zależy od próby — para (label, prompt)
        // identyczna na każdym retry tej samej warstwy, więc cache silnika Workflow zamrażał
        // wynik PIERWSZEJ próby na zawsze, nawet po realnej zmianie stanu repo (grant-flow
        // TS-SIM-001, DEV-orc-065).
        const diffOpts = Object.assign(
          { label: layer.id + '-diff-probe-' + attempt, maxTurns: DEFAULTS.diffProbeTurns, schema: DIFF_PROBE_SCHEMA },
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
            settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: 'dwa kolejne wyjścia bez wyniku — zakres za duży na budżet, podziel warstwę', cause: 'machine' }
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
      const noopDecision = decideVerdict(noopVerdict, attempt, maxAttempts, layer, plan.map((s) => s.layer))
      if (noopDecision.next === 'go') {
        log(layer.id + ': brak zmian potwierdzony przez weryfikatora — ' + noopClaim)
        settled = { id: layer.id, status: 'GO', files: [], attempts: attempt, note: 'no-op: ' + noopClaim }
        break
      }
      if (noopDecision.next === 'escalate') {
        settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: noopDecision.reason, cause: noopDecision.cause || 'code' }
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
    // ORC-077: numer próby w etykiecie — patrz komentarz przy '-diff-probe' wyżej, ten sam bug.
    const gateOpts = Object.assign(
      { label: layer.id + '-diff-gate-' + attempt, maxTurns: DEFAULTS.diffProbeTurns, schema: DIFF_PROBE_SCHEMA },
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
        settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: violations, cause: 'machine' }
        break
      }
      continue
    }
    if (changed.length) layerFiles = changed

    // ── 3. sonda deterministyczna (typecheck/testy/przyrost) — RAZ, tanio, przed verify
    // ORC-077: numer próby w etykiecie — patrz komentarz przy '-diff-probe' wyżej, ten sam bug.
    const probeOpts = Object.assign(
      { label: layer.id + '-checks-' + attempt, maxTurns: DEFAULTS.probeTurns, schema: CHECKS_SCHEMA },
      modelFor('probe'),
    )
    let probe = null
    try {
      probe = await ask(buildProbePrompt(a, layer), probeOpts)
    } catch (e) {
      probe = null
    }

    // ORC-085: warstwa ma skonfigurowane checks, a sonda zwróciła „skipped" dla obu — ślepa
    // sonda (złe nazwy skryptów/brak skryptów). Głośno, nie po cichu: weryfikator dostaje
    // fakty „skipped" jako brak dowodu, a GO_WITH_GAPS wymaga co najmniej jednego `pass`.
    if (probe && (layer.checks || []).length && probe.typecheck === 'skipped' && probe.tests === 'skipped') {
      log(layer.id + ': UWAGA — sonda ślepa (checks ' + layer.checks.join(', ') + ' → wszystko skipped); sprawdź nazwy skryptów w pakiecie (ORC-085)')
      report.warnings = (report.warnings || []).concat(layer.id + ': sonda ślepa — checks ' + layer.checks.join(', ') + ' wszystkie skipped')
    }

    if (typecheckRedIsLaterLayers(probe, layer, plan.map((s) => s.layer))) {
      log(layer.id + ': typecheck czerwony wyłącznie w plikach późniejszych warstw — odroczony (ORC-082)')
      probe = Object.assign({}, probe, { typecheck: 'deferred' })
    }

    if (probe && (probe.typecheck === 'fail' || probe.tests === 'fail')) {
      violations = 'deterministyczna bramka na czerwono (typecheck: ' + probe.typecheck +
        ', testy: ' + probe.tests + ')\n' + (probe.tail || '')
      log(layer.id + ': sonda NO_GO — bez analizy kodu, prosto do poprawki')
      probeRed = violations
      mode = 'implement'
      if (attempt >= maxAttempts) {
        settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: violations, cause: 'code' }
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
        settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: deltaFail, cause: 'code' }
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
      { label: layer.id + '-verify', agentType: verifyAgent, maxTurns: scaledBudget(a, 'verify', layerFiles.length), schema: VERDICT_SCHEMA },
      modelFor('verify'),
    )
    let verdict = null
    try {
      verdict = await ask(buildVerifierPrompt(a, layer, probe, layerFiles, mode), verifyOpts)
    } catch (e) {
      verdict = null
    }
    if (verdict && typeof verdict.deviation_note === 'string' && verdict.deviation_note.trim()) deviationNote = verdict.deviation_note.trim()

    const decision = decideVerdict(verdict, attempt, maxAttempts, layer, plan.map((s) => s.layer))
    if (decision.next === 'go') {
      settled = { id: layer.id, status: 'GO', files: layerFiles, attempts: attempt }
      break
    }
    if (decision.next === 'escalate' && layerGapsAcceptable(decision, verdict, probe)) {
      settled = { id: layer.id, status: 'GO_WITH_GAPS', files: layerFiles, attempts: attempt, gaps: decision.gaps }
      report.gaps.push({ layer: layer.id, items: decision.gaps })
      log(layer.id + ': GO z lukami (ORC-084) — sonda zielona, zero naruszeń, przebieg idzie dalej; luki w raporcie: ' + decision.gaps.join(', '))
      break
    }
    if (decision.next === 'escalate') {
      settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: decision.reason, files: layerFiles, cause: decision.cause || 'machine' }
      break
    }
    if (decision.next === 'silent') {
      silentDeaths++
      if (silentDeaths >= 2) {
        if (silentVerifierGapsAcceptable(probe, layerFiles)) {
          const gap = ['(cała warstwa ' + layer.id + ') weryfikator dwukrotnie bez wyniku — nieoceniona semantycznie, sonda zielona']
          settled = { id: layer.id, status: 'GO_WITH_GAPS', files: layerFiles, attempts: attempt, gaps: gap }
          report.gaps.push({ layer: layer.id, items: gap })
          log(layer.id + ': weryfikator bez wyniku 2x, sonda zielona — GO z luką, przebieg idzie dalej (ORC-086)')
          break
        }
        settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: 'weryfikator dwukrotnie bez wyniku', cause: 'machine' }
        break
      }
      mode = 'verify-existing'
      continue
    }
    if (decision.next === 'reverify') {
      // ORC-074: GO z unverified_scope — kod jest OK, weryfikatorowi zabrakło czasu/kompetencji
      // na część zakresu. 'verify-existing' pomija implementera i idzie prosto do sondy+verify
      // ze świeżym budżetem tur, zamiast palić pełną rundę implement→verify na niezmienionym kodzie.
      log(layer.id + ': ' + decision.reason)
      violations = null
      mode = 'verify-existing'
      continue
    }
    violations = decision.reason
    mode = 'implement'
  }

  if (!settled) settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: 'pętla warstwy zamknęła się bez werdyktu', cause: 'machine' }
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
    { label: 'final-gate', agentType: finalAgent, maxTurns: scaledBudget(a, 'final-gate', finalFiles.length), schema: VERDICT_SCHEMA },
    modelFor('final'),
  )
  let final = null
  try {
    final = await ask(buildFinalGatePrompt(a, (a.checks && a.checks.finalGate) || [], finalFiles, treeSource, report.gaps), finalOpts)
  } catch (e) {
    final = null
  }
  // ORC-083: `cause` — 'machine' = bramka nie dała werdyktu albo NO_GO wymuszone przez
  // unverified_scope (ORC-069); 'code' = weryfikator sam znalazł naruszenia w kodzie.
  report.finalGate = final
    ? Object.assign({}, final, { cause: undefined })
    : { verdict: 'NO_GO', violations: ['bramka końcowa nie zwróciła werdyktu'], cause: 'machine' }
  // Bramka końcowa nie ma pętli retry (jeden strzał) — GO z niepustym unverified_scope nie może
  // więc "skonsumować próby" jak w decideVerdict(); jedyna bezpieczna reakcja to potraktować to
  // jak NO_GO, żeby uczciwie przyznana luka trafiła do człowieka zamiast do cichego stage'owania.
  // ORC-076 (docs/decisions/orchestrate-rule-history.md#orc-076): do 2026-09-29 ten blok nie
  // wołał decideVerdict() w ogóle i nie miał filtra self-admission (ORC-071) — KAŻDE szczere
  // przyznanie "poza zakresem tej bramki" (plik niezmieniony, sprawdzony tylko grepem; test
  // niewysyłany w binarce release) liczyło się identycznie jak realna, niedokończona
  // weryfikacja. Ten sam filtr co w decideVerdict(), zastosowany tu wprost.
  // ORC-079: dodatkowo filtr strukturalny (po ścieżce, nie po prozie) dla pliku analizy/task
  // tego przebiegu — patrz komentarz przy definicji filterOwnTaskArtifacts.
  // ORC-080: i filtr mechaniczny dla pozycji już adjudykowanych przez a.task.decisions —
  // patrz komentarz przy definicji filterAdjudicatedByDecision.
  const finalUnverifiedAll = Array.isArray(report.finalGate.unverified_scope)
    ? filterSelfAdmittedOutOfScope(filterOwnTaskArtifacts(filterAdjudicatedByDecision(report.finalGate.unverified_scope.filter(Boolean), a.task.decisions), a.task))
    : []
  // ORC-084: pozycje już zapisane przez warstwy jako znane luki (GO_WITH_GAPS) nie wymuszają NO_GO
  const knownSplit = filterKnownLayerGaps(finalUnverifiedAll, report.gaps)
  const finalUnverified = knownSplit.kept
  if (knownSplit.absorbed.length) report.finalGate.absorbed_gaps = knownSplit.absorbed
  if (String(report.finalGate.verdict).toUpperCase() === 'GO' && finalUnverified.length) {
    // ORC-084: NO_GO wymuszone WYŁĄCZNIE przez unverified_scope (zero własnych naruszeń) —
    // pliki idą do stagingu z flagą „wymaga przeglądu"; człowiek i tak robi review przed commitem.
    if (!(report.finalGate.violations || []).length) report.stageForReview = finalFiles
    report.finalGate.verdict = 'NO_GO'
    report.finalGate.cause = 'machine'
    report.finalGate.violations = (report.finalGate.violations || []).concat(
      'GO z niezweryfikowanym zakresem (unverified_scope), bramka końcowa nie ma retry: ' + finalUnverified.join(', '))
  }
  if (String(report.finalGate.verdict).toUpperCase() !== 'GO') {
    if (!report.finalGate.cause) report.finalGate.cause = 'code'
    log('ESCALATE_AND_HALT — bramka końcowa: ' + formatViolations(report.finalGate.violations))
    return report
  }
}

// ── 6. wyjście: staged, NIE zacommitowane. Commit robi człowiek.
report.staged = finalFiles
log('Gotowe. Stan: staged, not committed — ' + finalFiles.length + ' plików. Commit robi człowiek.')
return report
