#!/usr/bin/env node
/**
 * tests/flow-evals/retrieval/run.js — eval L1 retrievalu (TASK-RAG-002, D7).
 *
 * Deterministyczny scorer na golden-secie (golden.json): dla każdego zapytania
 * sprawdza, czy oczekiwane źródło (substring hit.source) jest w top-K.
 * Metryki: hit@1, hit@5 (≙ „precision@5" z TASK-RAG-002 dla golden-setu
 * z jednym relewantnym źródłem per zapytanie) i MRR.
 *
 * BRAMKA WPIĘCIA (analysis, success_criteria filar 2): hit@5 ≥ threshold
 * (domyślnie 0.6 z golden.json) → exit 0; poniżej → exit 1 i retrieve_patterns
 * NIE wchodzi do /analyze-ddd.
 *
 * Wymaga: żywy Qdrant (KR_QDRANT_URL, domyślnie http://localhost:6401 z hosta)
 * + embedder (KR_EMBED_URL — ten sam model co przy seedzie: multilingual-e5-large!).
 * Uruchom: node tests/flow-evals/retrieval/run.js [--k 5]
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

process.env.KR_QDRANT_URL = process.env.KR_QDRANT_URL || 'http://localhost:6401';

const REPO = path.resolve(__dirname, '..', '..', '..');
const RETRIEVE = path.join(REPO, 'mcp-server', 'knowledge-retriever', 'dist', 'retrieve.js');

// q.filter = { kind?, level?, feature?, lib_version? } — plain MUST-only Qdrant filter (mirrors
// how a caller would normally pin a single dimension; the retrieve_examples tool's feature/combines
// OR-match is exercised separately by tests/flow-evals/library-reference-schema/, not here).
function buildMustFilter(spec) {
  if (!spec) return undefined;
  const must = Object.entries(spec)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({ key, match: { value } }));
  return must.length ? { must } : undefined;
}

async function main() {
  const kArg = process.argv.indexOf('--k');
  const K = kArg > -1 ? Number(process.argv[kArg + 1]) : 5;

  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
  const threshold = golden.threshold_hit_at_5 ?? 0.6;

  // dist może być ESM lub CJS — dynamic import obsługuje oba
  const mod = await import(pathToFileURL(RETRIEVE).href);
  const retrieveFromCollection = mod.retrieveFromCollection || mod.default?.retrieveFromCollection;
  if (!retrieveFromCollection) {
    process.stderr.write(`Brak retrieveFromCollection w ${RETRIEVE} — zbuduj najpierw (npm run build)\n`);
    process.exit(2);
  }

  let hit1 = 0, hit5 = 0, mrrSum = 0, errors = 0;
  const rows = [];
  for (const q of golden.queries) {
    let rank = 0; // 1-based; 0 = brak w top-K
    let top = '';
    let topSection = '';
    try {
      const filter = buildMustFilter(q.filter);
      const hits = await retrieveFromCollection(q.query, K, q.collection, filter ? { filter } : undefined);
      top = hits[0]?.source || '';
      topSection = hits[0]?.section || '';
      for (let i = 0; i < hits.length; i++) {
        const srcOk = !q.expect || q.expect.some((e) => (hits[i].source || '').includes(e));
        const sectionOk = !q.expect_section || q.expect_section.some((e) => (hits[i].section || '').includes(e));
        if (srcOk && sectionOk) { rank = i + 1; break; }
      }
    } catch (e) {
      errors++;
      rows.push(`  💥 ${q.id} — błąd retrievalu: ${e.message.slice(0, 100)}`);
      continue;
    }
    if (rank === 1) hit1++;
    if (rank >= 1 && rank <= K) hit5++;
    if (rank >= 1) mrrSum += 1 / rank;
    rows.push(rank
      ? `  ${rank === 1 ? '🎯' : '✅'} ${q.id} rank=${rank}  (${q.query.slice(0, 48)}…)`
      : `  ❌ ${q.id} MISS — top1: ${top.slice(0, 50)}#${topSection.slice(0, 40)}  (${q.query.slice(0, 40)}…)`);
  }

  const n = golden.queries.length;
  const scored = n - errors;
  process.stdout.write(rows.join('\n') + '\n\n');
  if (errors) process.stdout.write(`⚠️  ${errors}/${n} zapytań z błędem (embedder/Qdrant niedostępny?)\n`);
  if (scored === 0) { process.stdout.write('Brak wyników — środowisko niedostępne.\n'); process.exit(2); }

  const h1 = hit1 / scored, h5 = hit5 / scored, mrr = mrrSum / scored;
  process.stdout.write(`hit@1 = ${h1.toFixed(2)} · hit@${K} = ${h5.toFixed(2)} · MRR = ${mrr.toFixed(2)}  (n=${scored})\n`);

  // Log trendu (TASK-GUARDRAILS-001 Sekcja 2, minimalna wersja punktu z TASK-EVAL-001
  // Fazy 1): każdy run to dziś migawka bez historii — jedna linia JSONL pozwala zobaczyć
  // trend po zmianach chunkera/modelu/seedu zamiast zgadywać z pamięci.
  try {
    const gitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
    const entry = { date: new Date().toISOString().slice(0, 10), hit1: h1, hit5: h5, mrr, n: scored, threshold, gitSha };
    fs.appendFileSync(path.join(__dirname, 'results.jsonl'), JSON.stringify(entry) + '\n');
  } catch (e) {
    process.stderr.write(`⚠️  log trendu pominięty: ${e.message}\n`);
  }
  process.stdout.write(h5 >= threshold
    ? `✅ PRÓG WPIĘCIA OSIĄGNIĘTY (hit@${K} ${h5.toFixed(2)} ≥ ${threshold}) — retrieve_patterns może wejść do /analyze-ddd\n`
    : `❌ PONIŻEJ PROGU (hit@${K} ${h5.toFixed(2)} < ${threshold}) — NIE wpinać; popraw chunking/zapytania/seed\n`);
  process.exit(h5 >= threshold ? 0 : 1);
}

main().catch((e) => { process.stderr.write(String(e) + '\n'); process.exit(2); });
