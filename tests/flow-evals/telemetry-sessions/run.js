#!/usr/bin/env node
/**
 * tests/flow-evals/telemetry-sessions/run.js — eval L1 dla hooków telemetrii /analyze (ADR 0012, krok 3).
 *
 * DLACZEGO (2026-10-10): panel /analyze to agenci narzędzia Agent z głównej pętli, a hook metryk
 * widzi tylko Workflow, więc analiza miała 0 danych. Teraz komenda otwiera przebieg
 * (`telemetry-emit run-start`), hook PostToolUse(Agent) przypina agentów do slotów, a hook
 * SubagentStop zamyka ich kroki. Ten eval pilnuje kontraktów, które łatwo zepsuć po cichu.
 *
 * Wejścia hooków to ZANONIMIZOWANE payloady z żywej sondy (fixtures/): kształt `tool_response`
 * (async_launched + agentId) i `agent_id` w SubagentStop sprawdzono na prawdziwym przebiegu, nie
 * założono z transkryptu. Wszystko w katalogu tymczasowym (CLAUDE_TELEMETRY_DIR).
 *
 * Kontrakty:
 *   1. bez otwartego przebiegu, bez markera `[slot:…]`, w subagencie albo poza projektem start nic nie zapisuje
 *   2. równoległa rejestracja agentów nie gubi mapowań (plik na agenta, nie wspólny plik)
 *   3. SubagentStop bez stanu agenta: nic nie zapisuje, stdin → stdout
 *   4. wynik z transkryptu: ok / pusta odpowiedź = died+silent / błąd API na końcu = failed+infra
 *   5. powtórzony SubagentStop nie dubluje, drugi agent tego samego slotu = próba 2
 *   6. run-end: pominięty slot → skipped, agent bez końca → unknown, potem run.end, stan skasowany
 *   7. przebieg starszy niż TTL: hook go ignoruje, a run-start zamyka go zdarzeniem unknown
 *   8. prywatność: żadne zdarzenie nie niesie opisu agenta, promptu, odpowiedzi ani ścieżek
 *   9. hooki wychodzą 0 i przepisują stdin także dla śmieci na wejściu
 *  10. SubagentStop szybkiego agenta potrafi wyprzedzić PostToolUse (zmierzone na żywo) — krok
 *      i tak się zamyka, a stan nie przecieka (zatrzymania pomocników znikają z przebiegiem)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const START = path.join(REPO, 'hooks', 'telemetry-agent-start.js');
const STOP = path.join(REPO, 'hooks', 'telemetry-agent-stop.js');
const CLI = path.join(REPO, 'scripts', 'telemetry-emit.mjs');
const FIX = path.join(__dirname, 'fixtures');
const postFx = JSON.parse(fs.readFileSync(path.join(FIX, 'post-agent.json'), 'utf8'));
const stopFx = JSON.parse(fs.readFileSync(path.join(FIX, 'stop-agent.json'), 'utf8'));

const SECRET_DESC = 'zbadaj-tajny-prompt-klienta';
const SECRET_REPLY = 'tajna-odpowiedz-agenta';
const PLAN = 'security:panel:security,architect:panel:architect,tech-lead:panel:tech-lead';

let currentProject = '/fixture/project'; // cwd sesji w payloadzie SubagentStop = projekt bieżącego testu

function makeEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-telemetry-sessions-'));
  const project = path.join(dir, 'proj-aegis');
  fs.mkdirSync(project);
  currentProject = project;
  const env = { ...process.env, CLAUDE_TELEMETRY_DIR: path.join(dir, 'tel'), CLAUDE_TELEMETRY_RUN_TTL_MS: '' };
  return { dir, project, env, tel: env.CLAUDE_TELEMETRY_DIR };
}

const runNode = (file, args, env, input) => spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', env, input });
const hook = (file, payload, env) => runNode(file, [], env, typeof payload === 'string' ? payload : JSON.stringify(payload));
const runStart = (x, plan = PLAN) => runNode(CLI, ['run-start', '--process', 'analyze', '--project', x.project, '--task', 'TS-FX-001', '--plan', plan], x.env).stdout.trim();

function hookAsync(file, payload, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [file], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    p.on('close', (code) => resolve(code));
    p.stdin.end(JSON.stringify(payload));
  });
}

const postPayload = (x, agentId, desc = `[slot:security] ${SECRET_DESC}`, extra = {}) => ({
  ...postFx, cwd: x.project, ...extra,
  tool_input: { ...postFx.tool_input, description: desc },
  tool_response: { ...postFx.tool_response, agentId, description: desc },
});

// Transkrypt agenta: linie `assistant` z usage i tool_use; ostatnia może być błędem API.
function writeTranscript(x, name, { apiErrorLast = false } = {}) {
  const t0 = Date.parse('2026-10-10T15:00:00.000Z');
  const line = (id, usage, content, extra = {}) => JSON.stringify({
    type: 'assistant', timestamp: new Date(t0 + (extra.atSec || 0) * 1000).toISOString(),
    message: { id, model: 'claude-sonnet-5-5', role: 'assistant', content, usage },
  });
  const lines = [
    line('m1', { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 50, cache_read_input_tokens: 500 },
      [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }, { type: 'tool_use', id: 't2', name: 'Read', input: {} }]),
    line('m2', { input_tokens: 120, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 600 },
      [{ type: 'text', text: SECRET_REPLY }], { atSec: 42 }),
  ];
  if (apiErrorLast) {
    lines.push(JSON.stringify({
      type: 'assistant', isApiErrorMessage: true, error: 'rate_limit', timestamp: '2026-10-10T15:00:43.000Z',
      message: { id: 'e1', model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: "You've hit your weekly limit" }],
        usage: { input_tokens: 0, output_tokens: 0 } },
    }));
  }
  const file = path.join(x.dir, `${name}.jsonl`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

const stopPayload = (agentId, transcript, lastMessage) => ({
  ...stopFx, cwd: currentProject, agent_id: agentId, agent_transcript_path: transcript, last_assistant_message: lastMessage,
});

function allEvents(x) {
  if (!fs.existsSync(x.tel)) return [];
  return fs.readdirSync(x.tel).filter((f) => f.endsWith('.jsonl'))
    .flatMap((f) => fs.readFileSync(path.join(x.tel, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
}
const stateFiles = (x, sub) => {
  const d = path.join(x.tel, 'sessions', sub);
  return fs.existsSync(d) ? fs.readdirSync(d) : [];
};

const tests = [
  {
    name: 'start-ignores-everything-that-is-not-a-marked-panel-agent-of-an-open-run',
    run() {
      const x = makeEnv();
      hook(START, postPayload(x, 'a1'), x.env);
      if (stateFiles(x, 'agents').length) return 'bez otwartego przebiegu zapisał agenta';
      runStart(x);
      hook(START, postPayload(x, 'a2', 'Explore: zwykły agent bez markera'), x.env);
      hook(START, postPayload(x, 'a3', '[slot:security] x', { agent_id: 'parent-sub' }), x.env);
      hook(START, postPayload(x, 'a4', '[slot:security] x', { cwd: os.tmpdir() }), x.env);
      hook(START, postPayload(x, 'a5', '  [slot:security] z odstępem'), x.env);
      const got = stateFiles(x, 'agents');
      if (got.join() !== 'a5.json') return `zarejestrowano ${JSON.stringify(got)}, oczekiwano tylko a5`;
      return null;
    },
  },
  {
    name: 'start-records-slot-without-the-description',
    run() {
      const x = makeEnv();
      const runId = runStart(x);
      const r = hook(START, postPayload(x, 'ab0e67cca3587f5cb'), x.env);
      const raw = fs.readFileSync(path.join(x.tel, 'sessions', 'agents', 'ab0e67cca3587f5cb.json'), 'utf8');
      const rec = JSON.parse(raw);
      if (rec.slot !== 'security' || rec.runId !== runId || rec.attempt !== 1 || rec.agentType !== 'Explore') return `zły rekord: ${raw}`;
      if (raw.includes(SECRET_DESC)) return 'opis agenta wyciekł do pliku stanu';
      if (r.status !== 0 || r.stdout !== JSON.stringify(postPayload(x, 'ab0e67cca3587f5cb'))) return 'stdin nie został przepisany na stdout';
      return null;
    },
  },
  {
    name: 'parallel-registration-loses-no-agent',
    async run() {
      const x = makeEnv();
      runStart(x);
      const ids = Array.from({ length: 12 }, (_, i) => `par${i}`);
      const codes = await Promise.all(ids.map((id, i) => hookAsync(START, postPayload(x, id, `[slot:s${i}] x`), x.env)));
      if (codes.some((c) => c !== 0)) return 'hook zakończył się kodem ≠ 0';
      const got = stateFiles(x, 'agents').sort();
      if (got.length !== ids.length) return `zapisano ${got.length}/${ids.length} agentów (wyścig na pliku stanu)`;
      return null;
    },
  },
  {
    name: 'stop-without-agent-state-writes-nothing',
    run() {
      const x = makeEnv();
      runStart(x);
      const payload = stopPayload('nieznany', path.join(x.dir, 'brak.jsonl'), 'cokolwiek');
      const r = hook(STOP, payload, x.env);
      if (r.status !== 0 || r.stdout !== JSON.stringify(payload)) return 'brak exit 0 albo przepisania stdin';
      if (allEvents(x).length !== 1) return `oczekiwano tylko run.start, jest ${allEvents(x).length} zdarzeń`;
      return null;
    },
  },
  {
    name: 'stop-outcome-comes-from-transcript-and-reply',
    run() {
      const x = makeEnv();
      runStart(x);
      const cases = [
        ['ok1', writeTranscript(x, 't-ok'), SECRET_REPLY, 'ok', undefined],
        ['dead1', writeTranscript(x, 't-dead'), '   ', 'died', 'silent'],
        ['err1', writeTranscript(x, 't-err', { apiErrorLast: true }), "You've hit your weekly limit", 'failed', 'infra'],
      ];
      for (const [id] of cases) hook(START, postPayload(x, id, `[slot:${id}] x`), x.env);
      for (const [id, tr, msg] of cases) hook(STOP, stopPayload(id, tr, msg), x.env);
      const steps = allEvents(x).filter((e) => e.kind === 'step.end');
      for (const [id, , , outcome, cause] of cases) {
        const ev = steps.find((e) => e.step.id === id);
        if (!ev) return `brak step.end dla ${id}`;
        if (ev.outcome !== outcome || ev.cause !== cause) return `${id}: ${ev.outcome}/${ev.cause}, oczekiwano ${outcome}/${cause}`;
      }
      const ok = steps.find((e) => e.step.id === 'ok1');
      if (ok.step.group !== 'panel' || ok.step.role !== 'ok1' || ok.step.model !== 'claude-sonnet-5-5') return `zły step: ${JSON.stringify(ok.step)}`;
      if (ok.m.toolCalls !== 2 || ok.m.tokensOut !== 30 || ok.m.tokensIn !== 220 || ok.m.cacheRead !== 1100 || ok.m.cacheWrite !== 50) return `złe metryki: ${JSON.stringify(ok.m)}`;
      if (ok.m.durationMs !== 42000) return `durationMs z transkryptu: ${ok.m.durationMs}, oczekiwano 42000`;
      const err = steps.find((e) => e.step.id === 'err1');
      if (err.step.model !== 'claude-sonnet-5-5') return `model błędu API: ${err.step.model} ('<synthetic>' nie jest modelem)`;
      return null;
    },
  },
  {
    name: 'stop-twice-no-duplicate-and-second-agent-of-slot-is-attempt-2',
    run() {
      const x = makeEnv();
      runStart(x);
      const tr = writeTranscript(x, 't');
      hook(START, postPayload(x, 'first'), x.env);
      hook(START, postPayload(x, 'second'), x.env);
      hook(STOP, stopPayload('first', tr, 'a'), x.env);
      hook(STOP, stopPayload('first', tr, 'a'), x.env);
      hook(STOP, stopPayload('second', tr, 'b'), x.env);
      const steps = allEvents(x).filter((e) => e.kind === 'step.end');
      if (steps.length !== 2) return `oczekiwano 2 kroków, jest ${steps.length}`;
      const second = steps.find((e) => e.step.attempt === 2);
      if (!second || second.step.id !== 'security-r2') return `druga próba: ${JSON.stringify(second && second.step)}`;
      return null;
    },
  },
  {
    name: 'run-end-skips-missing-slots-marks-unfinished-unknown-and-clears-state',
    run() {
      const x = makeEnv();
      const runId = runStart(x);
      hook(START, postPayload(x, 'sec1', '[slot:security] x'), x.env);
      hook(START, postPayload(x, 'arch1', '[slot:architect] x'), x.env);
      hook(STOP, stopPayload('sec1', writeTranscript(x, 't'), 'raport'), x.env);
      const r = runNode(CLI, ['run-end', '--process', 'analyze', '--project', x.project, '--run-id', runId, '--outcome', 'halted'], x.env);
      if (r.status !== 0) return `run-end exit ${r.status}: ${r.stderr}`;
      const ev = allEvents(x).filter((e) => e.runId === runId);
      const by = (id) => ev.find((e) => e.kind === 'step.end' && e.step.id === id);
      if (!by('security') || by('security').outcome !== 'ok') return 'krok security zgubiony albo nie ok';
      if (!by('architect') || by('architect').outcome !== 'unknown') return `architect bez końca: ${by('architect') && by('architect').outcome}`;
      if (!by('tech-lead') || by('tech-lead').outcome !== 'skipped') return `tech-lead pominięty: ${by('tech-lead') && by('tech-lead').outcome}`;
      const end = ev.filter((e) => e.kind === 'run.end');
      if (end.length !== 1 || end[0].outcome !== 'halted') return `run.end: ${JSON.stringify(end.map((e) => e.outcome))}`;
      if (stateFiles(x, 'runs').length || stateFiles(x, 'agents').length) return 'stan przebiegu nie został skasowany';
      hook(STOP, stopPayload('arch1', writeTranscript(x, 't2'), 'spóźniony'), x.env);
      if (allEvents(x).filter((e) => e.step && e.step.id === 'architect').length !== 1) return 'spóźniony SubagentStop dopisał krok po zamknięciu';
      return null;
    },
  },
  {
    name: 'stop-before-start-is-completed-by-the-start-hook',
    run() {
      const x = makeEnv();
      runStart(x);
      const tr = writeTranscript(x, 't-fast');
      // Zmierzone na żywo: SubagentStop szybkiego agenta wyprzedza PostToolUse(Agent).
      hook(STOP, stopPayload('fast1', tr, SECRET_REPLY), x.env);
      if (allEvents(x).some((e) => e.kind === 'step.end')) return 'krok zapisany bez wiedzy o slocie';
      if (stateFiles(x, 'stops').join() !== 'fast1.json') return `oczekujące zatrzymanie: ${stateFiles(x, 'stops')}`;
      const pending = fs.readFileSync(path.join(x.tel, 'sessions', 'stops', 'fast1.json'), 'utf8');
      if (pending.includes(SECRET_REPLY)) return 'oczekujące zatrzymanie zawiera treść odpowiedzi';
      hook(START, postPayload(x, 'fast1', '[slot:architect] x'), x.env);
      const steps = allEvents(x).filter((e) => e.kind === 'step.end');
      if (steps.length !== 1 || steps[0].step.id !== 'architect' || steps[0].outcome !== 'ok') return `kroki: ${JSON.stringify(steps.map((e) => [e.step.id, e.outcome]))}`;
      if (steps[0].m.tokensOut !== 30 || steps[0].m.durationMs !== 42000) return `metryki: ${JSON.stringify(steps[0].m)}`;
      if (stateFiles(x, 'stops').length) return 'oczekujące zatrzymanie nie zostało usunięte';
      return null;
    },
  },
  {
    name: 'stop-before-start-with-empty-reply-is-died-silent',
    run() {
      const x = makeEnv();
      runStart(x);
      hook(STOP, stopPayload('fast2', writeTranscript(x, 't-fast2'), ''), x.env);
      hook(START, postPayload(x, 'fast2', '[slot:security] x'), x.env);
      const ev = allEvents(x).find((e) => e.kind === 'step.end');
      return ev && ev.outcome === 'died' && ev.cause === 'silent' ? null : `wynik: ${ev && ev.outcome}/${ev && ev.cause}`;
    },
  },
  {
    name: 'pending-stops-of-unmarked-agents-are-cleared-with-the-run',
    run() {
      const x = makeEnv();
      const runId = runStart(x);
      hook(STOP, stopPayload('helper1', writeTranscript(x, 't-h'), 'pomocnik'), x.env); // Explore bez markera: start go nie zarejestruje
      hook(START, postPayload(x, 'helper1', 'Explore: bez markera'), x.env);
      if (stateFiles(x, 'stops').join() !== 'helper1.json') return 'oczekiwano osieroconego zatrzymania pomocnika';
      runNode(CLI, ['run-end', '--process', 'analyze', '--project', x.project, '--run-id', runId, '--outcome', 'ok'], x.env);
      if (stateFiles(x, 'stops').length) return 'run-end nie posprzątał oczekujących zatrzymań';
      if (allEvents(x).some((e) => e.kind === 'step.end' && e.outcome !== 'skipped')) return 'pomocnik policzony jako krok panelu';
      return null;
    },
  },
  {
    name: 'stop-without-open-run-leaves-no-state',
    run() {
      const x = makeEnv();
      hook(STOP, stopPayload('lonely', writeTranscript(x, 't-l'), 'x'), x.env);
      return fs.existsSync(path.join(x.tel, 'sessions')) ? 'hook zostawił stan bez otwartego przebiegu' : null;
    },
  },
  {
    name: 'run-end-without-state-still-writes-run-end',
    run() {
      const x = makeEnv();
      const r = runNode(CLI, ['run-end', '--process', 'analyze', '--project', 'aegis-flow', '--run-id', 'analyze-bez-stanu', '--outcome', 'ok'], x.env);
      if (r.status !== 0) return `exit ${r.status}`;
      const end = allEvents(x).filter((e) => e.kind === 'run.end');
      return end.length === 1 && end[0].outcome === 'ok' ? null : 'brak run.end po starym torze';
    },
  },
  {
    name: 'stale-run-is-ignored-by-hook-and-swept-by-next-run-start',
    run() {
      const x = makeEnv();
      const staleId = runStart(x);
      const file = path.join(x.tel, 'sessions', 'runs', `${staleId}.json`);
      const run = JSON.parse(fs.readFileSync(file, 'utf8'));
      run.startedAt = new Date(Date.now() - 10 * 3600 * 1000).toISOString();
      fs.writeFileSync(file, JSON.stringify(run));
      hook(START, postPayload(x, 'late1'), x.env);
      if (stateFiles(x, 'agents').length) return 'hook przypiął agenta do przebiegu starszego niż TTL';
      const freshId = runStart(x);
      const ev = allEvents(x);
      const swept = ev.find((e) => e.kind === 'run.end' && e.runId === staleId);
      if (!swept || swept.outcome !== 'unknown') return 'osierocony przebieg nie został zamknięty zdarzeniem unknown';
      if (stateFiles(x, 'runs').join() !== `${freshId}.json`) return `stan po sprzątaniu: ${stateFiles(x, 'runs')}`;
      return null;
    },
  },
  {
    name: 'events-carry-no-description-reply-or-paths',
    run() {
      const x = makeEnv();
      const runId = runStart(x);
      hook(START, postPayload(x, 'p1'), x.env);
      hook(START, postPayload(x, 'p2', '[slot:architect] x'), x.env);
      hook(STOP, stopPayload('p1', writeTranscript(x, 'tp'), SECRET_REPLY), x.env);
      runNode(CLI, ['run-end', '--process', 'analyze', '--project', x.project, '--run-id', runId, '--outcome', 'ok'], x.env);
      const blob = JSON.stringify(allEvents(x));
      for (const s of [SECRET_DESC, SECRET_REPLY, x.project, x.dir, '/fixture/']) {
        if (blob.includes(s)) return `zdarzenia zawierają "${s}"`;
      }
      return null;
    },
  },
  {
    name: 'hooks-exit-zero-and-pass-through-garbage-input',
    run() {
      const x = makeEnv();
      for (const file of [START, STOP]) {
        for (const garbage of ['not json', '', '{"tool_name":"Agent"}', '{"agent_id":"../../etc/passwd"}']) {
          const r = hook(file, garbage, x.env);
          if (r.status !== 0 || r.stdout !== garbage) return `${path.basename(file)} na "${garbage}": exit ${r.status}, stdout "${r.stdout}"`;
        }
      }
      return null;
    },
  },
];

(async () => {
  let failed = 0;
  for (const test of tests) {
    let err;
    try { err = await test.run(); } catch (e) { err = 'wyjątek: ' + (e && e.stack || e); }
    console.log(`  ${err ? '❌' : '✅'} ${test.name}${err ? ' — ' + err : ''}`);
    if (err) failed++;
  }
  for (const d of fs.readdirSync(os.tmpdir())) {
    if (d.startsWith('eval-telemetry-sessions-')) fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true });
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
