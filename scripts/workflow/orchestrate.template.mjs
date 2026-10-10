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
function modelFor(role, a) {
  if (role === 'probe') return { model: 'haiku', effort: 'low' }
  if (role === 'implement') return { model: 'sonnet' }
  if (role === 'verify') return { model: 'sonnet' }
  // ORC-097: bramka końcowa dziedziczyła model sesji, czyli Opusa (39 z 46 bramek od 10-01), a
  // oddaje średnio 27 tys. tokenów wyjścia na werdykt — najdroższy pojedynczy krok przebiegu.
  // Domyślnie ('auto'): Sonnet, a model sesji TYLKO dla tasków wrażliwych na bezpieczeństwo
  // (analiza ma threat_model). `final_gate.model` w runtime.yml wymusza: inherit | sonnet | opus.
  const m = a && a.finalGateModel
  if (m === 'inherit') return {}
  if (m && m !== 'auto') return { model: m }
  return a && a.task && a.task.securitySensitive ? {} : { model: 'sonnet' }
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
  'Do zapisania i przywrócenia stanu używaj `cp`, nigdy gita.' +
  // ORC-087: ai-os-bot BOT-023 — implementery warstwy zacommitowały 4 commity mimo
  // STAGE_NOT_COMMIT; prompt nigdzie tego nie zakazywał (tylko cofanie).
  '\nZAKAZ COMMITOWANIA: `git commit`, `git commit --amend`, `git push`, `git tag` i `git rebase` ' +
  'są zakazane — przebieg kończy się „staged, not committed", commit robi człowiek. Zmiany ' +
  'zostają w drzewie roboczym; `git add` jest zbędny (robi go orchestrator po bramce końcowej).'

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
    'zmieniasz kontrakt pliku, zaktualizuj jego test obok.' +
    // ORC-087: ai-gateway TS-AIG-013 — zatwierdzona zależność (prom-client) nie mogła zostać
    // dodana, bo `package.json`/lockfile leżą poza `src/`; warstwa stanęła na BLOCKED_BY_PRIOR.
    // grant-flow TS-UI-003 dotknął .npmrc/package.json/pnpm-workspace.yaml z tego samego powodu.
    '\nWYJĄTEK — manifesty zależności: `package.json` (korzenia i pakietu warstwy), lockfile ' +
    '(`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`), `pnpm-workspace.yaml` i `.npmrc` ' +
    'wolno zmienić WYŁĄCZNIE wtedy, gdy zatwierdzona analiza/decyzja wymaga nowej zależności ' +
    'lub konfiguracji workspace — to praca tej warstwy, nie plik spoza zakresu. Weryfikator ' +
    'nie zgłasza ich jako „poza zakresem".' + deferNote
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
  // ORC-091: drobne rzeczy znalezione w ANALIZIE (nie blokujące, łatwe) — tylko przy pierwszej
  // próbie warstwy (przy poprawce implementer ma już konkretną listę).
  const minorFromAnalysis = !violations && (a.task.minorFixes || []).length && a.autoFixMinor !== false
    ? '\n\nDROBNE POPRAWKI Z ANALIZY (nie blokujące, łatwe): wykonaj te, które leżą w zakresie TEJ warstwy, ' +
      'przy okazji, mechanicznie (bez zmiany zachowania i bez refaktoru); resztę pomiń:\n' +
      a.task.minorFixes.map((x, i) => (i + 1) + '. ' + x).join('\n')
    : ''
  const noop = '\n\nGDY WARSTWA NIE WYMAGA ZMIAN: jeśli po przeczytaniu specu i analizy stwierdzisz, że ' +
    'ten task nie dotyka tej warstwy (np. zmiana czysto infrastrukturalna, model domenowy bez zmian), ' +
    'NIE pisz niczego na siłę. Zwróć changed_files: [] i no_changes_reason z konkretnym uzasadnieniem: ' +
    'co sprawdziłeś i dlaczego nic tu nie trzeba (odwołaj się do decyzji D-x lub jednostek pracy z analizy). ' +
    'Pusta lista BEZ no_changes_reason liczy się jako niewykonana praca.'
  // Przy poprawce (violations) nie powtarzamy bloku SZUKANIE — implementer ma listę
  // plik/linia/reguła, nie ma czego lokalizować; blok tylko dokładałby kontekstu.
  return spec + decisions + '\n\n' + scopeBlock(layer, a) + '\n' + renderCards(cardsFor(a, baseId(layer))) +
    (violations ? '' : SEARCH_BUDGET) + soft + silent + (probeRed ? RED_PROBE_RULE : '') + fix + minorFromAnalysis + noop + NO_REVERT
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
    'nie analizuj, nie poprawiaj. Zwróć połączoną listę ścieżek z obu poleceń (bez duplikatów).' +
    // ORC-087: wykrycie commitów implementera mimo STAGE_NOT_COMMIT (liczba commitów od bazy).
    (base ? ' Dodatkowo zwróć w `commits` wynik `git rev-list --count ' + base + '..HEAD` (liczba).' : '')
}

// ORC-103: odcisk drzewa roboczego — hash treści plików zmienionych względem bazy i nieśledzonych oraz statusu.
// Runda naprawcza po bramce końcowej (ORC-091) raportowała naprawę 13 ustaleń, a żaden plik nie
// zmienił mtime (marketing-hub TS-MH-007): lista `changed_files` implementera to jego twierdzenie,
// nie fakt. Odcisk przed i po rundzie to fakt.
function treeFingerprintCmd(base) {
  return '( { git diff --name-only -z ' + (base || 'HEAD') + '; git ls-files -o --exclude-standard -z; } | ' +
    'xargs -0 -r sha1sum 2>/dev/null; git status --porcelain ) | sha1sum'
}

function buildFingerprintPrompt(base) {
  return 'W repo uruchom dokładnie: ' + treeFingerprintCmd(base) + '\nNIC więcej. Zwróć w `fingerprint` ' +
    'pierwsze pole wyniku (40 znaków hex), bez zmian.'
}

