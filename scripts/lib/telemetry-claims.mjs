// scripts/lib/telemetry-claims.mjs — „reguła deklaruje metrykę, raport ją sprawdza" (TASK-OBS-017, ADR 0015 D6).
//
// Czyste funkcje (bez I/O i zegara):
//   - walidacja i parsowanie `claim` (rekord skrzynki: obiekt YAML; wpis rule-history: linia `**Claim:**`)
//   - werdykt claimu nad rollupami: confirmed | no_effect | regressed | insufficient_data
//   - wykrywanie reguł ORC/ANL bez claimu (pre-commit) i tydzień ISO raportu tygodniowego
//
// Claim:  metric     firstPass | falseGo | gateNoGo | retryCost | died | DEV-<sygnatura odstępstwa>
//         direction  down | up   (w którą stronę reguła ma przesunąć metrykę)
//         threshold  względna zmiana w tę stronę (0.2 = 20%), potrzebna do `confirmed`
//         process    (opcjonalnie) proces, którego dotyczy reguła, np. orchestrate; zawęża metrykę i liczbę przebiegów
//         engine     hash silnika (`git rev-parse --short HEAD` z chwili startu przebiegu), od którego reguła działa;
//                    ma to być PIERWSZY hash widoczny w rollupach, który zawiera commit reguły
//                    (`git merge-base --is-ancestor <commit-reguły> <hash>`), bo silnik zmienia się niemal z każdym commitem.

import { DEFAULT_WINDOW, METRICS, MIN_N, ABS_FLOOR, engineWindows, isoWeek, metricsOf } from './telemetry-report.mjs';

// Minimum przebiegów po każdej stronie okna (TASK-OBS-017). Dodatkowo metryka musi mieć próbę >= MIN_N.
export const MIN_RUNS = 20;
// Gęstość odstępstw: różnica poniżej 0,1 na 100 kroków to szum (odpowiednik ABS_FLOOR dla ułamków).
const DENSITY_FLOOR = 0.1;
// Udział przebiegów pod claimowanym haszem w oknie „po", od którego raport sam zmienia status rekordu.
export const TRUSTED_ENGINE_SHARE = 0.5;

export const METRIC_KEYS = METRICS.map((m) => m.key);
const SIGNATURE = /^DEV-[A-Za-z0-9._-]+$/;
const HASH = /^[0-9a-f]{7,40}$/;

/** Lista błędów (pusta = claim poprawny). */
export function validateClaim(claim) {
  if (!claim || typeof claim !== 'object') return ['claim nie jest obiektem'];
  const errors = [];
  if (!METRIC_KEYS.includes(claim.metric) && !SIGNATURE.test(String(claim.metric))) {
    errors.push(`metric "${claim.metric}" spoza listy ${METRIC_KEYS.join('|')} i nie jest sygnaturą DEV-…`);
  }
  if (!['down', 'up'].includes(claim.direction)) errors.push(`direction "${claim.direction}" spoza down|up`);
  if (!(Number(claim.threshold) > 0 && Number(claim.threshold) <= 1)) errors.push(`threshold "${claim.threshold}" musi być w (0, 1]`);
  if (!HASH.test(String(claim.engine))) errors.push(`engine "${claim.engine}" nie jest skróconym hashem gita`);
  if (claim.process !== undefined && !/^[a-z][a-z-]*$/.test(String(claim.process))) errors.push(`process "${claim.process}" nie jest nazwą procesu`);
  return errors;
}

export function normalizeClaim(claim) {
  return {
    metric: claim.metric, direction: claim.direction, threshold: Number(claim.threshold), engine: String(claim.engine),
    ...(claim.process !== undefined ? { process: String(claim.process) } : {}),
  };
}

const CLAIM_LINE = /^\*\*Claim:\*\*\s*(.+)$/m;

/** `**Claim:** metric=retryCost direction=down threshold=0.2 engine=57f8f64` → obiekt albo null. */
export function parseClaimLine(text) {
  const m = String(text).match(CLAIM_LINE);
  if (!m) return null;
  const out = {};
  for (const pair of m[1].trim().split(/\s+/)) {
    const [k, v] = pair.split('=');
    if (k && v !== undefined) out[k] = v;
  }
  return out;
}

const RULE_HEADING = /^### ((?:ORC|ANL)-\d{3}(?:\s*\/\s*(?:ORC|ANL)-\d{3})*)(.*)$/gm;

/**
 * Wpisy rule-history: [{ id, date, claim, claimErrors }]. Nagłówek łączony (`### ORC-010 / ORC-012`)
 * daje po jednym wpisie na id ze wspólnym claimem. Treść wpisu kończy się przed następnym `### ` albo `## `.
 */
