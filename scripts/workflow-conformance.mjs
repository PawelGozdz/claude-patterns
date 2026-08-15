#!/usr/bin/env node
// scripts/workflow-conformance.mjs — konformancja przebiegu Workflow z planem runtime.yml
// (TASK-OBS-002 §4). Runtime'owy odpowiednik statycznego /conformance-check: porównuje CO SIĘ
// WYDARZYŁO (rekordy kroków z workflow-steps.jsonl) z PLANEM obowiązującym w momencie przebiegu
// (snapshot ~/.claude/metrics/runtime-snapshots/<hash>.yml — D5).
//
// Sprawdzenia (deterministyczne, D2):
//   AGENT_OUTSIDE_SLOTS    — agentType spoza slotów planu (layers[].agent ∪ inner_loop.verify ∪ final_gate.agent)
//   MISSING_VERIFY         — jednostka miała implementację, ale żadnego kroku verifiera
//   VERIFY_NOT_GO          — ostatni werdykt verifiera jednostki ≠ GO (a przebieg nie eskalował tam)
//   MISSING_FINAL_GATE     — przebieg dobiegł końca bez kroku final gate'a
//   FINAL_GATE_WRONG_AGENT — final gate odpalony innym agentem niż wymaga plan
//   FINAL_GATE_NOT_GO      — final gate zakończony werdyktem ≠ GO
//   LAYER_ORDER            — implementerzy warstw odpalani niezgodnie z kolejnością planu
//   MAX_ATTEMPTS_EXCEEDED  — więcej prób impl/fix w jednostce niż inner_loop.max_attempts
// Info (nie dewiacja): escalatedAt — gdzie przebieg stanął i po ilu próbach.
//
// Użycie:
//   node scripts/workflow-conformance.mjs                 # wszystkie zebrane przebiegi
//   node scripts/workflow-conformance.mjs --run wf_xxx    # jeden przebieg
//   node scripts/workflow-conformance.mjs --runtime path/do/runtime.yml   # wymuś plan (np. fixture)
//   node scripts/workflow-conformance.mjs --json

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { STEPS_FILE, SNAPSHOTS_DIR, readJsonl, dedupeRecords } from './workflow-metrics-lib.mjs';

// Kroki narzędziowe (diff-sonda, typecheck, git-status…) chodzą na generycznych agentach —
// nie są "agentem spoza slotów", tylko instrumentacją workflow.
const UTILITY_AGENT_TYPES = new Set(['general-purpose', 'claude', 'Explore', 'state-reader']);

// Parser labeli. Trzy konwencje widziane w realnych przebiegach (2026-08, 216 runów):
//   dwukropkowa rola-pierwsza (kanon workflow-lint): 'impl:domain', 'verify:U1:a1', 'fix:infra-attempt2'
//   dwukropkowa jednostka-pierwsza:                  'domain:typecheck', 'application:impl'
//   myślnikowa:                                      'A2-impl-1', 'A2-verify-existing-3', 'A2-fix-2'
// Zakotwiczone do PEŁNEGO segmentu (opcjonalnie z sufiksami po myślniku: 'git-status',
// 'verify-gitdiff', 'impl-cont') — goły prefiks błędnie klasyfikowałby jednostki typu
// 'gateway' (⊃gate), 'runtime' (⊃run), 'checkout' (⊃check) jako role.
const ROLE_START = /^(impl|implement|implementation|fix|checks?|verify|typecheck|tests?|testing|final|gate|prep|stage|evidence|snapshot|git|gitsnap|gitstate?|gitstatus|gitdiff|run|migrate|discover|research|mutation|full-suite|delete|ui-verify)(-[a-z0-9]+)*$/i;

export function parseLabel(label) {
  if (!label) return { role: null, unit: '(bez labela)' };
  if (label.includes(':')) {
    const segs = label.split(':');
    if (ROLE_START.test(segs[0])) {
      return { role: segs[0], unit: (segs.slice(1).join(':') || segs[0]).replace(/-attempt\d+$/i, '') };
    }
    const last = segs[segs.length - 1];
    if (ROLE_START.test(last)) return { role: last, unit: segs.slice(0, -1).join(':') };
    return { role: null, unit: label };
  }
  const m = label.match(/^(.*?)-(impl|implement|implementation|fix|checks?|verify)(-[a-z0-9]+)*-\d+$/i);
  if (m) return { role: m[2], unit: m[1] };
  return { role: null, unit: label };
}