// Prawda tylko gdy OBA odciski są znane i identyczne — brak odpowiedzi sondy to „nie wiadomo", nie „bez zmian".
function fixLeftTreeUnchanged(before, after) {
  return !!(before && after && before === after)
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
  // ORC-088: wpis `checks` ze spacją to KOMENDA dosłowna (`flutter analyze`, `go vet ./...`),
  // bez spacji — nazwa skryptu package.json. Flutter/Dart nie ma package.json, więc przy
  // samych nazwach skryptów checks było puste, sonda „skipped", weryfikatory nie kompilowały,
  // a realny błąd wychodził dopiero z ręcznego `flutter test` (juz-ide-mobile-app
  // DESIGN-SYSTEM-009, `presentation`, 9 wystąpień). Komendy dosłowne biegną z korzenia repo.
  const isLiteralCheck = (c) => /\s/.test(String(c).trim())
  const hasLiteral = (layer.checks || []).some(isLiteralCheck)
  const cmds = (layer.checks || []).map((c) => isLiteralCheck(c) ? String(c).trim() : (firstDir ? '_chk ' + c : 'npm run ' + c))
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
  // ORC-104: sonda biegnie z korzenia repo bez względu na cwd agenta. `_pkgdir` i `git ls-files` liczą ścieżki
  // względem cwd — po `cd` w podkatalog (juz-ide-api-1, wcześniej grant-flow) npm odpalał się w złym katalogu.
  const rootAnchor = 'cd "$(git rev-parse --show-toplevel)" || exit 1\n'
  const run = cmds.length
    // ORC-094: OSOBNY log na każdy check. Wspólny `/tmp/check-<warstwa>.log` drugi check nadpisywał
    // pierwszy — marketing-hub TS-MH-013: po `lint:check:api` log nie zawierał już błędów `tsc`,
    // więc `tsErrors` było puste i odroczenie ORC-082 nie miało czego sparsować.
    ? rootAnchor + pkgLookup + cmds.map((c, i) => c + ' > /tmp/check-' + layer.id + '-' + (i + 1) + '.log 2>&1; echo "EXIT:$?"').join('\n') +
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
      // ORC-096: `git add -N -- <wzorce>` przerywa w CAŁOŚCI ("fatal: pathspec … did not match any
      // files"), gdy choć jeden wzorzec nic nie dopasowuje — a dla wpisów-plików (package.json)
      // generujemy też wzorce `*.spec.*`/`*.test.*`, które zwykle nic nie dopasowują. Nowy plik testu
      // zostawał nieśledzony i przyrost wychodził 0 (ai-os-bot BOT-024, u14: 19 zielonych testów,
      // halt „zero testów"). ls-files -o zwraca tylko istniejące nieśledzone pliki, bez błędu.
      '  git ls-files -o --exclude-standard -z -- ' + globScoped + ' | xargs -0 -r git add -N -- 2>/dev/null; git diff HEAD -U0 -- ' + globScoped + " | grep -cE '^\\+\\s*(it|test|testWidgets|describe|group)(\\.(each|only|skip|concurrent))?\\(' \n" +
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
    ? ' Przy niezerowym: NAJPIERW `grep -hE \'' + scopeGrep + '\' /tmp/check-' + layer.id + '-*.log` — ' +
      'linie z Twojego WŁASNEGO zakresu, w CAŁOŚCI, niezależnie od tego, ile linii to da. ' +
      'Dopiero gdy ten grep nic nie znajdzie (błąd bez ścieżki pliku, np. konfiguracyjny) — ' +
      'zwróć ostatnie 40 linii CAŁEGO logu w `tail`.'
    : ' Przy niezerowym — zwróć ostatnie 40 linii w `tail`.'
  // ORC-082 (uzupełnienie): surowe linie błędów TS jako OSOBNE pole. ORC-082 parsował `tail`, a `tail` agent
  // sondy potrafił sparafrazować („Missing method X…") — parser nie widział błędu, wyjątek
  // nie zadziałał i warstwa domain stanęła na BLOCKED_BY_PRIOR (juz-ide-api-1, 2026-09-30).
  const tsErrorsInstruction = cmds.length
    ? ' Przy niezerowym typecheck dodatkowo zwróć w `tsErrors` WYNIK DOSŁOWNIE (bez streszczania, ' +
      'parafrazy i komentarza): `grep -hE \'error TS[0-9]+\' /tmp/check-' + layer.id + '-*.log | head -60`.'
    : ''
  // ORC-099: przy czerwonych testach sonda zwraca nazwy padających plików i ich liczbę z podsumowania
  // runnera — silnik odracza testy, których WSZYSTKIE padające pliki należą do późniejszych warstw
  // (ai-gateway AIG-082 config-env: zmiana Config psuje registry.ts, potem ~36 testów w 15 plikach).
  const testFailInstruction = cmds.length
    ? ' Przy niezerowych testach dodatkowo zwróć: w `testFailFiles` WYNIK DOSŁOWNIE (bez streszczania): ' +
      '`grep -hE \'^[[:space:]]*FAIL[[:space:]]\' /tmp/check-' + layer.id + '-*.log | head -80`, a w ' +
      '`testFilesFailed` LICZBĘ plików z podsumowania runnera (vitest „Test Files  N failed", jest ' +
      '„Test Suites: N failed"); gdy podsumowania nie ma — pomiń to pole.' +
      // ORC-103: niestabilne testy (czas, entropia) czerwone pod obciążeniem całego zestawu, zielone osobno
      // (grant-flow TS-PROJ-COMPANY-001: 3 pliki, 53/53 w izolacji) — ręczne obejście `tests=false`.
      ' Następnie JEDEN raz uruchom ponownie TYLKO te padające pliki, osobno (to samo narzędzie, ' +
      'same ścieżki z `testFailFiles`, bez reszty zestawu); jeśli wszystkie przechodzą, zwróć ' +
      '`testsRerunPassed: true`, w przeciwnym razie `false`. Nie rób tego przy EXIT:0.'
    : ''
  // ORC-094: mapowanie wyników na pola ZAWSZE (nie tylko dla komend dosłownych). marketing-hub
  // TS-MH-013: wynik lintu trafiał do pola `typecheck`, więc warstwa wyglądała na „typecheck
  // czerwony" i wpadała w ścieżkę odroczenia/halt z błędnym powodem. Lint ma własne pole `lint`.
  const literalMapping = cmds.length
    ? '\nMapowanie wyników na pola (każdy check do SWOJEGO pola, nie mieszaj): nazwa/komenda z `lint` → ' +
      '`lint`; z `typecheck`, `tsc`, `analyze`, `vet` albo `build` → `typecheck`; z `test` → `tests` ' +
      '(EXIT:0 = pass, niezerowy = fail, brak skryptu = skipped). Pole `typecheck` = fail tylko wtedy, ' +
      'gdy padł typecheck/analyze/build, nigdy z powodu lintu.'
    : ''
  return 'Uruchom dokładnie to i NIC więcej:\n' + run + literalMapping +
    '\nPrzy EXIT:0 NIE otwieraj pliku logu wcale.' + tailInstruction + tsErrorsInstruction + testFailInstruction +
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
      (probe.lint != null ? '\n  checks.lint: ' + probe.lint : '') +
      (probe.newTestBlocks != null ? '\n  checks.newTestBlocks: ' + probe.newTestBlocks : '') +
      (probe.typecheck === 'deferred'
        ? '\n  (typecheck: czerwień wyłącznie w plikach PÓŹNIEJSZYCH warstw — odroczona do ich sond, ' +
          'nie jest naruszeniem tej warstwy; nie zgłaszaj jej)'
        : '') +
      (probe.tests === 'deferred'
        ? '\n  (testy: czerwień wyłącznie w plikach PÓŹNIEJSZYCH warstw — odroczona do ich sond, ' +
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
    '(plik, linia, reguła, co poprawić).\n' + scopeReminder + (a.autoFixMinor !== false ? MINOR_REMINDER : '') +
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
function buildFinalGatePrompt(a, checks, changedFiles, treeSource, knownGaps, probe) {
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
    // ORC-098: sonda silnika już wykonała checks na całości — bramka dostaje FAKTY jak weryfikator
    // warstwy (ORC-081) i nie powtarza ich. Bez wyniku sondy zostaje stara instrukcja (uruchom sam).
    (probe
      ? 'FAKTY Z SONDY — checks wykonane na całości (traktuj jak dane wejściowe): ' + checks.join(', ') +
        '\n  checks.typecheck: ' + probe.typecheck + '\n  checks.tests: ' + probe.tests +
        (probe.lint != null ? '\n  checks.lint: ' + probe.lint : '') +
        '\nNIE uruchamiaj ich ponownie. Rzeczy niesprawdzalne w tym repo (deploy, kopie u konsumentów, ' +
        'inne repozytoria, przeglądarka, środowisko produkcyjne) wpisz do `unverified_scope`, nie do ' +
        '`violations` — przy zielonych checks i zerze naruszeń nie powodują NO_GO, trafiają do raportu.\n'
      : (checks.length ? 'Deterministyczne bramki do wykonania raz, na całości: ' + checks.join(', ') + '\n' : '')) +
    (changedFiles.length ? 'Pliki objęte zmianą (z drzewa, względem bazy przebiegu):\n  ' + changedFiles.join('\n  ') + '\n' : '') +
    source + dirty + decisions + gapsBlock +
    renderCards(a.patterns || [], 'wszystkie wzorce tego przebiegu') +
    '\nZwróć werdykt GO albo NO_GO i listę naruszeń.\n' +
    (a.autoFixMinor !== false ? MINOR_REMINDER : '') +
    // ORC-097: bramka oddawała średnio 27 tys. tokenów wyjścia na werdykt (najwięcej ze wszystkich
    // kroków). Pełne rozumowanie zostaje po stronie agenta; w wyjściu tylko to, co czytają inni.
    'WYJŚCIE (limit długości): `rationale` najwyżej 5 zdań; każde naruszenie i ustalenie to JEDNA ' +
    'linia `plik:linia — reguła — poprawka`. Nie przepisuj kodu, nie streszczaj diffu, nie powtarzaj ' +
    'listy plików ani kart reguł, nie opisuj tego, co jest w porządku.\n' +
    'TWARDY LIMIT: ' + calls + ' wywołań narzędzi. Gdy budżet się kończy — wydaj werdykt ' +
    'natychmiast na podstawie zebranych dowodów.' + NO_REVERT
}

// ORC-091: wspólny akapit dla weryfikatorów warstw i bramki końcowej.
const MINOR_REMINDER =
  'POLE `minor_findings`: ostrzeżenia i nity ŁATWE do mechanicznego naprawienia (do kilku linii, bez ' +
  'zmiany zachowania, bez decyzji) wpisz TUTAJ, nie do `violations`, i nie zmieniaj przez nie werdyktu — ' +
  'orchestrator każe je naprawić od razu. Format wpisu: `plik:linia — problem — konkretna poprawka`. ' +
  '`violations` zostaje dla rzeczy blokujących.\n'

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
  // ORC-089: weryfikator podaje często samą nazwę pliku („TS-AIG-043.analysis.md"), nie ścieżkę —
  // pełne dopasowanie ścieżki jej nie łapało (ai-gateway TS-AIG-043). Nazwy plików tasku/analizy
  // zawierają id zadania, więc są jednoznaczne; krótszych niż 6 znaków nie używamy (ryzyko
  // przypadkowego trafienia w niezwiązaną pozycję).
  const needles = paths.flatMap((p) => {
    const base = String(p).slice(String(p).lastIndexOf('/') + 1)
    return base.length >= 6 && base !== p ? [p, base] : [p]
  })
  return items.filter((item) => !needles.some((n) => item.includes(n)))
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
      // ORC-104: `layerTouches` to podciąg ścieżki, więc `.../queues/` obejmuje też `.../queues/__tests__/x.spec.ts`
      // należące do jednostki testing o dłuższym, bardziej specyficznym dirs (juz-ide-api-1 TS-AUTH-CAPABILITIES-INIT-001:
      // obs-guardian liczył cudze spec-i jako własną lukę, weryfikator co próbę pomijał inne, ESCALATE po 3 próbach).
      // Właściciela wyznacza specyficzność (jak w ORC-093): gdy inna warstwa wygrywa, a ta nie remisuje — cudza robota.
      const owners = ownerLayersOf(item, (allLayers || []).filter((l) => effectiveDirs(l).length))
      if (owners.length && !owners.some((o) => o.id === layer.id)) return false
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
    return { next: 'reverify', gaps: ownUnverified, reason: 'weryfikator dał GO, ale nie zdążył sprawdzić (unverified_scope): ' + ownUnverified.join(', ') + ' — kolejna próba dostaje świeży budżet tur wyłącznie na dokończenie weryfikacji, bez powrotu do implementera' }
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

// ORC-100: `reverify` zwrócił DOKŁADNIE te same luki co poprzednia runda (ten sam zbiór) przy GO bez
// naruszeń i zielonej sondzie — kolejny świeży budżet weryfikatora niczego nie domknie (~25 wystąpień
// ORC-069 na warstwach: weryfikator zamyka warstwę z tym samym unverified_scope trzy razy). Warstwa
// kończy od razu jako GO_WITH_GAPS, bez palenia pozostałych prób.
function repeatedGapsAcceptable(prevGaps, decision, verdict, probe) {
  if (!decision || decision.next !== 'reverify' || !Array.isArray(decision.gaps) || !decision.gaps.length) return false
  if (!Array.isArray(prevGaps) || prevGaps.length !== decision.gaps.length) return false
  const a = prevGaps.map(String).sort()
  const b = decision.gaps.map(String).sort()
  if (a.some((x, i) => x !== b[i])) return false
  if (!verdict || String(verdict.verdict || '').toUpperCase() !== 'GO') return false
  if (Array.isArray(verdict.violations) && verdict.violations.length) return false
  return probeHasGreenEvidence(probe)
}

// „skipped" to brak dowodu, nie zieleń: ślepa sonda (wszystko skipped, np. złe nazwy
// skryptów — ORC-085) nie może uzasadniać przejścia dalej. Wymagamy co najmniej jednego
// faktycznego `pass` (typecheck albo testy) i zera `fail`.
function probeHasGreenEvidence(probe) {
  if (!probe) return false
  if (probe.typecheck === 'fail' || probe.tests === 'fail' || probe.lint === 'fail') return false
  return probe.typecheck === 'pass' || probe.tests === 'pass'
}

// ORC-086: weryfikator dwukrotnie bez wyniku (padł/przekroczył budżet) to awaria maszyny, nie
// werdykt o kodzie. Przy zielonej sondzie i niepustym zakresie warstwa idzie dalej jako
// GO_WITH_GAPS z luką „warstwa niezweryfikowana" (domyka bramka końcowa i człowiek), zamiast
// zatrzymywać przebieg. Bez dowodu zielonej sondy albo bez zmian w zakresie — halt jak dotąd.
function silentVerifierGapsAcceptable(probe, files) {
  return probeHasGreenEvidence(probe) && Array.isArray(files) && files.length > 0
}

// ORC-098: bramka końcowa z GO i niepustym unverified_scope, ale zero własnych naruszeń i
// ZIELONĄ sondą checks wykonaną przez silnik (nie przez agenta bramki), nie zatrzymuje przebiegu —
// kończy jako GO z lukami (staged do przeglądu, luki w raporcie). Dotąd każde takie GO szło w
// NO_GO `machine` (7 z 8 raportów 2026-10-03/04: ai-gateway AIG-064/067/069, iam SSO-057,
// marketing-hub MH-012, mobile DS009 x2), bo niesprawdzalne w repo rzeczy (deploy, kopie u
// konsumentów, przeglądarka) bramka nie ma jak domknąć. Brak wyniku sondy albo ślepa sonda
// (wszystko skipped) = brak dowodu, więc NO_GO jak dotąd.
function finalGapsAcceptable(finalGate, unverified, probe) {
  if (!finalGate || String(finalGate.verdict || '').toUpperCase() !== 'GO') return false
  if (!Array.isArray(unverified) || !unverified.length) return false
  if (Array.isArray(finalGate.violations) && finalGate.violations.length) return false
  return probeHasGreenEvidence(probe)
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

// ORC-090 (docs/decisions/orchestrate-rule-history.md#orc-090): `tsc` odpalony w pakiecie podaje
// ścieżki WZGLĘDEM PAKIETU (`src/app/api/x.ts`), a `dirs` warstw w monorepo mają prefiks
// (`apps/api/src/app/api/`) — `layerTouches` (indexOf) tego nie trafia, więc odroczenie ORC-082
// nie działało w monorepo (grant-flow TS-UI-004, application). Do ścieżek względnych pakietu
// dopasowujemy dir z odciętymi 1-2 początkowymi segmentami (zostają ≥2 segmenty, żeby `src/`
// nie łapało wszystkiego), a własność późniejszej warstwy liczymy po PEŁNYCH `dirs`, nie po
// zawężonych (`layers_scope`): plik spoza zawężenia, ale w katalogach późniejszej warstwy, nadal
// jest jej, nie „niczyj".
// ORC-093 (docs/decisions/orchestrate-rule-history.md#orc-093): właściciela pliku wyznaczamy
// po SPECYFICZNOŚCI dopasowania, nie przez „czy którakolwiek warstwa pasuje". grant-flow
// TS-TIME-READALL-001: `domain` ma `dirs: [apps/api/src/, domain/]` (katch-all na cały src), więc
// sprawdzenie „czy wcześniejsza warstwa pasuje" (ORC-090) uznawało KAŻDY plik za domenowy i
// odroczenie znów nie działało. Ranking: (1) nazwa katalogu-segmentu (`infrastructure/`,
// `__tests__/`) pasująca do SEGMENTU ścieżki (bez nazwy pliku — `domain-event.ts` nie jest
// domeną) wygrywa z (2) dopasowaniem prefiksu/wielosegmentowego; w obrębie rangi wygrywa dłuższy
// dir. Remis = brak właściciela (nie odraczamy).
function layerMatchScore(layer, file) {
  const f = String(file)
  const dirSegs = f.split('/').slice(0, -1)
  let best = null
  for (const d0 of (layer.dirs || []).concat(effectiveDirs(layer))) {
    const d = String(d0).replace(/\/+$/, '')
    if (!d) continue
    let score = null
    if (/\.[a-z0-9]+$/i.test(d)) {
      // ORC-098b: wpis `dirs` będący PLIKIEM (zakres jednostki z `layers_scope`, np. `src/wikiIndexer.ts`)
      // był pomijany, więc plik nie miał właściciela, a odroczenie ORC-082 nie działało (ai-os-bot
      // BOT-025 u4, ai-gateway AIG-068/082). Dopasowanie DOKŁADNE (także ścieżka względna pakietu z
      // `tsc`: jeden z dwóch kończy się drugim po `/`) i najwyższa ranga — konkretny plik wygrywa z
      // każdym katalogiem.
      const exact = f === d || f.endsWith('/' + d) || (f.indexOf('/') !== -1 && d.endsWith('/' + f))
      if (exact) score = { seg: 2, len: d.length }
    } else if (d.indexOf('/') === -1) {
      if (dirSegs.indexOf(d) !== -1) score = { seg: 1, len: d.length }
    } else {
      const segs = d.split('/')
      const rel = [1, 2].some((k) => segs.length > k + 1 && f.startsWith(segs.slice(k).join('/') + '/'))
      if (f.indexOf(d) !== -1 || rel) score = { seg: 0, len: d.length }
    }
    if (score && (!best || score.seg > best.seg || (score.seg === best.seg && score.len > best.len))) best = score
  }
  return best
}

// Wszystkie warstwy remisujące na najwyższym wyniku (jedna = jednoznaczny właściciel).
function ownerLayersOf(file, layers) {
  let best = null
  let owners = []
  for (const l of layers) {
    const s = layerMatchScore(l, file)
    if (!s) continue
    if (!best || s.seg > best.seg || (s.seg === best.seg && s.len > best.len)) { best = s; owners = [l] }
    else if (s.seg === best.seg && s.len === best.len) owners.push(l)
  }
  return owners
}

function ownerLayerOf(file, layers) {
  const owners = ownerLayersOf(file, layers)
  return owners.length === 1 ? owners[0] : null
}

function typecheckRedIsLaterLayers(probe, layer, allLayers) {
  if (!probe || probe.typecheck !== 'fail' || probe.tests === 'fail' || probe.lint === 'fail') return false
  const { total, paths } = typecheckErrorPaths(probe.tsErrors || probe.tail)
  if (!paths.length || paths.length !== total) return false
  const withDirs = (allLayers || []).filter((l) => (l.dirs || []).length || effectiveDirs(l).length)
  const myIdx = withDirs.findIndex((l) => l.id === layer.id)
  if (myIdx < 0 || myIdx === withDirs.length - 1) return false
  // ORC-098b: remis nie znosi odroczenia, gdy WSZYSTKIE remisujące warstwy są późniejsze od bieżącej
  // (plik należy do którejś z nich — ai-os-bot BOT-025: u5a/u5b mają ten sam plik w dirs). Gdy
  // bieżąca warstwa jest wśród remisujących, plik może być jej własny — nie odraczamy.
  return paths.every((p) => {
    const owners = ownerLayersOf(p, withDirs)
    return owners.length > 0 && owners.every((o) => withDirs.findIndex((l) => l.id === o.id) > myIdx)
  })
}

// ORC-099: ścieżki padających plików testowych z linii „FAIL  path > suite > case" (vitest) albo
// „FAIL path" (jest); unikalne, bez sufiksu po „>".
function testFailPaths(text) {
  const out = []
  const re = /^\s*FAIL\s+(\S+\.[A-Za-z0-9]+)/gm
  let m
  while ((m = re.exec(String(text || ''))) !== null) if (out.indexOf(m[1]) === -1) out.push(m[1])
  return out
}

// Czerwone TESTY, których wszystkie padające pliki należą do późniejszych warstw (typecheck i lint
// nie są czerwone) — odroczone do sond tamtych warstw, tak jak typecheck w ORC-082. Zgodność liczby
// wyłapanych plików z podsumowaniem runnera jest warunkiem: niepełna lista = brak odroczenia.
function testsRedIsLaterLayers(probe, layer, allLayers) {
  if (!probe || probe.tests !== 'fail' || probe.typecheck === 'fail' || probe.lint === 'fail') return false
  const paths = testFailPaths(probe.testFailFiles)
  if (!paths.length || typeof probe.testFilesFailed !== 'number' || paths.length !== probe.testFilesFailed) return false
  const withDirs = (allLayers || []).filter((l) => (l.dirs || []).length || effectiveDirs(l).length)
  const myIdx = withDirs.findIndex((l) => l.id === layer.id)
  if (myIdx < 0 || myIdx === withDirs.length - 1) return false
  return paths.every((p) => {
    const owners = ownerLayersOf(p, withDirs)
    return owners.length > 0 && owners.every((o) => withDirs.findIndex((l) => l.id === o.id) > myIdx)
  })
}

// ORC-103: testy czerwone w całym zestawie, ale zielone po osobnym uruchomieniu padających plików
// (niestabilne pod obciążeniem). Warunki: typecheck i lint nie są czerwone, sonda wyłapała pliki, a ich
// liczba zgadza się z podsumowaniem runnera (niepełna lista = nie wiemy, co jeszcze padło).
function testsFlakyUnderLoad(probe) {
  if (!probe || probe.tests !== 'fail' || probe.typecheck === 'fail' || probe.lint === 'fail') return false
  if (probe.testsRerunPassed !== true) return false
  const paths = testFailPaths(probe.testFailFiles)
  return paths.length > 0 && typeof probe.testFilesFailed === 'number' && paths.length === probe.testFilesFailed
}

// ORC-101: pozycje `minor_fixes` analizy (`plik — co — poprawka`), których ścieżka nie leży w `dirs`
// ŻADNEJ warstwy z dirs (dokumentacja, KANBAN, karty) — nikt by ich nie zrobił. Pozycja bez
// rozpoznawalnej ścieżki zostaje po staremu (nie jest sierotą).
function orphanMinorFixes(fixes, layers) {
  const scoped = (layers || []).filter((l) => effectiveDirs(l).length)
  if (!scoped.length) return []
  return (fixes || []).map(String).filter((x) => {
    const p = x.split(/\s+[—–]\s+|\s+-\s+/)[0].trim().replace(/^`|`$/g, '')
    if (!/[/.]/.test(p) || /\s/.test(p)) return false
    return !scoped.some((l) => layerTouches(l, p))
  })
}

// ORC-091 (docs/decisions/orchestrate-rule-history.md#orc-091): drobne ustalenia (ostrzeżenia,
// nity, łatwe poprawki) naprawia agent od razu, zamiast czekać na ręczne zlecenie przy każdym
// przebiegu. Weryfikator wpisuje je do `minor_findings` (nie do `violations`).
function collectMinor(verdict) {
  const raw = verdict && Array.isArray(verdict.minor_findings) ? verdict.minor_findings : []
  return raw.map((x) => String(x).trim()).filter(Boolean).slice(0, 25)
}

function formatMinorFix(items) {
  return 'DROBNE USTALENIA WERYFIKATORA — nie blokują werdyktu, ale są łatwe: popraw KAŻDE w zakresie ' +
    'tej warstwy, mechanicznie (bez zmiany zachowania, bez refaktoru, bez nowych decyzji). Pozycję, ' +
    'która wymaga decyzji albo wykracza poza kilka linii, POMIŃ i opisz w `deviation_note`. Nic poza listą:\n' +
    items.map((x, i) => (i + 1) + '. ' + x).join('\n')
}

// Przypisanie ustaleń do warstw po ŚCIEŻKACH wspomnianych w tekście ustalenia; reszta idzie do
// warstwy zapasowej. Zwraca mapę { idWarstwy: [ustalenia] }.
function groupFindingsByLayer(items, layers, fallbackId) {
  const groups = {}
  for (const item of items) {
    const tokens = String(item).match(/[\w@.\-/]+\.[a-z0-9]{1,6}/gi) || []
    let owner = null
    for (const t of tokens) {
      const l = ownerLayerOf(t, layers)
      if (l) { owner = l.id; break }
    }
    const id = owner || fallbackId
    if (!id) continue
    ;(groups[id] = groups[id] || []).push(item)
  }
  return groups
}

// ORC-095 (docs/decisions/orchestrate-rule-history.md#orc-095): JEDNA gotowa linia statusu dla
// człowieka, składana przez silnik, żeby główny agent nie wymyślał własnego akapitu. Bez ścieżek,
// nazw klas i numerów reguł — same liczby i rodzaj problemu.
function statusLine(report, kind, info) {
  const n = (x) => (Array.isArray(x) ? x.length : 0)
  if (kind === 'ok') {
    const bits = []
    if (n(report.gaps)) bits.push('niesprawdzone fragmenty: ' + n(report.gaps))
    if (report.stageForReview) bits.push('wymaga uważnego przeglądu')
    if (n(report.minorFindings)) bits.push('nienaprawione drobiazgi: ' + n(report.minorFindings))
    if (n(report.warnings)) bits.push('ostrzeżenia w raporcie: ' + n(report.warnings))
    return 'Gotowe do przeglądu: ' + n(report.staged) + ' plików w stagingu' + (bits.length ? '; ' + bits.join('; ') : '') + '.'
  }
  const where = info && info.id ? 'etapie „' + info.id + '"' : 'bramce końcowej'
  const why = info && info.cause === 'code' ? 'kod nie przechodzi kontroli' : 'awaria narzędzi, nie kodu'
  return 'Zatrzymane na ' + where + ': ' + why + '.'
}

// ORC-090: pliki BRUDNE JUŻ PRZED startem przebiegu (a.dirtyAtStart) nie są pracą tego taska —
// ai-os-bot BOT-007: stageForReview zastage'ował `.claude/**`, KANBAN i cudze pliki, które
// człowiek musiał ręcznie zdejmować z indeksu. Wyjątek: plik, który zmieniła któraś warstwa tego
// przebiegu (jest w jej raporcie), zostaje.
function stageableFiles(finalFiles, dirtyAtStart, layerFiles) {
  const dirty = (dirtyAtStart || []).map(String)
  const mine = (layerFiles || []).map(String)
  return (finalFiles || []).filter((f) => dirty.indexOf(f) === -1 || mine.indexOf(f) !== -1)
}

// Implementer po CZERWONEJ sondzie twierdzi „nic do zrobienia" → to nie jest no-op do
// potwierdzenia, tylko blokada. Weryfikator no-op nie widzi sondy i przyjąłby twierdzenie
// (TS-MH-005: 4/4 warstwy infra dostały GO na odziedziczonej czerwieni). Zwraca `settled`
// albo null, gdy ścieżka no-op jest dozwolona.
function blockedByPrior(layer, probeRed, noopClaim, earlierOwners) {
  if (!probeRed || !noopClaim) return null
  // ORC-103: ai-gateway TS-AIG-073 — warstwa testing stanęła na czerwonym `architecture.test.ts`, którego
  // przyczyną był kod warstwy implementation; wznowienie ją POMINĘŁO (layers_done), więc czerwień wróciła.
  // Komunikat nazywa właściciela i mówi, co zrobić, zamiast zostawiać zgadywanie.
  const hint = (earlierOwners || []).length
    ? '\nWŁAŚCICIEL CZERWIENI: ' + earlierOwners.join(', ') + ' (wcześniejsza warstwa). Wznowienie z tą warstwą w ' +
      '`layers_done` ją POMINIE — usuń ją z `layers_done` w analizie i uruchom ponownie, albo napraw ręcznie.'
    : ''
  return {
    id: layer.id,
    status: 'BLOCKED_BY_PRIOR',
    reason: 'sonda na czerwono, a implementer twierdzi, że w zakresie warstwy nie ma nic do ' +
      'naprawy: ' + noopClaim + '\n' + probeRed + hint,
    files: [],
  }
}

// ORC-103: wcześniejsze warstwy, do których należą pliki z czerwonej sondy (testy + błędy TS).
function earlierRedOwners(probe, layer, allLayers) {
  if (!probe) return []
  const withDirs = (allLayers || []).filter((l) => (l.dirs || []).length || effectiveDirs(l).length)
  const myIdx = withDirs.findIndex((l) => l.id === layer.id)
  if (myIdx <= 0) return []
  const paths = testFailPaths(probe.testFailFiles).concat(typecheckErrorPaths(probe.tsErrors || probe.tail).paths)
  const out = []
  for (const p of paths) {
    for (const o of ownerLayersOf(p, withDirs)) {
      const idx = withDirs.findIndex((l) => l.id === o.id)
      if (idx >= 0 && idx < myIdx && out.indexOf(o.id) === -1) out.push(o.id)
    }
  }
  return out
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
    lint: { type: 'string', enum: ['pass', 'fail', 'skipped'] },
    newTestBlocks: { type: 'number' },
    tail: { type: 'string' },
    tsErrors: { type: 'string' },
    testFailFiles: { type: 'string' },
    testFilesFailed: { type: 'number' },
    testsRerunPassed: { type: 'boolean' },
  },
}

const FINGERPRINT_SCHEMA = {
  type: 'object',
  required: ['fingerprint'],
  properties: { fingerprint: { type: 'string' } },
}

const DIFF_PROBE_SCHEMA = {
  type: 'object',
  required: ['files'],
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    dirty: { type: 'boolean' },
    commits: { type: 'number' },
  },
}

// Komentarze przy polu `deviation_note` czyta tylko człowiek — agent widzi schemat, więc kiedy
// zgłaszać, musi stać w `description`. Do 2026-10-10 go nie było i agenci zgłaszali głównie
// HALT-y; błędy kompozycji (warstwa bez pracy, wzorzec TS w projekcie Python, agent ze slotu
// spoza stosu) degradowały po cichu i nie docierały do skrzynki (ADR 0011, B2).
const DEVIATION_NOTE_DESCRIPTION =
  'Opcjonalne, nie blokuje pracy — trafia do skrzynki docs/tasks/_inbox/ w claude-patterns. ' +
  'Wypełnij, gdy konfiguracja, reguły albo wzorce nie pasują do tego, co faktycznie widzisz: ' +
  '(1) warstwa nie ma pracy w tym tasku albo jej katalogi nie istnieją w repo; ' +
  '(2) wzorzec lub reguła z przekazanej listy jest z obcego języka/stosu (np. kod TypeScript w projekcie Python); ' +
  '(3) rola agenta ze slotu nie pasuje do stosu projektu; ' +
  '(4) reguła lub wzorzec przeczy innemu albo nie rozstrzyga twojego przypadku; ' +
  '(5) pominąłeś poprawkę spoza zakresu warstwy. ' +
  'Format: jedno-dwa zdania faktu + ścieżka pliku albo identyfikator reguły/wzorca. ' +
  'NIE wpisuj tu streszczenia zmian ani oceny własnej pracy; brak odstępstwa = pomiń pole.'

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
    deviation_note: { type: 'string', description: DEVIATION_NOTE_DESCRIPTION },
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
    deviation_note: { type: 'string', description: DEVIATION_NOTE_DESCRIPTION },
    // Ścieżki, których weryfikator NIE zdążył sprawdzić (budżet tur) — patrz sekcja "TURN
    // BUDGET" w promptach weryfikatorów. Pole FAKTOGRAFICZNE (nie self-ocena — WL1 OK).
    // decideVerdict() i jednorazowa bramka końcowa traktują GO z niepustym unverified_scope
    // jak NIE-czysty GO, nie jak pełną weryfikację (patrz komentarz przy decideVerdict).
    unverified_scope: { type: 'array', items: { type: 'string' } },
    // ORC-091: drobne ustalenia (ostrzeżenia, nity, łatwe mechaniczne poprawki) — NIE blokują
    // werdyktu; orchestrator każe je naprawić implementerowi zamiast czekać na ręczne zlecenie.
    minor_findings: { type: 'array', items: { type: 'string' } },
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
// ORC-090: powód każdej „ciszy" trafia do `report.askErrors` (ten sam obiekt co `askErrors`),
// bo journal nie niesie treści błędu — bramka końcowa milczała po ponowieniu w 3 projektach
// (juz-ide-api-1, grant-flow x2) i nie dało się ustalić dlaczego.
const askErrors = []
async function ask(prompt, opts) {
  try {
    return await agent(prompt, opts)
  } catch (e) {
    const msg = e && e.message ? e.message : String(e)
    log((opts && opts.label ? opts.label : 'agent') + ': brak wyniku — ' + msg)
    askErrors.push({ label: opts && opts.label ? opts.label : 'agent', message: String(msg).slice(0, 400) })
    return null
  }
}

const a = args || {}
const maxAttempts = (a.verifiers && a.verifiers.maxAttempts) || DEFAULTS.maxAttempts
const plan = layerPlan(a, (a.createWhenHits) || {})
const report = { taskId: a.task && a.task.id, layers: [], gaps: [], minorFindings: [], askErrors, finalGate: null, exit: a.exit || 'STAGE_NOT_COMMIT' }
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
  // ORC-091: jedno przejście naprawcze drobnych ustaleń weryfikatora na warstwę
  let minorPassDone = false
  let prevGaps = null
  let cleanupNext = false
  let mode = 'implement'
  let layerFiles = []
  let settled = null
  let noopClaim = null
  // Wynik ostatniej CZERWONEJ sondy tej warstwy (null po zielonej). Po czerwieni ścieżka
  // no-op jest zamknięta — patrz blockedByPrior().
  let probeRed = null
  let probeRedFacts = null
  // ORC-066: ostatnia niepusta adnotacja „to nie jest udokumentowane" od implementera albo
  // weryfikatora tej warstwy — dopisywana do `settled` tuż przed `report.layers.push`, żeby
  // krok 5 /orchestrate mógł ją zgłosić do docs/tasks/_inbox/ w claude-patterns.
  let deviationNote = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // ── 1. implementacja (albo, po cichej śmierci, weryfikacja istniejącego stanu)
    if (mode === 'implement') {
      const isCleanup = cleanupNext
      cleanupNext = false
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
        // ORC-091: przejście naprawcze, w którym implementer nic nie zmienił, to nie „brak zmian
        // warstwy" do weryfikacji twierdzenia — warstwa była już GO, idziemy zwykłą ścieżką.
        if (isCleanup) noopClaim = null
        if (typeof impl.deviation_note === 'string' && impl.deviation_note.trim()) deviationNote = impl.deviation_note.trim()
      }
    }

    // ── 1b. „nic do zrobienia" z uzasadnieniem — twierdzenie, nie wynik. Weryfikator je
    // potwierdza (GO bez plików) albo obala (naruszenia → punktowa poprawka). Bez tej gałęzi
    // trzy próby „zero zmian" kończyły się ESCALATE na warstwie, której task w ogóle nie dotyka
    // (juz-ide-api-2, 2026-09-14). Analiza powinna to przewidzieć w layers_skip (albo zawęzić
    // przez layers_scope, gdy warstwa jest dotknięta częściowo); to jest siatka.
    if (noopClaim && mode === 'implement') {
      const blocked = blockedByPrior(layer, probeRed, noopClaim, earlierRedOwners(probeRedFacts, layer, plan.filter((s) => s.run).map((s) => s.layer)))
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

    if (typecheckRedIsLaterLayers(probe, layer, plan.filter((s) => s.run).map((s) => s.layer))) {
      log(layer.id + ': typecheck czerwony wyłącznie w plikach późniejszych warstw — odroczony (ORC-082)')
      probe = Object.assign({}, probe, { typecheck: 'deferred' })
    }
    if (testsRedIsLaterLayers(probe, layer, plan.filter((s) => s.run).map((s) => s.layer))) {
      log(layer.id + ': testy czerwone wyłącznie w plikach późniejszych warstw — odroczone (ORC-099)')
      probe = Object.assign({}, probe, { tests: 'deferred' })
    }

    if (testsFlakyUnderLoad(probe)) {
      log(layer.id + ': testy czerwone w całym zestawie, zielone osobno (' + probe.testFilesFailed + ' plików) — niestabilne pod obciążeniem (ORC-103)')
      report.warnings = (report.warnings || []).concat(layer.id + ': ' + probe.testFilesFailed + ' plików testowych padło w pełnym zestawie, ale przeszło po osobnym uruchomieniu (niestabilne) — sprawdź izolację testów (ORC-103): ' + testFailPaths(probe.testFailFiles).join(', '))
      probe = Object.assign({}, probe, { tests: 'pass' })
    }
    if (probe && (probe.typecheck === 'fail' || probe.tests === 'fail' || probe.lint === 'fail')) {
      violations = 'deterministyczna bramka na czerwono (typecheck: ' + probe.typecheck +
        ', testy: ' + probe.tests + (probe.lint != null ? ', lint: ' + probe.lint : '') + ')\n' + (probe.tail || '')
      log(layer.id + ': sonda NO_GO — bez analizy kodu, prosto do poprawki')
      probeRed = violations
      probeRedFacts = probe
      mode = 'implement'
      if (attempt >= maxAttempts) {
        settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: violations, cause: 'code' }
        break
      }
      continue
    }

    probeRed = null
    probeRedFacts = null
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
      // ORC-091: GO z drobnymi ustaleniami → jedno przejście naprawcze implementera, potem zwykła
      // sonda + weryfikacja. Zostaje zapas 2 prób (przejście + ewentualna poprawka po nim), żeby
      // opcjonalne sprzątanie nie mogło zatrzymać warstwy, która była już GO.
      const minors = a.autoFixMinor !== false ? collectMinor(verdict) : []
      if (minors.length && !minorPassDone && attempt + 2 <= maxAttempts) {
        minorPassDone = true
        cleanupNext = true
        log(layer.id + ': GO z ' + minors.length + ' drobnymi ustaleniami — przejście naprawcze przed zamknięciem warstwy (ORC-091)')
        violations = formatMinorFix(minors)
        mode = 'implement'
        continue
      }
      if (minors.length) report.minorFindings.push({ layer: layer.id, items: minors })
      settled = { id: layer.id, status: 'GO', files: layerFiles, attempts: attempt }
      break
    }
    if (repeatedGapsAcceptable(prevGaps, decision, verdict, probe)) {
      settled = { id: layer.id, status: 'GO_WITH_GAPS', files: layerFiles, attempts: attempt, gaps: decision.gaps }
      report.gaps.push({ layer: layer.id, items: decision.gaps })
      log(layer.id + ': te same luki po powtórnej weryfikacji (ORC-100) — GO z lukami bez kolejnych prób; luki w raporcie: ' + decision.gaps.join(', '))
      break
    }
    prevGaps = decision.next === 'reverify' ? decision.gaps : null
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
    report.statusLine = statusLine(report, 'halt', { id: layer.id, cause: settled.cause })
    return report
  }
  // ORC-095: to NIE jest polecenie dla głównego agenta w trakcie przebiegu. layers_done dopisuje
  // orchestrator JEDNYM Edit po zakończeniu Workflow (z report.layers), bez pytania i komunikatu.
  log('warstwa ' + layer.id + ' — GO (kontynuuję; layers_done uzupełni orchestrator po przebiegu).')
}

