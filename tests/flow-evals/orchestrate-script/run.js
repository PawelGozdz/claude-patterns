#!/usr/bin/env node
/**
 * tests/flow-evals/orchestrate-script/run.js — eval L1 (D7) dla kanonicznego skryptu
 * Workflow `scripts/workflow/orchestrate.template.mjs`.
 *
 * Zero LLM, zero uruchomienia Workflow. Testujemy CORE — czyste funkcje wycięte z tego
 * samego pliku, który realnie wykonuje przebieg (`scripts/workflow/orchestrate-core.mjs`),
 * karmione fixture'ami w kształcie wyjścia `orchestrate-prepare.mjs`.
 *
 * Uruchom: node tests/flow-evals/orchestrate-script/run.js
 */

const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CORE = path.join(REPO, 'scripts', 'workflow', 'orchestrate-core.mjs');
const TEMPLATE = path.join(REPO, 'scripts', 'workflow', 'orchestrate.template.mjs');

// ── fixture w kształcie args (wyjście orchestrate-prepare.mjs) ───────────────────
const ARGS = {
  task: {
    id: 'TS-FIX-001',
    title: 'Zadanie testowe',
    taskFile: 'project-orchestration/tasks/TS-FIX-001.md',
    analysisFile: 'project-orchestration/analysis/TS-FIX-001.analysis.md',
    decisions: [{ id: 'D1', topic: 'temat', choice: 'wybór A' }],
    layersDone: ['domain'],
  },
  layers: [
    { id: 'domain', dirs: ['src/domain/'], agent: 'domain-application-implementer', role: 'Model domenowy.', checks: ['typecheck'], skip: true, skipReason: 'GO z poprzedniego przebiegu (layers_done)', tests: false, optional: false, layerPatterns: [] },
    { id: 'infrastructure', dirs: ['src/infrastructure/'], agent: 'infrastructure-implementer', role: 'Styk ze światem.', checks: ['typecheck', 'lint'], skip: false, tests: false, optional: false, layerPatterns: ['infrastructure/repository-pattern.md'] },
    { id: 'api-surface', dirs: ['src/api/'], agent: 'infrastructure-implementer', checks: [], skip: false, tests: false, optional: true, createWhen: 'zmiana rusza publiczne wejścia', layerPatterns: [] },
    { id: 'testing', dirs: ['src/__tests__/'], agent: 'test-implementer', checks: ['test'], skip: false, tests: true, optional: false, layerPatterns: [] },
  ],
  patterns: [
    { path: 'cross-layer/conventions-pattern.md', card: true, content: 'KARTA KONWENCJE: camelCase', origin: 'always', matchedKeywords: [] },
    { path: 'infrastructure/repository-pattern.md', card: true, content: 'KARTA REPOZYTORIUM: jeden agregat', origin: 'layer:infrastructure', matchedKeywords: [] },
    { path: 'testing/testing-pyramid-pattern.md', card: false, content: 'PELNY WZORZEC PIRAMIDA', origin: 'trigger', matchedKeywords: ['test'] },
  ],
  checks: { byLayer: {}, finalGate: ['typecheck', 'lint', 'test'] },
  budgets: { verify: { max_tool_calls: 12, on_limit: 'emit-partial' } },
  knowledge: { collection: 'code_fixture' },
  humanVoice: { language: 'pl' },
  verifiers: { layer: 'code-quality-verifier', maxAttempts: 3, onMax: 'ESCALATE_AND_HALT', finalGate: 'security-e2e-verifier', onFail: 'ESCALATE_AND_HALT' },
  exit: 'STAGE_NOT_COMMIT',
};

const L = Object.fromEntries(ARGS.layers.map((l) => [l.id, l]));

