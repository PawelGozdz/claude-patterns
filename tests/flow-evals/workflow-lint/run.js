#!/usr/bin/env node
/**
 * tests/flow-evals/workflow-lint/run.js — eval L1 dla hooks/workflow-lint.js (D7).
 * Uruchom przy każdej zmianie lint-a: node tests/flow-evals/workflow-lint/run.js
 */

const path = require('path');
const { lint } = require(path.resolve(__dirname, '..', '..', '..', 'hooks', 'workflow-lint.js'));

const GOOD = `
export const meta = { name: 'impl-good', description: 'x', phases: [] }
phase('Domain')
const impl = await agent('implement domain layer per decisions', { label: 'impl:domain' })
const diff = await agent('run: git diff --stat', { label: 'gate:code-exists' })
if (!diff || !diff.trim()) { log('ESCALATE: implementer nie zmienił plików'); return { escalated: true } }
phase('Verify')
const v = await agent('verify domain layer', { label: 'verify:domain', agentType: 'code-quality-verifier', schema: VERDICT })
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
const final = await agent('final security gate', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
`;

const BAD = `
export const meta = { name: 'impl-bad', description: 'x', phases: [] }
const impl = await agent('implement domain layer', { label: 'impl:domain', agentType: 'domain-application-implementer', schema: IMPL_REPORT })
const vs = await parallel([
  () => agent('verify slice mechanism', { label: 'verify:mech', agentType: 'code-quality-verifier', schema: VERDICT }),
  () => agent('verify slice wire-up', { label: 'verify:wire', agentType: 'code-quality-verifier', schema: VERDICT }),
])
`;

const FULL_DIFF_INJECTED = `
export const meta = { name: 'impl-fulldiff', description: 'x', phases: [] }
phase('Domain')
const impl = await agent('implement domain layer per decisions', { label: 'impl:domain' })
const diff = await agent('run: git diff', { label: 'gate:code-exists' })
if (!diff || !diff.trim()) { log('ESCALATE: implementer nie zmienił plików'); return { escalated: true } }
phase('Application')
const implApp = await agent(\`implement application layer, domain diff for reference: \${diff}\`, { label: 'impl:application' })
phase('Verify')
const v = await agent('verify domain layer', { label: 'verify:domain', agentType: 'code-quality-verifier', schema: VERDICT })
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
const final = await agent('final security gate', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
`;

const CASES = [
  { name: 'good-script-passes', src: GOOD, expectErrors: [], expectWarns: [] },
  { name: 'bad-script-wl1-wl2-wl3', src: BAD, expectErrors: ['WL1', 'WL2', 'WL3'], expectWarns: ['WL5'] },
  { name: 'verify-without-schema-warns-wl4', src: GOOD.replace(', schema: VERDICT })', ' })'), expectErrors: [], expectWarns: ['WL4'] }, // replace = tylko 1. wystąpienie
  { name: 'full-diff-injected-warns-wl6', src: FULL_DIFF_INJECTED, expectErrors: [], expectWarns: ['WL6'] },

];

let failed = 0;
for (const c of CASES) {
  const f = lint(c.src);
  const errs = f.filter((x) => x.level === 'ERROR').map((x) => x.id).sort();
  const warns = f.filter((x) => x.level === 'WARN').map((x) => x.id).sort();
  const ok = JSON.stringify(errs) === JSON.stringify([...c.expectErrors].sort())
    && JSON.stringify(warns) === JSON.stringify([...c.expectWarns].sort());
  if (ok) {
    process.stdout.write(`  ✅ ${c.name}\n`);
  } else {
    failed++;
    process.stdout.write(`  ❌ ${c.name} — expected E=${c.expectErrors} W=${c.expectWarns}, got E=${errs} W=${warns}\n`);
  }
}
process.stdout.write(`\n${CASES.length - failed}/${CASES.length} passed\n`);
process.exit(failed ? 1 : 0);
