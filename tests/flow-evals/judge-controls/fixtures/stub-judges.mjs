/**
 * Sędziowie-atrapy dla evala judge-controls. Deterministyczni, bez modelu.
 *
 *  goodStubJudge     patrzy na TREŚĆ raportu weryfikatora (pack `verifier-report`): ID reguł, cytaty
 *                    plik:linia, zgodność werdyktu z naruszeniami. Powinien zostać dopuszczony.
 *  blindStubJudge    patrzy tylko na STRUKTURĘ (czy jest tabela): niepusty raport dostaje 4/5 i PASS
 *                    niezależnie od treści, więc przepuszcza defekt. MUSI zostać niedopuszczony.
 *  ceilingStubJudge  zawsze 5/5 i PASS (klasyczne zawyżanie). Niedopuszczony.
 *  scriptedJudge     odtwarza zadane próbki per wariant — do testów warunków brzegowych runnera.
 *
 * Atrapy znają rubrykę paczki `verifier-report` (id wymiarów); na innej rubryce rzucają błąd, żeby nie
 * dawać fałszywie dobrego wyniku.
 */
const DASH = new Set(['', '—', '-', '–']);

function parseRows(text) {
  return text.split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
    .filter((cells) => cells.length >= 4 && !/^-+$/.test(cells[0]) && !/rules_checked/.test(cells[1]))
    .map(([file, rules, violations, verdict]) => ({ file, rules, violations, verdict }));
}

const hasViolation = (r) => !DASH.has(r.violations);
const CITE = /[A-Z]{1,3}\d+ @ \S+:\d+/;
const RULE_IDS = /^[A-Z]{1,3}\d+(,[A-Z]{1,3}\d+)*$/;

function requireDims(rubric, wanted) {
  const have = rubric.dimensions.map((d) => d.id).sort().join('|');
  if (have !== [...wanted].sort().join('|')) {
    throw new Error(`atrapa zna tylko rubrykę [${wanted.join(', ')}], dostała [${have.split('|').join(', ')}]`);
  }
}

const DIMS = ['grounding', 'evidence', 'verdict_consistency', 'actionability'];
const verdictOf = (scores) => (Object.values(scores).every((v) => v >= 3) ? 'PASS' : 'FAIL');

export async function goodStubJudge(artifact, rubric) {
  requireDims(rubric, DIMS);
  const rows = parseRows(artifact);
  if (rows.length === 0) {
    const scores = Object.fromEntries(DIMS.map((d) => [d, 1]));
    return { scores, verdict: 'FAIL' };
  }
  const violating = rows.filter(hasViolation);

  let grounding = 1;
  if (/^📚 Patterns read:/m.test(artifact)) grounding += 2;
  if (rows.every((r) => RULE_IDS.test(r.rules))) grounding += 2;

  const evidence = violating.length === 0 ? 4 : (violating.every((r) => CITE.test(r.violations)) ? 5 : 2);

  const rowBad = rows.some((r) => (hasViolation(r) && r.verdict === 'PASS') || (!hasViolation(r) && r.verdict === 'VETO'));
  const claimed = /werdykt końcowy[\s\S]*?(\d+)\s+naruszeni/i.exec(artifact);
  const countBad = claimed ? Number(claimed[1]) !== violating.length : false;
  const verdict_consistency = rowBad || countBad ? 2 : 5;

  const actionability = violating.length === 0 ? 4 : (violating.every((r) => r.violations.includes('→')) ? 5 : 4);

  const scores = { grounding, evidence, verdict_consistency, actionability };
  return { scores, verdict: verdictOf(scores) };
}

export async function blindStubJudge(artifact, rubric) {
  requireDims(rubric, DIMS);
  const filled = parseRows(artifact).length > 0;
  const scores = Object.fromEntries(DIMS.map((d) => [d, filled ? 4 : 1]));
  return { scores, verdict: filled ? 'PASS' : 'FAIL' };
}

export async function ceilingStubJudge(_artifact, rubric) {
  const scores = Object.fromEntries(rubric.dimensions.map((d) => [d.id, rubric.scale.max]));
  return { scores, verdict: 'PASS' };
}

/**
 * @param {{positive:string, negative:string, defect:string}} texts treści wariantów paczki
 * @param {{positive:object[], negative:object[], defect:object[]}} script próbki {scores, verdict} per wariant;
 *        n-te wywołanie dla wariantu zwraca n-tą próbkę (ostatnia się powtarza)
 */
export function scriptedJudge(texts, script) {
  const used = { positive: 0, negative: 0, defect: 0 };
  const judge = async (artifact) => {
    const variant = ['positive', 'negative', 'defect'].find((v) => texts[v] === artifact);
    if (!variant) throw new Error('scriptedJudge: artefakt nie pasuje do żadnego wariantu paczki');
    const list = script[variant];
    const sample = list[Math.min(used[variant]++, list.length - 1)];
    return { scores: { ...sample.scores }, verdict: sample.verdict };
  };
  judge.calls = () => ({ ...used });
  return judge;
}
