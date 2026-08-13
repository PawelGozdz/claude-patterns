#!/usr/bin/env node
// Weryfikacja gotowości projektu wobec runtime.yml:
//   node scripts/verify-project-setup.mjs <project_dir>
//
// Materializacja sprawdza spójność BLOKÓW; ten skrypt sprawdza, czy PROJEKT ma
// to, na co runtime.yml wskazuje: agentów z paneli i warstw, wzorce pod ścieżkami
// lokalnymi, hooki faktycznie wpięte w settings.json, aktualny indeks decyzji.
// Rozjazd między „co deklaruje setup" a „co leży na dysku" nie ujawnia się inaczej
// niż w połowie przebiegu /analyze, gdy agent nie istnieje albo plik nie ma treści.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const YAML = (await import('yaml')).default;
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const [projectDir] = process.argv.slice(2);
if (!projectDir) { console.error('użycie: verify-project-setup.mjs <project_dir>'); process.exit(1); }

const ok = [], bad = [], warnings = [];
const brokenLinks = [];
const rtPath = join(projectDir, '.claude/config/runtime.yml');
if (!existsSync(rtPath)) { console.error('BŁĄD: brak .claude/config/runtime.yml'); process.exit(1); }
const rt = YAML.parse(readFileSync(rtPath, 'utf8')) ?? {};

// ── agenci z paneli, warstw i bramek ──────────────────────────────────────
const agentNames = new Set();
// Sloty z `agent: "/nazwa"` to KOMENDY, nie agenci — sprawdzamy je osobno niżej.
// Dotąd wypadały z weryfikacji całkowicie, więc slot wskazujący nieistniejącą komendę
// przechodził jako „setup kompletny" i odkrywał się dopiero przy przebiegu /analyze.
const commandSlots = new Set();
for (const p of rt.analyze?.panel ?? []) {
  if (!p.agent) continue;
  (p.agent.startsWith('/') ? commandSlots : agentNames).add(p.agent);
}
for (const l of rt.orchestrate?.layers ?? []) if (l.agent) agentNames.add(l.agent);
for (const k of ['inner_loop', 'final_gate'])
  for (const v of [rt.orchestrate?.[k]?.verify, rt.orchestrate?.[k]?.agent]) if (v) agentNames.add(v);

const findAgent = (name) => {
  if (name.startsWith('ecc:') || name === 'general-purpose') return 'wbudowany';
  for (const root of [join(projectDir, '.claude/agents'), join(process.env.HOME, '.claude/agents')]) {
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      if (!existsSync(dir)) continue;
      for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        let st;
        // Zerwany symlink (agent usunięty z claude-patterns, dowiązanie zostało) — statSync
        // rzuca ENOENT. To realny stan po migracji, więc raportujemy go zamiast przerywać
        // weryfikację całego projektu.
        try { st = statSync(full); } catch { brokenLinks.push(full); continue; }
        if (st.isDirectory()) stack.push(full);
        else if (e === `${name}.md`) return full;
      }
    }
  }
  return null;
};
for (const a of agentNames) {
  // Slot może deklarować alternatywę („flutter-quality-verifier | flutter-ui-verifier"):
  // orchestrator wybiera jednego wg kontekstu, więc obecność którejkolwiek wystarczy.
  const options = String(a).split('|').map((x) => x.trim()).filter(Boolean);
  const found = options.map((o) => [o, findAgent(o)]).filter(([, f]) => f);
  if (found.length) ok.push(`agent ${found.map(([o]) => o).join(' / ')}`);
  else bad.push(`agent "${a}" — nie ma definicji w .claude/agents/ ani ~/.claude/agents/`);
}