const CASES = (c) => [
  // ── kolejność i pomijanie warstw ───────────────────────────────────────────────
  {
    name: 'layer-plan-honours-layers-done-and-order',
    run() {
      const plan = c.layerPlan(ARGS, { 'api-surface': true });
      const ids = plan.map((p) => p.layer.id);
      if (JSON.stringify(ids) !== JSON.stringify(['domain', 'infrastructure', 'api-surface', 'testing'])) {
        return 'kolejność warstw zmieniona: ' + ids.join(',');
      }
      if (plan[0].run !== false || !/layers_done/.test(plan[0].reason)) return 'warstwa z layers_done nie została pominięta';
      if (plan[1].run !== true) return 'warstwa obowiązkowa pominięta';
      if (plan[2].run !== true) return 'warstwa warunkowa z trafionym create_when pominięta';
      return null;
    },
  },
  {
    name: 'optional-layer-skipped-when-create-when-misses',
    run() {
      const plan = c.layerPlan(ARGS, {});
      const opt = plan.find((p) => p.layer.id === 'api-surface');
      if (opt.run !== false) return 'warstwa warunkowa weszła mimo nietrafionego create_when';
      if (!/create_when/.test(opt.reason)) return 'powód pominięcia nie wymienia create_when';
      return null;
    },
  },

  // ── dobór kart do warstwy ──────────────────────────────────────────────────────
  {
    name: 'layer-cards-first-then-global',
    run() {
      const cards = c.cardsFor(ARGS, 'infrastructure').map((p) => p.path);
      if (cards[0] !== 'infrastructure/repository-pattern.md') return 'wzorzec warstwy nie jest pierwszy: ' + cards.join(',');
      if (!cards.includes('cross-layer/conventions-pattern.md')) return 'brak wzorca globalnego';
      // wzorzec przypisany do INNEJ warstwy nie może wyciec tutaj
      const other = c.cardsFor(ARGS, 'testing').map((p) => p.path);
      if (other.includes('infrastructure/repository-pattern.md')) return 'wzorzec warstwy infrastructure wyciekł do testing';
      return null;
    },
  },
  {
    name: 'cards-injected-into-impl-prompt-and-exploration-closed',
    run() {
      const p = c.buildImplPrompt(ARGS, L.infrastructure, 1, null, 0);
      if (!p.includes('KARTA REPOZYTORIUM')) return 'treść karty nie trafiła do promptu implementera';
      if (!/NIE czytaj pełnych wzorców/.test(p)) return 'brak zamknięcia ścieżki eksploracji';
      if (!p.includes('wybór A')) return 'zatwierdzone decyzje nie trafiły do promptu';
      if (!/ZAKAZ COFANIA/.test(p)) return 'brak zakazu git checkout/restore/stash/reset';
      if (!/src\/infrastructure\//.test(p)) return 'prompt nie niesie zakresu warstwy';
      return null;
    },
  },

  // ── budżety ────────────────────────────────────────────────────────────────────
  {
    name: 'budget-from-args-overrides-default',
    run() {
      if (c.budgetFor(ARGS, 'verify', 99) !== 12) return 'budżet z args zignorowany';
      if (c.budgetFor(ARGS, 'implement', 40) !== 40) return 'brak fallbacku dla slotu bez budżetu';
      if (c.budgetFor({}, 'verify', 15) !== 15) return 'fallback nie działa przy pustych args';
      return null;
    },
  },

  // ── routing modeli ─────────────────────────────────────────────────────────────
  {
    name: 'model-routing-probe-cheap-final-inherits',
    run() {
      const probe = c.modelFor('probe');
      if (probe.model !== 'haiku' || probe.effort !== 'low') return 'sonda nie jest tania: ' + JSON.stringify(probe);
      if (c.modelFor('implement').model !== 'sonnet') return 'implementer poza sonnetem';
      if (c.modelFor('verify').model !== 'sonnet') return 'verify warstwy poza sonnetem';
      if (Object.keys(c.modelFor('final')).length !== 0) return 'bramka końcowa ma override zamiast dziedziczyć model sesji';
      return null;
    },
  },

  // ── prompt weryfikatora ────────────────────────────────────────────────────────
  {
    name: 'verifier-prompt-carries-probe-facts-and-forbids-rerun',
    run() {
      const p = c.buildVerifierPrompt(ARGS, L.infrastructure, { typecheck: 'pass', tests: 'pass' }, ['src/infrastructure/a.ts'], 'implement');
      if (!/typecheck: pass/.test(p)) return 'wynik sondy nie wstrzyknięty jako fakt';
      if (!/NIE uruchamiaj typechecku ani testów ponownie/.test(p)) return 'brak zakazu ponawiania bramek';
      if (!/TWARDY LIMIT: 12/.test(p)) return 'brak twardego limitu z budżetu';
      if (!/wydaj werdykt/i.test(p)) return 'brak frazy wymuszającej werdykt przy wyczerpaniu budżetu';
      if (/git diff\b(?!.*--)/.test(p)) return 'prompt każe zrobić pełny diff';
      return null;
    },
  },
  {
    name: 'verify-existing-mode-marks-tree-as-source-of-truth',
    run() {
      const p = c.buildVerifierPrompt(ARGS, L.infrastructure, null, ['src/infrastructure/a.ts'], 'verify-existing');
      if (!/STAN\s+FAKTYCZNY/.test(p)) return 'tryb verify-existing nie mówi, że ocenia drzewo, nie raport';
      return null;
    },
  },

  // ── decyzja GO / FIX / ESCALATE / cicha śmierć ────────────────────────────────
  {
    name: 'verdict-go-fix-escalate-silent',
    run() {
      if (c.decideVerdict({ verdict: 'GO' }, 1, 3).next !== 'go') return 'GO nierozpoznane';
      if (c.decideVerdict({ verdict: 'go' }, 1, 3).next !== 'go') return 'GO małymi literami nierozpoznane';
      const fix = c.decideVerdict({ verdict: 'NO_GO', violations: ['brak walidacji'] }, 1, 3);
      if (fix.next !== 'fix' || !/brak walidacji/.test(fix.reason)) return 'NO_GO nie przechodzi w fix z naruszeniami';
      const esc = c.decideVerdict({ verdict: 'NO_GO', violations: ['x'] }, 3, 3);
      if (esc.next !== 'escalate') return 'ostatnia próba nie eskaluje';
      if (c.decideVerdict(null, 1, 3).next !== 'silent') return 'brak wyniku nie jest odróżniony od NO_GO';
      return null;
    },
  },

  // ── zakres jednostki / warstwy ────────────────────────────────────────────────
  {
    name: 'layer-touches-scopes-diff-to-layer',
    run() {
      if (!c.layerTouches(L.infrastructure, 'src/infrastructure/repo.ts')) return 'plik warstwy nie rozpoznany';
      if (c.layerTouches(L.infrastructure, 'src/domain/aggregate.ts')) return 'cudzy plik zaliczony jako praca tej warstwy';
      if (!c.layerTouches({ dirs: [] }, 'cokolwiek.ts')) return 'warstwa bez dirs powinna obejmować wszystko';
      return null;
    },
  },

  // ── bramka przyrostu (WL15 / §2a′ punkt 5) ────────────────────────────────────
  {
    name: 'delta-gate-fails-on-zero-new-test-blocks',
    run() {
      const fail = c.deltaGateFails(L.testing, { typecheck: 'pass', tests: 'pass', newTestBlocks: 0 }, ['src/__tests__/a.spec.ts']);
      if (!fail) return 'warstwa testowa z zerowym przyrostem przeszła';
      const ok = c.deltaGateFails(L.testing, { typecheck: 'pass', tests: 'pass', newTestBlocks: 4 }, ['src/__tests__/a.spec.ts']);
      if (ok) return 'realny przyrost potraktowany jako naruszenie';
      const notTests = c.deltaGateFails(L.infrastructure, { typecheck: 'pass', tests: 'pass', newTestBlocks: 0 }, ['src/infrastructure/a.ts']);
      if (notTests) return 'bramka przyrostu odpaliła na warstwie nietestowej (legalny refaktor)';
      const noProbe = c.deltaGateFails(L.testing, null, ['src/__tests__/a.spec.ts']);
      if (noProbe) return 'brak sondy potraktowany jako naruszenie przyrostu';
      return null;
    },
  },

  // ── sonda ─────────────────────────────────────────────────────────────────────
  {
    name: 'probe-prompt-redirects-output-and-counts-blocks',
    run() {
      const p = c.buildProbePrompt(ARGS, L.testing);
      if (!/> \/tmp\/check-testing\.log 2>&1; echo "EXIT:\$\?"/.test(p)) return 'wyjście checks nie jest przekierowane poza kontekst';
      if (!/EXIT:0 NIE otwieraj pliku logu/.test(p)) return 'brak zakazu czytania logu przy zielonym wyniku';
      if (!/grep -cE/.test(p)) return 'warstwa testowa bez pomiaru przyrostu bloków';
      if (!/skipped/.test(p)) return 'brak instrukcji dla brakującego skryptu w package.json';
      const infra = c.buildProbePrompt(ARGS, L.infrastructure);
      if (/grep -cE/.test(infra)) return 'pomiar przyrostu testów odpalony na warstwie nietestowej';
      return null;
    },
  },
  {
    name: 'probe-prompt-handles-layer-without-checks',
    run() {
      const p = c.buildProbePrompt(ARGS, L['api-surface']);
      if (!/brak checks w runtime.yml/.test(p)) return 'warstwa bez checks nie jest jawnie raportowana';
      return null;
    },
  },

  // ── ślad cichej śmierci przekazany do kolejnej próby ──────────────────────────
  {
    name: 'silent-death-signal-reaches-next-attempt',
    run() {
      const p = c.buildImplPrompt(ARGS, L.infrastructure, 2, 'naruszenie X', 1);
      if (!/BEZ wyniku/.test(p)) return 'kolejna próba nie wie o cichej śmierci poprzedniej';
      if (!/SPRAWDŹ ich stan przed edycją/.test(p)) return 'brak ostrzeżenia o częściowo zmienionym drzewie';
      if (!/naruszenie X/.test(p)) return 'naruszenia z verify nie trafiły do promptu naprawczego';
      return null;
    },
  },

  // ── bramka końcowa ────────────────────────────────────────────────────────────
  {
    name: 'final-gate-prompt-covers-whole-change',
    run() {
      const p = c.buildFinalGatePrompt(ARGS, ARGS.checks.finalGate, ['src/a.ts', 'src/b.ts']);
      if (!/CAŁOŚĆ zmiany/.test(p)) return 'bramka końcowa nie deklaruje zakresu całościowego';
      if (!/typecheck, lint, test/.test(p)) return 'suma checks nie trafiła do bramki końcowej';
      if (!/ZAKAZ COFANIA/.test(p)) return 'bramka końcowa bez zakazu cofania';
      return null;
    },
  },

  // ── schematy ──────────────────────────────────────────────────────────────────
  {
    name: 'impl-schema-has-no-self-grading-field',
    run() {
      const props = Object.keys(c.IMPL_SCHEMA.properties);
      const grading = props.filter((k) => /^(verdict|status|passed|success|ok|compliant|quality|score|approved)$/.test(k));
      if (grading.length) return 'schema implementera ocenia własną pracę: ' + grading.join(',');
      if (!props.includes('changed_files')) return 'schema implementera nie zwraca listy zmienionych plików';
      if (!c.VERDICT_SCHEMA.properties.verdict) return 'schema weryfikatora bez pola verdict';
      if (!c.CHECKS_SCHEMA.properties.newTestBlocks) return 'schema sondy bez pomiaru przyrostu';
      return null;
    },
  },
];

// ── bieg ─────────────────────────────────────────────────────────────────────────
(async () => {
  const core = (await import('file://' + CORE)).default;
  const cases = CASES(core);
  let failed = 0;

  for (const t of cases) {
    let err;
    try { err = t.run(); } catch (e) { err = 'wyjątek: ' + e.message; }
    if (err) { failed++; process.stdout.write(`  ❌ ${t.name} — ${err}\n`); }
    else process.stdout.write(`  ✅ ${t.name}\n`);
  }

  // Bramka regresji kształtu: kanoniczny skrypt MUSI przechodzić workflow-lint bez naruszeń.
  // Ten sam plik jest fixture'em w tests/flow-evals/workflow-lint/run.js — tutaj sprawdzamy
  // go przez realne CLI, żeby złapać też awarię samego narzędzia, nie tylko funkcji lint().
  const lint = spawnSync('node', [path.join(REPO, 'hooks', 'workflow-lint.js'), TEMPLATE], { encoding: 'utf8' });
  // „LINT OK" pojawia się także z licznikiem ostrzeżeń („LINT OK (1 warn)") — kanoniczny
  // skrypt ma być czysty, więc wymagamy braku znaczników WARN/ERROR w wyjściu.
  const clean = lint.status === 0 && /LINT OK/.test(lint.stdout) && !/\[WL\d+\]/.test(lint.stdout);
  if (clean) process.stdout.write('  ✅ canonical-script-passes-workflow-lint\n');
  else { failed++; process.stdout.write(`  ❌ canonical-script-passes-workflow-lint — ${(lint.stdout + lint.stderr).trim()}\n`); }

  const total = cases.length + 1;
  process.stdout.write(`\n${total - failed}/${total} passed\n`);
  process.exit(failed ? 1 : 0);
})();
