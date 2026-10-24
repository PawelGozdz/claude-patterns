#!/usr/bin/env node
/**
 * tests/flow-evals/governance/run.js — eval L1 bloku `governance` (2026-10-21, juz-ide-api-2).
 *
 * Zero LLM. Pilnuje trzech rzeczy, które wcześniej psuły się po cichu:
 *   1. globy kanonu zostają globami — `params_globs` w runtime.yml, rozwinięcie w chwili wywołania
 *      (`resolve-params.mjs`), ostrzeżenie `verify-project-setup` o rozjeździe, wykluczenia `!`;
 *   2. kanon dociera do bramki końcowej /orchestrate — `canon` w wyjściu `orchestrate-prepare`
 *      (inject + strategy_ref/canon_ref rozwiązane do ścieżek) i sekcja w prompcie bramki;
 *      bez bloku `governance` nic nie wchodzi;
 *   3. `strategy_fit_when_extra` / `strategy_fit_always_for` wchodzą do slotu strategy-fit,
 *      a pusty parametr nie zmienia runtime.yml (żadnego `...|` pasującego do wszystkiego).
 *
 * Uruchom: node tests/flow-evals/governance/run.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const YAML = require('yaml');

const REPO = path.resolve(__dirname, '..', '..', '..');
const node = (script, args) => spawnSync('node', [path.join(REPO, 'scripts', script), ...args], { encoding: 'utf8' });

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

const PROJECT_YML = (params) => `project:
  name: eval-governance
  description: "Fixture ewaluacyjny — blok governance"
  stack_blocks: [governance]
  language: typescript
  block_params:
    governance:
${params}
`;

function makeProject(params) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-governance-'));
  write(root, '.claude/config/project.yml', PROJECT_YML(params));
  write(root, 'docs/decisions/README.md', '# Indeks decyzji\n');
  write(root, 'docs/decisions/template.md', '# Szablon\n');
  write(root, 'docs/decisions/pomysly.md', '# Pomysły\n');
  write(root, 'docs/decisions/BDR-001-model.md', '# BDR-001\nModel danych jest jeden.\n');
  write(root, 'docs/decisions/BDR-090-prywatnosc.md', '# BDR-090\nAdres użytkownika nigdy nie wychodzi poza jego konto.\n');
  write(root, 'docs/strategy/zasady.md', '# Inwarianty\n1. Dane osobowe nie opuszczają konta.\n');
  return root;
}

const PARAMS_FULL = `      canon:
        - docs/decisions/*
        - "!docs/decisions/README.md"
        - "!docs/decisions/template.md"
        - "!docs/decisions/pomysly.md"
      canon_inject: [docs/strategy/zasady.md]
      strategy_fit_when_extra: "prywatn|reputac"
      strategy_fit_always_for: { priority: [P0] }`;
const PARAMS_PLAIN = `      canon: [docs/decisions/*, "!docs/decisions/README.md", "!docs/decisions/template.md", "!docs/decisions/pomysly.md"]`;

function materialize(root) {
  const r = node('materialize-runtime.mjs', [root, REPO]);
  const rtPath = path.join(root, '.claude/config/runtime.yml');
  return { r, rt: fs.existsSync(rtPath) ? YAML.parse(fs.readFileSync(rtPath, 'utf8')) : null };
}
const strategyFit = (rt) => rt.analyze.panel.find((s) => s.stage === 'strategy-fit');

const cases = [
  {
    name: 'glob-zostaje-globem-w-params_globs-a-lista-omija-wykluczone',
    run() {
      const { r, rt } = materialize(makeProject(PARAMS_PLAIN));
      if (r.status !== 0) return `materialize exit ${r.status}: ${r.stderr || r.stdout}`;
      const g = rt.params_globs?.governance?.canon;
      if (JSON.stringify(g) !== JSON.stringify(['docs/decisions/*', '!docs/decisions/README.md', '!docs/decisions/template.md', '!docs/decisions/pomysly.md']))
        return 'params_globs.governance.canon nie niesie surowych wzorców: ' + JSON.stringify(g);
      const list = rt.params.governance.canon;
      if (JSON.stringify(list) !== JSON.stringify(['docs/decisions/BDR-001-model.md', 'docs/decisions/BDR-090-prywatnosc.md']))
        return 'lista rozwinięta powinna pomijać README/template/pomysly: ' + JSON.stringify(list);
      return null;
    },
  },
  {
    name: 'resolve-params-widzi-plik-dodany-po-setupie',
    run() {
      const root = makeProject(PARAMS_PLAIN);
      const { r } = materialize(root);
      if (r.status !== 0) return 'materialize padł: ' + r.stderr;
      write(root, 'docs/decisions/BDR-091-nowa.md', '# BDR-091\n');
      const res = node('resolve-params.mjs', [root, '--block', 'governance', '--param', 'canon']);
      if (res.status !== 0) return `resolve-params exit ${res.status}: ${res.stderr}`;
      const row = JSON.parse(res.stdout).params[0];
      if (!row.live.includes('docs/decisions/BDR-091-nowa.md')) return 'live nie zawiera BDR-091: ' + JSON.stringify(row.live);
      if (row.snapshot.includes('docs/decisions/BDR-091-nowa.md')) return 'migawka nie powinna mieć BDR-091';
      if (!row.drift || !row.added.includes('docs/decisions/BDR-091-nowa.md')) return 'drift/added nie wykryte: ' + JSON.stringify(row);
      if (row.live.some((f) => /README|template|pomysly/.test(f))) return 'wykluczenia nie działają w live: ' + JSON.stringify(row.live);
      return null;
    },
  },
  {
    name: 'resolve-params-exit-2-gdy-glob-pusty',
    run() {
      const root = makeProject(PARAMS_PLAIN);
      materialize(root);
      fs.rmSync(path.join(root, 'docs/decisions'), { recursive: true });
      const res = node('resolve-params.mjs', [root]);
      if (res.status !== 2) return `oczekiwano exit 2 dla pustego globu, jest ${res.status}`;
      return null;
    },
  },
  {
    name: 'verify-project-setup-ostrzega-o-rozjezdzie-glob-lista',
    run() {
      const root = makeProject(PARAMS_PLAIN);
      materialize(root);
      write(root, 'docs/decisions/BDR-092-kolejna.md', '# BDR-092\n');
      const res = node('verify-project-setup.mjs', [root]);
      const out = (res.stdout || '') + (res.stderr || '');
      if (!/governance\.canon: lista w runtime\.yml rozjechana ze wzorcami/.test(out)) return 'brak ostrzeżenia o rozjeździe:\n' + out;
      if (!/BDR-092-kolejna\.md/.test(out)) return 'ostrzeżenie nie wskazuje nowego pliku:\n' + out;
      return null;
    },
  },
  {
    name: 'when_extra-i-always_for-wchodza-do-slotu-strategy-fit',
    run() {
      const { r, rt } = materialize(makeProject(PARAMS_FULL));
      if (r.status !== 0) return `materialize exit ${r.status}: ${r.stderr || r.stdout}`;
      const s = strategyFit(rt);
      if (!/^\(\?:feature\|.*pozycjonowan\)\|\(\?:prywatn\|reputac\)$/.test(s.when)) return 'when nie ma doklejonej alternatywy: ' + s.when;
      const rx = new RegExp(s.when, 'i');
      if (!rx.test('Ochrona prywatności adresu') || !rx.test('nowa funkcja')) return 'regex nie łapie ani extra, ani bazy';
      if (rx.test('poprawka literówki w logu')) return 'regex łapie wszystko (puste alternatywy?)';
      if (s.when_extra !== 'prywatn|reputac') return 'when_extra: ' + s.when_extra;
      if (JSON.stringify(s.always_for) !== JSON.stringify({ priority: ['P0'] })) return 'always_for: ' + JSON.stringify(s.always_for);
      const dc = rt.analyze.panel.find((p) => p.stage === 'data-classification');
      if (dc.when_extra !== undefined) return 'data-classification nie powinno dostać when_extra';
      return null;
    },
  },
  {
    name: 'pusty-parametr-nie-zmienia-slotu',
    run() {
      const { r, rt } = materialize(makeProject(PARAMS_PLAIN));
      if (r.status !== 0) return 'materialize padł: ' + r.stderr;
      const s = strategyFit(rt);
      if ('when_extra' in s || 'always_for' in s) return 'puste parametry zostawiły klucze w slocie: ' + JSON.stringify(s);
      if (!/^feature\|.*pozycjonowan$/.test(s.when) || s.when.endsWith('|')) return 'when bazowy zmieniony: ' + s.when;
      return null;
    },
  },
  {
    name: 'niepoprawny-regex-when_extra-to-blad-materializacji',
    run() {
      const bad = PARAMS_PLAIN + '\n      strategy_fit_when_extra: "(niezamknięty"';
      const { r } = materialize(makeProject(bad));
      if (r.status === 0) return 'materialize przyjął niepoprawny regex';
      if (!/when_extra/.test((r.stderr || '') + (r.stdout || ''))) return 'komunikat nie wspomina when_extra';
      return null;
    },
  },
];

// ── bramka końcowa: prepare + prompt ────────────────────────────────────────────
function prepareProject({ governance, taskRefs, params = PARAMS_FULL }) {
  const root = makeProject(params);
  write(root, 'docs/KANON.md', '# KANON\n\n## 1. Czym jest produkt\nWstęp, który NIE jest inwariantem.\n\n## 2. Inwarianty — nie do negocjacji\n\n1. **Adres nigdy nie wychodzi poza konto.**\n\n### 2.1 Szczegół\nDoprecyzowanie.\n\n## 3. Aktorzy\nTreść, której nie wklejamy.\n');
  write(root, 'docs/adr/0104-wlasciciel-uslugi.md', '# ADR 0104\nWłaściciel usługi to ActorId.\n');
  const { rt } = materialize(root);
  if (!governance) {
    // ten sam runtime bez bloku — jak projekt, który governance nie wybrał
    delete rt.params; delete rt.params_globs;
    rt.stack_blocks = rt.stack_blocks.filter((b) => b !== 'governance');
  }
  rt.orchestrate = {
    layers: [{ id: 'app', dirs: ['src/'], agent: 'domain-application-implementer', role: 'x', checks: ['typecheck'] }],
    inner_loop: { verify: 'code-quality-verifier', max_attempts: 3, on_max: 'ESCALATE_AND_HALT' },
    final_gate: { agent: 'security-e2e-verifier', on_fail: 'ESCALATE_AND_HALT' },
    exit: 'STAGE_NOT_COMMIT',
  };
  rt.analyze = { exit: 'CONTINUE' };
  write(root, '.claude/config/runtime.yml', YAML.stringify(rt));
  // BDR dodany PO materializacji — migawka go nie zna, a task się na niego powołuje
  write(root, 'docs/decisions/BDR-095-pozniejsza.md', '# BDR-095\nPóźniejsza decyzja o reputacji.\n');
  write(root, 'project-orchestration/tasks/T-1-slug.md',
    `---\nid: T-1\ntitle: "Prywatność adresu"\ntype: implementation\nstrategy_ref: ${taskRefs}\n---\n\n# Zadanie\n`);
  write(root, 'project-orchestration/analysis/T-1.analysis.md',
    `---\ntask: T-1\nstatus: approved\nopen_questions: []\ndecisions: []\npatterns: []\n---\n\n# Analiza\n`);
  return root;
}
const prepare = (root) => {
  const res = node('orchestrate-prepare.mjs', ['T-1', '--project', root, '--json']);
  if (res.status !== 0) return { error: `prepare exit ${res.status}: ${res.stderr}` };
  return { out: JSON.parse(res.stdout) };
};

cases.push(
  {
    name: 'prepare-rozwiazuje-strategy_ref-do-sciezek-i-trescia-inwariantow',
    run() {
      const { out, error } = prepare(prepareProject({ governance: true, taskRefs: '[BDR-090, BDR-095, BDR-999, BDR-09]' }));
      if (error) return error;
      const c = out.canon;
      if (!c || !c.active) return 'canon.active powinno być true: ' + JSON.stringify(c);
      if (c.inject.length !== 1 || c.inject[0].path !== 'docs/strategy/zasady.md' || !/Dane osobowe nie opuszczają konta/.test(c.inject[0].text))
        return 'inject nie niesie inwariantów z treścią: ' + JSON.stringify(c.inject);
      const paths = c.refs.map((x) => x.path).sort();
      if (JSON.stringify(paths) !== JSON.stringify(['docs/decisions/BDR-090-prywatnosc.md', 'docs/decisions/BDR-095-pozniejsza.md']))
        return 'refs rozwiązane błędnie (BDR-09 nie jest BDR-090; BDR-095 powstał po setupie): ' + JSON.stringify(paths);
      if (!c.refs.every((x) => x.text)) return 'refs bez treści';
      if (JSON.stringify(c.unresolved.sort()) !== JSON.stringify(['BDR-09', 'BDR-999'])) return 'unresolved: ' + JSON.stringify(c.unresolved);
      if (c.refs.some((x) => /BDR-001|README|template/.test(x.path))) return 'do bramki wszedł cały korpus';
      if (!out.warnings.some((w) => /nie rozwiązano odniesień.*BDR-999/.test(w))) return 'brak ostrzeżenia o nierozwiązanym odniesieniu';
      return null;
    },
  },
  {
    name: 'prepare-wkleja-sekcje-z-kotwicy-a-nie-caly-dokument',
    run() {
      const params = PARAMS_FULL.replace('canon_inject: [docs/strategy/zasady.md]', 'canon_inject: ["docs/KANON.md#2"]');
      const { out, error } = prepare(prepareProject({ governance: true, taskRefs: '[]', params }));
      if (error) return error;
      const t = out.canon.inject[0]?.text ?? '';
      if (!/Adres nigdy nie wychodzi poza konto/.test(t) || !/2\.1 Szczegół/.test(t)) return 'sekcja #2 niekompletna: ' + t;
      if (/Wstęp, który NIE jest inwariantem|Treść, której nie wklejamy/.test(t)) return 'do inwariantów wszedł cudzy fragment dokumentu: ' + t;
      return null;
    },
  },
  {
    name: 'prepare-tokenizuje-tekst-wolny-w-strategy_ref',
    run() {
      const refs = `'BDR-090, ADR-0104 (opis); decyzja @founder 2026-08-08; GDPR-019 i strategia-ai §4; docs/strategy/zasady.md (SSDLC)'`;
      const { out, error } = prepare(prepareProject({ governance: true, taskRefs: refs }));
      if (error) return error;
      const paths = out.canon.refs.map((x) => x.path).sort();
      const want = ['docs/adr/0104-wlasciciel-uslugi.md', 'docs/decisions/BDR-090-prywatnosc.md', 'docs/strategy/zasady.md'];
      // zasady.md jest już w inject — nie dublujemy go w refs
      const wantRefs = want.filter((p) => p !== 'docs/strategy/zasady.md');
      if (JSON.stringify(paths) !== JSON.stringify(wantRefs)) return 'refs z tekstu wolnego: ' + JSON.stringify(paths);
      if (out.canon.unresolved.length) return 'id z tekstu wolnego (GDPR-019) nie może trafić do unresolved: ' + JSON.stringify(out.canon.unresolved);
      if (!out.warnings.some((w) => /bez pliku.*GDPR-019/.test(w))) return 'brak ostrzeżenia o id bez pliku';
      return null;
    },
  },
  {
    name: 'prepare-bez-bloku-governance-nie-niesie-kanonu',
    run() {
      const { out, error } = prepare(prepareProject({ governance: false, taskRefs: '[BDR-090]' }));
      if (error) return error;
      if (out.canon.active || out.canon.inject.length || out.canon.refs.length) return 'canon bez bloku governance: ' + JSON.stringify(out.canon);
      return null;
    },
  },
);

async function promptCases() {
  const c = await import(path.join(REPO, 'scripts/workflow/orchestrate-core.mjs'));
  const ARGS = (canon) => ({ task: { id: 'T-1', decisions: [] }, budgets: {}, patterns: [], canon });
  const canon = {
    active: true,
    inject: [{ path: 'docs/strategy/zasady.md', text: '1. Dane osobowe nie opuszczają konta.' }],
    refs: [{ ref: 'BDR-090', path: 'docs/decisions/BDR-090-prywatnosc.md', text: 'Adres użytkownika nigdy nie wychodzi poza jego konto.' }],
    unresolved: ['BDR-999'],
  };
  return [
    {
      name: 'prompt-bramki-niesie-kanon-i-wymaga-vetu-z-cytatem',
      run() {
        const p = c.buildFinalGatePrompt(ARGS(canon), [], ['src/a.ts'], 'tree', []);
        for (const [re, what] of [
          [/ZGODNOŚĆ Z KANONEM/, 'nagłówek sekcji'],
          [/Dane osobowe nie opuszczają konta/, 'treść inwariantu'],
          [/BDR-090.*\n.*Adres użytkownika nigdy/s, 'treść decyzji z task\'a'],
          [/VETO → NO_GO/, 'VETO za naruszenie inwariantu'],
          [/plik:linia kodu — punkt kanonu/, 'format cytatu'],
          [/NIEROZWIĄZANE ODNIESIENIA.*BDR-999.*nie zgaduj/s, 'nierozwiązane odniesienia (informacja, nie luka)'],
          [/^(?![\s\S]*NIEROZWIĄZANE[\s\S]*unverified_scope[\s\S]*BDR-999)/, 'nierozwiązane nie mają iść do unverified_scope'],
        ]) if (!re.test(p)) return 'prompt bramki bez: ' + what;
        return null;
      },
    },
    {
      name: 'prompt-bramki-bez-governance-bez-sekcji-kanonu',
      run() {
        for (const cn of [undefined, { active: false, inject: [], refs: [], unresolved: [] }]) {
          const p = c.buildFinalGatePrompt(ARGS(cn), [], ['src/a.ts'], 'tree', []);
          if (/KANON|kanon/.test(p)) return 'sekcja kanonu odpaliła bez governance: ' + JSON.stringify(cn);
        }
        return null;
      },
    },
  ];
}

(async () => {
  const all = [...cases, ...(await promptCases())];
  let failed = 0;
  for (const t of all) {
    let err;
    try { err = t.run(); } catch (e) { err = 'wyjątek: ' + e.message; }
    if (err) { failed += 1; console.log(`  ❌ ${t.name}\n     ${String(err).split('\n').join('\n     ')}`); }
    else console.log(`  ✅ ${t.name}`);
  }
  console.log(`\n${all.length - failed}/${all.length} passed`);
  process.exit(failed ? 1 : 0);
})();
