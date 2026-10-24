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
 *   7. (TASK-OBS-017) `resolved` nie starzeje się, rekord otwarty ponownie starzeje się od reopened_at
 *   8. (TASK-OBS-017) pre-commit ostrzega o regułach bez claimu; raport tygodniowy ma wrapper crona i pilnuje go freshness
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
  {
    // TASK-OBS-017 (ADR 0011 aneks): `resolved` to stan końcowy — nie gnije jak promoted/proposed — ale rekord
    // otwarty ponownie (regresja claimu) wraca do `proposed` i starzeje się od `reopened_at`.
    name: 'resolved-does-not-age-but-reopened-does',
    run({ inbox }) {
      const rows = [
        { id: 'resolved-old', status: 'resolved', first_seen: daysAgo(90), last_seen: daysAgo(90) },
        { id: 'reopened-fresh', status: 'proposed', first_seen: daysAgo(90), last_seen: daysAgo(90), reopened_at: daysAgo(3), reopened_from_status: 'resolved' },
        { id: 'reopened-stale', status: 'proposed', first_seen: daysAgo(90), last_seen: daysAgo(90), reopened_at: daysAgo(20), reopened_from_status: 'resolved' },
      ];
      return eq(inbox.staleInboxEntries(rows, NOW).map((r) => r.id), ['reopened-stale'], 'rekordy bez ruchu');
    },
  },
  {
    // TASK-OBS-017 (ADR 0015 D6): nowa reguła ORC/ANL bez `**Claim:**` daje ostrzeżenie w pre-commit, nie błąd;
    // raport tygodniowy ma wrapper crona i jest pilnowany przez telemetry-freshness.
    name: 'guards-warn-about-rules-without-claim-and-weekly-wrapper',
    run({ claims }) {
      const src = fs.readFileSync(path.join(REPO, 'scripts', 'pre-commit-guards.mjs'), 'utf8');
      if (!src.includes('printClaimWarning') || !src.includes('rulesWithoutClaim')) return 'pre-commit nie ostrzega o regułach bez claimu';
      const history = '### ORC-200 — z claimem (2026-10-24)\n\n**Claim:** metric=died direction=down threshold=0.2 engine=57f8f64\n\n### ORC-201 — bez claimu (2026-10-24)\n\ntreść\n';
      const e = eq(claims.rulesWithoutClaim(history, ['ORC-200', 'ORC-201']), ['ORC-201'], 'reguły bez claimu');
      if (e) return e;
      const wrapper = fs.statSync(path.join(REPO, 'scripts', 'cron', 'telemetry-weekly.sh'));
      if (!(wrapper.mode & 0o111)) return 'scripts/cron/telemetry-weekly.sh nie jest wykonywalny';
      const fresh = fs.readFileSync(path.join(REPO, 'scripts', 'telemetry-freshness.mjs'), 'utf8');
      return fresh.includes('expectedWeeklyReport') ? null : 'telemetry-freshness nie pilnuje raportu tygodniowego';
    },
  },
];

(async () => {
  const libs = {
    claims: await import(path.join(REPO, 'scripts/lib/telemetry-claims.mjs')),
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