export function unitKey(label) {
  return parseLabel(label).unit;
}

export function parsePlan(yamlText, YAML) {
  const doc = YAML.parse(yamlText);
  const orch = doc?.orchestrate;
  if (!orch) return null;
  return {
    layers: (orch.layers || []).map((l, i) => ({ id: l.id, agent: l.agent, index: i })),
    verify: orch.inner_loop?.verify ?? null,
    maxAttempts: orch.inner_loop?.max_attempts ?? null,
    finalGate: orch.final_gate?.agent ?? null,
  };
}

// steps — rekordy 'step' JEDNEGO przebiegu; run — jego rekord 'run'; plan — z parsePlan().
export function checkConformance(steps, run, plan) {
  const deviations = [];
  const info = [];
  if (!plan) return { conformance: 'SKIPPED', reason: 'brak planu (runtime.yml bez sekcji orchestrate albo brak snapshotu)', deviations, info };

  const implAgents = new Set(plan.layers.map((l) => l.agent));
  const allowed = new Set([...implAgents, plan.verify, plan.finalGate].filter(Boolean));
  const escalatedAt = run?.escalatedAt ?? null;
  const unitEscalated = (unit) => !!escalatedAt
    && (unit === escalatedAt || unit.startsWith(`${escalatedAt}-`) || escalatedAt.startsWith(`${unit}-`));

  // 1. agenci spoza slotów (generyczne typy narzędziowe pomijamy — to instrumentacja, nie sloty)
  for (const s of steps) {
    if (s.agentType && !allowed.has(s.agentType) && !UTILITY_AGENT_TYPES.has(s.agentType)) {
      deviations.push({ code: 'AGENT_OUTSIDE_SLOTS', detail: `${s.label ?? s.agentId}: agentType '${s.agentType}' spoza slotów planu` });
    }
  }

  // 2. cykl implement→verify→GO per jednostka + limit prób
  const units = new Map();
  for (const s of steps) {
    const u = unitKey(s.label);
    if (!units.has(u)) units.set(u, []);
    units.get(u).push(s);
  }
  for (const [unit, unitSteps] of units) {
    const impls = unitSteps.filter((s) => implAgents.has(s.agentType));
    if (!impls.length) continue; // jednostka czysto weryfikacyjna / gate — bez wymogu cyklu
    // Verify liczy się po agentType Z PLANU albo po roli labela ('verify:…' / '…-verify-N') na
    // NIE-narzędziowym agencie — druga ścieżka łapie przebiegi z verifierem innego typu (te i tak
    // zgłasza AGENT_OUTSIDE_SLOTS). Probe'y typu 'verify-gitdiff' na general-purpose to nie verify.
    const verifies = unitSteps.filter((s) => {
      if (s.agentType === plan.verify) return true;
      const role = parseLabel(s.label).role ?? '';
      return /^(ui-)?verify$/i.test(role) && s.agentType && !UTILITY_AGENT_TYPES.has(s.agentType);
    }).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    if (unitEscalated(unit)) {
      info.push(`jednostka '${unit}': eskalacja po ${impls.length} próbach impl/fix (escalatedAt=${escalatedAt})`);
    } else if (!verifies.length) {
      deviations.push({ code: 'MISSING_VERIFY', detail: `jednostka '${unit}': ${impls.length}× impl/fix bez żadnego kroku verifiera (${plan.verify})` });
    } else {
      const last = verifies[verifies.length - 1];
      if (last.outcome !== 'GO' && last.outcome !== 'cached') {
        deviations.push({ code: 'VERIFY_NOT_GO', detail: `jednostka '${unit}': ostatni werdykt verifiera = ${last.outcome}` });
      }
    }
    if (plan.maxAttempts && impls.length > plan.maxAttempts) {
      deviations.push({ code: 'MAX_ATTEMPTS_EXCEEDED', detail: `jednostka '${unit}': ${impls.length} prób impl/fix > max_attempts=${plan.maxAttempts}` });
    }
  }

  // 3. final gate (tylko gdy przebieg nie eskalował wcześniej)
  if (!escalatedAt) {
    const gates = steps.filter((s) => s.agentType === plan.finalGate)
      .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    if (!gates.length) {
      // final gate właściwym agentem? — krok z 'final' w labelu na innym typie to osobna dewiacja
      const wrongGate = steps.find((s) => /final/i.test(s.label ?? '') && s.agentType && !UTILITY_AGENT_TYPES.has(s.agentType));
      if (wrongGate) {
        deviations.push({ code: 'FINAL_GATE_WRONG_AGENT', detail: `final gate '${wrongGate.label}' odpalony jako '${wrongGate.agentType}', plan wymaga '${plan.finalGate}'` });
      } else {
        deviations.push({ code: 'MISSING_FINAL_GATE', detail: `brak kroku final gate'a (${plan.finalGate}) w ukończonym przebiegu` });
      }
    } else {
      const last = gates[gates.length - 1];
      if (last.outcome !== 'GO' && last.outcome !== 'cached') {
        deviations.push({ code: 'FINAL_GATE_NOT_GO', detail: `final gate zakończony werdyktem ${last.outcome}` });
      }
    }
  } else {
    info.push(`przebieg eskalował na '${escalatedAt}' — final gate niewymagany`);
  }

  // 4. kolejność warstw — pierwsze wystąpienie każdego implementera vs kolejność w planie.
  //    Porównujemy tylko RÓŻNE agentTypes (ten sam agent może obsługiwać kilka warstw).
  const firstSeen = new Map();
  for (const s of [...steps].sort((a, b) => String(a.ts).localeCompare(String(b.ts)))) {
    if (implAgents.has(s.agentType) && !firstSeen.has(s.agentType)) firstSeen.set(s.agentType, s.label);
  }
  const planIndex = new Map();
  for (const l of plan.layers) if (!planIndex.has(l.agent)) planIndex.set(l.agent, l.index);
  let prevIdx = -1; let prevAgent = null;
  for (const [agent, label] of firstSeen) {
    const idx = planIndex.get(agent);
    if (idx < prevIdx) {
      deviations.push({ code: 'LAYER_ORDER', detail: `'${agent}' (od ${label}) odpalony przed '${prevAgent}', wbrew kolejności warstw planu` });
    } else {
      prevIdx = idx; prevAgent = agent;
    }
  }

  return {
    conformance: deviations.length ? `DEVIATIONS(${deviations.length})` : 'OK',
    deviations, info,
  };
}

