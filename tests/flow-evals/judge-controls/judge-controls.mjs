/**
 * tests/flow-evals/judge-controls/judge-controls.mjs — kontrola sędziów przed użyciem (TASK-GSTACK-ADOPT-001 B1).
 *
 * Sędzia (LLM albo heurystyka) wchodzi do obiegu dopiero po przejściu paczki kontrolnej: trzech wariantów
 * TEGO SAMEGO artefaktu.
 *   positive  poprawny artefakt                               -> sędzia ma go przyjąć, bez zawyżania
 *   negative  pusty szkielet (same nagłówki)                  -> sędzia ma go odrzucić
 *   defect    positive z JEDNYM celowo wstawionym defektem    -> ocena wymiaru dotkniętego defektem ma spaść
 *                                                                poniżej progu
 * Powód: sędzia, który przepuszcza defekt albo wszystko ocenia na 5/5, daje fałszywy spokój — L2
 * (TASK-EVAL-001 Faza 2) nie może stać na ocenie, o której nie wiemy, czy cokolwiek widzi.
 *
 * Sędzia = `async (artifact: string, rubric: {dimensions:[{id,description}], scale:{min,max}})
 *            => ({ scores: {<dimensionId>: number}, verdict: 'PASS'|'FAIL' })`.
 * Wynik każdego wariantu to mediana z 3 próbek (polityka `judge` z lib/eval-policy.mjs), więc jednorazowy
 * wybryk modelu nie decyduje o dopuszczeniu.
 *
 * Moduł jest deterministyczny i nie woła modelu; realnego sędziego dostarcza wołający.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectAttempts, panelVerdict, DEFAULT_JUDGE_THRESHOLD } from '../lib/eval-policy.mjs';

export const VARIANTS = Object.freeze(['positive', 'negative', 'defect']);
export const DEFAULT_MAX_CHANGED_LINES = 2;

export class JudgeControlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'JudgeControlError';
    this.code = code;
  }
}

const fail = (code, msg) => { throw new JudgeControlError(code, msg); };

function readText(dir, rel, what) {
  const file = join(dir, rel);
  if (!existsSync(file)) fail('PACK_FILE_MISSING', `${what}: brak pliku ${file}`);
  return readFileSync(file, 'utf8');
}

/** Multiset różnic linii: ile linii `a` nie ma w `b` (z krotnością). */
function lineDiffCount(a, b) {
  const counts = new Map();
  for (const l of b.split('\n')) counts.set(l, (counts.get(l) ?? 0) + 1);
  let missing = 0;
  for (const l of a.split('\n')) {
    const c = counts.get(l) ?? 0;
    if (c > 0) counts.set(l, c - 1); else missing++;
  }
  return missing;
}

/**
 * Wczytuje i waliduje paczkę kontrolną z katalogu (pack.json + 3 pliki wariantów).
 * Format pack.json: { id, artifact, scale:{min,max}, rubric:{dimensions:[{id,description}]},
 *   variants:{positive,negative,defect}, defect:{dimension, marker, description, max_changed_lines?},
 *   thresholds?:{pass} }
 */
