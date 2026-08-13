#!/usr/bin/env node
// Usuwa z definicji agentów zaszyte listy ścieżek do wzorców:
//   node scripts/dedupe-agent-patterns.mjs            # raport (dry-run)
//   node scripts/dedupe-agent-patterns.mjs --apply    # zastosuj
//
// Po co: ten sam dobór wzorców żyje dziś w trzech miejscach naraz — w runtime.yml
// (blokach), we wstrzykiwanej liście `{PATTERNS}` i w samych agentach (do 33 odwołań
// w jednym pliku). Agent płaci za nią w prompcie systemowym KAŻDEGO taska, niezależnie
// od tego, czego task dotyczy, a orchestrator i tak podaje własną, zawężoną listę.
//
// Czego skrypt NIE robi: nie rusza sekcji, które mówią o rolach ani o regułach —
// tylko wycina wyliczanki ścieżek i zastępuje je kontraktem. Jedna zasada redakcyjna:
// agent ma wiedzieć, że dostaje listę z zewnątrz i co zrobić, gdy jej NIE dostanie
// (dziś zaszyta lista jest cichym fallbackiem, więc brak wstrzyknięcia nigdy nie wychodzi).

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const AGENTS = join(REPO, 'agents');

const CONTRACT = `## Pattern grounding (list comes from the orchestrator)

The orchestrator injects a scoped \`{PATTERNS}\` list, derived from \`runtime.yml\`
(\`patterns.always\` + triggers matched against this task) — treat every entry as MUST-read,
and read the \`*_summary.md\` rule card first: it carries the enforceable rule IDs to cite.

**If \`{PATTERNS}\` is empty or missing, STOP and report it.** Do not fall back to patterns
you remember — an unscoped list is a bug in the caller, and silently working around it is
how ungrounded code gets written.`;

const walk = (dir, base = '') => readdirSync(dir).flatMap((e) => {
  const rel = base ? posix.join(base, e) : e;
  return statSync(join(dir, e)).isDirectory() ? walk(join(dir, e), rel) : [rel];
});

// Sekcja z wyliczanką ścieżek: nagłówek + blok, w którym są linie z `knowledge/patterns/`.
const SECTION_RE = /^(#{2,3} .*(?:Pattern Knowledge Base|Pattern Library|Patterns You Must Read|Required Patterns).*)$/gim;

let totalPaths = 0, touched = 0;
const report = [];

for (const rel of walk(AGENTS).filter((f) => f.endsWith('.md'))) {
  const path = join(AGENTS, rel);
  const src = readFileSync(path, 'utf8');
  const pathCount = (src.match(/knowledge\/patterns\//g) ?? []).length;
  if (!pathCount) continue;

  const lines = src.split('\n');
  const out = [];
  let removedLines = 0, sectionLevel = 0, replaced = false;
  const isPatternHeading = (l) => /pattern knowledge base|pattern library|patterns you must read|required patterns/i.test(l);

  // Blok nagłówka = od jego linii do następnego nagłówka tego samego lub wyższego poziomu.
  // Potrzebny, by odróżnić podsekcję z wyliczanką ścieżek (wycinamy) od podsekcji, która
  // trafiła pod ten sam nagłówek przy okazji — np. „### Verifier output MUST include",
  // opisującej format werdyktu. Ta druga jest wymaganiem roli, nie doborem wzorców.
  const blockHasPaths = (start) => {
    const level = lines[start].match(/^(#{2,6}) /)[1].length;
    for (let i = start + 1; i < lines.length; i++) {
      const m = lines[i].match(/^(#{2,6}) /);
      if (m && m[1].length <= level) break;
      if (lines[i].includes('knowledge/patterns/')) return true;
    }
    return false;
  };

  for (const [idx, line] of lines.entries()) {
    const h = line.match(/^(#{2,6}) /);
    if (h) {
      const level = h[1].length;
      // Sekcja kończy się na nagłówku tego samego lub wyższego poziomu — a także na
      // podsekcji bez ani jednej ścieżki: tam zaczyna się treść, której wstrzyknięty
      // `{PATTERNS}` niczym nie zastępuje, więc wycięcie jej to po prostu utrata wymagania.
      if (sectionLevel && (level <= sectionLevel || !blockHasPaths(idx))) sectionLevel = 0;
      if (!sectionLevel && isPatternHeading(line) && blockHasPaths(idx)) {
        sectionLevel = level;
        if (!replaced) { out.push(CONTRACT, ''); replaced = true; }
        removedLines++;
        continue;
      }
    }
    if (sectionLevel) { removedLines++; continue; }
    // Pojedyncze odwołania poza sekcją (np. w liście kroków) zostawiamy — usuwanie ich
    // na ślepo psuje zdania. Raportujemy je jako resztę do ręcznego przejrzenia.
    out.push(line);
  }

  const result = out.join('\n').replace(/\n{4,}/g, '\n\n\n');
  const leftover = (result.match(/knowledge\/patterns\//g) ?? []).length;
  totalPaths += pathCount;
  if (removedLines) {
    touched++;
    report.push({ rel, pathCount, removedLines, leftover });
    if (APPLY) writeFileSync(path, result);
  } else {
    report.push({ rel, pathCount, removedLines: 0, leftover: pathCount });
  }
}

report.sort((a, b) => b.pathCount - a.pathCount);
console.log(`${APPLY ? 'ZASTOSOWANO' : 'RAPORT (dry-run)'} — agentów z odwołaniami: ${report.length}, odwołań łącznie: ${totalPaths}\n`);
console.log('  plik                                                          odwołań  usunięte linie  zostaje');
for (const r of report)
  console.log(`  ${r.rel.padEnd(60)} ${String(r.pathCount).padStart(7)} ${String(r.removedLines).padStart(15)} ${String(r.leftover).padStart(8)}`);
console.log(`\n  sekcji wyciętych: ${touched}${APPLY ? '' : '  → uruchom z --apply, żeby zastosować'}`);
console.log('  „zostaje" = pojedyncze odwołania poza sekcją; przejrzyj je ręcznie, bo bywają częścią zdania.');
