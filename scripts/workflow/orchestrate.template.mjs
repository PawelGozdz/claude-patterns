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
function cardsFor(a, layerId) {
  const all = a.patterns || []
  const own = all.filter((p) => p.origin === 'layer:' + layerId)
  const rest = all.filter((p) => p.origin !== 'layer:' + layerId && !String(p.origin || '').startsWith('layer:'))
  return own.concat(rest)
}

function renderCards(cards) {
  if (!cards.length) return ''
  const body = cards.map((p) =>
    '--- ' + p.path + (p.card ? ' (karta reguł)' : ' (PEŁNY wzorzec — karty brak)') + ' ---\n' + p.content,
  ).join('\n')
  return '\n=== KARTY REGUŁ — obowiązujące dla tej warstwy ===\n' + body +
    '\n=== koniec kart ===\n\n' +
    'Masz komplet reguł POWYŻEJ. NIE czytaj pełnych wzorców i nie szukaj ich w repo ani ' +
    'w innych projektach. Gdy brakuje Ci PRZYKŁADU istniejącej implementacji (sygnatura ' +
    'helpera, użycie biblioteki, referencyjny handler), zadaj JEDNO celowane zapytanie ' +
    'retrievalu kodu (max 2 na cały Twój przebieg, zero gdy karta wystarcza). Gdy karta ' +
    'nie rozstrzyga Twojego przypadku — napisz w raporcie `gap: <czego brakuje>` ' +
    'i zaimplementuj najbliższy wariant zgodny z kartą. Luka w karcie to nasz błąd, ' +
    'nie Twój powód do eksploracji.\n'
}

// Zakaz cofania — obowiązuje KAŻDY prompt implementera i KAŻDY prompt naprawczy.
// Cofnięcie to jedyny sposób, w jaki zweryfikowana praca znika NIE ZOSTAWIAJĄC ŚLADU
// w diffie, który człowiek ogląda przed commitem.
const NO_REVERT =
  '\n\nZAKAZ COFANIA: `git checkout`, `git restore`, `git stash` i `git reset` są zakazane ' +
  'na KAŻDEJ ścieżce, zero wyjątków — także „to tylko mój plik" i „przywracam, jak było". ' +
  'Plik, który uważasz za spoza swojego zakresu, ZGŁOŚ w raporcie i zostaw nietknięty. ' +
  'Do zapisania i przywrócenia stanu używaj `cp`, nigdy gita.'

function scopeBlock(layer) {
  const dirs = (layer.dirs || []).join(', ') || '(cały projekt)'
  return 'ZAKRES WARSTWY\n  id: ' + layer.id + '\n  katalogi: ' + dirs +
    (layer.role ? '\n  rola: ' + layer.role : '') +
    '\nPlik spoza tych katalogów jest POZA ZAKRESEM, nie brakujący.'
}

function buildImplPrompt(a, layer, attempt, violations, silentDeaths) {
  const spec = 'ZADANIE ' + a.task.id + (a.task.title ? ' — ' + a.task.title : '') +
    (a.task.taskFile ? '\nSpec: ' + a.task.taskFile + ' (przeczytaj go)' : '') +
    (a.task.analysisFile ? '\nAnaliza (zatwierdzona): ' + a.task.analysisFile : '')
  const decisions = (a.task.decisions || []).length
    ? '\n\nDECYZJE ZATWIERDZONE PRZEZ CZŁOWIEKA — stosuj, nie re-decyduj:\n' +
      a.task.decisions.map((d) => '- ' + d.id + ' ' + (d.topic || '') + ': ' + (d.choice || '')).join('\n')
    : ''
  const turns = budgetFor(a, 'implement', DEFAULTS.implTurns)
  const soft = '\n\nBUDŻET: ~' + turns + ' tur. Gdy się kończy — NATYCHMIAST oddaj wynik ' +
    'w wymaganej formie ze stanem częściowym. Częściowy wynik jest wart więcej niż brak wyniku.'
  const silent = silentDeaths
    ? '\n\nUWAGA: ' + silentDeaths + ' poprzednia(e) próba(y) tej warstwy skończyły się BEZ wyniku ' +
      '— budżet tur wyczerpany. Zakres jest najpewniej za duży. Zrób NAJMNIEJSZY kompletny ' +
      'fragment i oddaj wynik, zamiast zaczynać całość od nowa. Pliki mogły zostać częściowo ' +
      'zmodyfikowane przez poprzednią próbę — SPRAWDŹ ich stan przed edycją, nie zakładaj czystego drzewa.'
    : ''
  const fix = violations
    ? '\n\nPOPRAWKA (próba ' + attempt + ') — napraw dokładnie te naruszenia i nic poza nimi:\n' + violations
    : ''
  return spec + decisions + '\n\n' + scopeBlock(layer) + '\n' + renderCards(cardsFor(a, layer.id)) +
    soft + silent + fix + NO_REVERT
}

