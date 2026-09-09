#!/usr/bin/env node
// Świeżość telemetrii lokalnego harnessa (K76, TASK-KAIZEN-002):
//   node scripts/telemetry-freshness.mjs [--verbose]
//
// Po co: `~/.claude/metrics/workflow-steps.jsonl` przestał rosnąć 2026-08-15 i nikt tego
// nie zauważył przez trzy tygodnie — 3771 wpisów i $2652 historii, a potem cisza. Powód
// był banalny: `workflow-metrics-postrun.js` siedzi w `hooks/hooks.json`, którego żaden
// skrypt nie aplikuje do `~/.claude/settings.json` (K60). Hook, którego nikt nie wpiął,
// wygląda dokładnie tak samo jak hook, który się nie odpalił — z zewnątrz nie widać różnicy.
// Sam plik metryk też nie odróżnia „nic się nie działo" od „pomiar padł".
//
// Dlatego mierzymy RÓŻNICĘ: ostatni zapis telemetrii kontra dowód, że praca danego typu
// mimo to trwała (transkrypt sesji). Cisza przy braku pracy jest poprawna; cisza przy
// pracy oznacza zerwany pomiar.
//
// Osobny skrypt, nie kolejna sekcja w `audit-projects.mjs` — bo przedmiot jest inny.
// Audyt projektów opisuje flotę repozytoriów w /opt/projects; ten check opisuje jedną
// instalację harnessa w ~/.claude, wspólną dla wszystkich. Ten sam podział, co przy
// `rag-freshness.mjs` i `generate-pattern-routing.mjs --check`: audyt je woła, ale każdy
// da się odpalić osobno, gdy naprawia się akurat tę jedną rzecz.
//
// Exit 0 = telemetria żywa; exit 1 = zerwany pomiar (pierwsza linia stderr to komunikat).

import { readFileSync, existsSync, statSync, readdirSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const HOME = homedir();
const PROJECTS = join(HOME, '.claude/projects');
const VERBOSE = process.argv.includes('--verbose');
const DAY = 24 * 60 * 60 * 1000;

// Pliki telemetrii mają dziesiątki MB. Interesuje nas ostatni wpis, więc czytamy ogon.
const tailLines = (path, bytes = 65536) => {
  const size = statSync(path).size;
  const len = Math.min(size, bytes);
  const buf = Buffer.alloc(len);
  const fd = openSync(path, 'r');
  try { readSync(fd, buf, 0, len, size - len); } finally { closeSync(fd); }
  return buf.toString('utf8').split('\n').filter((l) => l.trim());
};

// Ostatni sensowny znacznik czasu w pliku JSONL. `mtime` by nie wystarczył: plik dotyka
// każdy zapis, także taki, który nie niesie zdarzenia (rotacja, dopisanie pustej linii).
const lastTimestamp = (path, fields) => {
  let best = null;
  for (const line of tailLines(path)) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    for (const f of fields) {
      const v = o[f];
      if (!v) continue;
      const t = typeof v === 'number' ? v : Date.parse(v);
      if (Number.isFinite(t) && (best === null || t > best)) best = t;
    }
  }
  return best;
};

