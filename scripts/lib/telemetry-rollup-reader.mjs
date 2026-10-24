// scripts/lib/telemetry-rollup-reader.mjs — wspólny czytnik agregatów dziennych (telemetry/rollups/).
//
// Układ: <rollupsDir>/<projekt>/<RRRR-MM-DD>.<host>.json — jeden plik na projekt, dzień i host (ADR 0012).
// Czytnik tylko ładuje pliki; sumowanie liczników po hostach robi wołający (percentyle `durationMs`
// są per host i nie dają się sumować — raport ich nie używa).
//
// Wydzielony z `flow-live.loadBaseline` (TASK-OBS-014), żeby raport i flow-top nie miały dwóch kopii
// tej samej pętli. Uszkodzony plik jest pomijany, brak katalogu = pusta lista: odczyt nie przerywa pracy.

import fs from 'node:fs';
import path from 'node:path';
import { rollupsDir } from './telemetry-events.mjs';

const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.[^.]+\.json$/;
// Projekty syntetyczne evali (flow-eval-*) to artefakty testów, nie praca.
const SYNTHETIC_PROJECT = /^flow-eval-/;

/**
 * @param {object} [o]
 * @param {string} [o.dir] katalog główny rollupów (domyślnie rollupsDir())
 * @param {string|string[]} [o.project] jeden projekt albo lista; brak = wszystkie poza syntetycznymi
 * @param {string} [o.since] RRRR-MM-DD, włącznie
 * @param {string} [o.until] RRRR-MM-DD, włącznie
 * @returns {object[]} rollupy posortowane po dniu, potem projekcie i hoście; `project` zawsze ustawione
 */
export function readRollups({ dir = rollupsDir(), project, since, until } = {}) {
  let projects;
  if (project) projects = Array.isArray(project) ? project : [project];
  else {
    try {
      projects = fs.readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !SYNTHETIC_PROJECT.test(d.name)).map((d) => d.name);
    } catch { return []; }
  }
  const out = [];
  for (const proj of projects) {
    const pdir = path.join(dir, proj);
    let files;
    try { files = fs.readdirSync(pdir); } catch { continue; }
    for (const f of files) {
      const m = f.match(DAY_FILE);
      if (!m) continue;
      if (since && m[1] < since) continue;
      if (until && m[1] > until) continue;
      let r;
      try { r = JSON.parse(fs.readFileSync(path.join(pdir, f), 'utf8')); } catch { continue; }
      if (!r || typeof r !== 'object') continue;
      out.push({ ...r, day: r.day || m[1], project: r.project || proj });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.project.localeCompare(b.project)
    || String(a.host).localeCompare(String(b.host)));
}
