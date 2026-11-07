#!/usr/bin/env node
// Kontrola pytań do człowieka w artefakcie analizy — zero tokenów (ANL-054, ANL-055, ANL-057, ANL-059).
//
//   node scripts/verify-answer-sources.mjs <artefakt.analysis.md> [--project <dir>]
//        [--reply "<odpowiedź człowieka>"] [--stats]
//
// Bez przełączników: dla każdego pytania z `rec` sprawdza (1) czy cytat z `evidence[]` stoi w pliku i linii,
// (2) kształt pytania (ask = jedno pytanie, rec = jedno zdanie z podstawą, razem ≤ 2 zdania),
// (3) czy pytanie wolno przyjąć hurtem. Wypisuje też partię do pokazania człowiekowi (najwyżej `batch_size`).
// --reply   rozbiera odpowiedź („ok wszystkie", „ok poza 3 i 5", „2: nie") na konkretne `answer:` — agent je tylko zapisuje.
// --stats   odsetek rekomendacji odrzuconych przez człowieka (do `resolve_stats` w frontmatterze).
//
// Exit: 0 = czysto; 2 = którekolwiek pytanie łamie kontrakt (zmyślony cytat, zły format) — bramka kroku 1.b;
// 1 = błąd użycia. Niczego nie zapisuje. Projekt bez bloku decision-registry: exit 0 z `active: false`.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { loadResolveConfig } from './lib/resolve-config.mjs';
import { checkQuestion } from './lib/answer-evidence.mjs';
import { selectBatch, parseReply, resolveStats } from './lib/answer-reply.mjs';
import { parseFrontmatter } from './lib/frontmatter.mjs';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const values = new Set([flag('--project'), flag('--reply')].filter((v) => v !== undefined));
const [artifactArg] = argv.filter((a) => !a.startsWith('--') && !values.has(a));
const die = (msg) => { process.stderr.write(`✘ verify-answer-sources: ${msg}\n`); process.exit(1); };

if (!artifactArg) die('użycie: verify-answer-sources.mjs <artefakt.analysis.md> [--project <dir>] [--reply "<tekst>"] [--stats]');
const artifact = resolve(artifactArg);
if (!existsSync(artifact)) die(`brak pliku: ${artifact}`);

// artefakt leży w <projekt>/project-orchestration/analysis/ — stąd domyślny korzeń projektu
const projectDir = resolve(flag('--project') ?? (basename(dirname(artifact)) === 'analysis' ? resolve(dirname(artifact), '../..') : process.cwd()));
const fm = parseFrontmatter(readFileSync(artifact, 'utf8'));
if (!fm || fm.error) die(`frontmatter artefaktu nie parsuje się${fm?.error ? `: ${fm.error}` : ''}`);

const cfg = loadResolveConfig(projectDir);
const questions = Array.isArray(fm.data.open_questions) ? fm.data.open_questions.filter(Boolean) : [];
const decisions = Array.isArray(fm.data.decisions) ? fm.data.decisions.filter(Boolean) : [];

const out = { project: projectDir, active: cfg.active, format: cfg.format, warnings: cfg.warnings, limits: cfg.limits, questions: [] };
let failed = false;
if (cfg.active) {
  const checks = new Map();
  for (const q of questions) {
    const c = checkQuestion(q, { cfg, decisions });
    checks.set(String(q.id), c);
    // Kontrakt dotyczy pytań z rekomendacją, podstawą, źródłem albo domeną; stare pytania bez tych pól przechodzą jak dotąd.
    const relevant = typeof q.rec === 'string' || q.basis !== undefined || (q.evidence ?? []).length > 0 || q.domain !== undefined;
    if (relevant && c.problems.length) failed = true;
    out.questions.push({ id: c.id, relevant, problems: relevant ? c.problems : [], evidence: c.evidence, verified: c.verified, bulkEligible: c.bulkEligible, bulkReasons: c.bulkReasons });
  }
  const { batch, remaining } = selectBatch(questions, { batchSize: cfg.limits.batchSize });
  out.batch = batch.map((q, i) => ({ no: i + 1, id: q.id, bulkEligible: checks.get(String(q.id)).bulkEligible }));
  out.remaining = remaining;
  if (flag('--reply') !== undefined) {
    out.reply = parseReply(flag('--reply'), batch.map((q) => ({ q, ...checks.get(String(q.id)) })));
  }
}
if (argv.includes('--stats')) out.stats = resolveStats(questions);

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
if (failed) {
  const bad = out.questions.filter((q) => q.problems.length).map((q) => `${q.id}: ${q.problems.join('; ')}`);
  process.stderr.write(`✘ pytania łamią kontrakt ANL-054/055 (popraw przed pokazaniem człowiekowi):\n  • ${bad.join('\n  • ')}\n`);
  process.exit(2);
}
