#!/usr/bin/env node
/**
 * tests/flow-evals/conformance/run.js — eval L1 dla tools/conformance (reguły ciała pliku + ratchet).
 *
 * Zero LLM. Każdy przypadek buduje malutkie repozytorium git w katalogu tymczasowym, robi commit
 * (to jest baseline), modyfikuje drzewo robocze i uruchamia PRAWDZIWE CLI `check.mjs`.
 * Testy są dwukierunkowe: reguła musi łapać naruszenia ORAZ nie łapać legalnych kształtów
 * (event handler, stary dług, przesunięcie linii, wyjątek z powodem) — reguła, która tylko łapie,
 * w pierwszym tygodniu uczy zespół ją obchodzić.
 *
 * Uruchom: node tests/flow-evals/conformance/run.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CHECK = path.join(REPO, 'tools', 'conformance', 'check.mjs');
const H = 'src/contexts/auth/application/commands/change-password/handler.ts';

const tmpRoots = [];
function mkRepo(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-eval-'));
  tmpRoots.push(dir);
  sh(dir, 'init', '-q');
  sh(dir, 'config', 'user.email', 't@t');
  sh(dir, 'config', 'user.name', 't');
  for (const [p, c] of Object.entries(files)) put(dir, p, c);
  if (Object.keys(files).length) { sh(dir, 'add', '-A'); sh(dir, 'commit', '-qm', 'base'); }
  return dir;
}
function sh(cwd, ...args) { return spawnSync('git', args, { cwd, encoding: 'utf8' }); }
function put(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
function check(dir, args) {
  const r = spawnSync('node', [CHECK, ...args], { cwd: dir, encoding: 'utf8' });
  let json = null;
  if (args.includes('--json')) { try { json = JSON.parse(r.stdout); } catch { /* zostaje null */ } }
  return { status: r.status, out: r.stdout, err: r.stderr, json };
}
const probe = (dir, extra = []) => check(dir, ['--changed', '--ratchet', '--json', ...extra]);
const counts = (r) => {
  const f = r.json?.body?.findings ?? [];
  return { new: f.filter((x) => x.status === 'new').length, baseline: f.filter((x) => x.status === 'baseline').length, excepted: f.filter((x) => x.status === 'excepted').length };
};
const throwsFile = (n, tag = 'A') =>
  `export class ChangePasswordHandler {\n  async executeBusinessLogic(c: any) { return this.verify(c); }\n  private verify(c: any) {\n` +
  Array.from({ length: n }, (_, i) => `    if (!c.f${i}) throw new Error('${tag}${tag === 'A' ? '' : i}');`).join('\n') +
  `\n    return 1;\n  }\n}\n`;

