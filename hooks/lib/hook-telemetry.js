/**
 * hook-telemetry.js — zdarzenie v1 przy ZABLOKOWANIU przez hook (TASK-OBS-011, ADR 0012 aneks).
 *
 * Zapisuje wyłącznie blokady: `step.end`, `process: hook`, `outcome: halted`,
 * `step.role` = `<hook>:<reguła>`. Przepuszczenie nie ładuje nic i nie zapisuje nic.
 * Bez treści komendy, bez ścieżek i bez session_id — tylko stałe identyfikatory hooka i reguły
 * oraz nazwa projektu (basename katalogu roboczego).
 *
 * `runId` = `hook-<RRRRMMDD>`: jeden „przebieg” na dzień. Blokada nie ma początku ani końca,
 * a agregat liczy `step.end` także bez `run.start`.
 *
 * Zapis jest best-effort: nigdy nie rzuca i nie zmienia decyzji hooka ani kodu wyjścia.
 * Biblioteka zdarzeń to ESM, a hooki to CJS (jak w telemetry-sessions.js), więc zapis jest
 * asynchroniczny. Hooki kończą się `process.exit(...)` synchronicznie, dlatego wołaj
 * `exitAfterBlock` zamiast gołego `process.exit` — czeka na zapis (maks. WRITE_TIMEOUT_MS).
 *
 * UWAGA: `exitAfterBlock` wraca natychmiast, a proces kończy się dopiero po zapisie. Kod wołający
 * nie może iść dalej — zrób `return exitAfterBlock(...)` (a w funkcji pomocniczej `return` także
 * u jej wołającego). Inaczej kolejny `process.exit(0)` przegoni zapis i blokada zmieni się
 * w przepuszczenie (tak padał kill-switch w productivity-watchdog; pilnuje tego eval hook-telemetry).
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const WRITE_TIMEOUT_MS = 500;
const HOOK_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const RULE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/;

function eventsLibUrl() {
  const root = path.resolve(path.dirname(fs.realpathSync(__filename)), '..', '..');
  return pathToFileURL(path.join(root, 'scripts', 'lib', 'telemetry-events.mjs')).href;
}

const dayStamp = (d = new Date()) => d.toISOString().slice(0, 10).replace(/-/g, '');

/**
 * @param {{ hook: string, rule: string, cwd?: string }} p
 * @returns {Promise<{ ok: boolean, error?: string }>} nigdy nie odrzuca
 */
async function recordBlock({ hook, rule, cwd } = {}) {
  try {
    if (process.env.HOOK_TELEMETRY === 'off') return { ok: false, error: 'wyłączone (HOOK_TELEMETRY=off)' };
    if (!HOOK_ID.test(String(hook)) || !RULE_ID.test(String(rule))) return { ok: false, error: 'niebezpieczny id hooka lub reguły' };
    const lib = await import(eventsLibUrl());
    let project = lib.projectName(cwd);
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(project)) project = 'unknown';
    const res = lib.appendEvent({
      kind: 'step.end', process: 'hook', project, runId: `hook-${dayStamp()}`,
      step: { id: rule, role: `${hook}:${rule}` }, outcome: 'halted',
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

/**
 * Zapisuje blokadę (albo kilka — jedną na regułę), potem kończy proces tym samym kodem.
 * Zapis nigdy nie opóźnia wyjścia o więcej niż WRITE_TIMEOUT_MS.
 */
function exitAfterBlock(code, block) {
  let timer;
  const deadline = new Promise((resolve) => { timer = setTimeout(resolve, WRITE_TIMEOUT_MS); });
  const writes = Promise.all([].concat(block).map(recordBlock));
  Promise.race([writes, deadline]).then(
    () => { clearTimeout(timer); process.exit(code); },
    () => { clearTimeout(timer); process.exit(code); },
  );
}

module.exports = { recordBlock, exitAfterBlock, WRITE_TIMEOUT_MS };
