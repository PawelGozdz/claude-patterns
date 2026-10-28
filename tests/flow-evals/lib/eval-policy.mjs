/**
 * tests/flow-evals/lib/eval-policy.mjs — polityka powtórzeń zależna od rodzaju testu (TASK-GSTACK-ADOPT-001 B2).
 *
 * Problem: model jest losowy, więc test behawioralny odpalony raz daje fałszywe alarmy, a „odpal
 * jeszcze raz, aż przejdzie” zamienia bramkę w loterię. Polityka mówi z góry, ile prób robimy i jak
 * z nich składamy werdykt — zależnie od rodzaju przypadku:
 *
 *   rule      1 próba. Każda porażka = porażka. (Deterministyczne: hooki, AST, retrieval.)
 *   behavior  3 próby. PASS gdy >= 2/3 przeszło ORAZ żadna próba nie naruszyła kontraktu wyjścia.
 *   judge     3 próbki. Wynik = mediana per wymiar; PASS gdy każda mediana >= progu.
 *
 * Bez ukrytego retry: jedyny dozwolony powtórzony przebieg to JEDEN rerun przypadku w danym runie,
 * zapisany jawnie przez recordRerun() do JSONL obok wyników (reruns.jsonl). Drugi rerun tego samego
 * przypadku w tym samym runie = błąd, nie cichy kolejny przebieg.
 *
 * Moduł jest czysty i deterministyczny: nie woła modelu. Wejście walidowane jawnie — zły rodzaj albo zła
 * liczba prób rzuca EvalPolicyError (kod w `.code`), nigdy nie jest „naprawiane” po cichu.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const KINDS = Object.freeze(['rule', 'behavior', 'judge']);

/** Polityka per rodzaj. `attempts` = dokładna liczba prób (nie „co najmniej”). */
export const EVAL_POLICY = Object.freeze({
  rule: Object.freeze({ attempts: 1 }),
  behavior: Object.freeze({ attempts: 3, minPass: 2 }),
  judge: Object.freeze({ attempts: 3 }),
});

/** Ile razy wolno powtórzyć przypadek w jednym runie (zapisany rerun, nie ukryty retry). */
export const MAX_RERUNS = 1;

/** Domyślny próg mediany dla sędziego (skala 1–5: 3 = „akceptowalne”). */
export const DEFAULT_JUDGE_THRESHOLD = 3;

export class EvalPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EvalPolicyError';
    this.code = code;
  }
}

export function policyFor(kind) {
  if (typeof kind !== 'string' || !Object.hasOwn(EVAL_POLICY, kind)) {
    throw new EvalPolicyError('UNKNOWN_KIND',
      `nieznany rodzaj przypadku ${JSON.stringify(kind)} (dozwolone: ${KINDS.join(', ')})`);
  }
  return EVAL_POLICY[kind];
}

/** Mediana; dla parzystej liczby wartości średnia dwóch środkowych. Pusta lista = błąd. */
export function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new EvalPolicyError('BAD_RESULT', 'median wymaga niepustej tablicy liczb');
  }
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new EvalPolicyError('BAD_RESULT', `median: wartość nie jest skończoną liczbą: ${JSON.stringify(v)}`);
    }
  }
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function requireAttempts(kind, results) {
  const { attempts } = policyFor(kind);
  if (!Array.isArray(results)) {
    throw new EvalPolicyError('BAD_RESULT', `${kind}: results musi być tablicą wyników prób`);
  }
  if (results.length !== attempts) {
    throw new EvalPolicyError('BAD_ATTEMPT_COUNT',
      `${kind} wymaga dokładnie ${attempts} ${attempts === 1 ? 'próby' : 'prób'}, dostano ${results.length}`);
  }
}

function requireBool(kind, i, obj, field) {
  if (obj === null || typeof obj !== 'object' || typeof obj[field] !== 'boolean') {
    throw new EvalPolicyError('BAD_RESULT',
      `${kind}: próba #${i + 1} bez jawnego pola boolean \`${field}\` (kontrakt musi być zadeklarowany, nie domyślny)`);
  }
}

const out = (verdict, passed, total, reason, extra = {}) =>
  Object.freeze({ verdict, passed, total, reason, ...extra });

function ruleVerdict(results) {
  requireBool('rule', 0, results[0], 'pass');
  const ok = results[0].pass;
  return out(ok ? 'PASS' : 'FAIL', ok ? 1 : 0, 1,
    ok ? 'rule: 1/1, jedyna próba przeszła' : 'rule: 1/1 próba nie przeszła — każda porażka reguły to porażka');
}

function behaviorVerdict(results) {
  const { attempts, minPass } = EVAL_POLICY.behavior;
  results.forEach((r, i) => {
    requireBool('behavior', i, r, 'pass');
    requireBool('behavior', i, r, 'contractViolation');
  });
  const passed = results.filter((r) => r.pass).length;
  const violations = results.filter((r) => r.contractViolation).length;
  if (violations > 0) {
    return out('FAIL', passed, attempts,
      `behavior: naruszenie kontraktu w ${violations}/${attempts} próbach — wygrywa nad wynikiem ${passed}/${attempts}`);
  }
  if (passed >= minPass) {
    return out('PASS', passed, attempts, `behavior: ${passed}/${attempts} >= ${minPass}/${attempts}, brak naruszeń kontraktu`);
  }
  return out('FAIL', passed, attempts, `behavior: ${passed}/${attempts} < ${minPass}/${attempts}`);
}