const CASES = [
  {
    name: 'clean-tree-passes',
    run() {
      const d = mkRepo({ [H]: throwsFile(2) });
      const r = probe(d);
      if (r.status !== 0) return `exit ${r.status}, oczekiwano 0 (nic nie zmieniono)`;
      return null;
    },
  },
  {
    name: 'four-new-throws-in-file-with-eight-old-all-flagged',
    run() {
      const d = mkRepo({ [H]: throwsFile(8, 'old') });
      put(d, H, throwsFile(8, 'old').replace('    return 1;', Array.from({ length: 4 }, (_, i) => `    if (!c.g${i}) throw new Error('new${i}');`).join('\n') + '\n    return 1;'));
      const r = probe(d); const c = counts(r);
      if (r.status !== 1) return `exit ${r.status}, oczekiwano 1`;
      if (c.new !== 4 || c.baseline !== 8) return `new=${c.new} baseline=${c.baseline}, oczekiwano 4/8 (baseline plikowy przepuściłby 4 nowe)`;
      return null;
    },
  },
  {
    name: 'identical-lines-counted-as-multiset',
    run() {
      const d = mkRepo({ [H]: throwsFile(2) });
      put(d, H, throwsFile(2).replace('    return 1;', "    if (!c.f1) throw new Error('A');\n    return 1;"));
      const c = counts(probe(d));
      // dwa stare 'throw new Error('A')' w tej metodzie + jeden dopisany o tym samym tekście → 1 nowy
      if (c.new !== 1 || c.baseline !== 2) return `new=${c.new} baseline=${c.baseline}, oczekiwano 1/2`;
      return null;
    },
  },
  {
    name: 'line-shift-and-extra-spaces-stay-baseline',
    run() {
      const d = mkRepo({ [H]: throwsFile(2) });
      put(d, H, '// przesuwa wszystkie linie\n\n' + throwsFile(2).replace(/throw new/g, 'throw   new'));
      const r = probe(d);
      if (r.status !== 0) return `exit ${r.status}: przesunięcie linii/whitespace zrobiło z długu nowe naruszenie`;
      return null;
    },
  },
  {
    name: 'throw-in-private-method-is-caught-whole-file',
    run() {
      const d = mkRepo({ [H]: 'export class H { async executeBusinessLogic() { return 1; } }\n' });
      put(d, H, throwsFile(1));
      const f = probe(d).json.body.findings[0];
      if (!f || f.member !== 'ChangePasswordHandler.verify') return `member=${f?.member}, oczekiwano ChangePasswordHandler.verify`;
      return null;
    },
  },
  {
    name: 'throw-inside-callback-belongs-to-the-named-method',
    run() {
      const d = mkRepo({ [H]: 'export class H { async m() { return 1; } }\n' });
      put(d, H, "export class H { async m() { return [1].map(() => { throw new Error('x'); }); } }\n");
      const f = probe(d).json.body.findings[0];
      if (!f || f.member !== 'H.m') return `member=${f?.member}, oczekiwano H.m`;
      return null;
    },
  },
  {
    name: 'query-handler-throw-is-caught',
    run() {
      const p = 'src/contexts/a/application/queries/get-x/handler.ts';
      const d = mkRepo({ [p]: 'export class Q { run() { return 1; } }\n' });
      put(d, p, "export class Q { run() { throw new Error('x'); } }\n");
      if (probe(d).status !== 1) return 'throw w query handlerze przeszedł';
      return null;
    },
  },
  {
    name: 'event-handler-and-processor-are-out-of-scope',
    run() {
      const d = mkRepo({ 'README.md': 'x\n' });
      put(d, 'src/contexts/a/application/event-handlers/on-x.handler.ts', "import { InjectQueue } from '@nestjs/bullmq';\nexport class E { h() { throw new Error('retry'); } }\n");
      put(d, 'src/contexts/a/infrastructure/queues/x.processor.ts', "import { Queue } from 'bullmq';\nexport class P { p() { throw new Error('retry'); } }\n");
      const r = probe(d);
      if (r.status !== 0) return `exit ${r.status}: event handler / procesor nie są w zakresie reguł (rethrow dla retry BullMQ jest legalny)\n${r.out}`;
      return null;
    },
  },
  {
    name: 'throw-exception-marker-with-reason-is-waiver',
    // Wyjątek zatwierdzony = obecny w baseline (zacommitowany przed przebiegiem). Samo jego dopisanie w przebiegu to exception-new.
    run() {
      const d = mkRepo({ [H]: "export class H {\n  m() {\n    // THROW-EXCEPTION: callback blokady wymaga wyjątku (SecureOperationLock)\n    throw new Error('x');\n  }\n}\n" });
      put(d, H, "export class H {\n  m() {\n    // THROW-EXCEPTION: callback blokady wymaga wyjątku (SecureOperationLock)\n    throw new Error('x');\n  }\n}\n".replace('export class H {', 'export class H {\n  other() { return 1; }'));
      const r = probe(d); const c = counts(r);
      if (r.status !== 0 || c.excepted !== 1) return `exit ${r.status} excepted=${c.excepted}, oczekiwano 0/1`;
      return null;
    },
  },
  {
    name: 'throw-exception-marker-without-reason-is-not-waiver',
    run() {
      const d = mkRepo({ 'README.md': 'x\n' });
      put(d, H, "export class H {\n  m() {\n    throw new Error('x'); // THROW-EXCEPTION\n  }\n}\n");
      const r = probe(d);
      if (r.status !== 1) return 'marker bez powodu zadziałał jak wyjątek';
      if (!/bez powodu/.test(JSON.stringify(r.json))) return 'brak informacji o markerze bez powodu w ustaleniu';
      return null;
    },
  },
  {
    name: 'bullmq-import-and-injectqueue-in-new-handler-are-hard',
    run() {
      const d = mkRepo({ 'README.md': 'x\n' });
      put(d, H, "import { InjectQueue } from '@nestjs/bullmq';\nimport type { Queue } from 'bullmq';\nexport class H {\n  constructor(@InjectQueue('q') private readonly q: Queue) {}\n}\n");
      const c = counts(probe(d));
      if (c.new !== 3) return `new=${c.new}, oczekiwano 3 (import @nestjs/bullmq, import bullmq, dekorator @InjectQueue)`;
      return null;
    },
  },
  {
    name: 'require-and-dynamic-import-of-bullmq-are-caught',
    run() {
      const d = mkRepo({ 'README.md': 'x\n' });
      put(d, H, "export class H {\n  a() { return require('bullmq'); }\n  async b() { return import('bullmq'); }\n}\n");
      const c = counts(probe(d));
      if (c.new !== 2) return `new=${c.new}, oczekiwano 2`;
      return null;
    },
  },
  {
    name: 'queue-port-handler-is-clean',
    run() {
      const d = mkRepo({ 'README.md': 'x\n' });
      put(d, H, "import { Inject } from '@nestjs/common';\nimport { SMS_QUEUE, type ISmsQueue } from './queue.port';\nexport class H {\n  constructor(@Inject(SMS_QUEUE) private readonly q: ISmsQueue) {}\n}\n");
      if (probe(d).status !== 0) return 'handler z portem został oflagowany';
      return null;
    },
  },
  {
    name: 'queue-exception-marker-with-reason-is-waiver',
    run() {
      const d = mkRepo({ [H]: "// QUEUE-EXCEPTION: migracja w toku, port w TS-X-002\nimport { InjectQueue } from '@nestjs/bullmq';\nexport class H {}\n" });
      put(d, H, "// QUEUE-EXCEPTION: migracja w toku, port w TS-X-002\nimport { InjectQueue } from '@nestjs/bullmq';\nexport class H {}\n" + '// dopisek\n');
      const r = probe(d);
      if (r.status !== 0) return `exit ${r.status}\n${r.out}`;
      return null;
    },
  },
  {
    name: 'config-exception-with-reason-waives-and-stale-is-reported',
    run() {
      const d = mkRepo({ [H]: "export class H { m() { throw new Error('x'); } }\n", '.claude/conformance.json': JSON.stringify({ exceptions: [
        { rule: 'CH-NO-THROW', file: H, reason: 'callback wymaga wyjątku, TS-Y-001' },
        { rule: 'CH-NO-THROW', file: 'src/nie/istnieje/handler.ts', reason: 'martwy wpis' },
      ] }) });
      put(d, H, "export class H { n() { return 1; } m() { throw new Error('x'); } }\n");
      const r = probe(d);
      if (r.status !== 0) return `exit ${r.status}: wyjątek z powodu nie zadziałał`;
      if (r.json.body.staleExceptions.length !== 1) return 'martwy wpis wyjątku nie został zgłoszony';
      return null;
    },
  },
  {
    name: 'config-exception-without-reason-is-config-error',
    run() {
      const d = mkRepo({ 'README.md': 'x\n' });
      put(d, '.claude/conformance.json', JSON.stringify({ exceptions: [{ rule: 'CH-NO-THROW', file: H }] }));
      const r = probe(d);
      if (r.status !== 2) return `exit ${r.status}, oczekiwano 2 (wyjątek bez powodu to błąd konfiguracji)`;
      return null;
    },
  },
  {
    name: 'rule-can-be-disabled-per-project',
    run() {
      const d = mkRepo({ [H]: "export class H { m() { throw new Error('x'); } }\n", '.claude/conformance.json': JSON.stringify({ bodyRules: [{ id: 'CH-NO-THROW', disabled: true }] }) });
      put(d, H, "export class H { n() { return 1; } m() { throw new Error('x'); } }\n");
      if (probe(d).status !== 0) return 'wyłączona reguła (zatwierdzona w baseline) nadal blokuje';
      return null;
    },
  },
  {
    name: 'renamed-file-keeps-its-baseline',
    run() {
      const d = mkRepo({ [H]: throwsFile(3) });
      const moved = 'src/contexts/auth/application/commands/update-password/handler.ts';
      fs.mkdirSync(path.dirname(path.join(d, moved)), { recursive: true });
      sh(d, 'mv', H, moved);
      const r = probe(d);
      if (r.status !== 0) return `exit ${r.status}: git mv uczynił z długu nowe naruszenia\n${r.out}`;
      return null;
    },
  },
  {
    name: 'untracked-new-file-has-empty-baseline',
    run() {
      const d = mkRepo({ [H]: throwsFile(2) });
      put(d, 'src/contexts/auth/application/commands/other/handler.ts', "export class O { m() { throw new Error('A'); } }\n");
      const c = counts(probe(d));
      if (c.new !== 1) return `new=${c.new}, oczekiwano 1 (nowy plik nie dziedziczy długu z innego pliku)`;
      return null;
    },
  },
  {
    name: 'spec-and-tests-dir-are-ignored',
    run() {
      const d = mkRepo({ 'README.md': 'x\n' });
      put(d, 'src/contexts/a/application/commands/x/handler.spec.ts', "throw new Error('x');\n");
      put(d, 'src/contexts/a/application/commands/x/__tests__/handler.ts', "throw new Error('x');\n");
      if (probe(d).status !== 0) return 'pliki testowe są skanowane';
      return null;
    },
  },
  {
    name: 'monorepo-path-is-matched',
    run() {
      const d = mkRepo({ 'README.md': 'x\n' });
      put(d, 'apps/api/src/contexts/a/application/commands/x/handler.ts', "export class H { m() { throw new Error('x'); } }\n");
      if (probe(d).status !== 1) return 'apps/api/src/... nie jest w zakresie reguł';
      return null;
    },
  },
  {
    name: 'strict-dir-mode-lists-baseline-debt-too',
    run() {
      const d = mkRepo({ [H]: throwsFile(3) });
      const r = check(d, ['--dir', 'src', '--json']);
      const c = counts(r);
      if (r.status !== 1 || c.new !== 3) return `exit ${r.status} new=${c.new}, oczekiwano 1/3 (audyt bez ratchetu pokazuje cały dług)`;
      return null;
    },
  },
  {
    name: 'baseline-ref-override-compares-against-given-commit',
    run() {
      const d = mkRepo({ [H]: throwsFile(1) });
      put(d, H, throwsFile(2));
      sh(d, 'commit', '-qam', 'second');
      const vsHead = probe(d);
      const vsFirst = probe(d, ['--baseline-ref', 'HEAD~1']);
      if (vsHead.status !== 0) return 'HEAD: czyste drzewo powinno przejść';
      if (counts(vsFirst).new !== 1) return `HEAD~1: new=${counts(vsFirst).new}, oczekiwano 1`;
      return null;
    },
  },
  {
    name: 'unknown-ref-and-non-git-dir-exit-3',
    run() {
      const d = mkRepo({ 'README.md': 'x\n' });
      if (probe(d, ['--baseline-ref', 'nie-ma-takiego']).status !== 3) return 'nieznany ref: exit ≠ 3';
      const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-eval-plain-'));
      tmpRoots.push(plain);
      if (check(plain, ['--changed', '--ratchet']).status !== 3) return 'katalog bez gita: exit ≠ 3';
      return null;
    },
  },
  {
    name: 'legacy-hard-rule-still-reported-in-dir-mode',
    run() {
      const d = mkRepo({ 'src/domain/x.aggregate.ts': 'export class X {}\n' });
      const r = check(d, ['--dir', 'src', '--json']);
      if (r.status !== 1 || r.json.violations.length !== 1 || r.json.violations[0].type !== 'extends') return `exit ${r.status}, naruszenia extends: ${r.json?.violations?.length}`;
      return null;
    },
  },
  {
    name: 'usage-without-mode-exit-2',
    run() {
      const d = mkRepo({ 'README.md': 'x\n' });
      if (check(d, []).status !== 2) return 'brak --dir/--changed: exit ≠ 2';
      return null;
    },
  },
  {
    name: 'exception-marker-added-in-run-is-exception-new',
    run() {
      const d = mkRepo({ [H]: "export class H {\n  m() {\n    throw new Error('x');\n  }\n}\n" });
      put(d, H, "export class H {\n  m() {\n    // THROW-EXCEPTION: callback blokady wymaga wyjątku (SecureOperationLock)\n    throw new Error('x');\n  }\n}\n");
      const r = probe(d);
      const f = (r.json?.body?.findings ?? []).filter((x) => x.status === 'exception-new');
      if (r.status !== 1 || f.length !== 1) return `exit ${r.status} exception-new=${f.length}, oczekiwano 1/1 (agent sam sobie wystawił wyjątek)\n${r.out}`;
      const txt = check(d, ['--changed', '--ratchet']);
      if (!/zgod/i.test(txt.out) || !/exception|wyjątek/i.test(txt.out)) return `komunikat nie mówi o zgodzie człowieka:\n${txt.out}`;
      return null;
    },
  },
  {
    name: 'config-exception-added-in-run-is-exception-new-and-config-changed',
    run() {
      const d = mkRepo({ [H]: "export class H { m() { throw new Error('x'); } }\n" });
      put(d, '.claude/conformance.json', JSON.stringify({ exceptions: [{ rule: 'CH-NO-THROW', file: H, reason: 'sam sobie' }] }));
      put(d, H, "export class H { n() { return 1; } m() { throw new Error('x'); } }\n");
      const r = probe(d);
      const f = r.json?.body?.findings ?? [];
      if (r.status !== 1) return `exit ${r.status}, oczekiwano 1`;
      if (!f.some((x) => x.status === 'exception-new')) return 'brak exception-new dla wpisu dodanego w przebiegu';
      if (!f.some((x) => x.rule === 'CONFIG-CHANGED')) return 'brak ustalenia CONFIG-CHANGED';
      return null;
    },
  },
  {
    name: 'disabling-a-rule-in-run-is-config-changed',
    run() {
      const d = mkRepo({ [H]: "export class H { m() { return 1; } }\n" });
      put(d, '.claude/conformance.json', JSON.stringify({ bodyRules: [{ id: 'CH-NO-THROW', disabled: true }] }));
      put(d, H, "export class H { m() { throw new Error('x'); } }\n");
      const r = probe(d);
      if (r.status !== 1 || !(r.json?.body?.findings ?? []).some((x) => x.rule === 'CONFIG-CHANGED')) return `exit ${r.status}: wyłączenie reguły w przebiegu przeszło bez ustalenia\n${r.out}`;
      return null;
    },
  },
  {
    name: 'rename-from-unmatched-path-gets-no-baseline',
    run() {
      const helper = 'src/contexts/auth/application/commands/change-password/change-password.helper.ts';
      const d = mkRepo({ [helper]: throwsFile(3) });
      sh(d, 'mv', helper, H);
      const c = counts(probe(d));
      if (c.new !== 3) return `new=${c.new}, oczekiwano 3 (plik spoza reguły przeniesiony do handler.ts nie wnosi długu)`;
      return null;
    },
  },
  {
    name: 'export-from-and-import-equals-and-legacy-bull-are-caught',
    run() {
      const d = mkRepo({ 'README.md': 'x\n' });
      put(d, H, "export { Queue } from 'bullmq';\nimport q = require('bullmq');\nimport { Queue as B } from '@nestjs/bull';\nexport class H {}\n");
      const c = counts(probe(d));
      if (c.new !== 3) return `new=${c.new}, oczekiwano 3 (export from, import =, @nestjs/bull)`;
      return null;
    },
  },
  {
    name: 'only-and-skip-narrow-the-probe-scope',
    run() {
      const other = 'src/contexts/billing/application/commands/pay/handler.ts';
      const d = mkRepo({ 'README.md': 'x\n' });
      put(d, H, "export class A { m() { throw new Error('a'); } }\n");
      put(d, other, "export class B { m() { throw new Error('b'); } }\n");
      const all = counts(probe(d)).new;
      const onlyAuth = counts(probe(d, ['--only', 'src/contexts/auth/'])).new;
      const segment = counts(probe(d, ['--only', 'application/'])).new;
      const skipped = counts(probe(d, ['--skip', other])).new;
      const onlyFile = counts(probe(d, ['--only', H])).new;
      if (all !== 2 || onlyAuth !== 1 || segment !== 2 || skipped !== 1 || onlyFile !== 1) {
        return `all=${all} onlyAuth=${onlyAuth} segment=${segment} skipped=${skipped} onlyFile=${onlyFile}, oczekiwano 2/1/2/1/1`;
      }
      return null;
    },
  },
  {
    name: 'baseline-ref-pinned-to-run-start-survives-a-commit-in-the-run',
    run() {
      const d = mkRepo({ [H]: throwsFile(1) });
      const start = sh(d, 'rev-parse', 'HEAD').stdout.trim();
      put(d, H, throwsFile(3));
      sh(d, 'add', '-A'); sh(d, 'commit', '-qm', 'agent commits mid-run');
      const moved = counts(probe(d)).new;
      const pinned = counts(probe(d, ['--baseline-ref', start])).new;
      if (moved !== 0 || pinned !== 2) return `HEAD: new=${moved} (oczekiwano 0 — dowód luki), pinned: new=${pinned} (oczekiwano 2)`;
      return null;
    },
  },
  {
    name: 'plain-mv-without-git-keeps-baseline-and-approved-exception',
    // zwykły mv = "D + nieśledzony" dla git diff na drzewie roboczym; rename wykrywa dopiero tymczasowy indeks
    run() {
      const MARKED = "export class H {\n  m() {\n    // THROW-EXCEPTION: zatwierdzone w baseline\n    throw new Error('x');\n  }\n  p() { throw new Error('dlug'); }\n}\n";
      const d = mkRepo({ [H]: MARKED });
      const moved = 'src/contexts/auth/application/commands/update-password/handler.ts';
      fs.mkdirSync(path.dirname(path.join(d, moved)), { recursive: true });
      fs.renameSync(path.join(d, H), path.join(d, moved));
      const r = probe(d); const c = counts(r);
      if (r.status !== 0 || c.new !== 0 || (r.json?.body?.findings ?? []).some((x) => x.status === 'exception-new')) {
        return `exit ${r.status} new=${c.new}: zwykły mv zgubił baseline albo zatwierdzony wyjątek\n${r.out}`;
      }
      return null;
    },
  },
  {
    name: 'dir-ratchet-from-subdirectory-resolves-dir-against-cwd',
    run() {
      const d = mkRepo({ ['apps/api/' + H]: throwsFile(2) });
      const r = spawnSync('node', [CHECK, '--dir', 'src', '--ratchet', '--json'], { cwd: path.join(d, 'apps/api'), encoding: 'utf8' });
      if (/ENOENT/.test(r.stderr)) return 'ENOENT: --dir liczony od korzenia gita zamiast od cwd\n' + r.stderr.slice(0, 200);
      let j; try { j = JSON.parse(r.stdout); } catch { return 'brak JSON: ' + r.stderr.slice(0, 200); }
      if (j.scanned < 1) return 'scanned=' + j.scanned + ', oczekiwano >= 1';
      return null;
    },
  },
  {
    name: 'only-scope-edge-cases-typo-dot-dir-segment-boundary',
    run() {
      const dotted = 'apps/api.v2/src/contexts/a/application/commands/x/handler.ts';
      const d = mkRepo({ 'README.md': 'x\n' });
      put(d, dotted, "export class A { m() { throw new Error('a'); } }\n");
      put(d, 'myapplication/application/commands/y/handler.ts', "export class B { m() { throw new Error('b'); } }\n");
      const typo = probe(d, ['--only', 'src/contexts/nie-ma/']);
      if (!typo.json?.scope?.emptyScope || !/--only nie dopasował/.test(typo.err)) return 'literówka w --only przeszła bez ostrzeżenia (fail-open)';
      const dot = counts(probe(d, ['--only', 'apps/api.v2'])).new;
      const boundary = counts(probe(d, ['--only', 'application/'])).new;
      if (dot !== 1) return `katalog z kropką: new=${dot}, oczekiwano 1`;
      if (boundary !== 2) return `segment application/: new=${boundary}, oczekiwano 2 (oba pliki mają segment application/)`;
      const none = counts(probe(d, ['--only', 'myapp/'])).new;
      if (none !== 0) return `myapp/ nie może pasować do myapplication/ (granica segmentu): new=${none}`;
      return null;
    },
  },
  {
    name: 'approved-exception-is-a-multiset-second-identical-one-is-new',
    run() {
      const ONE = "export class H {\n  m() {\n    // THROW-EXCEPTION: zatwierdzone\n    throw new Error('x');\n  }\n}\n";
      const TWO = "export class H {\n  m() {\n    // THROW-EXCEPTION: zatwierdzone\n    throw new Error('x');\n    // THROW-EXCEPTION: zatwierdzone\n    throw new Error('x');\n  }\n}\n";
      const d = mkRepo({ [H]: ONE });
      put(d, H, TWO);
      const f = probe(d).json?.body?.findings ?? [];
      const ex = f.filter((x) => x.status === 'excepted').length;
      const en = f.filter((x) => x.status === 'exception-new').length;
      if (ex !== 1 || en !== 1) return `excepted=${ex} exception-new=${en}, oczekiwano 1/1 (drugi identyczny wyjątek nie jest zatwierdzony)`;
      return null;
    },
  },
  {
    name: 'config-changed-ignores-reformat-and-key-order-flags-invalid-json-and-deletion',
    run() {
      const cfg = { exceptions: [{ rule: 'CH-NO-THROW', file: H, reason: 'powod' }], bodyRules: [{ id: 'CH-NO-THROW', disabled: false }] };
      const base = { [H]: "export class H { m() { throw new Error('x'); } }\n", '.claude/conformance.json': JSON.stringify(cfg) };
      const touch = (d) => put(d, H, "export class H { n() { return 1; } m() { throw new Error('x'); } }\n");
      const has = (r) => (r.json?.body?.findings ?? []).some((x) => x.rule === 'CONFIG-CHANGED');
      let d = mkRepo(base); touch(d);
      put(d, '.claude/conformance.json', JSON.stringify({ bodyRules: cfg.bodyRules, exceptions: cfg.exceptions }, null, 2) + '\n');
      if (has(probe(d))) return 'przeformatowanie / kolejność kluczy dały fałszywe CONFIG-CHANGED';
      d = mkRepo(base); touch(d); put(d, '.claude/conformance.json', '{ nie json');
      if (!has(probe(d))) return 'niepoprawny JSON konfiguracji nie został zgłoszony';
      d = mkRepo(base); touch(d); fs.rmSync(path.join(d, '.claude/conformance.json'));
      if (!has(probe(d))) return 'usunięcie konfiguracji nie zostało zgłoszone';
      d = mkRepo({ 'README.md': 'x\n' }); put(d, H, "export class H { m() { return 1; } }\n");
      if (has(probe(d))) return 'brak konfiguracji po obu stronach dał CONFIG-CHANGED';
      return null;
    },
  },
  {
    name: 'stale-exception-is-judged-only-for-paths-that-do-not-exist',
    run() {
      const other = 'src/contexts/billing/application/commands/pay/handler.ts';
      const d = mkRepo({
        [H]: "export class H { m() { return 1; } }\n",
        [other]: "export class B { m() { throw new Error('b'); } }\n",
        '.claude/conformance.json': JSON.stringify({ exceptions: [
          { rule: 'CH-NO-THROW', file: other, reason: 'plik istnieje, ale nie jest w zmianie' },
          { rule: 'CH-NO-THROW', file: 'src/nie/istnieje/handler.ts', reason: 'martwa ścieżka' },
        ] }),
      });
      put(d, H, "export class H { m() { return 2; } }\n");
      const stale = probe(d).json?.body?.staleExceptions ?? [];
      if (stale.length !== 1 || stale[0].file !== 'src/nie/istnieje/handler.ts') return `stale=${JSON.stringify(stale.map((e) => e.file))}, oczekiwano tylko nieistniejącej ścieżki`;
      return null;
    },
  },
  {
    name: 'template-literal-require-is-caught',
    run() {
      const d = mkRepo({ 'README.md': 'x\n' });
      put(d, H, "export class H { a() { return require(`bullmq`); } }\n");
      const c = counts(probe(d));
      if (c.new !== 1) return `new=${c.new}, oczekiwano 1`;
      return null;
    },
  },
  {
    name: 'changed-without-ratchet-is-strict',
    run() {
      const d = mkRepo({ [H]: throwsFile(2) });
      put(d, H, throwsFile(2) + '// dopisek\n');
      const r = check(d, ['--changed', '--json']);
      if (r.status !== 1) return `exit ${r.status}, oczekiwano 1 (bez ratchetu stary dług jest naruszeniem)`;
      return null;
    },
  },
];

let failed = 0;
for (const t of CASES) {
  let err;
  try { err = t.run(); } catch (e) { err = 'wyjątek: ' + e.message; }
  if (err) { failed++; process.stdout.write(`  ❌ ${t.name} — ${err}\n`); }
  else process.stdout.write(`  ✅ ${t.name}\n`);
}
for (const d of tmpRoots) fs.rmSync(d, { recursive: true, force: true });
process.stdout.write(`\n${CASES.length - failed}/${CASES.length} passed\n`);
process.exit(failed ? 1 : 0);