const listTranscripts = () => {
  if (!existsSync(PROJECTS)) return [];
  const out = [];
  for (const d of readdirSync(PROJECTS, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dir = join(PROJECTS, d.name);
    let entries;
    try { entries = readdirSync(dir); } catch { continue; }
    for (const f of entries) {
      if (!f.endsWith('.jsonl')) continue;
      const p = join(dir, f);
      try { out.push({ path: p, mtime: statSync(p).mtimeMs }); } catch { /* zniknął w trakcie */ }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
};

// Najnowszy transkrypt zawierający wzorzec, szukany od najświeższego wstecz i przerywany
// na pierwszym trafieniu. Pytanie brzmi „czy JEST coś nowszego niż telemetria", a nie
// „ile tego jest" — pełny przemiał 6000 plików kosztowałby 10 s zamiast ułamka sekundy.
const newestMatching = (files, pattern) => {
  const BATCH = 60;
  for (let i = 0; i < files.length; i += BATCH) {
    const chunk = files.slice(i, i + BATCH);
    let hits = '';
    try {
      hits = execFileSync('grep', ['-l', '-m', '1', '-F', pattern, ...chunk.map((f) => f.path)],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 * 1024 * 1024 });
    } catch { /* grep zwraca 1, gdy w partii nie ma trafień */ }
    const found = hits.split('\n').filter(Boolean);
    if (found.length) {
      // W partii kolejność wyników idzie za kolejnością argumentów, a ta jest malejąca
      // po mtime, więc pierwsze trafienie jest najnowsze.
      const byPath = new Map(chunk.map((f) => [f.path, f.mtime]));
      return { path: found[0], mtime: byPath.get(found[0]) ?? 0 };
    }
  }
  return null;
};

const findings = [];
const notes = [];
const transcripts = listTranscripts();

// Naprawa to wpięcie `hooks/hooks.json` w `~/.claude/settings.json`. Robi to
// `scripts/sync-global-hooks.mjs` (K60) — dopóki nie powstanie, komunikat nie może
// odsyłać do skryptu, którego nie ma, bo to zamienia znalezisko w ślepy zaułek.
const REPO = join(new URL('..', import.meta.url).pathname);
const SYNC_HOOKS = join(REPO, 'scripts/sync-global-hooks.mjs');
const FIX = existsSync(SYNC_HOOKS)
  ? 'node scripts/sync-global-hooks.mjs --apply'
  : 'wpięcie ręczne: przenieś wpis hooka z hooks/hooks.json do ~/.claude/settings.json ' +
    '(automat: scripts/sync-global-hooks.mjs, K60 — jeszcze nie istnieje)';

// ── 1. Metryki Workflow ────────────────────────────────────────────────────
// Dowodem pracy jest sesja, w której narzędzie `Workflow` faktycznie wystąpiło —
// nie sama aktywność w Claude Code. Bez tego zawężenia każdy dzień pisania kodu
// wyglądałby jak zerwany pomiar workflowów.
const WF_METRICS = join(HOME, '.claude/metrics/workflow-steps.jsonl');
if (!existsSync(WF_METRICS)) {
  notes.push('brak ~/.claude/metrics/workflow-steps.jsonl — nic jeszcze nie zapisano');
} else {
  const last = lastTimestamp(WF_METRICS, ['ts', 'timestamp', 'finishedAt']);
  if (last === null) {
    notes.push('workflow-steps.jsonl bez czytelnego znacznika czasu w ogonie pliku');
  } else {
    const newer = transcripts.filter((f) => f.mtime > last + DAY);
    const hit = newer.length ? newestMatching(newer, '"name":"Workflow"') : null;
    if (hit) {
      findings.push([
        `metryki Workflow martwe: ostatni wpis ${new Date(last).toISOString().slice(0, 16)}, ` +
        `a sesja z narzędziem Workflow działała ${new Date(hit.mtime).toISOString().slice(0, 16)} ` +
        `(${Math.round((hit.mtime - last) / DAY)} dni później) — hook workflow-metrics-postrun ` +
        'nie jest wpięty w ~/.claude/settings.json',
        FIX,
      ]);
      if (VERBOSE) notes.push(`dowód: ${hit.path}`);
    } else {
      notes.push(`workflow-steps.jsonl aktualny względem sesji (ostatni wpis ${new Date(last).toISOString().slice(0, 10)})`);
    }
  }
}

// ── 2. Log użycia agentów ──────────────────────────────────────────────────
// Tu odwrotnie niż wyżej: SubagentStop odpala się w KAŻDEJ sesji z delegacją, więc
// szukanie konkretnego dowodu w transkryptach byłoby przepłacone. Wystarczy próg —
// tydzień ciszy w logu przy istniejącym świeższym transkrypcie znaczy to samo.
const AGENT_LOG = join(HOME, '.claude/logs/agent-usage.jsonl');
if (!existsSync(AGENT_LOG)) {
  notes.push('brak ~/.claude/logs/agent-usage.jsonl — nic jeszcze nie zapisano');
} else {
  const last = lastTimestamp(AGENT_LOG, ['ts', 'timestamp', 'time']) ?? statSync(AGENT_LOG).mtimeMs;
  const newestSession = transcripts[0]?.mtime ?? 0;
  if (newestSession > last + 7 * DAY) {
    findings.push([
      `log użycia agentów martwy: ostatni wpis ${new Date(last).toISOString().slice(0, 16)}, ` +
      `najnowsza sesja ${new Date(newestSession).toISOString().slice(0, 16)} — hook ` +
      'subagent-stop-cost-log nie jest wpięty w ~/.claude/settings.json',
      FIX,
    ]);
  } else {
    notes.push(`agent-usage.jsonl aktualny (ostatni wpis ${new Date(last).toISOString().slice(0, 10)})`);
  }
}

if (VERBOSE || !findings.length) for (const n of notes) console.log(`  ${n}`);

if (!findings.length) {
  console.log('  telemetria: pomiary żywe');
  process.exit(0);
}

for (const [what, fix] of findings) console.error(`  ✗ ${what}\n    → ${fix}`);
process.exit(1);
