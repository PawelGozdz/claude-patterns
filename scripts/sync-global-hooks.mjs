#!/usr/bin/env node
// Dopina do ~/.claude/settings.json hooki deklarowane w hooks/hooks.json:
//   node scripts/sync-global-hooks.mjs [--apply] [--check] [--remove <nazwa>] [--settings <plik>]
//
// Po co: `hooks/hooks.json` opisywał się jako „auto-install hook configuration", a
// `setup-global.sh` linkował wyłącznie KATALOG `hooks/` do ~/.claude/hooks. Sam plik
// nie był nigdzie aplikowany, więc z 22 zadeklarowanych hooków w globalnym
// settings.json siedziały dwa (`block-root-grep`, `pre-workflow-lint`) — oba dopisane
// ręcznie. Efekt: metryki workflow (`workflow-metrics-postrun`) i log kosztów agentów
// milczały miesiącami, a rejestr wyglądał na kompletny (audyt 2026-09-07, A1/B2).
//
// Odpowiednik `sync-runtime-hooks.mjs` dla warstwy globalnej i celowo ta sama zasada:
// dopisujemy WYŁĄCZNIE brakujące wpisy i nigdy nie ruszamy istniejących ani ich
// kolejności. settings.json bywa ręcznie dostrojony (timeouty, statusMessage), a
// kolejność matcherów ma znaczenie — scalanie „po swojemu" kasowałoby te ustawienia
// po cichu przy każdym setupie.
//
// Tożsamość hooka = NAZWA PLIKU w `command` (`check-delegation.js`). Nie porównujemy
// całych stringów komend, bo ta sama bramka bywa wpięta jako `$HOME/.claude/hooks/x.js`
// albo ścieżką bezwzględną do repo — to jeden hook, nie dwa.
//
// Tryby:
//   (bez flag)          dry-run: lista tego, co zostałoby dopisane
//   --apply             zapis, z kopią <settings>.bak
//   --check             tylko kod wyjścia 1 przy brakach (do audytu/CI), zero zmian
//   --remove <nazwa>    usuwa wpisy hooka po nazwie pliku (retire hooka); też wymaga --apply

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const CHECK = argv.includes('--check');
const flagValue = (name) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : undefined; };
const REMOVE = flagValue('--remove');
const SETTINGS = flagValue('--settings') ?? join(homedir(), '.claude/settings.json');
const CATALOG = join(REPO, 'hooks/hooks.json');

if (argv.includes('-h') || argv.includes('--help')) {
  console.log('użycie: sync-global-hooks.mjs [--apply] [--check] [--remove <nazwa-hooka>] [--settings <plik>]');
  process.exit(0);
}
if (argv.includes('--remove') && !REMOVE) {
  console.error('--remove wymaga nazwy hooka (bez rozszerzenia .js)');
  process.exit(2);
}
if (!existsSync(CATALOG)) { console.error(`brak katalogu hooków: ${CATALOG}`); process.exit(2); }
if (!existsSync(SETTINGS)) { console.error(`brak pliku ustawień: ${SETTINGS}`); process.exit(2); }

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const raw = readFileSync(SETTINGS, 'utf8');
const settings = JSON.parse(raw);

/** Nazwa pliku hooka wyciągnięta z `command` — jedyny stabilny identyfikator wpisu. */
const hookName = (command) => (String(command ?? '').match(/([a-z0-9-]+)\.js\b/i) ?? [])[1] ?? null;

const write = (label) => {
  copyFileSync(SETTINGS, `${SETTINGS}.bak`);
  writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  console.log(`  ${label} (kopia: ${SETTINGS}.bak)`);
};

// ── tryb --remove: wycofanie hooka z globalnych ustawień ───────────────────
if (REMOVE) {
  const target = REMOVE.replace(/\.js$/, '');
  let removed = 0;
  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    if (!Array.isArray(entries)) continue;
    const kept = [];
    for (const entry of entries) {
      const hooks = (entry.hooks ?? []).filter((h) => {
        const match = hookName(h.command) === target;
        if (match) { removed++; console.log(`  - ${target} ← ${event}${entry.matcher ? ` (${entry.matcher})` : ''}`); }
        return !match;
      });
      // Wpis bez hooków to martwy matcher — zostawiony, zaśmiecałby plik i mylił audyt.
      if (hooks.length) kept.push({ ...entry, hooks });
    }
    if (kept.length) settings.hooks[event] = kept;
    else delete settings.hooks[event];
  }
  if (!removed) { console.log(`${target}: nie ma go w ${SETTINGS} — nic do zrobienia`); process.exit(0); }
  console.log(`${target}: usunięto wpisów: ${removed}`);
  if (APPLY) write('zapisano'); else console.log('  → uruchom z --apply, żeby zapisać');
  process.exit(0);
}

// ── tryb domyślny: dopięcie brakujących ────────────────────────────────────
const declared = [];
for (const [event, entries] of Object.entries(catalog.hooks ?? {})) {
  if (!Array.isArray(entries)) continue;
  for (const entry of entries)
    for (const h of entry.hooks ?? []) {
      const name = hookName(h.command);
      if (name) declared.push({ name, event, matcher: entry.matcher, description: entry.description, hook: h });
    }
}

const installed = new Set();
for (const entries of Object.values(settings.hooks ?? {})) {
  if (!Array.isArray(entries)) continue;
  for (const entry of entries)
    for (const h of entry.hooks ?? []) { const n = hookName(h.command); if (n) installed.add(n); }
}

const missing = declared.filter((d) => !installed.has(d.name));
// Hook zadeklarowany, ale nieistniejący na dysku dopisalibyśmy jako martwą komendę —
// Claude Code odpalałby `node` na nieistniejącym pliku przy każdym zdarzeniu.
const orphans = missing.filter((d) => !existsSync(join(REPO, 'hooks', `${d.name}.js`)));
const addable = missing.filter((d) => !orphans.includes(d));

console.log(`${SETTINGS}`);
console.log(`  zadeklarowanych w hooks/hooks.json: ${declared.length}, wpiętych: ${declared.length - missing.length}, brakujących: ${missing.length}`);
for (const d of addable) console.log(`  + ${d.name} → ${d.event}${d.matcher ? ` (${d.matcher})` : ''}`);
for (const d of orphans) console.error(`  ! ${d.name} — deklarowany w hooks.json, ale nie ma hooks/${d.name}.js; nie dopisuję`);

if (CHECK) {
  if (missing.length) console.error(`\n  ✗ ${missing.length} hook(ów) z hooks.json nie jest wpiętych — napraw: node scripts/sync-global-hooks.mjs --apply`);
  else console.log('\n  ✓ globalne settings.json zgodne z hooks/hooks.json');
  process.exit(missing.length ? 1 : 0);
}

if (!addable.length) { console.log('\n  ✓ nic do dopisania'); process.exit(orphans.length ? 1 : 0); }

for (const d of addable) {
  settings.hooks ??= {};
  settings.hooks[d.event] ??= [];
  settings.hooks[d.event].push({
    ...(d.matcher ? { matcher: d.matcher } : {}),
    hooks: [d.hook],
    ...(d.description ? { description: d.description } : {}),
  });
}

if (APPLY) write(`dopisano ${addable.length}`);
else console.log('\n  → uruchom z --apply, żeby zapisać');
process.exit(0);