export function parseRuleHistory(md) {
  const out = [];
  for (const h of md.matchAll(RULE_HEADING)) {
    const rest = md.slice(h.index + h[0].length);
    const end = rest.search(/^#{2,3} /m);
    const body = end === -1 ? rest : rest.slice(0, end);
    const date = (h[2].match(/\((\d{4}-\d{2}-\d{2})\)\s*$/) || [])[1] || null;
    const raw = parseClaimLine(body);
    const claim = raw ? normalizeClaim(raw) : null;
    const claimErrors = raw ? validateClaim(claim) : [];
    for (const id of h[1].split('/').map((s) => s.trim())) out.push({ id, date, claim, claimErrors });
  }
  return out;
}

/** Id reguł dodanych jako nowe wiersze tabeli (`+| ORC-133 | …`) w diffie komendy. */
export function addedRuleIds(diffText) {
  const ids = [];
  for (const line of String(diffText).split('\n')) {
    const m = line.match(/^\+\|\s*((?:ORC|ANL)-\d{3})\s*\|/);
    if (m) ids.push(m[1]);
  }
  return [...new Set(ids)];
}

/** Z podanych id te, które nie mają poprawnego claimu w rule-history (brak wpisu też się liczy). */
export function rulesWithoutClaim(historyMd, ids) {
  const byId = new Map(parseRuleHistory(historyMd).map((r) => [r.id, r]));
  return ids.filter((id) => {
    const r = byId.get(id);
    return !r || !r.claim || r.claimErrors.length > 0;
  });
}

const ratio = (a, b) => (b > 0 ? a / b : null);

/**
 * Werdykt claimu. Okno przed/po z `engineWindows` (dni z danymi, hash widoczny w rollupach).
 * confirmed — metryka przesunęła się w deklarowaną stronę o >= threshold (względnie) i powyżej progu szumu;
 * regressed — w przeciwną stronę o >= threshold; no_effect — reszta; insufficient_data — brak hasha w rollupach,
 * mniej niż MIN_RUNS przebiegów po którejś stronie albo za mała próba metryki.
 * `trusted` = w oknie „po" co najmniej TRUSTED_ENGINE_SHARE przebiegów szło pod tym haszem: tylko wtedy raport
 * sam zmienia status rekordu (przy częstych zmianach silnika okno „po" miesza kolejne poprawki).
 */
export function claimVerdict(rollups, claim, { window = DEFAULT_WINDOW } = {}) {
  const base = { verdict: 'insufficient_data', reason: null, before: null, after: null, deltaPct: null, runsBefore: 0, runsAfter: 0, engineShare: null, trusted: false };
  // Odstępstwa nie mają procesu w rollupie, więc sygnatura jest liczona po całości; metryki jakości zawęża `process`.
  const process = SIGNATURE.test(claim.metric) ? undefined : claim.process;
  const w = engineWindows(rollups, claim.engine, { window, process });
  if (!w.found) return { ...base, reason: 'hash silnika nie występuje w rollupach' };
  const out = { ...base, runsBefore: w.before.runs, runsAfter: w.after.runs, engineShare: w.engineShare, trusted: w.engineShare !== null && w.engineShare >= TRUSTED_ENGINE_SHARE };
  if (w.before.runs < MIN_RUNS || w.after.runs < MIN_RUNS) return { ...out, reason: `mniej niż ${MIN_RUNS} przebiegów po jednej ze stron (${w.before.runs}/${w.after.runs})` };

  let before; let after; let floor;
  if (SIGNATURE.test(claim.metric)) {
    if (w.before.steps < MIN_N || w.after.steps < MIN_N) return { ...out, reason: 'za mało kroków' };
    before = ratio((w.before.deviations[claim.metric] || 0) * 100, w.before.steps);
    after = ratio((w.after.deviations[claim.metric] || 0) * 100, w.after.steps);
    floor = DENSITY_FLOOR;
  } else {
    const def = METRICS.find((m) => m.key === claim.metric);
    const bm = metricsOf(w.before)[def.key];
    const am = metricsOf(w.after)[def.key];
    if (bm.value === null || am.value === null || bm.n < MIN_N || am.n < MIN_N) return { ...out, reason: `próba metryki ${claim.metric} poniżej ${MIN_N} (${bm.n}/${am.n})` };
    before = bm.value; after = am.value; floor = ABS_FLOOR;
  }
  const diff = after - before;
  const moved = claim.direction === 'down' ? before - after : after - before; // dodatnie = w deklarowaną stronę
  const rel = before > 0 ? moved / before : null;
  const result = { ...out, before, after, deltaPct: before > 0 ? (diff / before) * 100 : null };
  if (Math.abs(diff) < floor) return { ...result, verdict: 'no_effect', reason: 'zmiana poniżej progu szumu' };
  if (moved > 0) return { ...result, verdict: rel !== null && rel >= claim.threshold ? 'confirmed' : 'no_effect', reason: null };
  return { ...result, verdict: rel === null || -rel >= claim.threshold ? 'regressed' : 'no_effect', reason: null };
}

// ── tydzień raportu tygodniowego ─────────────────────────────────────────────

const DAY_MS = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** '2026-W43' → { from: '2026-10-19', to: '2026-10-25' } (poniedziałek–niedziela). */
export function weekRange(week) {
  const m = String(week).match(/^(\d{4})-W(\d{2})$/);
  if (!m) throw new Error(`tydzień musi mieć postać RRRR-Www (jest: ${week})`);
  const jan4 = Date.UTC(Number(m[1]), 0, 4);
  const monday1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS;
  const from = monday1 + (Number(m[2]) - 1) * 7 * DAY_MS;
  return { from: isoDay(from), to: isoDay(from + 6 * DAY_MS) };
}

/** Tydzień ISO poprzedzający tydzień z `day` (RRRR-MM-DD). */
export function previousWeek(day) {
  return isoWeek(isoDay(Date.parse(`${day}T00:00:00Z`) - 7 * DAY_MS));
}

/**
 * Tydzień, którego raport musi już istnieć w dniu `day`. Cron robi go w poniedziałek po agregacie, więc sam
 * poniedziałek ma jeszcze dzień luzu: wtedy oczekiwany jest tydzień sprzed poprzedniego.
 */
export function expectedWeeklyReport(day) {
  const shifted = isoDay(Date.parse(`${day}T00:00:00Z`) - DAY_MS);
  return previousWeek(shifted);
}
