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
const fs = require('fs');
const os = require('os');
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
      // ORC-097: bramka końcowa dziedziczy model sesji TYLKO dla tasków wrażliwych na bezpieczeństwo
      // albo po jawnym final_gate.model: inherit; domyślnie Sonnet (szczegóły: eval final-gate-model-*).
      if (Object.keys(c.modelFor('final', { task: { securitySensitive: true } })).length !== 0) return 'task z threat_model: bramka końcowa ma override zamiast dziedziczyć model sesji';
      if (c.modelFor('final').model !== 'sonnet') return 'domyślna bramka końcowa powinna iść na sonnecie';
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
      // ORC-070 reinforcement (juz-ide-api-1 TS-SEC-112, infrastructure:guards: 3 identyczne
      // rundy GO z unverified_scope wskazującym pliki spoza dirs tej jednostki) ──────────────
      if (!/unverified_scope.*wyłącznie pliki z TWOJEGO WŁASNEGO zakresu/is.test(p)) {
        return 'brak przypomnienia, że unverified_scope to tylko własny zakres warstwy (ORC-070)';
      }
      if (!/ORC-011/.test(p)) return 'przypomnienie o unverified_scope nie odwołuje się do ORC-011';
      // ORC-071: format wpisu (jedna ścieżka, bez prozy) — juz-ide-api-1 TS-SEC-112,
      // infrastructure:shared-infra: goła nazwa pliku w nawiasie nie dopasowała się do filtra.
      if (!/FORMAT:.*jedna ścieżka/is.test(p)) return 'brak twardej instrukcji formatu unverified_scope (ORC-071)';
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

  // ── GO z niezweryfikowanym zakresem nie jest czystym GO (marketing-hub TS-MH-010,
  // testing:l1-l2: GO mimo 11 czerwonych testów, weryfikator wyczerpał budżet tur) ────
  {
    name: 'verdict-go-with-unverified-scope-is-not-clean-go',
    run() {
      const retry = c.decideVerdict({ verdict: 'GO', unverified_scope: ['a.spec.ts', 'b.spec.ts'] }, 1, 3);
      // ORC-074: GO+unverified_scope konsumuje próbę, ale przez 'reverify' (świeży budżet
      // TYLKO dla weryfikatora), nie 'fix' (który wraca do implementera na nic-do-naprawienia).
      if (retry.next !== 'reverify') return 'GO z unverified_scope powinien iść w reverify (nie fix, nie czysty GO)';
      if (!/a\.spec\.ts/.test(retry.reason) || !/b\.spec\.ts/.test(retry.reason)) return 'reason nie wymienia niezweryfikowanych ścieżek';
      const exhausted = c.decideVerdict({ verdict: 'GO', unverified_scope: ['a.spec.ts'] }, 3, 3);
      if (exhausted.next !== 'escalate') return 'GO z unverified_scope po wyczerpaniu prób powinien eskalować, nie przejść czysto';
      const clean = c.decideVerdict({ verdict: 'GO', unverified_scope: [] }, 1, 3);
      if (clean.next !== 'go') return 'pusta tablica unverified_scope nie powinna blokować czystego GO';
      return null;
    },
  },

  // ── ORC-070: unverified_scope, który leży wyłącznie w dirs INNEJ warstwy tego samego
  // przebiegu, nie jest luką TEJ warstwy (grant-flow TS-RATE-003, domain:domain: 2/3 pozycji
  // to domain/repositories/ i error-mapper wiring, należące do application/
  // infrastructure-persistence — diagnostyka po fakcie potwierdziła tę warstwę za kompletną) ──
  {
    name: 'verdict-unverified-scope-filters-other-layers-own-scope',
    run() {
      const allLayers = ARGS.layers;
      // pozycja jednoznacznie należąca do warstwy domain — odfiltrowana, GO przechodzi czysto
      const foreign = c.decideVerdict(
        { verdict: 'GO', unverified_scope: ['src/domain/aggregate.ts'] }, 1, 3, L.infrastructure, allLayers,
      );
      if (foreign.next !== 'go') return 'pozycja z dirs innej warstwy powinna zostać odfiltrowana (GO czysty)';
      // pozycja spoza dirs KAŻDEJ warstwy — nieznana, liczona konserwatywnie jako realna luka
      // (ORC-074: GO+unverified_scope idzie w 'reverify', nie 'fix' — patrz test dedykowany)
      const unknown = c.decideVerdict(
        { verdict: 'GO', unverified_scope: ['src/other/random.ts'] }, 1, 3, L.infrastructure, allLayers,
      );
      if (unknown.next !== 'reverify') return 'ścieżka nieprzypisana do żadnej warstwy powinna nadal blokować czysty GO';
      // wolny tekst bez separatora ścieżki — bez zmian, liczony konserwatywnie
      const freeform = c.decideVerdict(
        { verdict: 'GO', unverified_scope: ['pełny re-walk reguł'] }, 1, 3, L.infrastructure, allLayers,
      );
      if (freeform.next !== 'reverify') return 'wolny tekst bez ścieżki nie powinien być cicho odfiltrowany';
      // mieszanka: jedna cudza, jedna własna — własna wystarcza, by zablokować czysty GO
      const mixed = c.decideVerdict(
        { verdict: 'GO', unverified_scope: ['src/domain/aggregate.ts', 'src/infrastructure/repo.ts'] }, 1, 3, L.infrastructure, allLayers,
      );
      if (mixed.next !== 'reverify' || !/src\/infrastructure\/repo\.ts/.test(mixed.reason) || /src\/domain\/aggregate\.ts/.test(mixed.reason)) {
        return 'mieszanka cudza+własna: reason powinien wymieniać tylko własną pozycję';
      }
      // bez `layer` (stare wywołanie) — brak filtra, zachowanie sprzed ORC-070
      const noLayer = c.decideVerdict({ verdict: 'GO', unverified_scope: ['src/domain/aggregate.ts'] }, 1, 3);
      if (noLayer.next !== 'reverify') return 'wywołanie bez layer powinno zachować stare zachowanie (brak filtra)';
      return null;
    },
  },

  // ── ORC-071: weryfikator pisze PROZĄ zamiast czystej ścieżki (juz-ide-api-1 TS-SEC-112,
  // infrastructure:shared-infra: "guards unit files (reputation-threshold.guard.ts, ...) —
  // poza zakresem tej jednostki (shared-infra)" — gołe nazwy plików w nawiasie nie dopasowują
  // się do dirs innej warstwy, więc filtr ścieżkowy ORC-070 sam nie wystarczał) ──────────────
  {
    name: 'verdict-unverified-scope-self-admission',
    run() {
      const allLayers = ARGS.layers;
      const prose = c.decideVerdict(
        { verdict: 'GO', unverified_scope: [
          'guards unit files (reputation-threshold.guard.ts, residence-verification.guard.ts) — poza zakresem tej jednostki (shared-infra)',
        ] }, 1, 3, L.infrastructure, allLayers,
      );
      if (prose.next !== 'go') return 'samo-przyznanie "poza zakresem" w prozie powinno odfiltrować pozycję (GO czysty)';
      const proseEn = c.decideVerdict(
        { verdict: 'GO', unverified_scope: ['helper.ts is out of scope for this unit'] }, 1, 3, L.infrastructure, allLayers,
      );
      if (proseEn.next !== 'go') return 'wariant angielski "out of scope" powinien też zostać odfiltrowany';
      // grant-flow TS-RATE-003, infrastructure:infrastructure-persistence (3. wystąpienie) —
      // "owned by domain unit", nie tylko "owned by another/a different"
      const ownedByNamed = c.decideVerdict(
        { verdict: 'GO', unverified_scope: ['VO files owned by domain unit'] }, 1, 3, L.infrastructure, allLayers,
      );
      if (ownedByNamed.next !== 'go') return '"owned by <nazwa> unit" powinno też zostać odfiltrowane';
      // wolny tekst BEZ samo-przyznania nadal blokuje — nie odfiltrowujemy na wyrost
      // (ORC-074: GO+unverified_scope idzie w 'reverify', nie 'fix')
      const stillBlocks = c.decideVerdict(
        { verdict: 'GO', unverified_scope: ['nie zdążyłem sprawdzić helper.ts'] }, 1, 3, L.infrastructure, allLayers,
      );
      if (stillBlocks.next !== 'reverify') return 'tekst bez frazy "poza zakresem" nie powinien być odfiltrowany';
      return null;
    },
  },

  // ── ORC-076: final gate (jednorazowy, bez retry — NIE woła decideVerdict()) dostaje ten sam
  // filtr self-admission co warstwy, zamiast osobnej, dużo bardziej naiwnej kopii reguły
  // (juz-ide-mobile-app DESIGN-SYSTEM-009: 7 plików niezmienionych sprawdzonych grepem + 8
  // plików testowych celowo pominiętych jako niewysyłane w release — GO z self-admission
  // wymuszał NO_GO na jednorazowej bramce, bez możliwości naprawy) ──────────────────────────
  {
    name: 'final-gate-unverified-scope-self-admission',
    run() {
      const filtered = c.filterSelfAdmittedOutOfScope([
        '7 plików niezmienionych sprawdzonych tylko grepem — poza zakresem tej bramki',
        'test/canvas_d_test.dart is out of scope for this release binary',
        'src/real/gap.ts',
      ]);
      if (filtered.length !== 1 || filtered[0] !== 'src/real/gap.ts') {
        return 'filterSelfAdmittedOutOfScope nie odfiltrował self-admission albo usunął realną lukę: ' + JSON.stringify(filtered);
      }
      return null;
    },
  },

  // ── ORC-079: plik analizy/task tego przebiegu wymieniony w unverified_scope BEZ frazy
  // self-admission (ai-os-bot BOT-005a-tests, 2026-09-29: "plik analizy" nie zawierał żadnej
  // frazy z SELF_ADMITS_OUT_OF_SCOPE, więc ORC-076 go nie złapał) — filtr po ścieżce, nie prozie ─
  {
    name: 'final-gate-filters-own-task-artifacts-by-path',
    run() {
      const task = { analysisFile: 'project-orchestration/analysis/TS-FIX-001.analysis.md', taskFile: 'project-orchestration/tasks/TS-FIX-001.md' };
      const filtered = c.filterOwnTaskArtifacts([
        'project-orchestration/analysis/TS-FIX-001.analysis.md — sam plik analizy',
        'plik taska: project-orchestration/tasks/TS-FIX-001.md',
        'src/real/gap.ts',
      ], task);
      if (filtered.length !== 1 || filtered[0] !== 'src/real/gap.ts') {
        return 'filterOwnTaskArtifacts nie odfiltrował pliku analizy/taska albo usunął realną lukę: ' + JSON.stringify(filtered);
      }
      // task bez analysisFile/taskFile (pola null) nie powinien wywalić się ani nic zjeść
      const noTask = c.filterOwnTaskArtifacts(['src/real/gap.ts'], { analysisFile: null, taskFile: null });
      if (noTask.length !== 1) return 'task bez analysisFile/taskFile nie powinien zmieniać listy';
      return null;
    },
  },

  // ── ORC-080: weryfikator (LLM) nie trzyma się jawnej decyzji człowieka w decisions[]
  // (ai-os-bot BOT-005a-tests, 2026-09-29: D7 jawnie adjudykowało pozycję, final gate i tak
  // zgłosił ją jako unverified) — filtr mechaniczny po id decyzji, nie ufanie że LLM
  // "zastosował" tekst promptu (ta sama lekcja co ORC-071) ────────────────────────────────
  {
    name: 'final-gate-filters-items-adjudicated-by-decision-id',
    run() {
      const decisions = [{ id: 'D7', topic: 'zakres testów dat', choice: 'poza zakresem tej bramki' }];
      const filtered = c.filterAdjudicatedByDecision([
        'D7: treść testów dat pominięta zgodnie z decyzją',
        'zobacz D7 dla uzasadnienia',
        'src/real/gap.ts',
      ], decisions);
      if (filtered.length !== 1 || filtered[0] !== 'src/real/gap.ts') {
        return 'filterAdjudicatedByDecision nie odfiltrował pozycji z id decyzji albo usunął realną lukę: ' + JSON.stringify(filtered);
      }
      // "D71" nie powinno dopasować "D7" (granica słowa, nie samo startsWith)
      const noFalseMatch = c.filterAdjudicatedByDecision(['plik D71-legacy.ts do przeglądu'], decisions);
      if (noFalseMatch.length !== 1) return 'filterAdjudicatedByDecision dopasował "D71" do id "D7" (fałszywe trafienie)';
      const noDecisions = c.filterAdjudicatedByDecision(['src/real/gap.ts'], []);
      if (noDecisions.length !== 1) return 'brak decisions[] nie powinien zmieniać listy';
      return null;
    },
  },

  // ── ORC-082: typecheck czerwony tylko w późniejszych warstwach jest odroczony ──────────
  {
    name: 'typecheck-red-only-in-later-layers-is-deferred',
    run() {
      const layers = [{ id: 'domain', dirs: ['domain/'] }, { id: 'application', dirs: ['application/'] }, { id: 'infrastructure', dirs: ['infrastructure/'] }, { id: 'testing', dirs: ['__tests__/'] }];
      const red = (tail) => ({ typecheck: 'fail', tests: 'skipped', tail });
      const infra = "src/contexts/x/infrastructure/repo.ts(12,3): error TS2420: Class incorrectly implements interface.";
      const own = "src/contexts/x/domain/agg.ts(5,1): error TS2322: Type mismatch.";
      const app = "src/contexts/x/application/h.ts(9,2): error TS2554: Expected 10 arguments.";
      if (!c.typecheckRedIsLaterLayers(red(infra), layers[0], layers)) return 'czerwień tylko w infrastructure nie została odroczona dla domain';
      if (!c.typecheckRedIsLaterLayers(red(app + '\n' + infra), layers[0], layers)) return 'czerwień w application+infrastructure nie została odroczona dla domain';
      if (c.typecheckRedIsLaterLayers(red(own + '\n' + infra), layers[0], layers)) return 'błąd we WŁASNYM zakresie został odroczony';
      if (c.typecheckRedIsLaterLayers(red(app), layers[2], layers)) return 'błąd w WCZEŚNIEJSZEJ warstwie został odroczony';
      if (c.typecheckRedIsLaterLayers(red(infra), layers[3], layers)) return 'ostatnia warstwa nie może odraczać';
      if (c.typecheckRedIsLaterLayers(red(infra + '\nerror TS18003: No inputs were found in config file'), layers[0], layers)) return 'błąd bez ścieżki został odroczony';
      if (c.typecheckRedIsLaterLayers(red('coś nieparsowalnego'), layers[0], layers)) return 'nieparsowalny ogon został odroczony';
      if (c.typecheckRedIsLaterLayers({ typecheck: 'fail', tests: 'fail', tail: infra }, layers[0], layers)) return 'czerwone testy nie mogą być odroczone';
      // uzupełnienie ORC-082: sparafrazowany `tail` + surowe `tsErrors` → odroczone
      const paraphrase = { typecheck: 'fail', tests: 'skipped', tail: 'Missing method foo in infrastructure implementation', tsErrors: infra };
      if (!c.typecheckRedIsLaterLayers(paraphrase, layers[0], layers)) return 'surowe tsErrors nie zostały użyte mimo sparafrazowanego tail';
      if (c.typecheckRedIsLaterLayers({ typecheck: 'fail', tests: 'skipped', tail: 'Missing method foo in infrastructure implementation' }, layers[0], layers)) return 'sparafrazowany tail bez tsErrors został odroczony';
      return null;
    },
  },
  {
    name: 'probe-prompt-requests-verbatim-ts-errors',
    run() {
      const p = c.buildProbePrompt(ARGS, { id: 'domain', dirs: ['domain/'], checks: ['typecheck'] });
      if (!/tsErrors/.test(p) || !/error TS\[0-9\]\+/.test(p)) return 'prompt sondy nie żąda surowych linii błędów TS w tsErrors';
      if (!/DOSŁOWNIE/.test(p)) return 'brak żądania dosłowności';
      return null;
    },
  },

  // ── ORC-083: cause code vs machine ─────────────────────────────────────────────────────
  {
    name: 'decide-verdict-tags-cause-code-vs-machine',
    run() {
      const exhausted = c.decideVerdict({ verdict: 'NO_GO', violations: ['x'] }, 3, 3);
      if (exhausted.next !== 'escalate' || exhausted.cause !== 'code') return 'wyczerpane NO_GO powinno mieć cause=code: ' + JSON.stringify(exhausted);
      const unver = c.decideVerdict({ verdict: 'GO', unverified_scope: ['src/a/b.ts'] }, 3, 3);
      if (unver.next !== 'escalate' || unver.cause !== 'machine') return 'GO z unverified_scope po próbach powinno mieć cause=machine: ' + JSON.stringify(unver);
      const silent = c.decideVerdict(null, 1, 3);
      if (silent.next !== 'silent' || silent.cause !== 'machine') return 'brak wyniku powinien mieć cause=machine: ' + JSON.stringify(silent);
      return null;
    },
  },

  // ── ORC-084: GO_WITH_GAPS ──────────────────────────────────────────────────────────────
  {
    name: 'layer-gaps-acceptable-requires-green-probe-and-zero-violations',
    run() {
      const layer = { id: 'web', dirs: ['apps/web/'] };
      const go = { verdict: 'GO', unverified_scope: ['apps/web/src/AuthGate.tsx'] };
      const dec = c.decideVerdict(go, 3, 3, layer, [layer]);
      if (dec.next !== 'escalate' || !dec.gaps || dec.gaps[0] !== 'apps/web/src/AuthGate.tsx') return 'decideVerdict nie zwrócił gaps: ' + JSON.stringify(dec);
      const green = { typecheck: 'pass', tests: 'skipped' };
      if (c.layerGapsAcceptable(dec, go, { typecheck: 'skipped', tests: 'skipped' })) return 'ślepa sonda (wszystko skipped) nie może przejść jako GO_WITH_GAPS (ORC-085)';
      if (!c.layerGapsAcceptable(dec, go, green)) return 'zielona sonda + zero naruszeń powinno przejść jako GO_WITH_GAPS';
      if (c.layerGapsAcceptable(dec, go, { typecheck: 'fail', tests: 'pass' })) return 'czerwony typecheck nie może przejść';
      if (c.layerGapsAcceptable(dec, go, { typecheck: 'pass', tests: 'fail' })) return 'czerwone testy nie mogą przejść';
      if (c.layerGapsAcceptable(dec, go, null)) return 'brak wyniku sondy nie może przejść';
      if (c.layerGapsAcceptable(dec, { verdict: 'GO', violations: ['x'], unverified_scope: ['a/b.ts'] }, green)) return 'naruszenia blokują GO_WITH_GAPS';
      if (c.haltsRun('GO_WITH_GAPS')) return 'GO_WITH_GAPS zatrzymuje przebieg';
      return null;
    },
  },
  // ── ORC-098b: dirs będące plikami i remisy późniejszych warstw ─────────────────────────
  {
    name: 'owner-layer-file-dirs-win-over-directories',
    run() {
      const flat = { id: 'flat', dirs: ['src/'] };
      const unit = { id: 'unit', dirs: ['src/'], scope: { dirs: ['src/wikiIndexer.ts'] } };
      const owner = c.ownerLayerOf('src/wikiIndexer.ts', [flat, unit]);
      if (!owner || owner.id !== 'unit') return 'plik w scope.dirs jednostki powinien wygrać z katalogiem src/: ' + JSON.stringify(owner && owner.id);
      const rel = c.ownerLayerOf('src/wikiIndexer.ts', [flat, { id: 'u', dirs: [], scope: { dirs: ['apps/api/src/wikiIndexer.ts'] } }]);
      if (!rel || rel.id !== 'u') return 'ścieżka względna pakietu z tsc powinna trafić we wpis-plik z prefiksem monorepo';
      if (c.ownerLayerOf('src/other.ts', [{ id: 'x', dirs: [], scope: { dirs: ['src/wikiIndexer.ts'] } }])) return 'inny plik nie może dopasować się do wpisu-pliku';
      return null;
    },
  },
  {
    name: 'typecheck-red-deferred-when-tie-is-only-later-layers',
    run() {
      const cur = { id: 'u4', dirs: ['src/a/'] };
      const u5a = { id: 'u5a', dirs: ['src/wikiIndexer.ts'] };
      const u5b = { id: 'u5b', dirs: ['src/wikiIndexer.ts'] };
      const layers = [cur, u5a, u5b];
      const red = (p) => ({ typecheck: 'fail', tests: 'pass', lint: 'pass', tsErrors: p + "(3,1): error TS2322: x" });
      if (!c.typecheckRedIsLaterLayers(red('src/wikiIndexer.ts'), cur, layers)) return 'remis samych późniejszych warstw powinien odraczać czerwień';
      const withCur = [{ id: 'u4', dirs: ['src/wikiIndexer.ts'] }, u5a, u5b];
      if (c.typecheckRedIsLaterLayers(red('src/wikiIndexer.ts'), withCur[0], withCur)) return 'remis z udziałem bieżącej warstwy nie może odraczać';
      return null;
    },
  },
  // ── ORC-101: drobne poprawki z analizy bez właściciela warstwy ──────────────────────────
  {
    name: 'orphan-minor-fixes-are-those-outside-every-layer-scope',
    run() {
      const layers = [{ id: 'domain', dirs: ['src/domain/'] }, { id: 'infra', dirs: ['src/infrastructure/'] }];
      const fixes = [
        'src/domain/order.ts — nit — zmień nazwę',
        'docs/architecture/architecture.md — opis — dopisz pin',
        'project-orchestration/KANBAN.md — wpis — dodaj TS-X-1',
        '`CLAUDE.md` — data — odśwież',
        'ogólna uwaga bez ścieżki',
        'plik ze spacją.md w nazwie — x — y',
      ];
      const orphans = c.orphanMinorFixes(fixes, layers);
      const want = ['docs/architecture/architecture.md — opis — dopisz pin', 'project-orchestration/KANBAN.md — wpis — dodaj TS-X-1', '`CLAUDE.md` — data — odśwież'];
      if (JSON.stringify(orphans) !== JSON.stringify(want)) return 'sieroty: ' + JSON.stringify(orphans);
      if (c.orphanMinorFixes(fixes, [{ id: 'all', dirs: [] }]).length) return 'bez warstw z dirs nie ma jak wskazać sierot (zachowanie sprzed zmiany)';
      if (c.orphanMinorFixes(undefined, layers).length) return 'brak minor_fixes = brak sierot';
      return null;
    },
  },
  // ── ORC-103: odcisk drzewa po rundzie naprawczej, niestabilne testy, właściciel czerwieni ────
  {
    name: 'fix-claim-without-tree-change-is-detected-only-when-both-fingerprints-known',
    run() {
      const fp = 'a'.repeat(40);
      if (!c.fixLeftTreeUnchanged(fp, fp)) return 'identyczne odciski = drzewo bez zmian';
      if (c.fixLeftTreeUnchanged(fp, 'b'.repeat(40))) return 'różne odciski = zmiana';
      if (c.fixLeftTreeUnchanged(null, fp) || c.fixLeftTreeUnchanged(fp, null) || c.fixLeftTreeUnchanged(null, null)) return 'brak odpowiedzi sondy to „nie wiadomo", nie „bez zmian"';
      if (!/git diff --name-only -z abc123;.*sha1sum.*git status --porcelain/.test(c.treeFingerprintCmd('abc123'))) return 'komenda odcisku: ' + c.treeFingerprintCmd('abc123');
      if (!/git diff --name-only -z HEAD;/.test(c.treeFingerprintCmd(undefined))) return 'bez bazy odcisk względem HEAD';
      return null;
    },
  },
  {
    name: 'tests-flaky-under-load-needs-isolated-rerun-and-complete-file-list',
    run() {
      const base = { typecheck: 'pass', tests: 'fail', lint: 'pass', testFailFiles: ' FAIL  src/shared/a.test.ts > x\n FAIL  src/shared/b.test.ts > y', testFilesFailed: 2, testsRerunPassed: true };
      if (!c.testsFlakyUnderLoad(base)) return 'komplet plików + zielony ponowny bieg = niestabilne';
      if (c.testsFlakyUnderLoad(Object.assign({}, base, { testsRerunPassed: false }))) return 'ponowny bieg czerwony = prawdziwa czerwień';
      if (c.testsFlakyUnderLoad(Object.assign({}, base, { testsRerunPassed: undefined }))) return 'brak ponownego biegu = bez łagodzenia';
      if (c.testsFlakyUnderLoad(Object.assign({}, base, { testFilesFailed: 3 }))) return 'niepełna lista plików = nie wiadomo, co jeszcze padło';
      if (c.testsFlakyUnderLoad(Object.assign({}, base, { typecheck: 'fail' }))) return 'czerwony typecheck nie jest „niestabilnym testem"';
      if (c.testsFlakyUnderLoad(Object.assign({}, base, { tests: 'pass' }))) return 'zielone testy nie wymagają łagodzenia';
      return null;
    },
  },
  {
    name: 'blocked-by-prior-names-earlier-owner-layer-and-layers-done-hint',
    run() {
      const layers = [{ id: 'implementation', dirs: ['src/'] }, { id: 'testing', dirs: ['src/__tests__/'] }];
      const probe = { typecheck: 'pass', tests: 'fail', testFailFiles: ' FAIL  src/mcp/guards.test.ts > x', testFilesFailed: 1 };
      const owners = c.earlierRedOwners(probe, layers[1], layers);
      if (JSON.stringify(owners) !== JSON.stringify(['implementation'])) return 'właściciel: ' + JSON.stringify(owners);
      const b = c.blockedByPrior(layers[1], 'czerwono', 'nic do zrobienia', owners);
      if (!b || b.status !== 'BLOCKED_BY_PRIOR' || !/implementation/.test(b.reason) || !/layers_done/.test(b.reason)) return 'komunikat: ' + (b && b.reason);
      const plain = c.blockedByPrior(layers[1], 'czerwono', 'nic do zrobienia', []);
      if (/layers_done/.test(plain.reason)) return 'bez wcześniejszego właściciela nie ma podpowiedzi o layers_done';
      if (c.blockedByPrior(layers[1], null, 'x', owners) !== null) return 'zielona sonda = brak blokady';
      return null;
    },
  },
  {
    name: 'earlier-red-owners-ignores-own-and-later-layers',
    run() {
      const layers = [{ id: 'domain', dirs: ['src/domain/'] }, { id: 'infra', dirs: ['src/infra/'] }, { id: 'testing', dirs: ['src/__tests__/'] }];
      const own = { tests: 'fail', testFailFiles: ' FAIL  src/infra/x.test.ts', testFilesFailed: 1 };
      if (c.earlierRedOwners(own, layers[1], layers).length) return 'własny plik nie jest cudzym właścicielem';
      const later = { tests: 'fail', testFailFiles: ' FAIL  src/__tests__/x.test.ts', testFilesFailed: 1 };
      if (c.earlierRedOwners(later, layers[1], layers).length) return 'późniejsza warstwa nie jest wcześniejszym właścicielem';
      if (c.earlierRedOwners(null, layers[2], layers).length) return 'brak sondy = brak właściciela';
      const ts = { typecheck: 'fail', tsErrors: 'src/domain/o.ts(3,1): error TS2322: x' };
      if (JSON.stringify(c.earlierRedOwners(ts, layers[2], layers)) !== JSON.stringify(['domain'])) return 'błąd TS w domain';
      return null;
    },
  },
  // ── ORC-104: własność luki po specyficzności, sonda z korzenia repo ──────────────────────
  {
    name: 'unverified-test-files-owned-by-more-specific-layer-are-not-own-gap',
    run() {
      const obs = { id: 'infrastructure:obs-guardian', dirs: ['src/ctx/infrastructure/queues/', 'src/shared/infrastructure/queues/services/__tests__/'] };
      const repro = { id: 'testing:repro-test', dirs: ['src/ctx/infrastructure/queues/__tests__/'] };
      const all = [repro, obs];
      const cudze = 'src/ctx/infrastructure/queues/__tests__/processor.spec.ts';
      const wlasne = 'src/shared/infrastructure/queues/services/__tests__/fan-out.spec.ts';
      const d1 = c.decideVerdict({ verdict: 'GO', unverified_scope: [cudze] }, 1, 3, obs, all);
      if (d1.next !== 'go') return 'spec z dirs dłuższej jednostki testing to cudza robota: ' + JSON.stringify(d1);
      const d2 = c.decideVerdict({ verdict: 'GO', unverified_scope: [cudze, wlasne] }, 1, 3, obs, all);
      if (d2.next !== 'reverify' || d2.gaps.length !== 1 || d2.gaps[0] !== wlasne) return 'własny spec zostaje luką: ' + JSON.stringify(d2);
      const d3 = c.decideVerdict({ verdict: 'GO', unverified_scope: [cudze] }, 1, 3, repro, all);
      if (d3.next !== 'reverify') return 'właściciel nadal ma lukę: ' + JSON.stringify(d3);
      return null;
    },
  },
  {
    name: 'probe-command-anchors-to-repo-root-before-package-lookup',
    run() {
      const p = c.buildProbePrompt(ARGS, { id: 'infrastructure', dirs: ['src/infrastructure/'], checks: ['typecheck'] });
      const i = p.indexOf('git rev-parse --show-toplevel');
      if (i === -1) return 'brak kotwicy korzenia repo w poleceniu sondy';
      if (i > p.indexOf('_pkgdir()')) return 'kotwica musi poprzedzać wyszukiwanie package.json';
      return null;
    },
  },
  // ── ORC-100: te same luki po powtórnej weryfikacji nie palą kolejnych prób ───────────────
  {
    name: 'repeated-identical-gaps-settle-as-go-with-gaps-without-more-attempts',
    run() {
      const go = { verdict: 'GO', violations: [], unverified_scope: ['a/x.ts', 'a/y.ts'] };
      const dec = c.decideVerdict(go, 2, 3);
      if (dec.next !== 'reverify' || !Array.isArray(dec.gaps) || dec.gaps.length !== 2) return 'reverify powinien nieść gaps: ' + JSON.stringify(dec);
      const green = { typecheck: 'pass', tests: 'pass' };
      if (!c.repeatedGapsAcceptable(['a/y.ts', 'a/x.ts'], dec, go, green)) return 'ten sam zbiór luk (inna kolejność) + zielona sonda powinien zamknąć warstwę';
      if (c.repeatedGapsAcceptable(null, dec, go, green)) return 'pierwsza runda (brak poprzednich luk) nie może zamykać';
      if (c.repeatedGapsAcceptable(['a/x.ts'], dec, go, green)) return 'inny zbiór luk nie może zamykać';
      if (c.repeatedGapsAcceptable(['a/x.ts', 'a/z.ts'], dec, go, green)) return 'częściowo inny zbiór nie może zamykać';
      if (c.repeatedGapsAcceptable(['a/x.ts', 'a/y.ts'], dec, go, { typecheck: 'skipped', tests: 'skipped' })) return 'ślepa sonda nie jest dowodem';
      if (c.repeatedGapsAcceptable(['a/x.ts', 'a/y.ts'], dec, go, { typecheck: 'fail', tests: 'pass' })) return 'czerwona sonda blokuje';
      if (c.repeatedGapsAcceptable(['a/x.ts', 'a/y.ts'], dec, { verdict: 'GO', violations: ['v'] }, green)) return 'naruszenia blokują';
      return null;
    },
  },
  // ── ORC-099: odroczenie czerwonych testów do późniejszych warstw ────────────────────────
  {
    name: 'tests-red-deferred-only-when-all-failing-files-belong-to-later-layers',
    run() {
      const cur = { id: 'config', dirs: ['src/config/'] };
      const later = { id: 'registry', dirs: ['src/registry/'] };
      const layers = [cur, later];
      const mk = (files, n, extra) => Object.assign({
        typecheck: 'pass', tests: 'fail', lint: 'pass',
        testFailFiles: files.map((f) => ' FAIL  ' + f + ' > suite > case').join('\n'), testFilesFailed: n,
      }, extra || {});
      if (!c.testsRedIsLaterLayers(mk(['src/registry/a.test.ts', 'src/registry/b.test.ts'], 2), cur, layers)) return 'testy padające tylko w późniejszej warstwie powinny być odroczone';
      if (c.testsRedIsLaterLayers(mk(['src/registry/a.test.ts', 'src/config/c.test.ts'], 2), cur, layers)) return 'padający plik we WŁASNEJ warstwie blokuje odroczenie';
      if (c.testsRedIsLaterLayers(mk(['src/registry/a.test.ts'], 2), cur, layers)) return 'lista niepełna (1 z 2 plików) nie może odraczać';
      if (c.testsRedIsLaterLayers(mk(['src/registry/a.test.ts'], undefined), cur, layers)) return 'brak podsumowania runnera nie może odraczać';
      if (c.testsRedIsLaterLayers(mk(['src/registry/a.test.ts'], 1, { typecheck: 'fail' }), cur, layers)) return 'czerwony typecheck blokuje odroczenie testów';
      if (c.testsRedIsLaterLayers(mk(['src/registry/a.test.ts'], 1), later, layers)) return 'ostatnia warstwa nie może odraczać';
      if (c.testsRedIsLaterLayers(mk(['src/elsewhere/x.test.ts'], 1), cur, layers)) return 'plik bez właściciela nie może odraczać';
      return null;
    },
  },
  // ── ORC-098: bramka końcowa — GO z lukami zamiast NO_GO z samego unverified_scope ──────
  {
    name: 'final-gate-gaps-acceptable-needs-green-engine-probe-and-zero-violations',
    run() {
      const gate = { verdict: 'GO', violations: [] };
      const gaps = ['kopie u konsumentów'];
      const green = { typecheck: 'pass', tests: 'pass', lint: 'pass' };
      if (!c.finalGapsAcceptable(gate, gaps, green)) return 'zielona sonda + zero naruszeń + luki powinno przejść jako GO z lukami';
      if (c.finalGapsAcceptable(gate, gaps, null)) return 'brak wyniku sondy nie może obniżać NO_GO';
      if (c.finalGapsAcceptable(gate, gaps, { typecheck: 'skipped', tests: 'skipped' })) return 'ślepa sonda (wszystko skipped) nie jest dowodem';
      if (c.finalGapsAcceptable(gate, gaps, { typecheck: 'pass', tests: 'pass', lint: 'fail' })) return 'czerwony lint nie może przejść';
      if (c.finalGapsAcceptable(gate, gaps, { typecheck: 'pass', tests: 'fail' })) return 'czerwone testy nie mogą przejść';
      if (c.finalGapsAcceptable({ verdict: 'GO', violations: ['a.ts:1 — reguła — x'] }, gaps, green)) return 'własne naruszenia blokują obniżenie';
      if (c.finalGapsAcceptable({ verdict: 'NO_GO', violations: [] }, gaps, green)) return 'NO_GO bramki nie jest GO z lukami';
      if (c.finalGapsAcceptable(gate, [], green)) return 'bez luk nie ma czego obniżać (czyste GO idzie zwykłą ścieżką)';
      return null;
    },
  },
  {
    name: 'final-gate-prompt-passes-probe-facts-and-forbids-rerun',
    run() {
      const probe = { typecheck: 'pass', tests: 'pass', lint: 'pass' };
      const withProbe = c.buildFinalGatePrompt(ARGS, ['typecheck', 'test'], ['a.ts'], 'tree', [], probe);
      if (!/FAKTY Z SONDY/.test(withProbe) || !/checks\.typecheck: pass/.test(withProbe)) return 'prompt bramki nie niesie faktów z sondy';
      if (!/NIE uruchamiaj ich ponownie/.test(withProbe)) return 'brak zakazu ponownego uruchamiania checks';
      if (!/unverified_scope/.test(withProbe)) return 'brak wskazówki, że niesprawdzalne rzeczy idą do unverified_scope';
      const without = c.buildFinalGatePrompt(ARGS, ['typecheck', 'test'], ['a.ts'], 'tree', [], null);
      if (/FAKTY Z SONDY/.test(without) || !/Deterministyczne bramki do wykonania/.test(without)) return 'bez sondy zostaje stara instrukcja (uruchom sam)';
      return null;
    },
  },
  {
    name: 'final-gate-absorbs-known-layer-gaps',
    run() {
      const known = [{ layer: 'web', items: ['apps/web/src/AuthGate.tsx'] }];
      const r = c.filterKnownLayerGaps(['apps/web/src/AuthGate.tsx', 'src/real/new-gap.ts'], known);
      if (r.kept.length !== 1 || r.kept[0] !== 'src/real/new-gap.ts') return 'nowa luka powinna zostać: ' + JSON.stringify(r);
      if (r.absorbed.length !== 1) return 'znana luka powinna być wchłonięta: ' + JSON.stringify(r);
      const none = c.filterKnownLayerGaps(['x/y.ts'], []);
      if (none.kept.length !== 1 || none.absorbed.length !== 0) return 'brak znanych luk nie zmienia listy';
      return null;
    },
  },

  // ── ORC-085: sonda, budżet ──────────────────────────────────────────────────────────────
  {
    name: 'probe-prompt-falls-back-from-suffixed-script-names',
    run() {
      const layer = { id: 'web', dirs: ['apps/web/'], checks: ['typecheck:web', 'test:web'] };
      const p = c.buildProbePrompt({ task: { id: 'T' } }, layer);
      if (!p.includes('_chk() {')) return 'brak funkcji _chk w prompcie sondy';
      if (!p.includes('_chk typecheck:web') || !p.includes('_chk test:web')) return 'checks nie idą przez _chk';
      if (!p.includes('"$sfx" = "$bn"')) return 'brak osłony: sufiks odcinany tylko gdy równa się nazwie katalogu pakietu (lint:check → lint niosłoby --fix)';
      if (p.includes('npm run typecheck:web)')) return 'stare bezpośrednie (cd && npm run <check>) nadal w prompcie';
      return null;
    },
  },
  {
    name: 'scaled-budget-grows-with-files-and-explicit-wins',
    run() {
      if (c.scaledBudget({}, 'verify', 5) !== 15) return 'mała jednostka powinna mieć 15';
      if (c.scaledBudget({}, 'verify', 37) !== 42) return '37 plików → 15+27=42, jest ' + c.scaledBudget({}, 'verify', 37);
      if (c.scaledBudget({}, 'verify', 500) !== 50) return 'cap 50';
      if (c.scaledBudget({ budgets: { verify: { max_tool_calls: 20 } } }, 'verify', 37) !== 20) return 'jawny budżet musi wygrać';
      return null;
    },
  },

  // ── ORC-086: weryfikator bez wyniku przy zielonej sondzie nie zatrzymuje ─────────────────
  {
    name: 'silent-verifier-gaps-require-green-probe-and-changed-files',
    run() {
      const green = { typecheck: 'pass', tests: 'skipped' };
      if (!c.silentVerifierGapsAcceptable(green, ['a/b.ts'])) return 'zielona sonda + zmiany powinny przejść jako GO_WITH_GAPS';
      if (c.silentVerifierGapsAcceptable(green, [])) return 'brak zmian w zakresie nie może przejść';
      if (c.silentVerifierGapsAcceptable({ typecheck: 'skipped', tests: 'skipped' }, ['a/b.ts'])) return 'ślepa sonda nie może przejść';
      if (c.silentVerifierGapsAcceptable({ typecheck: 'fail', tests: 'pass' }, ['a/b.ts'])) return 'czerwona sonda nie może przejść';
      if (c.silentVerifierGapsAcceptable(null, ['a/b.ts'])) return 'brak sondy nie może przejść';
      return null;
    },
  },

  // ── ORC-087: zakaz commitów, manifesty w zakresie, sonda commitów ───────────────────────
  {
    name: 'impl-prompt-forbids-commits-and-scope-allows-dependency-manifests',
    run() {
      const impl = c.buildImplPrompt(ARGS, L.infrastructure, 1, null, 0);
      if (!/ZAKAZ COMMITOWANIA/.test(impl) || !/git commit/.test(impl)) return 'prompt implementera nie zakazuje commitów';
      const scope = c.scopeBlock(L.infrastructure, ARGS);
      if (!/manifesty zależności/.test(scope) || !/pnpm-lock\.yaml/.test(scope) || !/\.npmrc/.test(scope)) return 'scopeBlock nie dopuszcza manifestów zależności';
      return null;
    },
  },
  {
    name: 'tree-probe-asks-for-commit-count-since-base',
    run() {
      const p = c.buildTreeProbePrompt('abc123');
      if (!/rev-list --count abc123\.\.HEAD/.test(p) || !/`commits`/.test(p)) return 'sonda drzewa nie pyta o liczbę commitów od bazy';
      if (/rev-list/.test(c.buildTreeProbePrompt(null))) return 'bez bazy sonda nie powinna pytać o commity';
      return null;
    },
  },

  // ── ORC-088: checks jako komendy dosłowne (Flutter) ─────────────────────────────────────
  {
    name: 'probe-runs-literal-check-commands-without-npm',
    run() {
      const layer = { id: 'presentation', dirs: ['presentation/'], checks: ['flutter analyze', 'flutter test'] };
      const p = c.buildProbePrompt({ task: { id: 'T' } }, layer);
      if (!/^flutter analyze > \/tmp\/check-presentation-1\.log/m.test(p)) return 'komenda dosłowna nie jest uruchamiana bezpośrednio: ' + p.slice(0, 300);
      if (/npm run flutter/.test(p) || /_chk flutter/.test(p)) return 'komenda dosłowna nie może iść przez npm/_chk';
      if (!/Mapowanie wyników/.test(p)) return 'brak mapowania wyników komend dosłownych na typecheck/tests';
      const npmOnly = c.buildProbePrompt({ task: { id: 'T' } }, { id: 'web', dirs: ['apps/web/'], checks: ['typecheck'] });
      if (!/`lint`/.test(npmOnly)) return 'mapowanie wyników (z polem lint) powinno być zawsze, gdy są checks (ORC-094)';
      return null;
    },
  },

  // ── ORC-089: nazwa pliku analizy bez ścieżki też jest artefaktem przebiegu ──────────────
  {
    name: 'own-task-artifacts-filter-matches-bare-file-name',
    run() {
      const task = { analysisFile: 'docs/tasks/analysis/TS-AIG-043.analysis.md', taskFile: 'docs/tasks/TS-AIG-043.md' };
      const out = c.filterOwnTaskArtifacts([
        'TS-AIG-043.analysis.md nieprzeczytany',
        'docs/tasks/analysis/TS-AIG-043.analysis.md',
        'src/usage/real-gap.ts',
      ], task);
      if (out.length !== 1 || out[0] !== 'src/usage/real-gap.ts') return 'nazwa/ścieżka pliku analizy nie została odfiltrowana albo realna luka zniknęła: ' + JSON.stringify(out);
      const short = c.filterOwnTaskArtifacts(['a.md w tle'], { analysisFile: 'x/a.md' });
      if (short.length !== 1) return 'zbyt krótka nazwa (<6 znaków) nie może być filtrem';
      return null;
    },
  },

  // ── ORC-090: odroczenie typechecku w monorepo, pliki brudne przed startem ────────────────
  {
    name: 'typecheck-deferral-handles-package-relative-paths-in-monorepo',
    run() {
      const layers = [
        { id: 'application', dirs: ['apps/api/src/contexts/x/application/'] },
        { id: 'infrastructure', dirs: ['apps/api/src/contexts/x/infrastructure/'] },
        { id: 'testing', dirs: ['__tests__/'], scope: { dirs: ['apps/api/src/contexts/x/__tests__/unit/'] } },
      ];
      const red = (tail) => ({ typecheck: 'fail', tests: 'skipped', tsErrors: tail });
      const infra = 'src/contexts/x/infrastructure/repo.ts(12,3): error TS2420: Class incorrectly implements interface.';
      const own = 'src/contexts/x/application/h.ts(5,1): error TS2322: Type mismatch.';
      const spec = 'src/contexts/x/__tests__/integration/create.spec.ts(9,2): error TS2554: Expected 10 arguments.';
      if (!c.typecheckRedIsLaterLayers(red(infra), layers[0], layers)) return 'ścieżka względna pakietu w późniejszej warstwie (infrastructure) nie została odroczona';
      if (!c.typecheckRedIsLaterLayers(red(infra + '\n' + spec), layers[0], layers)) return 'plik poza zawężeniem, ale w pełnych dirs późniejszej warstwy (testing), nie został odroczony';
      if (c.typecheckRedIsLaterLayers(red(own + '\n' + infra), layers[0], layers)) return 'błąd we własnym zakresie (ścieżka względna) został odroczony';
      if (c.typecheckRedIsLaterLayers(red(own), layers[1], layers)) return 'błąd w WCZEŚNIEJSZEJ warstwie (ścieżka względna) został odroczony';
      return null;
    },
  },
  {
    name: 'stageable-files-exclude-dirty-at-start-unless-layer-changed-them',
    run() {
      const out = c.stageableFiles(['src/a.ts', '.claude/x.md', 'KANBAN.md', 'src/b.ts'], ['.claude/x.md', 'KANBAN.md', 'src/b.ts'], ['src/b.ts']);
      if (JSON.stringify(out) !== JSON.stringify(['src/a.ts', 'src/b.ts'])) return 'brudne przed startem pliki nie zostały wykluczone / zmienione przez warstwę zniknęły: ' + JSON.stringify(out);
      if (c.stageableFiles(['x'], undefined, undefined).length !== 1) return 'brak dirtyAtStart nie zmienia listy';
      return null;
    },
  },

  // ── ORC-091: drobne ustalenia naprawiane od razu ─────────────────────────────────────────
  {
    name: 'minor-findings-collected-grouped-and-formatted',
    run() {
      if (c.collectMinor({ minor_findings: [' a.ts:3 — nit — popraw ', '', 'b.ts'] }).length !== 2) return 'collectMinor nie odfiltrował pustych / nie przycinał';
      if (c.collectMinor(null).length !== 0 || c.collectMinor({}).length !== 0) return 'brak pola minor_findings → pusta lista';
      if (c.collectMinor({ minor_findings: Array.from({ length: 40 }, (_, i) => 'x' + i) }).length !== 25) return 'limit 25 ustaleń';
      const txt = c.formatMinorFix(['a.ts:3 — nit — popraw']);
      if (!/nie blokują/.test(txt) || !/1\. a\.ts:3/.test(txt) || !/deviation_note/.test(txt)) return 'formatMinorFix: brak instrukcji/numeracji: ' + txt;
      const layers = [{ id: 'domain', dirs: ['domain/'] }, { id: 'infrastructure', dirs: ['infrastructure/'] }];
      const g = c.groupFindingsByLayer(['src/x/infrastructure/repo.ts:9 — nit', 'src/x/domain/agg.ts — nit', 'bez ścieżki'], layers, 'domain');
      if (!g.infrastructure || g.infrastructure.length !== 1) return 'ustalenie ze ścieżką infrastructure nie trafiło do infrastructure: ' + JSON.stringify(g);
      if (!g.domain || g.domain.length !== 2) return 'domain powinno mieć ustalenie ze ścieżką + zapasowe: ' + JSON.stringify(g);
      return null;
    },
  },
  {
    name: 'verifier-and-final-gate-prompts-offer-minor-findings-and-impl-gets-analysis-minors',
    run() {
      const layer = L.infrastructure;
      const v = c.buildVerifierPrompt(ARGS, layer, { typecheck: 'pass', tests: 'pass' }, ['a.ts'], 'implement');
      if (!/minor_findings/.test(v)) return 'prompt weryfikatora warstwy nie wspomina minor_findings';
      const off = c.buildVerifierPrompt(Object.assign({}, ARGS, { autoFixMinor: false }), layer, { typecheck: 'pass', tests: 'pass' }, ['a.ts'], 'implement');
      if (/minor_findings/.test(off)) return 'autoFixMinor=false powinno wyłączyć blok';
      const f = c.buildFinalGatePrompt(ARGS, [], ['a.ts'], 'tree', []);
      if (!/minor_findings/.test(f)) return 'prompt bramki końcowej nie wspomina minor_findings';
      const withMinors = Object.assign({}, ARGS, { task: Object.assign({}, ARGS.task, { minorFixes: ['README: literówka w nagłówku'] }) });
      const impl = c.buildImplPrompt(withMinors, layer, 1, null, 0, null);
      if (!/DROBNE POPRAWKI Z ANALIZY/.test(impl) || !/literówka/.test(impl)) return 'implementer nie dostał drobnych poprawek z analizy';
      const fixPass = c.buildImplPrompt(withMinors, layer, 2, 'naruszenie X', 0, null);
      if (/DROBNE POPRAWKI Z ANALIZY/.test(fixPass)) return 'przy poprawce nie dokładamy drobnych poprawek z analizy';
      return null;
    },
  },

  // ── ORC-093: właściciel pliku po specyficzności (katch-all w wcześniejszej warstwie) ─────
  {
    name: 'typecheck-deferral-owner-by-specificity-with-catch-all-domain-dirs',
    run() {
      // układ grant-flow: domain ma katch-all apps/api/src/
      const layers = [
        { id: 'domain', dirs: ['apps/api/src/', 'domain/'] },
        { id: 'application', dirs: ['application/'] },
        { id: 'infrastructure', dirs: ['infrastructure/', 'apps/api/src/app/', 'apps/api/src/shared/'] },
        { id: 'testing', dirs: ['__tests__/', 'apps/api/test/'] },
      ];
      const red = (tail) => ({ typecheck: 'fail', tests: 'skipped', tsErrors: tail });
      const err = (p) => p + '(1,1): error TS2322: x.';
      const infraAbs = err('apps/api/src/contexts/t/infrastructure/repo.ts');
      const infraRel = err('src/contexts/t/infrastructure/repo.ts');
      const ctrl = err('apps/api/src/app/api/c.ts');
      const ownApp = err('apps/api/src/contexts/t/application/h.ts');
      const domEventInInfra = err('apps/api/src/contexts/t/infrastructure/persistence/domain-event.ts');
      const spec = err('apps/api/src/contexts/t/__tests__/a.spec.ts');
      if (!c.typecheckRedIsLaterLayers(red(infraAbs), layers[1], layers)) return 'infrastructure (ścieżka z prefiksem) przy katch-all domain nie została odroczona';
      if (!c.typecheckRedIsLaterLayers(red(infraRel), layers[1], layers)) return 'infrastructure (ścieżka względna pakietu) nie została odroczona';
      if (!c.typecheckRedIsLaterLayers(red(ctrl + '\n' + domEventInInfra), layers[1], layers)) return 'kontroler (prefiks apps/api/src/app/) / plik domain-event.ts w infrastructure nie został odroczony';
      if (!c.typecheckRedIsLaterLayers(red(spec), layers[1], layers)) return 'plik w __tests__ (testing) nie został odroczony';
      if (c.typecheckRedIsLaterLayers(red(ownApp), layers[1], layers)) return 'błąd we WŁASNYM zakresie (application) został odroczony';
      if (c.typecheckRedIsLaterLayers(red(ownApp + '\n' + infraAbs), layers[1], layers)) return 'mieszanka własny+późniejszy została odroczona';
      if (c.typecheckRedIsLaterLayers(red(err('apps/api/src/contexts/t/domain/agg.ts')), layers[1], layers)) return 'błąd w WCZEŚNIEJSZEJ warstwie (domain) został odroczony';
      return null;
    },
  },

  // ── ORC-094: osobne logi per check, pole lint, lint nie jest zielenią ────────────────────
  {
    name: 'probe-writes-separate-log-per-check-and-maps-lint-field',
    run() {
      const layer = { id: 'domain', dirs: ['apps/api/src/', 'domain/'], checks: ['typecheck:api', 'lint:check:api'] };
      const p = c.buildProbePrompt({ task: { id: 'T' } }, layer);
      if (!/> \/tmp\/check-domain-1\.log 2>&1; echo "EXIT:\$\?"/.test(p) || !/> \/tmp\/check-domain-2\.log 2>&1; echo "EXIT:\$\?"/.test(p)) return 'każdy check musi mieć własny plik logu (-1.log, -2.log)';
      if (/check-domain\.log/.test(p)) return 'wspólny log check-domain.log nadpisywałby wyniki';
      if (!/check-domain-\*\.log/.test(p)) return 'tsErrors/grep zakresu muszą czytać wszystkie logi (-*.log)';
      if (!/`lint`/.test(p) || !/nigdy z powodu lintu/.test(p)) return 'brak mapowania lintu na własne pole';
      return null;
    },
  },
  {
    name: 'lint-fail-is-red-and-never-green-evidence',
    run() {
      if (c.layerGapsAcceptable({ next: 'escalate', gaps: ['a/b.ts'] }, { verdict: 'GO' }, { typecheck: 'pass', tests: 'pass', lint: 'fail' })) return 'lint fail nie może być zielenią dla GO_WITH_GAPS';
      if (!c.layerGapsAcceptable({ next: 'escalate', gaps: ['a/b.ts'] }, { verdict: 'GO' }, { typecheck: 'pass', tests: 'skipped', lint: 'pass' })) return 'pass + lint pass powinno przejść';
      if (c.typecheckRedIsLaterLayers({ typecheck: 'fail', tests: 'skipped', lint: 'fail', tsErrors: 'src/x/infrastructure/r.ts(1,1): error TS2322: x' }, { id: 'domain', dirs: ['domain/'] }, [{ id: 'domain', dirs: ['domain/'] }, { id: 'infrastructure', dirs: ['infrastructure/'] }])) return 'czerwony lint obok czerwonego typechecku nie może być odroczony';
      return null;
    },
  },

  // ── ORC-095: linia statusu dla człowieka ─────────────────────────────────────────────────
  {
    name: 'status-line-is-short-business-and-has-no-paths',
    run() {
      const ok = c.statusLine({ staged: ['a', 'b', 'c'], gaps: [{}], minorFindings: [], warnings: ['x', 'y'] }, 'ok');
      if (!/^Gotowe do przeglądu: 3 plików w stagingu; niesprawdzone fragmenty: 1; ostrzeżenia w raporcie: 2\.$/.test(ok)) return 'zła linia ok: ' + ok;
      const review = c.statusLine({ staged: ['a'], stageForReview: ['a'] }, 'ok');
      if (!/wymaga uważnego przeglądu/.test(review)) return 'brak flagi przeglądu: ' + review;
      const halt = c.statusLine({}, 'halt', { id: 'domain', cause: 'machine' });
      if (halt !== 'Zatrzymane na etapie „domain": awaria narzędzi, nie kodu.') return 'zła linia halt machine: ' + halt;
      const haltCode = c.statusLine({}, 'halt', { cause: 'code' });
      if (haltCode !== 'Zatrzymane na bramce końcowej: kod nie przechodzi kontroli.') return 'zła linia halt code: ' + haltCode;
      for (const l of [ok, review, halt, haltCode]) if (/[\\/]\w+\.\w+|ORC-|ADR/.test(l) || l.length > 160) return 'linia statusu ma ścieżkę/numer reguły albo jest za długa: ' + l;
      return null;
    },
  },

  // ── ORC-096: nieśledzone pliki testowe liczone mimo wzorca, który nic nie dopasowuje ─────
  {
    name: 'probe-counts-untracked-test-files-even-with-unmatched-pathspec',
    run() {
      const layer = { id: 'u14-tooling', dirs: ['.githooks/', 'package.json', 'scripts/'], checks: [], tests: true };
      const p = c.buildProbePrompt({ task: { id: 'T' } }, layer);
      if (!/git ls-files -o --exclude-standard -z -- .*\| xargs -0 -r git add -N --/.test(p)) return 'przyrost testów musi dodawać nieśledzone pliki przez ls-files -o | xargs git add -N: ' + p.slice(p.indexOf('git ls-files') > -1 ? p.indexOf('git ls-files') : 0, 400);
      if (/ git add -N -- ':\(glob\)/.test(p)) return 'bezpośrednie git add -N -- <wzorce> przerywa w całości przy niedopasowanym wzorcu';
      if (!/git diff HEAD -U0 -- .*\| grep -cE/.test(p)) return 'WL6: git diff HEAD i | grep -cE muszą być w jednej linii';
      return null;
    },
  },

  // ── ORC-097: model i długość wyjścia bramki końcowej ─────────────────────────────────────
  {
    name: 'final-gate-model-defaults-to-sonnet-and-inherits-for-security-tasks',
    run() {
      const j = (x) => JSON.stringify(x);
      if (j(c.modelFor('final')) !== j({ model: 'sonnet' })) return 'domyślnie Sonnet, jest: ' + j(c.modelFor('final'));
      if (j(c.modelFor('final', { task: { securitySensitive: false } })) !== j({ model: 'sonnet' })) return 'task bez threat_model → Sonnet';
      if (j(c.modelFor('final', { task: { securitySensitive: true } })) !== j({})) return 'task z threat_model → model sesji (puste opcje)';
      if (j(c.modelFor('final', { finalGateModel: 'inherit' })) !== j({})) return 'inherit → model sesji';
      if (j(c.modelFor('final', { finalGateModel: 'opus', task: {} })) !== j({ model: 'opus' })) return 'jawne opus → opus';
      if (j(c.modelFor('final', { finalGateModel: 'auto', task: { securitySensitive: true } })) !== j({})) return 'auto zachowuje się jak domyślne';
      if (j(c.modelFor('verify')) !== j({ model: 'sonnet' }) || j(c.modelFor('probe')).indexOf('haiku') === -1) return 'pozostałe role bez zmian';
      return null;
    },
  },
  {
    name: 'final-gate-prompt-limits-output-length',
    run() {
      const f = c.buildFinalGatePrompt(ARGS, [], ['a.ts'], 'tree', []);
      if (!/WYJŚCIE \(limit długości\)/.test(f) || !/najwyżej 5 zdań/.test(f) || !/JEDNA linia/.test(f)) return 'prompt bramki końcowej bez limitu długości wyjścia';
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
      if (!/> \/tmp\/check-testing-1\.log 2>&1; echo "EXIT:\$\?"/.test(p)) return 'wyjście checks nie jest przekierowane poza kontekst';
      if (!/EXIT:0 NIE otwieraj pliku logu/.test(p)) return 'brak zakazu czytania logu przy zielonym wyniku';
      if (!/grep -cE/.test(p)) return 'warstwa testowa bez pomiaru przyrostu bloków';
      if (!/skipped/.test(p)) return 'brak instrukcji dla brakującego skryptu w package.json';
      const infra = c.buildProbePrompt(ARGS, L.infrastructure);
      if (/grep -cE/.test(infra)) return 'pomiar przyrostu testów odpalony na warstwie nietestowej';
      return null;
    },
  },
  // ── ORC-078: Flutter/Dart rozdziela lib/ i test/ BEZ wspólnego segmentu
  // (lib/core/design/x.dart -> test/core/design/x_test.dart) — dirs z prefiksem lib/ (pełna
  // ścieżka od korzenia, jak w --overrides) budowały pathspec, który nigdy nie trafiał w
  // drzewo testów (juz-ide-mobile-app DESIGN-SYSTEM-009, newTestBlocks zawsze 0) ─────────────
  {
    name: 'probe-prompt-flutter-lib-path-variant',
    run() {
      const flutterLayer = { id: 'presentation', dirs: ['lib/core/design/'], checks: [], tests: true };
      const plainLayer = { id: 'presentation-plain', dirs: ['core/design/'], checks: [], tests: true };
      const p = c.buildProbePrompt(ARGS, flutterLayer);
      if (!p.includes(":(glob)**/lib/core/design/**'")) return 'brak oryginalnego wariantu pathspecu z prefiksem lib/';
      if (!p.includes(":(glob)**/core/design/**'")) return 'brak wariantu bez segmentu lib/ — test/ w Flutterze go nie ma';
      // dir bez prefiksu lib/, tego samego kształtu poza tym — nie powinien dostać dodatkowego
      // wariantu (bez regresji dla stacków, gdzie test/ faktycznie lustrzanie odwzorowuje lib/).
      // Liczymy wystąpienia KONKRETNYCH złożonych pathspeców (split-count), nie ogólne
      // ":(glob)**/" — ten wzorzec pojawia się też w przykładzie w treści instrukcji ("x").
      const plain = c.buildProbePrompt(ARGS, plainLayer);
      const countOf = (haystack, needle) => haystack.split(needle).length - 1;
      if (countOf(plain, ":(glob)**/core/design/**'") !== 2) return 'warstwa bez lib/ powinna mieć dokładnie 2 wystąpienia swojego pathspecu (add -N + diff)';
      if (countOf(p, ":(glob)**/lib/core/design/**'") !== 2) return 'wariant z lib/ powinien wystąpić 2 razy (add -N + diff)';
      if (countOf(p, ":(glob)**/core/design/**'") !== 2) return 'wariant bez lib/ powinien wystąpić 2 razy (add -N + diff)';
      return null;
    },
  },
  // ── marketing-hub TS-MH-006, testing:knowledge (2x z rzędu, ten sam objaw): "ostatnie 40
  // linii" gubiło błąd w zakresie warstwy, gdy log kończył się ostrzeżeniami z shared/ ──────
  {
    name: 'probe-prompt-greps-own-scope-before-tail-fallback',
    run() {
      const p = c.buildProbePrompt(ARGS, L.testing);
      if (!/NAJPIERW `grep -hE '/.test(p)) return 'brak grepa po własnym zakresie przed tail';
      if (!new RegExp('grep -hE \'' + 'src/__tests__/'.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + '\'').test(p)) {
        return 'wzorzec grepa nie zawiera dirs warstwy testowej';
      }
      if (!/dopiero gdy ten grep nic nie znajdzie/i.test(p)) return 'brak fallbacku do pełnego tail, gdy grep pusty';
      const noDirs = c.buildProbePrompt(ARGS, { id: 'whole', dirs: [], checks: ['typecheck'] });
      if (/NAJPIERW `grep -hE '/.test(noDirs)) return 'warstwa bez dirs nie powinna dostać instrukcji grepa (nie ma czego zawężać)';
      if (!/zwróć ostatnie 40 linii w `tail`/.test(noDirs)) return 'warstwa bez dirs powinna zachować prosty fallback do tail';
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
  // ── ORC-016: checks zawężone do pakietu w monorepo (feature-flags TASK-0010: goły
  // `npm run lint` → root `turbo run lint` → build WSZYSTKICH zależności upstream, w tym
  // packages/contracts, uszkodzone 2x w tym samym przebiegu, mimo że warstwa go nie dotykała) ──
  {
    name: 'probe-prompt-scopes-checks-to-package-root-in-monorepo',
    run() {
      const p = c.buildProbePrompt(ARGS, L.infrastructure);
      if (!/_pkgdir\(\)/.test(p)) return 'brak lookupu package.json dla warstwy z dirs';
      // ORC-085: check idzie przez `_chk <nazwa>`, które uruchamia go w `cd "$PKGROOT"`.
      if (!/_chk lint/.test(p) || !/cd "\$PKGROOT" && npm run "\$s"/.test(p)) return 'polecenie checka nie jest scope\'owane przez PKGROOT';
      if (!/PKGROOT wyjdzie jako "\."/.test(p)) return 'brak instrukcji zgłoszenia świadomego pełnego zakresu, gdy nie znaleziono package.json';
      const noDirs = c.buildProbePrompt(ARGS, { id: 'whole', dirs: [], checks: ['typecheck'] });
      if (/_pkgdir\(\)/.test(noDirs)) return 'warstwa bez dirs nie powinna dostać lookupu (nie ma czego zawężać)';
      if (!/^npm run typecheck/m.test(noDirs)) return 'warstwa bez dirs powinna zachować goły npm run';
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
      // feature-flags TASK-0010: bramka końcowa nie miała kanału na decyzje człowieka
      // adresujące unverified_scope (2/4 eskalacji ORC-069 tego przebiegu były na final-gate)
      if (!/DECYZJE ZATWIERDZONE PRZEZ CZŁOWIEKA/.test(p)) return 'bramka końcowa nie widzi a.task.decisions';
      if (!/D1 temat: wybór A/.test(p)) return 'decyzja z fixture nie została wyrenderowana w treści';
      const noDecisions = c.buildFinalGatePrompt({ ...ARGS, task: { ...ARGS.task, decisions: [] } }, ARGS.checks.finalGate, ['src/a.ts']);
      if (/DECYZJE ZATWIERDZONE/.test(noDecisions)) return 'brak decyzji powinien pominąć cały akapit, nie renderować pusty';
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
      // Agent widzi tylko schemat — bez `description` nie wie, kiedy zgłaszać odstępstwo (ADR 0011 B2).
      for (const [name, s] of [['IMPL_SCHEMA', c.IMPL_SCHEMA], ['VERDICT_SCHEMA', c.VERDICT_SCHEMA]]) {
        const d = s.properties.deviation_note && s.properties.deviation_note.description;
        if (!d || !/obcego języka/.test(d) || !/nie ma pracy/.test(d)) return name + '.deviation_note bez opisu przypadków zgłoszenia';
      }
      return null;
    },
  },
  // ── nowe pliki: bramka, diff-sonda i przyrost (TS-AIG-015, TS-MH-003/005) ─────────
  {
    name: 'tree-command-sees-untracked-and-staged-files',
    run() {
      const cmd = c.treeFilesCmd();
      if (!/git diff --name-only HEAD/.test(cmd)) return 'lista plików nie porównuje z HEAD (plik "A" niewidoczny): ' + cmd;
      if (!/git ls-files --others --exclude-standard/.test(cmd)) return 'lista plików bez nieśledzonych: ' + cmd;
      if (!/git diff --name-only abc123/.test(c.treeFilesCmd('abc123'))) return 'baza przebiegu zignorowana';
      if (c.buildDiffProbePrompt('abc123').indexOf(c.treeFilesCmd('abc123')) === -1) return 'diff-sonda używa innego polecenia niż bramka';
      if (/status --short/.test(c.buildDiffProbePrompt())) return 'diff-sonda nadal na git status --short (zwija katalogi)';
      return null;
    },
  },
  {
    name: 'new-files-visible-in-real-git-tree-untracked-A-AM',
    run() {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-tree-'));
      const sh = (cmd) => spawnSync('bash', ['-c', cmd], { cwd: dir, encoding: 'utf8' });
      try {
        sh('git init -q && git config user.email t@t && git config user.name t && mkdir -p src/__tests__ && echo x > README && git add README && git commit -qm init');
        fs.writeFileSync(path.join(dir, 'src/__tests__/a.spec.ts'), "describe('a', () => {\n  it('x', () => {})\n  it.each([1])('y', () => {})\n})\n");
        const probe = c.buildProbePrompt(ARGS, L.testing);
        const countLine = probe.split('\n').find((l) => /^\s*git (add -N|ls-files -o)/.test(l));
        if (!countLine) return 'brak polecenia liczącego przyrost';
        const states = [['untracked', ''], ['A', 'git add -A'], ['AM', "echo \"  it('z', () => {})\" >> src/__tests__/a.spec.ts"]];
        for (const [name, prep] of states) {
          if (prep) sh(prep);
          const files = sh(c.treeFilesCmd()).stdout;
          if (!/src\/__tests__\/a\.spec\.ts/.test(files)) return 'stan ' + name + ': bramka nie widzi nowego pliku (' + files.trim() + ')';
          const n = Number(sh(countLine.trim()).stdout.trim());
          if (!(n >= 3)) return 'stan ' + name + ': przyrost bloków = ' + n + ' (oczekiwane >= 3, w tym it.each)';
        }
        return null;
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },

  // ── fałszywe GO: no-op po czerwonej sondzie (TS-MH-005) ───────────────────────────
  {
    name: 'noop-after-red-probe-is-blocked-not-go',
    run() {
      const b = c.blockedByPrior(L.infrastructure, 'typecheck: fail\nsrc/domain/x.ts(3): TS2322', 'POZA ZAKRESEM: src/domain/x.ts:3');
      if (!b || b.status !== 'BLOCKED_BY_PRIOR') return 'no-op po czerwonej sondzie nie jest blokadą: ' + JSON.stringify(b);
      if (!/TS2322/.test(b.reason)) return 'powód blokady nie niesie wyniku sondy';
      if (!c.haltsRun('BLOCKED_BY_PRIOR')) return 'BLOCKED_BY_PRIOR nie zatrzymuje przebiegu';
      if (c.haltsRun('GO')) return 'GO zatrzymuje przebieg';
      if (c.blockedByPrior(L.infrastructure, null, 'nic do zrobienia') !== null) return 'no-op bez czerwieni zablokowany (powinien iść do weryfikatora)';
      const p = c.buildImplPrompt(ARGS, L.infrastructure, 2, 'deterministyczna bramka na czerwono', 0, 'typecheck: fail');
      if (!/CZERWONA SONDA/.test(p) || !/BLOCKED_BY_PRIOR/.test(p)) return 'implementer po czerwieni nie wie, jak zgłosić czerwień spoza zakresu';
      if (/CZERWONA SONDA/.test(c.buildImplPrompt(ARGS, L.infrastructure, 1, null, 0, null))) return 'reguła czerwonej sondy w pierwszej próbie';
      return null;
    },
  },
  {
    name: 'noop-verifier-sees-prior-violations',
    run() {
      const p = c.buildVerifierPrompt(ARGS, L.infrastructure, null, [], 'verify-noop', 'nic do zrobienia', '1. brak mappera X');
      if (!/brak mappera X/.test(p)) return 'weryfikator no-op nie widzi naruszeń z poprzedniej rundy';
      return null;
    },
  },

  // ── bramka końcowa: pliki z drzewa + karty (TS-MH-005) ───────────────────────────
  {
    name: 'final-gate-gets-tree-files-and-cards',
    run() {
      const files = c.finalFileList(['src/infra/a.ts', 'db/migrations/1.sql'], ['src/infra/a.ts', 'src/domain/b.ts']);
      if (JSON.stringify(files) !== JSON.stringify(['src/infra/a.ts', 'db/migrations/1.sql', 'src/domain/b.ts'])) return 'suma drzewo ∪ warstwy niepoprawna: ' + files.join(',');
      const withDirty = Object.assign({}, ARGS, { dirtyAtStart: ['notes.md'] });
      const p = c.buildFinalGatePrompt(withDirty, ['test'], files, 'tree');
      if (!/KARTA REPOZYTORIUM/.test(p) || !/KARTA KONWENCJE/.test(p)) return 'bramka końcowa bez kart wzorców';
      if (!/db\/migrations\/1\.sql/.test(p)) return 'plik z drzewa nie trafił do bramki';
      if (!/BRUDNE JUŻ PRZED startem[\s\S]*notes\.md/.test(p)) return 'brak listy plików brudnych przed startem';
      if (!/sonda drzewa nie zwróciła wyniku/.test(c.buildFinalGatePrompt(ARGS, [], files, 'layers'))) return 'brak ostrzeżenia o liście z raportów warstw';
      return null;
    },
  },

  // ── pliki towarzyszące i pod-warstwy (TS-MH-005) ─────────────────────────────────
  {
    name: 'companion-spec-belongs-to-file-scope',
    run() {
      const layer = { id: 'infrastructure', dirs: ['infrastructure/'], scope: { dirs: ['src/auth/role-permissions.map.ts'], reason: 'r' } };
      if (!c.layerTouches(layer, 'src/auth/role-permissions.adapter.spec.ts')) return 'spec obok pliku z zakresu poza zakresem';
      if (!c.layerTouches(layer, 'apps/api/src/auth/role-permissions.map.spec.ts')) return 'spec w monorepo (prefiks pakietu) poza zakresem';
      if (c.layerTouches(layer, 'src/auth/other.spec.ts')) return 'spec innego pliku zaliczony do zakresu';
      if (c.layerTouches(layer, 'src/billing/role-permissions.adapter.spec.ts')) return 'spec z innego katalogu zaliczony do zakresu';
      if (c.layerTouches(layer, 'src/auth/role-permissions.adapter.ts')) return 'nie-test obok zaliczony do zakresu';
      if (!/role-permissions\.\*\.spec\.\*/.test(c.buildProbePrompt(ARGS, Object.assign({}, layer, { tests: true, checks: [] })))) return 'sonda przyrostu nie liczy specu towarzyszącego';
      return null;
    },
  },
  // ── ORC-075: plik towarzyszący, którego katalog jednostka `tests: true` tego samego
  // przebiegu już pokrywa, to nie luka TEJ warstwy (grant-flow TS-RATE-003,
  // application:application: 3 eskalacje na "brak __tests__/handler.spec.ts", mimo że
  // domain-application-implementer ma zakaz pisania testów i unit 'testing:testing' z tym
  // samym przebiegu już deklaruje dirs pokrywające te same pliki) ─────────────────────────
  {
    name: 'scope-block-defers-companion-test-to-sibling-testing-unit',
    run() {
      const p = c.buildImplPrompt(ARGS, L.infrastructure, 1, null, 0);
      if (!/tests: true.*testing/.test(p) && !/testing.*tests: true/.test(p) && !/\(testing\)/.test(p)) {
        return 'warstwa nietestowa nie widzi odesłania do jednostki testing (tests: true) tego przebiegu';
      }
      if (!/to JEJ praca, nie luka tej warstwy/.test(p)) return 'brak jawnej deferencji pliku towarzyszącego';
      const pTesting = c.buildVerifierPrompt(ARGS, L.testing, null, ['src/__tests__/a.spec.ts'], 'implement');
      if (/to JEJ praca, nie luka tej warstwy/.test(pTesting)) return 'jednostka testing nie powinna dostać deferencji do samej siebie';
      const noSiblings = { task: ARGS.task, layers: [L.infrastructure] };
      const pNoSiblings = c.buildImplPrompt(noSiblings, L.infrastructure, 1, null, 0);
      if (/to JEJ praca, nie luka tej warstwy/.test(pNoSiblings)) return 'bez jednostki tests:true w przebiegu deferencja nie powinna się pojawić';
      return null;
    },
  },
  {
    name: 'unit-sub-layer-gets-base-layer-cards',
    run() {
      const sub = { id: 'infrastructure:audience', base: 'infrastructure', dirs: ['src/infrastructure/'], scope: { dirs: ['contexts/audience/'], reason: 'unit' } };
      if (!/KARTA REPOZYTORIUM/.test(c.buildImplPrompt(ARGS, sub, 1, null, 0))) return 'pod-warstwa nie dostała kart warstwy bazowej';
      if (!/KARTA REPOZYTORIUM/.test(c.buildVerifierPrompt(ARGS, sub, null, ['x'], 'implement'))) return 'weryfikator pod-warstwy bez kart warstwy bazowej';
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
