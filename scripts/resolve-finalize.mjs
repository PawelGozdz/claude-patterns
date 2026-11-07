#!/usr/bin/env node
// Zamknięcie utrwalenia decyzji po odpowiedzi człowieka — zero tokenów (ANL-058).
//
//   node scripts/resolve-finalize.mjs check-write --project <dir> --task <TS-ID> --op create|edit|delete <ścieżka>...
//        exit 0 = wszystkie ścieżki mieszczą się w zakresie z configu; exit 2 = któraś nie (wypisuje powód)
//   node scripts/resolve-finalize.mjs close-questions --project <dir> --task <TS-ID> <artefakt.analysis.md> [--dry-run]
//        dla każdego pytania z `answer` i `question_file` (format file): sprawdza, że w katalogu decyzji (tech/product)
//        jest NOWY dokument z polem `rozstrzyga` (nazwa pola: resolution_sink.link_field) wskazującym to pytanie,
//        i dopiero wtedy kasuje plik pytania. Brak dokumentu = plik zostaje, exit 2.
//
// Dlaczego skrypt, a nie `rm` w prompcie: ANL-004 zostawia Bashowi tylko odczyt, a kasowanie pytania bez dokumentu
// decyzji gubi pytanie bez śladu (BDR-141: historię pamięta BDR i git log, ale tylko gdy BDR istnieje).
// Niczego nie commituje ani nie stage'uje.

import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadResolveConfig } from './lib/resolve-config.mjs';
import { checkWrite } from './lib/resolve-write-scope.mjs';
import { parseFrontmatter } from './lib/frontmatter.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const die = (msg) => { process.stderr.write(`✘ resolve-finalize: ${msg}\n`); process.exit(1); };
const opts = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--dry-run') opts['dry-run'] = true;
  else if (['--project', '--task', '--op'].includes(rest[i])) opts[rest[i].slice(2)] = rest[++i];
  else if (rest[i].startsWith('--')) die(`nieznany przełącznik: ${rest[i]}`);
  else positional.push(rest[i]);
}
if (!['check-write', 'close-questions'].includes(cmd)) die('pierwszy argument: check-write | close-questions');
if (!opts.project || !opts.task) die('wymagane: --project <dir> --task <TS-ID>');
const projectDir = resolve(opts.project);
const cfg = loadResolveConfig(projectDir);

if (cmd === 'check-write') {
  if (!opts.op) die('wymagane: --op create|edit|delete');
  if (!positional.length) die('podaj ≥1 ścieżkę względną do korzenia projektu');
  const rows = positional.map((p) => ({ path: p, ...checkWrite(cfg, { path: p, op: opts.op, exists: existsSync(join(projectDir, p)), taskId: opts.task }) }));
  process.stdout.write(`${JSON.stringify({ format: cfg.format, rows }, null, 2)}\n`);
  const denied = rows.filter((r) => !r.allowed);
  if (denied.length) {
    process.stderr.write(`✘ poza zakresem zapisu:\n  • ${denied.map((r) => `${r.path}: ${r.why}`).join('\n  • ')}\n`);
    process.exit(2);
  }
  process.exit(0);
}

// ── close-questions ────────────────────────────────────────────────────────
const [artifactArg] = positional;
if (!artifactArg) die('podaj ścieżkę artefaktu analizy');
if (cfg.format !== 'file') {
  process.stdout.write(`${JSON.stringify({ format: cfg.format, closed: [], skipped: 'questions_format ≠ file — nie ma plików pytań do zamknięcia' }, null, 2)}\n`);
  process.exit(0);
}
const fm = parseFrontmatter(readFileSync(resolve(artifactArg), 'utf8'));
if (!fm || fm.error) die('frontmatter artefaktu nie parsuje się');
const answered = (fm.data.open_questions ?? []).filter((q) => q && q.question_file && q.answer !== null && q.answer !== undefined);

// Dokumenty decyzji, które mówią „rozstrzygam pytanie X": zbieramy raz, z obu katalogów ujścia.
const resolves = new Map(); // id pytania → plik dokumentu
for (const dir of [cfg.sink.tech, cfg.sink.product].filter(Boolean)) {
  const abs = join(projectDir, dir);
  if (!existsSync(abs)) continue;
  for (const f of readdirSync(abs).filter((n) => n.endsWith('.md'))) {
    const doc = parseFrontmatter(readFileSync(join(abs, f), 'utf8'));
    const ids = doc?.data?.[cfg.sink.linkField];
    for (const id of Array.isArray(ids) ? ids : ids ? [ids] : []) resolves.set(String(id), `${dir}/${f}`);
  }
}

const closed = [];
const kept = [];
for (const q of answered) {
  const rel = `${cfg.questionsDir}/${q.question_file}.md`;
  const doc = resolves.get(String(q.question_file));
  if (!doc) { kept.push({ id: q.id, file: rel, why: `brak dokumentu decyzji z ${cfg.sink.linkField}: [${q.question_file}] w ${[cfg.sink.tech, cfg.sink.product].filter(Boolean).join(', ')}` }); continue; }
  const gate = checkWrite(cfg, { path: rel, op: 'delete', exists: true, taskId: opts.task });
  if (!gate.allowed) { kept.push({ id: q.id, file: rel, why: gate.why }); continue; }
  if (!existsSync(join(projectDir, rel))) { kept.push({ id: q.id, file: rel, why: 'plik pytania już nie istnieje' }); continue; }
  if (!opts['dry-run']) unlinkSync(join(projectDir, rel));
  closed.push({ id: q.id, file: rel, resolvedBy: doc });
}
process.stdout.write(`${JSON.stringify({ format: cfg.format, dryRun: Boolean(opts['dry-run']), closed, kept }, null, 2)}\n`);
if (kept.some((k) => k.why.startsWith('brak dokumentu'))) process.exit(2);