export function loadPack(dir) {
  const metaFile = join(dir, 'pack.json');
  if (!existsSync(metaFile)) fail('PACK_FILE_MISSING', `brak ${metaFile}`);
  let meta;
  try { meta = JSON.parse(readFileSync(metaFile, 'utf8')); }
  catch (e) { fail('PACK_INVALID', `${metaFile}: niepoprawny JSON (${e.message})`); }

  const str = (v, name) => (typeof v === 'string' && v.trim() !== '' ? v : fail('PACK_INVALID', `pack.json: pole \`${name}\` jest wymagane`));
  const id = str(meta.id, 'id');
  str(meta.artifact, 'artifact');

  const scale = meta.scale;
  if (!scale || !Number.isFinite(scale.min) || !Number.isFinite(scale.max) || scale.min >= scale.max) {
    fail('PACK_INVALID', `${id}: scale musi mieć liczby min < max`);
  }
  const dims = meta.rubric?.dimensions;
  if (!Array.isArray(dims) || dims.length === 0) fail('PACK_INVALID', `${id}: rubric.dimensions musi być niepustą tablicą`);
  const ids = new Set();
  for (const d of dims) {
    str(d?.id, 'rubric.dimensions[].id');
    str(d?.description, `rubric.dimensions[${d.id}].description`);
    if (ids.has(d.id)) fail('PACK_INVALID', `${id}: zduplikowany wymiar ${d.id}`);
    ids.add(d.id);
  }

  const texts = {};
  for (const v of VARIANTS) {
    texts[v] = readText(dir, str(meta.variants?.[v], `variants.${v}`), `${id}/${v}`);
    if (texts[v].trim() === '') fail('PACK_INVALID', `${id}: wariant ${v} jest pusty`);
  }

  // negative = same nagłówki: co najmniej jeden, żadnej treści poza nagłówkami
  const nonBlank = texts.negative.split('\n').filter((l) => l.trim() !== '');
  const nonHeading = nonBlank.filter((l) => !/^#{1,6}\s/.test(l));
  if (nonHeading.length > 0) {
    fail('NEGATIVE_NOT_EMPTY', `${id}: negative ma treść poza nagłówkami (np. ${JSON.stringify(nonHeading[0])})`);
  }
  if (texts.positive === texts.negative) fail('PACK_INVALID', `${id}: positive i negative są identyczne`);

  const defect = meta.defect;
  if (!defect || !ids.has(defect.dimension)) {
    fail('DEFECT_INVALID', `${id}: defect.dimension (${JSON.stringify(defect?.dimension)}) nie jest wymiarem rubryki`);
  }
  str(defect.description, 'defect.description');
  str(defect.marker, 'defect.marker');
  if (!texts.defect.includes(defect.marker)) fail('DEFECT_INVALID', `${id}: defect.marker nie występuje w wariancie defect`);
  if (texts.positive.includes(defect.marker)) fail('DEFECT_INVALID', `${id}: defect.marker występuje już w positive — to nie jest wstawiony defekt`);
  const added = lineDiffCount(texts.defect, texts.positive);
  const removed = lineDiffCount(texts.positive, texts.defect);
  const changed = Math.max(added, removed);
  const maxChanged = defect.max_changed_lines ?? DEFAULT_MAX_CHANGED_LINES;
  if (changed === 0) fail('DEFECT_INVALID', `${id}: defect jest identyczny z positive`);
  if (changed > maxChanged) {
    fail('DEFECT_NOT_MINIMAL', `${id}: defect zmienia ${changed} linii (limit ${maxChanged}) — ma być JEDEN celowy defekt`);
  }

  return Object.freeze({
    id,
    artifact: meta.artifact,
    scale: Object.freeze({ min: scale.min, max: scale.max }),
    dimensions: Object.freeze(dims.map((d) => ({ id: d.id, description: d.description }))),
    texts: Object.freeze(texts),
    defect: Object.freeze({ dimension: defect.dimension, marker: defect.marker, description: defect.description }),
    threshold: meta.thresholds?.pass ?? DEFAULT_JUDGE_THRESHOLD,
  });
}

function validateJudgeOutput(out, pack, variant, sample) {
  const where = `${pack.id}/${variant} próbka #${sample}`;
  if (out === null || typeof out !== 'object') fail('BAD_JUDGE_OUTPUT', `${where}: sędzia nie zwrócił obiektu`);
  if (out.verdict !== 'PASS' && out.verdict !== 'FAIL') {
    fail('BAD_JUDGE_OUTPUT', `${where}: verdict musi być 'PASS' albo 'FAIL', dostano ${JSON.stringify(out.verdict)}`);
  }
  const sc = out.scores;
  if (sc === null || typeof sc !== 'object') fail('BAD_JUDGE_OUTPUT', `${where}: brak obiektu scores`);
  const expected = pack.dimensions.map((d) => d.id).sort().join('|');
  if (Object.keys(sc).sort().join('|') !== expected) {
    fail('BAD_JUDGE_OUTPUT', `${where}: scores ma wymiary [${Object.keys(sc).join(', ')}], rubryka wymaga [${expected.split('|').join(', ')}]`);
  }
  for (const [dim, v] of Object.entries(sc)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < pack.scale.min || v > pack.scale.max) {
      fail('BAD_JUDGE_OUTPUT', `${where}: ocena ${dim}=${JSON.stringify(v)} poza skalą ${pack.scale.min}–${pack.scale.max}`);
    }
  }
}

async function scoreVariant(judge, pack, variant, rubric) {
  const outs = await collectAttempts('judge', async (i) => {
    const o = await judge(pack.texts[variant], rubric);
    validateJudgeOutput(o, pack, variant, i + 1);
    return o;
  });
  const panel = panelVerdict('judge', outs.map((o) => ({ scores: o.scores })),
    { threshold: pack.threshold, scale: pack.scale });
  const passVotes = outs.filter((o) => o.verdict === 'PASS').length;
  return {
    medians: panel.medians,
    belowThreshold: pack.dimensions.map((d) => d.id).filter((d) => panel.medians[d] < pack.threshold),
    passVotes,
    failVotes: outs.length - passVotes,
    // wynik pojedynczych próbek zostaje w raporcie: widać rozrzut, na którym mediana go ukrywa
    samples: outs.map((o) => ({ verdict: o.verdict, scores: { ...o.scores } })),
  };
}

