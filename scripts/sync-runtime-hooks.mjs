#!/usr/bin/env node
// Dopina do .claude/settings.json hooki deklarowane w runtime.yml:
//   node scripts/sync-runtime-hooks.mjs <project_dir> [--apply]
//
// Po co: bloki mówią, których hooków wymaga stack, ale setup-project.sh instalował
// wyłącznie zestaw przypisany do `stack_profile` (ddd-hooks.json / flutter-hooks.json).
// Efekt: runtime.yml deklarował hooki, których w settings.json nie było — bramka
// istniała w konfiguracji i nie działała w rzeczywistości (klasyczny registry drift,
// patrz patterns/cross-layer/registry-drift-guard-pattern.md).
//
// Dopisujemy tylko BRAKUJĄCE wpisy i nigdy nie ruszamy istniejących: settings.json
// bywa ręcznie dostrojony, a kolejność matcherów ma znaczenie.

import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const YAML = (await import('yaml')).default;
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const [projectDir] = process.argv.slice(2);
const APPLY = process.argv.includes('--apply');
if (!projectDir) { console.error('użycie: sync-runtime-hooks.mjs <project_dir> [--apply]'); process.exit(1); }

const rt = YAML.parse(readFileSync(join(projectDir, '.claude/config/runtime.yml'), 'utf8')) ?? {};
const settingsPath = join(projectDir, '.claude/settings.json');
if (!existsSync(settingsPath)) { console.error('brak .claude/settings.json'); process.exit(1); }
const raw = readFileSync(settingsPath, 'utf8');
const settings = JSON.parse(raw);

// Wzorzec wpięcia bierzemy z hooks/hooks.json repo — tam jest zdefiniowane, na jakie
// zdarzenie i matcher reaguje każdy hook. Zgadywanie tego per hook kończy się bramką,
// która nigdy się nie odpala.
// Wzorce wpięcia są rozsypane po dwóch źródłach: hooks/hooks.json (uniwersalne) oraz
// templates/<profil>-hooks.json (stackowe). Przeszukujemy oba — to zresztą kolejny
// przykład rejestru, który rozjechał się z rzeczywistością.
const catalogs = [join(REPO, 'hooks/hooks.json'), ...readdirSync(join(REPO, 'templates'))
  .filter((f) => f.endsWith('-hooks.json'))
  .map((f) => join(REPO, 'templates', f))]
  .filter((f) => existsSync(f))
  .map((f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; } });

const findSpec = (name) => {
  for (const catalog of catalogs)
  for (const [event, entries] of Object.entries(catalog.hooks ?? catalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries)
      for (const h of entry.hooks ?? [])
        if (String(h.command ?? '').includes(`${name}.js`))
          return { event, matcher: entry.matcher, hook: h, description: entry.description };
  }
  // Fallback: sam plik hooka deklaruje swoje zdarzenie w nagłówku („PreToolUse hook",
  // „SubagentStop hook"). To pewniejsze źródło niż katalogi, które okazały się niepełne —
  // wpięcia w działających projektach powstały ręcznie i nigdy nie trafiły do rejestru.
  const file = join(REPO, 'hooks', `${name}.js`);
  if (!existsSync(file)) return null;
  const head = readFileSync(file, 'utf8').slice(0, 800);
  const event = (head.match(/\b(PreToolUse|PostToolUse|SubagentStop|SessionStart|Stop)\b/) ?? [])[1];
  if (!event) return null;
  const needsMatcher = event === 'PreToolUse' || event === 'PostToolUse';
  return {
    event,
    matcher: needsMatcher ? 'Write|Edit|MultiEdit' : undefined,
    hook: { type: 'command', command: `node "${file}"` },
    description: `${name} (zdarzenie odczytane z nagłówka hooka)`,
  };
};

const declared = rt.hooks ?? [];
const missing = declared.filter((h) => !raw.includes(h));
const added = [], unknown = [];

for (const name of missing) {
  const spec = findSpec(name);
  if (!spec) { unknown.push(name); continue; }
  settings.hooks ??= {};
  settings.hooks[spec.event] ??= [];
  settings.hooks[spec.event].push({
    ...(spec.matcher ? { matcher: spec.matcher } : {}),
    hooks: [{ type: 'command', command: `node "${join(REPO, 'hooks', `${name}.js`)}"` }],
    ...(spec.description ? { description: spec.description } : {}),
  });
  added.push(`${name} → ${spec.event} (${spec.matcher})`);
}

console.log(`${projectDir.split('/').pop()}: deklarowanych ${declared.length}, brakujących ${missing.length}`);
for (const a of added) console.log(`  + ${a}`);
for (const u of unknown) console.error(`  ! ${u} — nie ustaliłem zdarzenia (brak w katalogach i w nagłówku pliku), dopnij ręcznie`);
if (added.length && APPLY) {
  copyFileSync(settingsPath, `${settingsPath}.bak`);
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`  zapisano (kopia: settings.json.bak)`);
} else if (added.length) {
  console.log('  → uruchom z --apply, żeby zapisać');
}