// ── komendy ze slotów panelu ──────────────────────────────────────────────
// Komenda żyje globalnie (~/.claude/commands/) albo w projekcie (.claude/commands/).
// Skill o tej samej nazwie z `disable-model-invocation: true` NIE jest linkowany do
// projektu celowo (ma odpowiednik komendowy) — dlatego szukamy komendy, nie skilla.
for (const slot of commandSlots) {
  const name = slot.replace(/^\//, '');
  const paths = [
    join(projectDir, '.claude/commands', `${name}.md`),
    join(process.env.HOME ?? '', '.claude/commands', `${name}.md`),
  ];
  if (paths.some((p) => existsSync(p))) ok.push(`komenda ${slot}`);
  else bad.push(`slot panelu wskazuje komendę "${slot}" — nie ma jej ani w .claude/commands/, ani globalnie`);
}

// ── wzorce: runtime wskazuje ścieżki repo, agent czyta je pod .claude/knowledge/patterns ──
const patterns = [
  ...(rt.patterns?.always ?? []),
  ...(rt.patterns?.triggers ?? []).flatMap((t) => t.include ?? []),
];
for (const p of new Set(patterns)) {
  const local = join(projectDir, '.claude/knowledge/patterns', p);
  (existsSync(local) ? ok : bad).push(existsSync(local)
    ? `wzorzec ${p}`
    : `wzorzec "${p}" niedostępny lokalnie (${local}) — overlay nie symlinkuje tej kategorii`);
  // Karta reguł to wersja, która realnie wchodzi do promptów.
  const card = p.replace(/\.md$/, '_summary.md');
  if ((rt.patterns?.always ?? []).includes(p) && !existsSync(join(projectDir, '.claude/knowledge/patterns', card)))
    warnings.push(`brak karty reguł dla wzorca z półki always: ${card}`);
}

// ── hooki: deklaracja vs faktyczne wpięcie ────────────────────────────────
const settingsPath = join(projectDir, '.claude/settings.json');
if (existsSync(settingsPath)) {
  const raw = readFileSync(settingsPath, 'utf8');
  for (const h of rt.hooks ?? [])
    (raw.includes(h) ? ok : bad).push(raw.includes(h)
      ? `hook ${h}`
      : `hook "${h}" deklarowany w runtime.yml, ale nie ma go w settings.json — odpal setup-project.sh`);
  const active = [...new Set([...raw.matchAll(/check-[a-z0-9-]+/g)].map((m) => m[0]))];
  const extra = active.filter((h) => !(rt.hooks ?? []).includes(h));
  if (extra.length) warnings.push(`hooki aktywne poza runtime.yml: ${extra.join(', ')} — przenieś do bloku albo project.yml (extra_hooks)`);
} else warnings.push('brak .claude/settings.json — hooki nie są wpięte');

// ── parametry ścieżkowe i indeks decyzji ──────────────────────────────────
for (const [block, params] of Object.entries(rt.params ?? {}))
  for (const [key, val] of Object.entries(params ?? {}))
    for (const v of (Array.isArray(val) ? val : [val]))
      // `@scope/pakiet` to nazwa npm, nie ścieżka w repo — runtime.yml nie niesie typów
      // parametrów, więc rozstrzygamy po kształcie wartości.
      if (typeof v === 'string' && v.includes('/') && !v.startsWith('.') && !v.startsWith('@')) {
        const file = v.split('#')[0];
        if (!existsSync(join(projectDir, file))) bad.push(`param ${block}.${key}: brak pliku ${file}`);
      }
// Biblioteka bazowa domeny: blok deklaruje, do czego odnoszą się jego wzorce (68 odwołań
// do @vytches/ddd), więc jej brak w zależnościach znaczy, że implementer dostanie
// instrukcje o klasach, których w projekcie nie ma.
const dddLib = rt.params?.['ddd/core']?.ddd_library;
if (dddLib) {
  const pkgPath = join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) warnings.push(`blok ddd/core deklaruje ${dddLib}, ale projekt nie ma package.json`);
  else {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.peerDependencies ?? {}) };
    if (!declared[dddLib]) bad.push(`blok ddd/core zakłada bibliotekę ${dddLib}, której nie ma w package.json`);
    else {
      ok.push(`biblioteka domeny: ${dddLib}@${declared[dddLib]}`);
      const min = rt.params['ddd/core'].ddd_library_min_version;
      // Porównanie tylko po majorze — pełny semver-range wymagałby zależności,
      // a interesuje nas wyłącznie „czy wzorce mówią o nowszym API niż to w repo".
      if (min) {
        const num = (v) => Number(String(v).replace(/^[^\d]*/, '').split('.')[0] || 0);
        if (num(declared[dddLib]) < num(min))
          bad.push(`${dddLib} w wersji ${declared[dddLib]}, a wzorce bloku ddd/core zakładają ≥ ${min}`);
      }
    }
  }
}

const idxPath = join(projectDir, '.claude/config/decisions-index.json');
if (rt.params?.['decision-registry']) {
  if (!existsSync(idxPath)) warnings.push('brak decisions-index.json — /analyze wygeneruje go sam (index-decisions.mjs)');
  else {
    const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
    ok.push(`indeks decyzji: ${idx.counts.active}/${idx.counts.total} aktywnych, ${idx.counts.needs_scope_check} z opisanym zakresem`);
    if (idx.problems?.duplicate_ids?.length)
      warnings.push(`${idx.problems.duplicate_ids.length} zdublowanych numerów w rejestrze — cytowanie po numerze jest niejednoznaczne`);
  }
}
if (rt.knowledge?.collection) ok.push(`kolekcja RAG: ${rt.knowledge.collection}`);
if (rt.taxonomy?.areas?.length) ok.push(`taksonomia: ${rt.taxonomy.areas.length} obszarów`);

if (brokenLinks.length)
  warnings.push(`zerwane dowiązania (${brokenLinks.length}): ` +
    [...new Set(brokenLinks)].slice(0, 4).map((f) => f.split('/.claude/')[1]).join(', ') +
    ' — usuń je albo odpal setup-project.sh');
console.log(`\n${projectDir}\n  bloki: [${(rt.stack_blocks ?? []).join(', ')}]`);
console.log(`  sprawdzone OK: ${ok.length}`);
if (warnings.length) { console.log(`\n  UWAGI (${warnings.length}):`); warnings.forEach((w) => console.log(`    ${w}`)); }
if (bad.length) { console.error(`\n  BRAKI (${bad.length}):`); bad.forEach((b) => console.error(`    ${b}`)); }
console.log(bad.length ? '\n  ✗ setup niekompletny' : '\n  ✓ setup kompletny — /analyze i /orchestrate mają wszystko, na co wskazuje runtime.yml');
process.exit(bad.length ? 1 : 0);