// Sonda: deterministyczne bramki uruchomione RAZ, tanio, bez czytania kodu. Verifier
// dostaje jej wynik jako FAKT i ma zakaz ponawiania — inaczej ten sam typecheck wykonuje
// się kilkadziesiąt razy, a każde 16-23 KB wyjścia zostaje w kontekście na resztę przebiegu.
function buildProbePrompt(a, layer) {
  const cmds = (layer.checks || []).map((c) => 'npm run ' + c)
  const scoped = (layer.dirs || []).join(' ')
  // Pathspecy monorepo: `layer.dirs` to nazwy typu "__tests__/"/"domain/", nigdy katalogi
  // TOP-LEVEL repo (prawdziwa ścieżka to src/contexts/<ctx>/domain/...). Literalny pathspec
  // `-- domain/` czy `-- __tests__/` dopasowuje TYLKO katalog o tej dokładnej ścieżce od
  // korzenia repo — czyli nic, w monorepo z zagnieżdżeniem. Magic pathspec `:(glob)**/x/**`
  // dopasowuje x niezależnie od głębokości. Bez tego `newTestBlocks` liczy 0 zawsze,
  // niezależnie od realnej zawartości (zweryfikowane, TASK-KAIZEN-002 audyt 2026-09-09).
  const globScoped = (layer.dirs || [])
    .map((d) => "':(glob)**/" + d.replace(/\/$/, '') + "/**'")
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
      '  git add -N -- ' + globScoped + ' 2>/dev/null; git diff -U0 -- ' + globScoped + " | grep -cE '^\\+\\s*(it|test|testWidgets|describe|group)\\(' \n" +
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
function buildDiffProbePrompt() {
  return 'W repo uruchom: git diff --name-only oraz git status --short. NIC więcej — ' +
    'nie czytaj plików, nie analizuj, nie poprawiaj. Zwróć listę ścieżek.'
}

// Jeden kanoniczny builder promptu weryfikatora — WL10 liczy go RAZ dla wszystkich wywołań.
// Ręczne składanie promptu per-warstwa jest dokładnie tym, co zawiodło w incydencie
// TS-REP-PIPELINE-001-F3a-remediation.
function buildVerifierPrompt(a, layer, probe, changedFiles, mode) {
  const calls = budgetFor(a, 'verify', DEFAULTS.verifyCalls)
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
    renderCards(cardsFor(a, layer.id)) +
    '\nOceń zgodność zmiany z regułami powyżej. Zwróć werdykt GO albo NO_GO i listę naruszeń ' +
    '(plik, linia, reguła, co poprawić).\n' +
    'TWARDY LIMIT: ' + calls + ' wywołań narzędzi. Gdy budżet się kończy — wydaj werdykt ' +
    'natychmiast, na podstawie tego, co już wiesz. Werdykt częściowy z uzasadnieniem jest ' +
    'poprawnym wynikiem; brak werdyktu wywraca cały przebieg.'
}

function buildFinalGatePrompt(a, checks, changedFiles) {
  const calls = budgetFor(a, 'final-gate', DEFAULTS.verifyCalls)
  return 'BRAMKA KOŃCOWA dla ' + a.task.id + ' — oceniasz CAŁOŚĆ zmiany, nie ostatnią warstwę. ' +
    'To ostatnie miejsce, w którym wychodzi regresja MIĘDZY warstwami.\n\n' +
    (checks.length ? 'Deterministyczne bramki do wykonania raz, na całości: ' + checks.join(', ') + '\n' : '') +
    (changedFiles.length ? 'Pliki objęte zmianą:\n  ' + changedFiles.join('\n  ') + '\n' : '') +
    '\nZwróć werdykt GO albo NO_GO i listę naruszeń.\n' +
    'TWARDY LIMIT: ' + calls + ' wywołań narzędzi. Gdy budżet się kończy — wydaj werdykt ' +
    'natychmiast na podstawie zebranych dowodów.' + NO_REVERT
}

// Decyzja po weryfikacji. Trzy różne awarie, trzy różne reakcje — zlanie ich w jedno
// („no to spróbuj jeszcze raz") jest tym, co pali trzecią pełną próbę na gotowym kodzie.
function decideVerdict(verdict, attempt, maxAttempts) {
  if (!verdict) return { next: 'silent', reason: 'brak wyniku weryfikatora' }
  const v = String(verdict.verdict || '').toUpperCase()
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
function layerTouches(layer, file) {
  const dirs = layer.dirs || []
  if (!dirs.length) return true
  return dirs.some((d) => String(file).indexOf(String(d).replace(/\/+$/, '')) !== -1)
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
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict'],
  properties: {
    verdict: { type: 'string', enum: ['GO', 'NO_GO'] },
    violations: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
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

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // ── 1. implementacja (albo, po cichej śmierci, weryfikacja istniejącego stanu)
    if (mode === 'implement') {
      const implOpts = Object.assign(
        { label: layer.id + '-impl', agentType: layer.agent, maxTurns: budgetFor(a, 'implement', DEFAULTS.implTurns), schema: IMPL_SCHEMA },
        modelFor('implement'),
      )
      let impl = null
      try {
        impl = await ask(buildImplPrompt(a, layer, attempt, violations, silentDeaths), implOpts)
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
          probeDiff = await ask(buildDiffProbePrompt(), diffOpts)
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
      }
    }

    // ── 2. bramka „kod istnieje" — mierzymy drzewo, nie raport agenta
    const gateOpts = Object.assign(
      { label: layer.id + '-diff-gate', maxTurns: DEFAULTS.diffProbeTurns, schema: DIFF_PROBE_SCHEMA },
      modelFor('probe'),
    )
    let gate = null
    try {
      gate = await ask('W repo uruchom: git diff --name-only oraz git diff --stat. NIC więcej — nie czytaj plików, nie analizuj.', gateOpts)
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
      mode = 'implement'
      if (attempt >= maxAttempts) {
        settled = { id: layer.id, status: 'ESCALATE_AND_HALT', reason: violations }
        break
      }
      continue
    }

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
    const verifyAgent = firstAgentName(a.verifiers && a.verifiers.layer)
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
  report.layers.push(settled)
  for (const f of settled.files || []) if (allChangedFiles.indexOf(f) === -1) allChangedFiles.push(f)

  if (settled.status === 'ESCALATE_AND_HALT') {
    log('ESCALATE_AND_HALT na warstwie ' + layer.id + ' — ' + settled.reason)
    return report
  }
  log('warstwa ' + layer.id + ' — GO. Dopisz jej id do layers_done w artefakcie analizy (checkpoint wznowienia).')
}

// ── 5. bramka końcowa: suma checks warstw, które faktycznie weszły, raz na całości
phase('Bramka końcowa')

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
    final = await ask(buildFinalGatePrompt(a, (a.checks && a.checks.finalGate) || [], allChangedFiles), finalOpts)
  } catch (e) {
    final = null
  }
  report.finalGate = final || { verdict: 'NO_GO', violations: ['bramka końcowa nie zwróciła werdyktu'] }
  if (String(report.finalGate.verdict).toUpperCase() !== 'GO') {
    log('ESCALATE_AND_HALT — bramka końcowa: ' + formatViolations(report.finalGate.violations))
    return report
  }
}

// ── 6. wyjście: staged, NIE zacommitowane. Commit robi człowiek.
report.staged = allChangedFiles
log('Gotowe. Stan: staged, not committed — ' + allChangedFiles.length + ' plików. Commit robi człowiek.')
return report
