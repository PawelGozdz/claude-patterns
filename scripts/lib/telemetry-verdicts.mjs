// scripts/lib/telemetry-verdicts.mjs — poprawność werdyktów weryfikatorów (TASK-OBS-012, ADR 0015 D2).
//
// Czysta funkcja: zdarzenia → lista „rozliczeń" (`tallies` per werdykt, `gates` per bramka), które
// `buildRollups` dodaje do dnia i agenta werdyktu. Źródłem prawdy o fałszywym GO jest bramka końcowa tego
// samego przebiegu, nie drugi LLM (ADR 0004): `go` jednostki, po którym pierwsza bramka dała `no_go`
// wskazujące tę warstwę (`step.blamed`, patrz final-gate-blame.mjs).
//
//   goJudged    — jednostki, których OSTATNI werdykt przed pierwszą bramką to `go`, w przebiegach z
//                 przypisaniem (pole `blamed` obecne) — mianownik odsetka fałszywych GO
//   falseGo     — z nich te, które bramka wskazała
//   noGoJudged  — `no_go` z następnym werdyktem tej jednostki (rozstrzygalne)
//   falseNoGo   — z nich te, po których następny werdykt to `go` BEZ kroku `fixes` pomiędzy
//
// `fixes` zapisuje tylko `orchestrate`, więc tylko on dostaje falseNoGo. Fałszywe GO to dolna granica:
// naruszenie bez ścieżki z plików warstwy nie ma właściciela i liczy się w `gates.unattributed`.

import { unitOf } from './telemetry-stats.mjs';
import { firstFinalGates, layerOfVerifierUnit } from './final-gate-blame.mjs';

const VERDICTS = new Set(['go', 'no_go']);
const isVerdict = (e) => e.kind === 'step.end' && e.step && e.step.role === 'verifier' && VERDICTS.has(e.outcome);
const byTime = (a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id);

function unitsOf(verdicts) {
  const units = new Map();
  for (const v of verdicts) {
    const unit = unitOf(v.step.id);
    if (!units.has(unit)) units.set(unit, []);
    units.get(unit).push(v);
  }
  return units;
}

function falseNoGoTallies(units, fixes, tallies) {
  for (const [unit, list] of units) {
    for (let i = 0; i < list.length - 1; i++) {
      const v = list[i];
      if (v.outcome !== 'no_go') continue;
      const next = list[i + 1];
      const repaired = fixes.some((f) => unitOf(f.step.fixes) === unit && f.ts > v.ts && f.ts < next.ts);
      tallies.push({ ev: v, counts: { noGoJudged: 1, ...(next.outcome === 'go' && !repaired ? { falseNoGo: 1 } : {}) } });
    }
  }
}

function falseGoTallies(units, gate, tallies, gates) {
  const blamed = new Set(gate.step.blamed);
  const hit = new Set();
  for (const [unit, list] of units) {
    const last = list.filter((v) => v.ts < gate.ts).pop();
    if (!last || last.outcome !== 'go') continue;
    const layer = layerOfVerifierUnit(unit);
    const wrong = blamed.has(layer);
    if (wrong) hit.add(layer);
    tallies.push({ ev: last, counts: { goJudged: 1, ...(wrong ? { falseGo: 1 } : {}) } });
  }
  gates.push({
    ev: gate,
    counts: {
      judged: 1,
      ...(gate.outcome === 'no_go' ? { noGo: 1 } : {}),
      ...(blamed.size ? { noGoAttributed: 1, blamedUnits: blamed.size } : {}),
      ...(gate.step.unblamed ? { unattributed: gate.step.unblamed } : {}),
      ...(blamed.size > hit.size ? { blamedUnmatched: blamed.size - hit.size } : {}),
    },
  });
}

export function judgeVerdicts(events) {
  const tallies = [];
  const gates = [];
  const runs = new Map();
  for (const e of events) {
    if (e.process !== 'orchestrate' || e.kind !== 'step.end' || !e.step) continue;
    const k = `${e.host}|${e.project}|${e.runId}`;
    if (!runs.has(k)) runs.set(k, []);
    runs.get(k).push(e);
  }
  for (const steps of runs.values()) {
    steps.sort(byTime);
    const units = unitsOf(steps.filter(isVerdict));
    falseNoGoTallies(units, steps.filter((s) => s.step.fixes), tallies);
    const gate = firstFinalGates(steps).get(steps[0].runId);
    if (gate && Array.isArray(gate.step.blamed)) falseGoTallies(units, gate, tallies, gates);
  }
  return { tallies, gates };
}
