---
id: DEV-orc-016-implementation-sdk-dart-core
status: dismissed
dismissed_reason: >
  Naprawione w silniku (nie config projektu, nie baza wiedzy — realny punkt 3 z README §2).
  buildProbePrompt() w scripts/workflow/orchestrate.template.mjs scope'uje teraz checks do
  najbliższego package.json znalezionego przez SONDĘ (ma Bash — silnik nie ma dostępu do fs,
  patrz nagłówek pliku): `(cd "$PKGROOT" && npm run <check>)` zamiast gołego `npm run <check>`
  na roocie. Podejście różni się od proponowanej łatki w tym zgłoszeniu (ta zakładała
  `existsSync`/`join` bezpośrednio w skrypcie Workflow, który nie ma fs) — ten sam efekt
  osiągnięty przez lookup w tekście promptu, wykonywany przez agenta sondy. Patrz
  docs/decisions/orchestrate-rule-history.md#orc-016-code; eval:
  probe-prompt-scopes-checks-to-package-root-in-monorepo w
  tests/flow-evals/orchestrate-script/run.js.
trigger: agent_note
rule_ref: ORC-016
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 3
projects:
  - feature-flags
---

# DEV-orc-016-implementation-sdk-dart-core

## Occurrences

- 2026-09-27 feature-flags (0010) run `wf_2a6df522-a59` warstwa `implementation:sdk-dart-core` — STAN NA 2026-09-27: NIE naprawione — git log scripts/workflow/orchestrate.template.mjs pokazuje ostatni commit 9cb5506 (ORC-069, niezwiązany), linia ok. 251 wciąż ma 'const cmds = (layer.checks || []).map((c) => "npm run " + c)' bez zawężenia.

PROPONOWANA ŁATKA (gotowa do wklejenia, nie testowana workflow-lintem):

W buildProbePrompt(a, layer), przed budową cmds, dodać funkcję pomocniczą (obok effectiveDirs, linia ~159):

  function packageRootFor(layer) {
    const dirs = effectiveDirs(layer)
    // Pierwszy katalog warstwy, którego najbliższy przodek ma package.json — jeśli
    // żaden nie pasuje (np. warstwa cross-cutting bez wspólnego pakietu), zwróć null
    // i jedź po staremu (root), ale ZAZNACZ to w logu jako świadome pełne zawężenie (ORC-016).
    for (const d of dirs) {
      const top = d.replace(/^\.\//, '').split('/').slice(0, 2).join('/') // 'packages/sdk-dart'
      if (existsSync(join(process.cwd(), top, 'package.json'))) return top
    }
    return null
  }

I zamiast:
  const cmds = (layer.checks || []).map((c) => 'npm run ' + c)

użyć:
  const pkgRoot = packageRootFor(layer)
  const cmds = (layer.checks || []).map((c) =>
    pkgRoot ? 'npm run ' + c + ' --prefix ' + pkgRoot : 'npm run ' + c
  )
  const scopeNote = pkgRoot
    ? ''
    : (layer.checks || []).length
      ? '\nUWAGA: nie znaleziono pojedynczego package.json dla zakresu tej warstwy — checks lecą na PEŁNYM repo (ORC-016, świadomie, nie domyślnie).\n'
      : ''

'--prefix' działa z npm/pnpm bez zależności od turbo i BEZ WCHODZENIA w graf ^build innych pakietów — różni się tym od 'pnpm --filter'/'turbo --filter', które nadal cofną się do zależności upstream (to jest źródło tej awarii: turbo.json w feature-flags ma lint/typecheck/test zależne od ^build). Jeśli projekt i tak chce korzystać z cache'u turbo, alternatywa to 'turbo run <c> --filter=./' + pkgRoot, ale to NIE rozwiązuje tego konkretnego incydentu (nadal buduje zależności). Do decyzji maintainera, który kompromis (szybkość+cache vs zero efektów ubocznych) wybrać jako domyślny.
- 2026-09-27 feature-flags (0010) run `wf_2a6df522-a59` warstwa `implementation:sdk-dart-core` — ZNALEZIONA PRZYCZYNA ŹRÓDŁOWA (nie naprawiona, wciąż w kodzie): scripts/workflow/orchestrate.template.mjs, funkcja buildProbePrompt(), linia ok. 251: 'const cmds = (layer.checks || []).map((c) => "npm run " + c)' — buduje polecenie sondy z SAMEJ nazwy checka (np. "lint"), BEZ żadnego zawężenia do dotkniętego pakietu, mimo że effectiveDirs(layer) jest dostępne w tej samej funkcji (używane tylko do globScoped/newTestBlocks, nie do cmds). W repo feature-flags root package.json ma "lint": "turbo run lint", a turbo.json ma lint/typecheck/test/build wszystkie z dependsOn: ["^build"] — więc NIEZAWĘŻONE 'npm run lint' w sondzie wymusza pełny build WSZYSTKICH zależności upstream w monorepo, w tym packages/contracts, którego build (generate && tsup) w tym środowisku psuje standalone-validators.js. Sugerowana naprawa: buildProbePrompt powinien używać effectiveDirs(layer) (albo mapowania dirs->nazwa pakietu pnpm) do zbudowania 'pnpm --filter <pkg> run <check>' / 'turbo run <check> --filter=<pkg>' zamiast gołego 'npm run <check>' na root — ORC-016 jest dziś czystą prozą ('tylko prompt'), a to konkretne miejsce w kodzie jest tam, gdzie powinien wejść mechanizm.
- 2026-09-27 feature-flags (0010) run `wf_2a6df522-a59` warstwa `implementation:sdk-dart-core` — Uszkodzenie packages/contracts/src/generated/standalone-validators.js (i kosmetyczne przeformatowanie 5 sąsiednich plików generated/*.ts) wystąpiło DWUKROTNIE w tym samym przebiegu TASK-0010 (pierwszy raz w rundzie 1, ręcznie cofnięte po decyzji człowieka; drugi raz samoistnie odtworzone w rundzie 5, mimo że żadna warstwa/jednostka tego taska nie ma packages/contracts/ w swoim dirs/scope). To wskazuje na powtarzalny, nie losowy problem: któraś z deterministycznych 'checks' tej warstwy (lint/validate:types/deps:circular) albo sonda odpalają pełny 'turbo build'/'generate' bez zawężenia do dotkniętego pakietu (ORC-016), co kaskadowo re-generuje packages/contracts w tym środowisku ZE ZŁYM wynikiem (brakujący/inny toolchain AJV -> plik walidatorów tracący ~11615 linii zamiast się kompilować). Wymaga osobnego zbadania (które dokładnie polecenie w checks/sondzie to odpala) i naprawy zawężenia zakresu, inaczej powtórzy się przy KAŻDYM kolejnym /orchestrate w tym repo, które dotknie warstwy 'implementation' z checks ['lint','validate:types','deps:circular'].