export async function main(argv = process.argv.slice(2)) {
  let YAML;
  try { YAML = (await import('yaml')).default; }
  catch { console.error('BŁĄD: brak paczki "yaml" — odpal `npm ci` w claude-patterns.'); process.exit(1); }

  const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  const onlyRun = get('--run');
  const forcedRuntime = get('--runtime');
  const json = argv.includes('--json');
  const file = get('--file') ?? STEPS_FILE;

  const records = dedupeRecords(readJsonl(file));
  const runs = records.filter((r) => r.type === 'run' && (!onlyRun || r.runId === onlyRun));
  const stepsByRun = new Map();
  for (const s of records.filter((r) => r.type === 'step')) {
    if (!stepsByRun.has(s.runId)) stepsByRun.set(s.runId, []);
    stepsByRun.get(s.runId).push(s);
  }

  const planCache = new Map();
  const loadPlan = (hash) => {
    const p = forcedRuntime ?? (hash ? path.join(SNAPSHOTS_DIR, `${hash}.yml`) : null);
    if (!p || !fs.existsSync(p)) return null;
    if (!planCache.has(p)) planCache.set(p, parsePlan(fs.readFileSync(p, 'utf8'), YAML));
    return planCache.get(p);
  };

  const results = [];
  for (const run of runs) {
    const res = checkConformance(stepsByRun.get(run.runId) ?? [], run, loadPlan(run.runtimeYmlHash));
    results.push({ runId: run.runId, project: run.project, taskId: run.taskId, workflowName: run.workflowName, ...res });
  }

  if (json) { console.log(JSON.stringify(results, null, 2)); return results; }
  for (const r of results) {
    console.log(`\n${r.runId} (${r.workflowName ?? r.taskId ?? '?'}, ${r.project ?? '?'}) → ${r.conformance}${r.reason ? ` — ${r.reason}` : ''}`);
    for (const d of r.deviations) console.log(`  ✗ ${d.code}: ${d.detail}`);
    for (const i of r.info) console.log(`  ℹ ${i}`);
  }
  if (!results.length) console.log('(brak przebiegów — odpal najpierw workflow-metrics-collect.mjs)');
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  main();
}