// ── 4b. ORC-101: drobne poprawki z analizy, które nie należą do ŻADNEJ warstwy (dokumentacja, rejestry,
// karty). Każda warstwa dostaje `minor_fixes` z poleceniem „zrób te w swoim zakresie, resztę pomiń", a
// pliki poza `dirs` wszystkich warstw pomija każda — nikt ich nie robił, bramka końcowa zgłaszała je
// jako niewykonane, a przebieg kończył się pytaniem „dopisać to mam ja czy ty?" (ai-gateway AIG-069:
// TM, karta niezmienników, architecture.md, CLAUDE-LOCAL.md, KANBAN). Robi je jednym przejściem
// ostatni implementer jako JAWNY wyjątek od zakresu; błąd tego kroku nie zatrzymuje przebiegu.
const ranLayersAll = plan.filter((s) => s.run).map((s) => s.layer)
const orphanFixes = a.autoFixMinor !== false ? orphanMinorFixes(a.task.minorFixes, ranLayersAll) : []
if (orphanFixes.length) {
  const implOnly = ranLayersAll.filter((l) => l.agent && !l.tests)
  const docOwner = implOnly[implOnly.length - 1] || ranLayersAll.filter((l) => l.agent).slice(-1)[0]
  if (docOwner) {
    log('drobne poprawki z analizy bez właściciela warstwy: ' + orphanFixes.length + ' — jedno przejście przez ' + docOwner.id + ' (ORC-101)')
    const docText = 'WYJĄTEK OD ZAKRESU WARSTWY — DROBNE POPRAWKI Z ANALIZY, które nie należą do żadnej warstwy ' +
      '(dokumentacja, rejestry, karty). Zakres tej warstwy NIE ogranicza poniższych pozycji: edytuj wskazane ' +
      'pliki mechanicznie, bez zmiany zachowania kodu i bez dotykania czegokolwiek poza listą:\n' +
      orphanFixes.map((x, i) => (i + 1) + '. ' + x).join('\n')
    const docOpts = Object.assign(
      { label: docOwner.id + '-doc-fixes', agentType: docOwner.agent, maxTurns: budgetFor(a, 'implement', DEFAULTS.implTurns), schema: IMPL_SCHEMA },
      modelFor('implement'),
    )
    let docFixed = null
    try {
      docFixed = await ask(buildImplPrompt(a, docOwner, 2, docText, 0, null), docOpts)
    } catch (e) {
      docFixed = null
    }
    if (docFixed) {
      for (const f of docFixed.changed_files || []) if (allChangedFiles.indexOf(f) === -1) allChangedFiles.push(f)
      report.docFixes = { layer: docOwner.id, items: orphanFixes, files: docFixed.changed_files || [] }
    } else {
      report.minorFindings.push({ layer: 'analysis-minor-fixes', items: orphanFixes })
      report.warnings = (report.warnings || []).concat(docOwner.id + ': drobne poprawki z analizy bez właściciela — implementer bez wyniku, pozycje w minorFindings (ORC-101)')
    }
  }
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
// ORC-087: implementer zacommitował mimo STAGE_NOT_COMMIT — nie zatrzymuje przebiegu (diff względem
// bazy nadal działa), ale trafia do raportu, żeby człowiek nie zdziwił się historią.
if (a.baseSha && tree && typeof tree.commits !== 'number') {
  // ORC-094: ai-os-bot BOT-024 — 40 commitów, a raport nie miał ostrzeżenia: sonda nie zwróciła
  // licznika. Brak odpowiedzi to też informacja, nie milczenie.
  report.warnings = (report.warnings || []).concat('sonda drzewa nie zwróciła licznika commitów od bazy — nie wiadomo, czy agenci commitowali; sprawdź `git log ' + a.baseSha + '..HEAD`')
}
if (tree && typeof tree.commits === 'number' && tree.commits > 0) {
  log('UWAGA: ' + tree.commits + ' commit(ów) od bazy przebiegu mimo STAGE_NOT_COMMIT (ORC-087)')
  report.warnings = (report.warnings || []).concat(
    'implementery zacommitowały ' + tree.commits + ' commit(ów) od bazy ' + a.baseSha +
    ' — przejrzyj `git log ' + a.baseSha + '..HEAD`; spłaszczenie do stagingu: `git reset --soft ' + a.baseSha + '`')
}
const finalFiles = finalFileList(tree && tree.files, allChangedFiles)
if (treeSource === 'layers') log('sonda drzewa przed bramką końcową bez wyniku — lista plików z raportów warstw (może być niepełna)')

const finalAgent = firstAgentName(a.verifiers && a.verifiers.finalGate)
if (!finalAgent) {
  log('brak slotu final_gate w runtime.yml — kończę na werdyktach warstw')
} else {
  const finalOpts = Object.assign(
    { label: 'final-gate', agentType: finalAgent, maxTurns: scaledBudget(a, 'final-gate', finalFiles.length), schema: VERDICT_SCHEMA },
    modelFor('final', a),
  )
  // ORC-091: runda naprawcza po bramce końcowej. Ustalenia [BLOKUJĄCE] (violations z cause=code) i
  // [DROBNE] (minor_findings) idą do implementera warstwy, która jest ich właścicielem (po
  // ścieżkach; reszta do ostatniej warstwy produkcyjnej), po każdej naprawie biegnie sonda warstwy.
  // Zwraca false, gdy implementer zamilkł albo sonda po naprawie jest czerwona.
  const repairFinalFindings = async (blocking, minor) => {
    const ranLayers = plan.filter((s) => s.run).map((s) => s.layer)
    const implLayers = ranLayers.filter((l) => l.agent)
    const fallback = (implLayers.filter((l) => !l.tests).slice(-1)[0] || implLayers.slice(-1)[0] || {}).id
    const items = blocking.map((x) => '[BLOKUJĄCE] ' + x).concat(minor.map((x) => '[DROBNE] ' + x))
    const groups = groupFindingsByLayer(items, implLayers, fallback)
    let ok = true
    const noop = []
    // ORC-103: odcisk drzewa przed i po każdej naprawie; `ask` zwraca null przy awarii sondy.
    const fingerprint = async (label) => {
      try {
        const r = await ask(buildFingerprintPrompt(a.baseSha), Object.assign({ label, maxTurns: DEFAULTS.diffProbeTurns, schema: FINGERPRINT_SCHEMA }, modelFor('probe')))
        return r && typeof r.fingerprint === 'string' ? r.fingerprint.trim() : null
      } catch (e) {
        return null
      }
    }
    let fpBefore = await fingerprint('final-fix-fp-0')
    for (const id of Object.keys(groups)) {
      const layer = implLayers.find((l) => l.id === id)
      if (!layer) continue
      const text = 'USTALENIA BRAMKI KOŃCOWEJ do poprawy w zakresie TEJ warstwy (pozycje [BLOKUJĄCE] ' +
        'obowiązkowe; [DROBNE] mechanicznie, bez zmiany zachowania; pozycję wymagającą decyzji albo ' +
        'spoza zakresu warstwy POMIŃ i opisz w `deviation_note`):\n' + groups[id].map((x, i) => (i + 1) + '. ' + x).join('\n')
      const fixOpts = Object.assign(
        { label: layer.id + '-final-fix', agentType: layer.agent, maxTurns: budgetFor(a, 'implement', DEFAULTS.implTurns), schema: IMPL_SCHEMA },
        modelFor('implement'),
      )
      const fixed = await ask(buildImplPrompt(a, layer, 2, text, 0, null), fixOpts)
      if (!fixed) {
        ok = false
        report.warnings = (report.warnings || []).concat(layer.id + ': naprawa po bramce końcowej — implementer bez wyniku')
        continue
      }
      const fpAfter = await fingerprint('final-fix-fp-' + layer.id)
      if (fixLeftTreeUnchanged(fpBefore, fpAfter)) {
        ok = false
        noop.push(layer.id)
        report.warnings = (report.warnings || []).concat(layer.id + ': implementer zgłosił naprawę ' + groups[id].length + ' ustaleń bramki końcowej (' + (fixed.changed_files || []).length + ' plików), ale drzewo robocze się nie zmieniło — pomijam sondę i ponowną bramkę (ORC-103)')
        continue
      }
      fpBefore = fpAfter
      for (const f of fixed.changed_files || []) {
        if (allChangedFiles.indexOf(f) === -1) allChangedFiles.push(f)
        if (finalFiles.indexOf(f) === -1) finalFiles.push(f)
      }
      const prOpts =Object.assign({ label: layer.id + '-final-fix-checks', maxTurns: DEFAULTS.probeTurns, schema: CHECKS_SCHEMA }, modelFor('probe'))
      const pr = await ask(buildProbePrompt(a, layer), prOpts)
      if (pr && (pr.typecheck === 'fail' || pr.tests === 'fail')) {
        ok = false
        report.warnings = (report.warnings || []).concat(layer.id + ': sonda czerwona po naprawie ustaleń bramki końcowej (typecheck: ' + pr.typecheck + ', testy: ' + pr.tests + ')')
      }
    }
    report.finalFix = { blocking: blocking.length, minor: minor.length, layers: Object.keys(groups), noop }
    return ok
  }

  let roundExtra = ''
  for (let round = 1; round <= 2; round++) {
  const gateOpts = round === 1 ? finalOpts : Object.assign({}, finalOpts, { label: 'final-gate-r2' })
  // ORC-098: checks bramki końcowej uruchamia SONDA silnika (Haiku, raz na rundę), nie agent bramki —
  // ten ich nie uruchamiał (AIG-064/069: „bramka nie dostała wyników checks") i każdy przebieg kończył
  // się NO_GO z unverified_scope. Wynik jedzie do bramki jako fakt i do decyzji o lukach niżej.
  const finalChecks = (a.checks && a.checks.finalGate) || []
  let finalProbe = null
  if (finalChecks.length) {
    try {
      finalProbe = await ask(
        buildProbePrompt(a, { id: 'final', checks: finalChecks, dirs: [], tests: false }),
        Object.assign({ label: 'final-checks' + (round === 1 ? '' : '-r2'), maxTurns: DEFAULTS.probeTurns, schema: CHECKS_SCHEMA }, modelFor('probe')),
      )
    } catch (e) {
      finalProbe = null
    }
    if (!finalProbe) report.warnings = (report.warnings || []).concat('sonda checks bramki końcowej bez wyniku — bramka uruchamia je sama, luki nie będą obniżane do GO (ORC-098)')
  }
  let final = null
  try {
    final = await ask(buildFinalGatePrompt(a, finalChecks, finalFiles, treeSource, report.gaps, finalProbe) + roundExtra, gateOpts)
  } catch (e) {
    final = null
  }
  // ORC-087: bramka końcowa bez wyniku (padła/wyczerpała budżet bez werdyktu) to awaria maszyny,
  // nie werdykt — juz-ide-api-1 TS-REP-FACET-TIER-EXPOSURE-001 (33 plików, 2x cicho, także po
  // podniesieniu budżetu do 60) i grant-flow TS-UI-003 (`agent empty result`). Jedno ponowienie
  // z innym kształtem zadania: werdykt najpóźniej po ~70% budżetu, najpierw checks i pliki
  // najwyższego ryzyka, reszta do unverified_scope. Inna etykieta (cache silnika, ORC-077).
  if (!final) {
    const retryCalls = scaledBudget(a, 'final-gate', finalFiles.length)
    log('bramka końcowa bez wyniku — ponawiam raz z werdyktem po ~70% budżetu (ORC-087)')
    try {
      final = await ask(
        buildFinalGatePrompt(a, finalChecks, finalFiles, treeSource, report.gaps, finalProbe) + roundExtra +
          '\n\nPOPRZEDNIE WYWOŁANIE NIE ZWRÓCIŁO WYNIKU (budżet wyczerpany bez werdyktu). Wydaj werdykt ' +
          'NAJPÓŹNIEJ po ' + Math.floor(retryCalls * 0.7) + ' wywołaniach: najpierw deterministyczne bramki, ' +
          'potem pliki najwyższego ryzyka (migracje, auth, kontrakty, publiczne API); resztę wpisz do ' +
          '`unverified_scope`. Werdykt częściowy jest poprawnym wynikiem, jego brak nie.',
        Object.assign({}, finalOpts, { label: 'final-gate-retry' + (round === 1 ? '' : '-r2') }),
      )
    } catch (e) {
      final = null
    }
  }
  // ORC-083: `cause` — 'machine' = bramka nie dała werdyktu albo NO_GO wymuszone przez
  // unverified_scope (ORC-069); 'code' = weryfikator sam znalazł naruszenia w kodzie.
  report.finalGate = final
    ? Object.assign({}, final, { cause: undefined })
    : { verdict: 'NO_GO', violations: ['bramka końcowa nie zwróciła werdyktu (także po ponowieniu)'], cause: 'machine' }
  // ORC-087: brak werdyktu przy wszystkich warstwach GO — pliki idą do stagingu z flagą przeglądu.
  if (!final) report.stageForReview = stageableFiles(finalFiles, a.dirtyAtStart, allChangedFiles)
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
  if (finalGapsAcceptable(report.finalGate, finalUnverified, finalProbe)) {
    // ORC-098: zero naruszeń + zielona sonda silnika → GO z lukami, nie halt. Pliki idą do stagingu
    // z flagą przeglądu, luki do raportu (statusLine: „niesprawdzone fragmenty", „wymaga uważnego przeglądu").
    report.gaps.push({ layer: 'final-gate', items: finalUnverified })
    report.finalGate.gaps_accepted = finalUnverified
    report.stageForReview = stageableFiles(finalFiles, a.dirtyAtStart, allChangedFiles)
    log('bramka końcowa: GO z lukami (ORC-098) — checks zielone, zero naruszeń; luki w raporcie: ' + finalUnverified.join(', '))
  } else if (String(report.finalGate.verdict).toUpperCase() === 'GO' && finalUnverified.length) {
    // ORC-084: NO_GO wymuszone WYŁĄCZNIE przez unverified_scope (zero własnych naruszeń) —
    // pliki idą do stagingu z flagą „wymaga przeglądu"; człowiek i tak robi review przed commitem.
    if (!(report.finalGate.violations || []).length) report.stageForReview = stageableFiles(finalFiles, a.dirtyAtStart, allChangedFiles)
    report.finalGate.verdict = 'NO_GO'
    report.finalGate.cause = 'machine'
    report.finalGate.violations = (report.finalGate.violations || []).concat(
      'GO z niezweryfikowanym zakresem (unverified_scope), bramka końcowa nie ma retry: ' + finalUnverified.join(', '))
  }
  const fgNotGo = String(report.finalGate.verdict).toUpperCase() !== 'GO'
  if (fgNotGo && !report.finalGate.cause) report.finalGate.cause = 'code'
  // ORC-091: ustalenia bramki, które agent może naprawić sam — blokujące (cause=code, do 8 sztuk;
  // więcej to nie „łatwe poprawki") i drobne. Runda 1 → naprawa → przy blokujących ponowna bramka
  // (runda 2); same drobne: naprawa + sonda, bez ponownej bramki (werdykt zostaje).
  const minorFinal = a.autoFixMinor !== false ? collectMinor(report.finalGate) : []
  const blockingFinal = fgNotGo && report.finalGate.cause === 'code' && a.autoFixMinor !== false ? (report.finalGate.violations || []) : []
  if (round === 1 && (blockingFinal.length || minorFinal.length) && blockingFinal.length <= 8) {
    log('bramka końcowa: ' + blockingFinal.length + ' blokujących i ' + minorFinal.length + ' drobnych ustaleń — runda naprawcza (ORC-091)')
    const repaired = await repairFinalFindings(blockingFinal, minorFinal)
    if (repaired && blockingFinal.length) {
      report.finalGateRound1 = report.finalGate
      roundExtra = '\n\nRUNDA 2 (po naprawie): poprzednia runda zgłosiła ustalenia, które implementer poprawił:\n' +
        blockingFinal.concat(minorFinal).map((x, i) => (i + 1) + '. ' + x).join('\n') +
        '\nZweryfikuj poprawki i całość. Poprawione pozycje NIE są już naruszeniami; zgłoś tylko to, co nadal zachodzi albo powstało przy poprawce.'
      continue
    }
    const noopFix = report.finalFix && report.finalFix.noop && report.finalFix.noop.length
    if (!repaired && !blockingFinal.length && noopFix) {
      // ORC-103: drobiazgi nie zostały naprawione (implementer nic nie zapisał) — to nie jest naruszenie,
      // zostają w minorFindings dla człowieka; werdykt bramki bez zmian.
      report.minorFindings.push({ layer: 'final-gate', items: minorFinal })
    } else if (!repaired && !blockingFinal.length) {
      // naprawa drobiazgów zepsuła sondę — to nasze naruszenie, nie szum
      report.finalGate.verdict = 'NO_GO'
      report.finalGate.cause = 'code'
      report.finalGate.violations = (report.finalGate.violations || []).concat('naprawa drobnych ustaleń zostawiła czerwoną sondę lub implementer bez wyniku (patrz report.warnings)')
    }
  } else if (minorFinal.length) {
    report.minorFindings.push({ layer: 'final-gate', items: minorFinal })
  }
  if (String(report.finalGate.verdict).toUpperCase() !== 'GO') {
    log('ESCALATE_AND_HALT — bramka końcowa: ' + formatViolations(report.finalGate.violations))
    report.statusLine = statusLine(report, 'halt', { cause: report.finalGate.cause })
    return report
  }
  break
  }
}

// ── 6. wyjście: staged, NIE zacommitowane. Commit robi człowiek.
report.staged = stageableFiles(finalFiles, a.dirtyAtStart, allChangedFiles)
report.statusLine = statusLine(report, 'ok')
log('Gotowe. Stan: staged, not committed — ' + finalFiles.length + ' plików. Commit robi człowiek.')
return report
