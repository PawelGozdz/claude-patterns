// scripts/lib/telemetry-export.mjs — kontrakt transportu agregatów na serwer zespołu (TASK-OBS-008, ADR 0012).
//
// Serwer dostaje WYŁĄCZNIE liczniki. Zasada jest strukturalna, nie „wytnij złe pola": paczkę budujemy
// od zera z białej listy, więc pole, którego nie przewidzieliśmy (nowy klucz w rollupie, `taskRef`,
// ścieżka), po prostu nie ma jak wyjechać. Na wszelki wypadek drugą linią jest `findLeaks` — skan
// kluczy i napisów gotowej paczki pod kątem ścieżek, id tasków i białych znaków.
//
// Idempotencja: każdy rollup ma stabilne `id` (projekt|dzień|host). Odbiorca robi upsert po `id`
// (zastępuje), więc ponowna wysyłka tego samego dnia — także po przeliczeniu agregatu — niczego nie
// dubluje. `contentHash` pozwala pominąć rekordy bez zmian.
//
// Co NIE wyjeżdża: `taskRef`, `runId`, ścieżki, id kroków, treść odstępstw. Odstępstwa wychodzą jako
// liczniki per (przyczyna, wyzwalacz) — sygnatura odstępstwa (`DEV-…`) powstaje z treści zgłoszenia
// i mogłaby nieść nazwy z projektu.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { deterministicId, rollupsDir } from './telemetry-events.mjs';

export const BATCH_VERSION = 1;
const SAFE_KEY = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

// Zbiera, co odrzucono (do raportu CLI) — nigdy nie trafia do paczki.
const makeCtx = () => ({ dropped: [] });

function counters(src, fields) {
  const out = {};
  for (const f of fields) { const n = num(src && src[f]); if (n !== null) out[f] = n; }
  return out;
}

// Mapa dynamicznych kluczy → liczby (outcomes, causes, ended). Klucz spoza SAFE_KEY odpada.
function countMap(src, at, ctx) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const [k, v] of Object.entries(src)) {
    if (!SAFE_KEY.test(k)) { ctx.dropped.push(`${at}.${k}`); continue; }
    const n = num(v);
    if (n !== null) out[k] = n;
  }
  return out;
}

const stats = (src) => (src && typeof src === 'object' ? counters(src, ['n', 'p50', 'p90']) : {});

function mapOf(src, at, ctx, build) {
  const out = {};
  for (const [k, v] of Object.entries(src || {})) {
    if (!SAFE_KEY.test(k)) { ctx.dropped.push(`${at}.${k}`); continue; }
    out[k] = build(v || {}, `${at}.${k}`, ctx);
  }
  return out;
}

const roleBlock = (src, at, ctx) => ({
  ...counters(src, ['n', 'costUsd', 'toolCalls']),
  durationMs: stats(src.durationMs),
  outcomes: countMap(src.outcomes, `${at}.outcomes`, ctx),
  causes: countMap(src.causes, `${at}.causes`, ctx),
});

const processBlock = (src, at, ctx) => ({
  ...counters(src, ['steps', 'stepsWithoutCost', 'costUsd', 'costUsdRetried', 'died', 'retried']),
  repairs: counters(src.repairs, ['fixSteps', 'fixed', 'open']),
  verification: counters(src.verification, ['units', 'firstPassGo']),
  roles: mapOf(src.roles, `${at}.roles`, ctx, roleBlock),
});

const runBlock = (src, at, ctx) => ({
  ...counters(src, ['started', 'costUsd']),
  durationMs: stats(src.durationMs),
  ended: countMap(src.ended, `${at}.ended`, ctx),
});

const engineBlock = (src, at, ctx) => ({
  ...counters(src, ['started', 'steps', 'stepsWithoutCost', 'costUsd', 'died']),
  ended: countMap(src.ended, `${at}.ended`, ctx),
});