function judgeVerdict(results, opts) {
  const threshold = opts.threshold ?? DEFAULT_JUDGE_THRESHOLD;
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
    throw new EvalPolicyError('BAD_OPTS', `judge: threshold musi być liczbą, dostano ${JSON.stringify(threshold)}`);
  }
  const scale = opts.scale;
  const first = results[0]?.scores;
  if (first === null || typeof first !== 'object' || Object.keys(first).length === 0) {
    throw new EvalPolicyError('BAD_RESULT', 'judge: próbka #1 bez niepustego obiektu `scores`');
  }
  const dims = Object.keys(first).sort();
  results.forEach((r, i) => {
    const sc = r?.scores;
    if (sc === null || typeof sc !== 'object') {
      throw new EvalPolicyError('BAD_RESULT', `judge: próbka #${i + 1} bez obiektu \`scores\``);
    }
    const keys = Object.keys(sc).sort();
    if (keys.join('|') !== dims.join('|')) {
      throw new EvalPolicyError('BAD_RESULT',
        `judge: próbka #${i + 1} ma inne wymiary (${keys.join(', ')}) niż pierwsza (${dims.join(', ')})`);
    }
    for (const d of dims) {
      const v = sc[d];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new EvalPolicyError('BAD_RESULT', `judge: próbka #${i + 1}, wymiar ${d}: ocena nie jest skończoną liczbą`);
      }
      if (scale && (v < scale.min || v > scale.max)) {
        throw new EvalPolicyError('BAD_RESULT',
          `judge: próbka #${i + 1}, wymiar ${d}: ocena ${v} poza skalą ${scale.min}–${scale.max}`);
      }
    }
  });
  const medians = {};
  for (const d of dims) medians[d] = median(results.map((r) => r.scores[d]));
  const below = dims.filter((d) => medians[d] < threshold);
  const passed = dims.length - below.length;
  const reason = below.length === 0
    ? `judge: mediany wszystkich ${dims.length} wymiarów >= ${threshold}`
    : `judge: mediana < ${threshold} w wymiarach: ${below.map((d) => `${d}=${medians[d]}`).join(', ')}`;
  return out(below.length === 0 ? 'PASS' : 'FAIL', passed, dims.length, reason, { medians: Object.freeze(medians) });
}

/**
 * Składa werdykt z wyników prób wg polityki rodzaju.
 *  rule     results = [{pass}]                         (dokładnie 1)
 *  behavior results = [{pass, contractViolation}] x3   (oba pola jawne)
 *  judge    results = [{scores:{wymiar: liczba}}] x3   opts: {threshold=3, scale?:{min,max}}
 * @returns {{verdict:'PASS'|'FAIL', passed:number, total:number, reason:string, medians?:object}}
 */
export function panelVerdict(kind, results, opts = {}) {
  requireAttempts(kind, results);
  if (kind === 'rule') return ruleVerdict(results);
  if (kind === 'behavior') return behaviorVerdict(results);
  return judgeVerdict(results, opts);
}

/**
 * Wykonuje DOKŁADNIE tyle prób, ile przewiduje polityka (sekwencyjnie), bez retry i bez połykania
 * błędów: wyjątek próby leci wyżej. `attemptFn(i)` zwraca wynik próby i (0-based).
 */
export async function collectAttempts(kind, attemptFn) {
  const { attempts } = policyFor(kind);
  if (typeof attemptFn !== 'function') {
    throw new EvalPolicyError('BAD_OPTS', 'collectAttempts wymaga funkcji próby');
  }
  const results = [];
  for (let i = 0; i < attempts; i++) results.push(await attemptFn(i));
  return results;
}

/** Domyślna ścieżka dziennika rerunów: obok wyników evala. */
export const rerunLogPath = (evalDir) => join(evalDir, 'reruns.jsonl');

function readRerunLog(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '').map((line, i) => {
    try { return JSON.parse(line); }
    catch (e) {
      throw new EvalPolicyError('CORRUPT_LOG', `${file}:${i + 1}: uszkodzona linia JSONL (${e.message})`);
    }
  });
}

/** Ile rerunów zapisano już dla (runId, caseId). */
export function rerunCount(file, runId, caseId) {
  return readRerunLog(file).filter((r) => r.runId === runId && r.caseId === caseId).length;
}

/**
 * Zapisuje JEDEN dozwolony rerun przypadku w danym runie. To jedyna droga do powtórzenia poza polityką
 * prób: wpis musi mieć powód, a drugi rerun tego samego (runId, caseId) rzuca RERUN_EXHAUSTED.
 * Funkcja tylko zapisuje fakt — decyzję „czy rerun jest uzasadniony” podejmuje wołający i jest ona
 * widoczna w pliku, a nie ukryta w pętli.
 * @param {string} file ścieżka JSONL (zwykle rerunLogPath(evalDir))
 * @param {{runId:string, caseId:string, kind:string, reason:string, previousVerdict?:string}} entry
 * @param {{ts?:string}} [opts] ts wstrzykiwalny dla determinizmu testów
 */
export function recordRerun(file, entry, opts = {}) {
  policyFor(entry?.kind);
  for (const f of ['runId', 'caseId', 'reason']) {
    if (typeof entry[f] !== 'string' || entry[f].trim() === '') {
      throw new EvalPolicyError('BAD_RERUN', `recordRerun: pole \`${f}\` jest wymagane (niepusty string)`);
    }
  }
  if (rerunCount(file, entry.runId, entry.caseId) >= MAX_RERUNS) {
    throw new EvalPolicyError('RERUN_EXHAUSTED',
      `przypadek ${entry.caseId} w runie ${entry.runId} był już powtórzony (limit: ${MAX_RERUNS}) — bez dalszych retry`);
  }
  const record = {
    ts: opts.ts ?? new Date().toISOString(),
    runId: entry.runId,
    caseId: entry.caseId,
    kind: entry.kind,
    reason: entry.reason,
    ...(entry.previousVerdict ? { previousVerdict: entry.previousVerdict } : {}),
  };
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(record)}\n`);
  return record;
}
