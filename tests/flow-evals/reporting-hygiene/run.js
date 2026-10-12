#!/usr/bin/env node
/**
 * tests/flow-evals/reporting-hygiene/run.js — eval L1 dla higieny raportowania (TASK-OBS-007, ADR 0011 B1/B4/B5).
 *
 * DLACZEGO: skrzynka i audyt same pilnują, żeby nie zgniły — a to nie zadziała, jeśli próg
 * „bez ruchu" liczy się źle (ruch = najnowsze z last_seen / reopened_at / first_seen), cron
 * jest oceniany w złym dniu (weekend!) albo audyt raportuje jako nadmiar coś, co kompozycja wnosi.
 * Wszystko na sztucznych danych i w katalogu tymczasowym; żaden prawdziwy projekt nie jest dotykany.
 *
 * Kontrakty:
 *   1. promoted > 7 dni i proposed > 14 dni = bez ruchu; inne statusy i świeże rekordy nie
 *   2. reopened_at / last_seen odświeżają rekord (starszy first_seen go nie postarza)
 *   3. cron: w weekend oczekiwany jest piątkowy bieg; przed 07:30+2h bieżącego dnia — poprzedni dzień roboczy
 *   4. brak logu albo log sprzed oczekiwanego biegu = stale; log po biegu = świeży
 *   5. nadmiary: agent/kategoria/skill spoza kompozycji = INFO; wnoszone przez runtime.yml / project.yml — cisza
 *   6. pre-commit-guards drukuje postarzanie i ma eval zarejestrowany
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-hygiene-'));
const write = (p, c = '') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want) ? null : `${what}: ${JSON.stringify(got)}, oczekiwano ${JSON.stringify(want)}`);

const NOW = new Date('2026-10-12T12:00:00'); // poniedziałek, czas lokalny
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);

const tests = [
  {
    name: 'stale-thresholds-by-status',
    run({ inbox }) {
      const rows = [
        { id: 'p-old', status: 'promoted', last_seen: daysAgo(8) },
        { id: 'p-edge', status: 'promoted', last_seen: daysAgo(7) },
        { id: 'q-old', status: 'proposed', last_seen: daysAgo(15) },
        { id: 'q-edge', status: 'proposed', last_seen: daysAgo(14) },
        { id: 'done', status: 'dismissed', last_seen: daysAgo(90) },
        { id: 'nodate', status: 'proposed' },
      ];
      return eq(inbox.staleInboxEntries(rows, NOW).map((r) => `${r.id}:${r.days}`), ['q-old:15', 'p-old:8'], 'rekordy bez ruchu');
    },
  },
  {
    name: 'movement-is-latest-of-seen-reopened-first',
    run({ inbox }) {
      const rows = [
        { id: 'reopened', status: 'promoted', first_seen: daysAgo(60), last_seen: daysAgo(30), reopened_at: daysAgo(2) },
        { id: 'seen', status: 'proposed', first_seen: daysAgo(60), last_seen: new Date(NOW.getTime() - 3 * 86400000) },
        { id: 'only-first', status: 'proposed', first_seen: daysAgo(20) },
      ];
      return eq(inbox.staleInboxEntries(rows, NOW).map((r) => r.id), ['only-first'], 'tylko rekord bez żadnego ruchu');
    },
  },
  {
    name: 'cron-expected-run-skips-weekend-and-grace',
    run({ cron }) {
      const at = (iso) => cron.lastExpectedRun(new Date(iso));
      const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return eq(fmt(at('2026-10-11T12:00:00')), '2026-10-09T07:30', 'niedziela → piątek')
        || eq(fmt(at('2026-10-12T08:00:00')), '2026-10-09T07:30', 'poniedziałek 08:00 (w okresie zapasu) → piątek')
        || eq(fmt(at('2026-10-12T10:00:00')), '2026-10-12T07:30', 'poniedziałek 10:00 → poniedziałek');
    },
  },
  {
    name: 'cron-log-fresh-or-stale',
    run({ cron }) {
      const now = new Date('2026-10-12T12:00:00');
      const t = (iso) => new Date(iso).getTime();
      return eq(cron.auditLogStale(t('2026-10-12T07:31:00'), now), null, 'log po dzisiejszym biegu')
        || eq(cron.auditLogStale(t('2026-10-09T07:31:00'), now) !== null, true, 'log sprzed biegu = stale')
        || eq(cron.auditLogStale(null, now) !== null, true, 'brak logu = stale')
        || eq(cron.auditLogStale(t('2026-10-09T07:31:00'), new Date('2026-10-11T12:00:00')), null, 'weekend: piątkowy log wystarcza');
    },
  },
  {
    name: 'surplus-reports-only-what-composition-does-not-bring',
    run({ audit }) {
      const P = path.join(tmp, 'proj');
      write(path.join(P, '.claude/config/runtime.yml'), [
        'schema_version: 1', 'patterns:', '  always:', '    - flutter/a-pattern.md',
        'orchestrate:', '  layers:', '    - {id: domain, agent: "used-implementer"}',
        '  final_gate: {agent: "used-verifier"}',
      ].join('\n'));
      write(path.join(P, '.claude/config/project.yml'), 'project:\n  skills: [testing]\n');
      for (const a of ['used-implementer', 'used-verifier', 'orphan-agent']) write(path.join(P, '.claude/agents', `${a}.md`), '---\nname: x\n---\n');
      for (const c of ['flutter', 'stray-cat', 'mine-local']) write(path.join(P, '.claude/knowledge/patterns', c, 'x.md'), 'x');
      const mk = (name, cat) => {
        write(path.join(tmp, 'central/skills', cat, name, 'SKILL.md'), 'x');
        fs.mkdirSync(path.join(P, '.claude/skills'), { recursive: true });
        fs.symlinkSync(path.join(tmp, 'central/skills', cat, name), path.join(P, '.claude/skills', name));
      };
      mk('tdd', 'testing'); mk('stray-skill', 'marketing'); mk('grant-flow', 'integrations');
      const got = audit.surplusIssues(P);
      const text = got.map(([what]) => what).join(' | ');
      const bad = [];
      if (!got.every((i) => i[2] === 'info')) bad.push('nadmiar nie jest INFO');
      if (!/orphan-agent/.test(text) || /used-implementer|used-verifier/.test(text)) bad.push('agenci: ' + text);
      if (!/stray-cat/.test(text) || /flutter|mine-local/.test(text.replace(/stray-cat/, ''))) bad.push('kategorie: ' + text);
      if (!/stray-skill/.test(text) || /\btdd\b|grant-flow/.test(text)) bad.push('skille: ' + text);
      // integrations jest domyślne, ale exclude_skills je wyłącza → wtedy grant-flow to nadmiar
      write(path.join(P, '.claude/config/project.yml'), 'project:\n  skills: [testing]\nexclude_skills: [integrations]\n');
      if (!/grant-flow/.test(audit.surplusIssues(P).map(([w]) => w).join(' '))) bad.push('exclude_skills nie wyłączyło integrations');
      return bad.length ? bad.join('; ') : null;
    },
  },
  {
    name: 'surplus-silent-without-runtime-yml',
    run({ audit }) {
      const P = path.join(tmp, 'nort');
      write(path.join(P, '.claude/agents/a.md'), 'x');
      return eq(audit.surplusIssues(P), [], 'projekt bez runtime.yml');
    },
  },
  {
    name: 'guards-print-stale-and-register-eval',
    run() {
      const src = fs.readFileSync(path.join(REPO, 'scripts', 'pre-commit-guards.mjs'), 'utf8');
      if (!src.includes('tests/flow-evals/reporting-hygiene/run.js')) return 'eval nie jest w pre-commit-guards';
      if (!src.includes('staleInboxEntries')) return 'pre-commit nie wywołuje postarzania skrzynki';
      const wrapper = fs.statSync(path.join(REPO, 'scripts', 'cron', 'audit-daily.sh'));
      return wrapper.mode & 0o111 ? null : 'scripts/cron/audit-daily.sh nie jest wykonywalny';
    },
  },
];

(async () => {
  const libs = {
    inbox: await import(path.join(REPO, 'scripts/lib/inbox.mjs')),
    cron: await import(path.join(REPO, 'scripts/lib/cron-freshness.mjs')),
    audit: await import(path.join(REPO, 'scripts/lib/audit-checks.mjs')),
  };
  let failed = 0;
  for (const test of tests) {
    let err;
    try { err = test.run(libs); } catch (e) { err = 'wyjątek: ' + (e && e.stack || e); }
    console.log(`  ${err ? '❌' : '✅'} ${test.name}${err ? ' — ' + err : ''}`);
    if (err) failed++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