// Odstępstwa: sygnatury wyrzucone, zostają liczniki per (cause, trigger).
function deviationCounts(src, ctx) {
  const merged = new Map();
  for (const [sig, d] of Object.entries(src || {})) {
    const cause = typeof d.cause === 'string' && SAFE_KEY.test(d.cause) ? d.cause : null;
    const trigger = typeof d.trigger === 'string' && SAFE_KEY.test(d.trigger) ? d.trigger : null;
    if (!cause || !trigger) { ctx.dropped.push(`deviations.${sig}`); continue; }
    const key = `${cause}|${trigger}`;
    merged.set(key, (merged.get(key) || 0) + (num(d.n) || 0));
  }
  return [...merged.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, n]) => { const [cause, trigger] = key.split('|'); return { cause, trigger, n }; });
}

/** Rollup z pliku → rekord paczki. Zwraca null, gdy brakuje tożsamości (projekt/dzień/host). */
export function projectRollup(r, ctx = makeCtx()) {
  const project = typeof r.project === 'string' && SAFE_KEY.test(r.project) ? r.project : null;
  const host = typeof r.host === 'string' && SAFE_KEY.test(r.host) ? r.host : null;
  const day = typeof r.day === 'string' && DAY.test(r.day) ? r.day : null;
  if (!project || !host || !day) { ctx.dropped.push('rollup bez poprawnego project/day/host'); return null; }
  const body = {
    v: 1, project, day, host,
    ...counters(r, ['events', 'stepsTotal']),
    processes: mapOf(r.processes, 'processes', ctx, processBlock),
    runs: mapOf(r.runs, 'runs', ctx, runBlock),
    engines: mapOf(r.engines, 'engines', ctx, (e, at) => mapOf(e, at, ctx, engineBlock)),
    deviations: deviationCounts(r.deviations, ctx),
  };
  const contentHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  return { id: deterministicId(`rollup:${project}|${day}|${host}`), contentHash, ...body };
}

const PATHLIKE = /[\\/]|\s/;
const TASKLIKE = /(^|[^A-Za-z0-9])[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{2,}\b/;

/** Druga linia obrony: każdy klucz i napis paczki bez ścieżek, białych znaków i id tasków. */
export function findLeaks(value, at = 'batch', out = []) {
  if (Array.isArray(value)) value.forEach((v, i) => findLeaks(v, `${at}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (PATHLIKE.test(k) || TASKLIKE.test(k)) out.push(`${at}.${k}: klucz wygląda na ścieżkę albo id zadania`);
      findLeaks(v, `${at}.${k}`, out);
    }
  } else if (typeof value === 'string' && (PATHLIKE.test(value) || TASKLIKE.test(value))) {
    out.push(`${at}: napis wygląda na ścieżkę albo id zadania ("${value.slice(0, 40)}")`);
  }
  return out;
}

/** Wszystkie rollupy z katalogu (opcjonalnie od dnia `since`) → paczka. `dropped` osobno, poza paczką. */
export function buildBatch({ dir = rollupsDir(), since = null, host = null } = {}) {
  const ctx = makeCtx();
  const rollups = [];
  let projects = [];
  try {
    projects = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch { /* brak katalogu = pusta paczka */ }
  for (const p of projects) {
    for (const f of fs.readdirSync(path.join(dir, p)).filter((x) => x.endsWith('.json')).sort()) {
      if (since && f.slice(0, 10) < since) continue;
      let raw;
      try { raw = JSON.parse(fs.readFileSync(path.join(dir, p, f), 'utf8')); } catch { ctx.dropped.push(`${p}/${f}: nieczytelny`); continue; }
      const rec = projectRollup(raw, ctx);
      if (rec && (!host || rec.host === host)) rollups.push(rec);
    }
  }
  rollups.sort((a, b) => a.id.localeCompare(b.id));
  const hosts = [...new Set(rollups.map((x) => x.host))].sort();
  const batch = { v: BATCH_VERSION, kind: 'rollup-batch', hosts, rollups };
  return { batch, dropped: ctx.dropped, leaks: findLeaks(batch) };
}
