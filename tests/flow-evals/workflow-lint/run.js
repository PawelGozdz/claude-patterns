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
const v = await agent('verify domain layer (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:domain', agentType: 'code-quality-verifier', schema: VERDICT })
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
const final = await agent('final security gate (limit: 12 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
`;

const BAD = `
export const meta = { name: 'impl-bad', description: 'x', phases: [] }
const impl = await agent('implement domain layer', { label: 'impl:domain', agentType: 'domain-application-implementer', schema: IMPL_REPORT })
const vs = await parallel([
  () => agent('verify slice mechanism (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:mech', agentType: 'code-quality-verifier', schema: VERDICT }),
  () => agent('verify slice wire-up (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:wire', agentType: 'code-quality-verifier', schema: VERDICT }),
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
const v = await agent('verify domain layer (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:domain', agentType: 'code-quality-verifier', schema: VERDICT })
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
const final = await agent('final security gate (limit: 12 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
`;

const TSC_BURIED_IN_PROSE = `
export const meta = { name: 'impl-tscburied', description: 'x', phases: [] }
phase('InfraConsumers')
const impl = await agent(\`Zaimplementuj warstwe. Zakres:
1. Handler A.
2. Handler B.
3. Test piramida.
4. Test piramida L1~50%/L2~30% dla tej warstwy. tsc --noEmit bez nowych bledow.\`, { label: 'impl:infra-consumers', agentType: 'infrastructure-testing-implementer' })
const diff = await agent('run: git diff --stat', { label: 'gate:code-exists' })
if (!diff || !diff.trim()) { log('ESCALATE'); return { escalated: true } }
phase('Verify')
const v = await agent('verify infra layer (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:infra', agentType: 'code-quality-verifier', schema: VERDICT })
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
const final = await agent('final security gate (limit: 12 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
`;

const DOCS_LAYER_HEAVY_CONTEXT = `
export const meta = { name: 'impl-docsheavy', description: 'x', phases: [] }
const infraDocsDirs = ['docs/product/geo-domain.md', 'docs/business/token-economy.md']
phase('InfraDocs')
const impl = await agent(\`Zaktualizuj dokumentacje.
\${EXISTING_INFRA}
\${DECISIONS}
Kod jest juz zaimplementowany, Read swiezy kod jesli potrzebujesz faktow.\`, { label: 'impl:infra-docs' })
const diff = await agent('run: git diff --stat', { label: 'gate:code-exists' })
if (!diff || !diff.trim()) { log('ESCALATE'); return { escalated: true } }
phase('Verify')
const v = await agent('verify docs layer (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:infra-docs', agentType: 'code-quality-verifier', schema: VERDICT })
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
const final = await agent('final security gate (limit: 12 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
`;

const DOCS_LAYER_MITIGATED = DOCS_LAYER_HEAVY_CONTEXT.replace(
  'Kod jest juz zaimplementowany, Read swiezy kod jesli potrzebujesz faktow.',
  'ZAKAZ: NIE czytaj, NIE grepuj, NIE weryfikuj zadnego kodu zrodlowego (src/) — kod jest juz w pelni zaimplementowany.'
);

// Regresja: realny skrypt juz-ide-api-2 uzywal referencji do wlasciwosci (FILES.geoDomainDoc),
// nie inline stringow — pierwsza wersja WL8 (tylko cudzyslowy) by tego nie zlapala.
const DOCS_LAYER_PROPERTY_REFS = `
export const meta = { name: 'impl-docsproprefs', description: 'x', phases: [] }
const infraDocsDirs = [FILES.geoDomainDoc, FILES.tokenEconomyDoc, FILES.monetizationMatrixDoc]
phase('InfraDocs')
const impl = await agent(\`Zaktualizuj dokumentacje.
\${EXISTING_INFRA}
\${DECISIONS}
Kod jest juz zaimplementowany, Read swiezy kod jesli potrzebujesz faktow.\`, { label: 'impl:infra-docs' })
const diff = await agent('run: git diff --stat', { label: 'gate:code-exists' })
if (!diff || !diff.trim()) { log('ESCALATE'); return { escalated: true } }
phase('Verify')
const v = await agent('verify docs layer (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:infra-docs', agentType: 'code-quality-verifier', schema: VERDICT })
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
const final = await agent('final security gate (limit: 12 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
`;

// WL10 — verify({schema}) bez limitu narzędzi + frazy wymuszającej werdykt (incydent
// TS-REP-PIPELINE-001-F3a-remediation). Prompt celowo krótki i bez markerów.
const WL10_MISSING_LIMIT = `
export const meta = { name: 'impl-wl10missing', description: 'x', phases: [] }
phase('Domain')
const impl = await agent('implement domain layer per decisions', { label: 'impl:domain' })
const diff = await agent('run: git diff --stat', { label: 'gate:code-exists' })
if (!diff || !diff.trim()) { log('ESCALATE'); return { escalated: true } }
phase('Verify')
const v = await agent('verify domain layer, sprawdz AC 1-10', { label: 'verify:domain', agentType: 'code-quality-verifier', schema: VERDICT })
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
const final = await agent('final security gate (limit: 12 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
`;

// Kanoniczny buildVerifierPrompt() z oboma markerami w ciele — wszystkie wywołania przez tę
// funkcję liczą się jako pokryte razem, mimo że call-site nie ma markerów wprost.
const WL10_VIA_BUILDER = `
export const meta = { name: 'impl-wl10builder', description: 'x', phases: [] }
function buildVerifierPrompt({ role, checkQuestions }) {
  return [
    \`Jesteś weryfikatorem (\${role}), nie implementerem — NIE używasz Write/Edit.\`,
    ...checkQuestions,
    'LIMIT: masz budżet około 10 wywołań narzędzi. Gdy się zbliża — natychmiast wydaj werdykt.',
  ].join('\\n')
}
phase('Domain')
const impl = await agent('implement domain layer per decisions', { label: 'impl:domain' })
const diff = await agent('run: git diff --stat', { label: 'gate:code-exists' })
if (!diff || !diff.trim()) { log('ESCALATE'); return { escalated: true } }
phase('Verify')
const v = await agent(buildVerifierPrompt({ role: 'domain', checkQuestions: ['czy X istnieje?'] }), { label: 'verify:domain', agentType: 'code-quality-verifier', schema: VERDICT })
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
const final = await agent(buildVerifierPrompt({ role: 'final', checkQuestions: ['czy Y jest spójne?'] }), { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
`;

const CASES = [
  { name: 'good-script-passes', src: GOOD, expectErrors: [], expectWarns: [] },
  { name: 'bad-script-wl1-wl2-wl3', src: BAD, expectErrors: ['WL1', 'WL2', 'WL3'], expectWarns: ['WL5'] },
  { name: 'verify-without-schema-warns-wl4', src: GOOD.replace(', schema: VERDICT })', ' })'), expectErrors: [], expectWarns: ['WL4'] }, // replace = tylko 1. wystąpienie
  { name: 'full-diff-injected-warns-wl6', src: FULL_DIFF_INJECTED, expectErrors: [], expectWarns: ['WL6'] },
  { name: 'tsc-buried-in-prose-warns-wl7', src: TSC_BURIED_IN_PROSE, expectErrors: [], expectWarns: ['WL7'] },
  { name: 'docs-layer-heavy-context-warns-wl8', src: DOCS_LAYER_HEAVY_CONTEXT, expectErrors: [], expectWarns: ['WL8'] },
  { name: 'docs-layer-mitigated-no-wl8', src: DOCS_LAYER_MITIGATED, expectErrors: [], expectWarns: [] },
  { name: 'docs-layer-property-refs-warns-wl8', src: DOCS_LAYER_PROPERTY_REFS, expectErrors: [], expectWarns: ['WL8'] },
  { name: 'verify-missing-limit-warns-wl10', src: WL10_MISSING_LIMIT, expectErrors: [], expectWarns: ['WL10'] },
  { name: 'verify-via-builder-no-wl10', src: WL10_VIA_BUILDER, expectErrors: [], expectWarns: [] },
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