const check = (ok, reason) => ({ ok, reason });

/**
 * Uruchamia paczkę na sędzi (3 próbki x 3 warianty = 9 wywołań) i wylicza dopuszczenie.
 * @param {(artifact:string, rubric:object)=>Promise<{scores:object, verdict:'PASS'|'FAIL'}>} judge
 * @param {object} pack wynik loadPack()
 * @param {{allowPerfectPositive?:boolean}} [opts] domyślnie false: positive na suficie we WSZYSTKICH wymiarach = podejrzane
 */
export async function runJudgeControls(judge, pack, opts = {}) {
  if (typeof judge !== 'function') fail('BAD_JUDGE', 'sędzia musi być funkcją async (artifact, rubric) => {scores, verdict}');
  const rubric = Object.freeze({ dimensions: pack.dimensions, scale: pack.scale });
  const pos = await scoreVariant(judge, pack, 'positive', rubric);
  const neg = await scoreVariant(judge, pack, 'negative', rubric);
  const def = await scoreVariant(judge, pack, 'defect', rubric);
  const th = pack.threshold;
  const dimIds = pack.dimensions.map((d) => d.id);
  const fmt = (m) => dimIds.map((d) => `${d}=${m[d]}`).join(', ');

  const accepts = check(
    pos.passVotes >= 2 && pos.belowThreshold.length === 0,
    pos.passVotes >= 2 && pos.belowThreshold.length === 0
      ? `positive przyjęty (werdykty PASS ${pos.passVotes}/3, mediany >= ${th})`
      : `sędzia nie przyjmuje poprawnego artefaktu: PASS ${pos.passVotes}/3, mediany pod progiem ${th}: [${pos.belowThreshold.join(', ') || '—'}] (${fmt(pos.medians)})`);

  const perfect = dimIds.every((d) => pos.medians[d] === pack.scale.max);
  const notInflated = check(
    opts.allowPerfectPositive === true || !perfect,
    perfect && opts.allowPerfectPositive !== true
      ? `positive ma ${pack.scale.max}/${pack.scale.max} we WSZYSTKICH wymiarach — podejrzane zawyżanie (poprawny artefakt paczki jest celowo niedoskonały)`
      : 'positive nie jest na suficie we wszystkich wymiarach');

  const negBelow = neg.belowThreshold.length;
  const rejectsNeg = neg.failVotes >= 2 && negBelow > dimIds.length / 2;
  const rejects = check(
    rejectsNeg,
    rejectsNeg
      ? `negative odrzucony (FAIL ${neg.failVotes}/3, ${negBelow}/${dimIds.length} wymiarów pod progiem)`
      : `sędzia nie odrzuca pustego szkieletu: FAIL ${neg.failVotes}/3, tylko ${negBelow}/${dimIds.length} wymiarów pod progiem ${th} (${fmt(neg.medians)})`);

  const dd = pack.defect.dimension;
  const detected = def.medians[dd] < th && def.medians[dd] < pos.medians[dd];
  const detects = check(
    detected,
    detected
      ? `defekt wykryty: ${dd} ${pos.medians[dd]} -> ${def.medians[dd]} (próg ${th})`
      : `sędzia przepuszcza defekt: ${dd} ${pos.medians[dd]} -> ${def.medians[dd]} (wymagane: < ${th} i niżej niż w positive). Defekt: ${pack.defect.description}`);

  const checks = { accepts_positive: accepts, positive_not_inflated: notInflated, rejects_negative: rejects, detects_defect: detects };
  const admitted = Object.values(checks).every((c) => c.ok);
  const failures = Object.entries(checks).filter(([, c]) => !c.ok).map(([k, c]) => `${k}: ${c.reason}`);
  return Object.freeze({
    pack: pack.id,
    admitted,
    verdict: admitted ? 'ADMITTED' : 'NOT_ADMITTED',
    reasons: admitted ? Object.entries(checks).map(([k, c]) => `${k}: ${c.reason}`) : failures,
    checks,
    medians: { positive: pos.medians, negative: neg.medians, defect: def.medians },
    // wymiary inne niż defektowy, które też spadły względem positive — informacja, nie warunek
    collateralDrops: dimIds.filter((d) => d !== dd && def.medians[d] < pos.medians[d]),
    samples: { positive: pos.samples, negative: neg.samples, defect: def.samples },
  });
}
