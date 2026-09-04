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
let v
try {
  v = await agent('verify domain layer (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:domain', agentType: 'code-quality-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
let final
try {
  final = await agent('final security gate (limit: 12 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
`;

const BAD = `
export const meta = { name: 'impl-bad', description: 'x', phases: [] }
const IMPL_REPORT = { changed_files: [], summary: '', verdict: 'pass' }
let impl
try {
  impl = await agent('implement domain layer', { label: 'impl:domain', agentType: 'domain-application-implementer', schema: IMPL_REPORT })
} catch (e) { log('NO_GO'); }
let vs
try {
  vs = await parallel([
    () => agent('verify slice mechanism (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:mech', agentType: 'code-quality-verifier', schema: VERDICT }),
    () => agent('verify slice wire-up (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:wire', agentType: 'code-quality-verifier', schema: VERDICT }),
  ])
} catch (e) { log('NO_GO'); }
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
let v
try {
  v = await agent('verify domain layer (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:domain', agentType: 'code-quality-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
let final
try {
  final = await agent('final security gate (limit: 12 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
`;

const TSC_BURIED_IN_PROSE = `
export const meta = { name: 'impl-tscburied', description: 'x', phases: [] }
phase('InfraConsumers')
const impl = await agent(\`Zaimplementuj warstwe. Zakres:
1. Handler A.
2. Handler B.
3. Obsluga bledow.
4. Walidacja wejscia. tsc --noEmit bez nowych bledow.\`, { label: 'impl:infra-consumers', agentType: 'infrastructure-implementer' })
const diff = await agent('run: git diff --stat', { label: 'gate:code-exists' })
if (!diff || !diff.trim()) { log('ESCALATE'); return { escalated: true } }
phase('Verify')
let v
try {
  v = await agent('verify infra layer (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:infra', agentType: 'code-quality-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
let final
try {
  final = await agent('final security gate (limit: 12 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
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
let v
try {
  v = await agent('verify docs layer (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:infra-docs', agentType: 'code-quality-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
let final
try {
  final = await agent('final security gate (limit: 12 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
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
let v
try {
  v = await agent('verify docs layer (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:infra-docs', agentType: 'code-quality-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
let final
try {
  final = await agent('final security gate (limit: 12 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
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
let v
try {
  v = await agent('verify domain layer, sprawdz AC 1-10', { label: 'verify:domain', agentType: 'code-quality-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
let final
try {
  final = await agent('final security gate (limit: 12 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
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
let v
try {
  v = await agent(buildVerifierPrompt({ role: 'domain', checkQuestions: ['czy X istnieje?'] }), { label: 'verify:domain', agentType: 'code-quality-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
let final
try {
  final = await agent(buildVerifierPrompt({ role: 'final', checkQuestions: ['czy Y jest spójne?'] }), { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
`;

// WL14 — dedykowany przypadek pozytywny (dotąd brak: regresja 2026-08-14 dodała regułę,
// ale żaden fixture jej nie testował wprost — wyszło dopiero, gdy zaczęła fałszywie
// trafiać we WSZYSTKIE inne fixture'y, patrz notatka w tests/flow-evals/workflow-lint/).
const WL14_UNWRAPPED_SCHEMA = `
export const meta = { name: 'impl-wl14', description: 'x', phases: [] }
phase('Domain')
const impl = await agent('implement domain layer per decisions', { label: 'impl:domain' })
const diff = await agent('run: git diff --stat', { label: 'gate:code-exists' })
if (!diff || !diff.trim()) { log('ESCALATE'); return { escalated: true } }
phase('Verify')
const v = await agent('verify domain layer (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:domain', agentType: 'code-quality-verifier', schema: VERDICT })
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
const final = await agent('final security gate (limit: 12 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'final-gate', agentType: 'security-e2e-verifier', schema: VERDICT })
`;

// WL15 — dedykowany przypadek pozytywny: prompt rozkazuje dopisanie testów, sonda nie
// mierzy przyrostu bloków wykonywalnych.
const WL15_NO_DELTA_MEASURE = `
export const meta = { name: 'impl-wl15', description: 'x', phases: [] }
phase('Testing')
const impl = await agent('dopisz testy dla warstwy domain, pokrycie L1 ~50%', { label: 'impl:testing', agentType: 'test-implementer' })
const diff = await agent('run: git diff --stat', { label: 'gate:code-exists' })
if (!diff || !diff.trim()) { log('ESCALATE'); return { escalated: true } }
phase('Verify')
let v
try {
  v = await agent('verify testy (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:testing', agentType: 'code-quality-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
`;

// Regresja 2026-09-01 (TS-ARCH-HANDLER-CONTRACT-001 faza 5, juz-ide-api-3): celowo
// SEKWENCYJNY skrypt blokowany trzema fałszywymi alarmami — WL2 na KOMENTARZU „zero
// parallel()/pipeline()", WL2 na 7-liniowym helperze implementera (okno 4000 znaków
// „ciała" połykało następne funkcje z verify), WL4 na weryfikatorze, którego `schema:`
// siedziała za promptem dłuższym niż 600-znakowy snippet (prompt zawiera też '})'
// w \${JSON.stringify(...)}), które dawne przycinanie brało za koniec opcji).
const SEQUENTIAL_COMMENT_MENTIONS_PARALLEL = `
export const meta = { name: 'impl-seqcomment', description: 'x', phases: [] }
// Caly skrypt jest CELOWO sekwencyjny - zero parallel()/pipeline(). Jednostki
// biegna po kolei, verify po kazdej jednostce, we wspolnym drzewie roboczym.
async function runImplementAgent(prompt, opts) {
  try { return await agent(prompt, opts) } catch (e) { log('impl padl'); return null }
}
phase('Domain')
const impl = await runImplementAgent('zbuduj warstwe domain wg decision cards', { label: 'impl:domain' })
const diff = await agent('run: git diff --stat', { label: 'gate:code-exists' })
if (!diff || !diff.trim()) { log('ESCALATE: implementer nie zmienil plikow'); return { escalated: true } }
phase('Verify')
let v
try {
  v = await agent(\`=== WERYFIKACJA JEDNOSTKI domain ===
Zakres WYLACZNIE: src/a.ts, src/b.ts. Pliki innych jednostek tej samej fali moga byc juz
zmienione w working tree (fala biegnie sekwencyjnie) - to zamierzone, nie zanieczyszczenie
zakresu. Sprawdz: (1) klasa bazowa NIE zostala zmieniona, (2) override w kazdym handlerze
wola wylacznie stack.unwind() (lub jest trywialny), (3) niezmienniki TCC1-8 zachowane,
(4) semantyka bledow (kody, Result.fail vs throw) identyczna z przed - tresc czytaj Readem
na konkretnym pliku, (5) zero git checkout/restore/reset/stash w historii tej sesji.
Wyniki sondy przyjmij jako fakt (checks: \${JSON.stringify(checks)}) i NIE uruchamiaj ich
ponownie. LIMIT: budżet ok. 8 wywołań narzędzi — gdy się kończy, natychmiast wydaj werdykt.\`,
    { label: 'verify:domain', agentType: 'code-quality-verifier', schema: VERDICT })
} catch (e) { log('NO_GO: brak StructuredOutput w budżecie'); return { escalated: true } }
if (v == null) { log('ESCALATE: verifier padł'); return { escalated: true } }
`;

// Kontr-przypadek chroniący pierwotny incydent WL2 (wf_23029d51-3a2): verify NAPRAWDĘ
// ukryte w helperze wołanym z parallel() ma dalej blokować — realne ciało funkcji
// (fnBodyAt) zawiera wywołanie weryfikatora, więc runUnit klasyfikuje się jako
// verifier-helper mimo braku „verify" w samym wywołaniu parallel().
const WL2_VERIFY_HIDDEN_IN_HELPER = `
export const meta = { name: 'impl-wl2helper', description: 'x', phases: [] }
async function runUnit(unit) {
  const impl = await agent('zbuduj jednostke ' + unit, { label: 'impl:' + unit })
  let v
  try {
    v = await agent('oceń jednostke (limit: 8 wywołań; jeśli budżet się kończy, natychmiast wydaj werdykt)', { label: 'verify:' + unit, agentType: 'code-quality-verifier', schema: VERDICT })
  } catch (e) { return null }
  return v
}
const results = await parallel(UNITS.map((u) => () => runUnit(u)))
const okUnits = results.filter(Boolean)
const diff = await agent('run: git diff --stat', { label: 'gate:code-exists' })
if (!diff || !diff.trim()) { log('ESCALATE'); return { escalated: true } }
`;

const CASES = [
  { name: 'good-script-passes', src: GOOD, expectErrors: [], expectWarns: [] },
  { name: 'bad-script-wl1-wl2-wl3', src: BAD, expectErrors: ['WL1', 'WL2', 'WL3'], expectWarns: ['WL5'] },
  { name: 'verify-without-schema-warns-wl4', src: GOOD.replace(', schema: VERDICT })', ' })'), expectErrors: [], expectWarns: ['WL4'] }, // replace = tylko 1. wystąpienie
  // FULL_DIFF_INJECTED demonstruje DWA nakładające się naruszenia na tym samym `diff`:
  // pełny git diff bez --stat (WL6, warn) ORAZ jego surowy tekst wklejany do kolejnego
  // promptu bez schema (WL12, error) — usunięcie któregokolwiek z nich zmieniłoby scenariusz.
  { name: 'full-diff-injected-warns-wl6', src: FULL_DIFF_INJECTED, expectErrors: ['WL12'], expectWarns: ['WL6'] },
  { name: 'tsc-buried-in-prose-warns-wl7', src: TSC_BURIED_IN_PROSE, expectErrors: [], expectWarns: ['WL7'] },
  { name: 'docs-layer-heavy-context-warns-wl8', src: DOCS_LAYER_HEAVY_CONTEXT, expectErrors: [], expectWarns: ['WL8'] },
  { name: 'docs-layer-mitigated-no-wl8', src: DOCS_LAYER_MITIGATED, expectErrors: [], expectWarns: [] },
  { name: 'docs-layer-property-refs-warns-wl8', src: DOCS_LAYER_PROPERTY_REFS, expectErrors: [], expectWarns: ['WL8'] },
  { name: 'verify-missing-limit-warns-wl10', src: WL10_MISSING_LIMIT, expectErrors: [], expectWarns: ['WL10'] },
  { name: 'verify-via-builder-no-wl10', src: WL10_VIA_BUILDER, expectErrors: [], expectWarns: [] },
  { name: 'unwrapped-schema-errors-wl14', src: WL14_UNWRAPPED_SCHEMA, expectErrors: ['WL14', 'WL14'], expectWarns: [] },
  { name: 'no-delta-measure-warns-wl15', src: WL15_NO_DELTA_MEASURE, expectErrors: [], expectWarns: ['WL15'] },
  { name: 'sequential-comment-mentions-parallel-passes', src: SEQUENTIAL_COMMENT_MENTIONS_PARALLEL, expectErrors: [], expectWarns: [] },
  { name: 'verify-hidden-in-helper-errors-wl2', src: WL2_VERIFY_HIDDEN_IN_HELPER, expectErrors: ['WL2'], expectWarns: [] },
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
