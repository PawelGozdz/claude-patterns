#!/usr/bin/env node
/**
 * tests/flow-evals/library-reference-schema/run.js — eval L1 STRUKTURALNY (TASK-RAG-003 0.1/0.2).
 *
 * Deterministyczny, BEZ embeddera — czyste count()/scroll() do Qdranta. Sprawdza integralność
 * SEEDU (nie rankingu semantycznego, to robi ../retrieval/):
 *   1) exact_counts: total + rozkład kind/level == snapshot z golden.json
 *   2) invariants: pola, które MUSZĄ być 100% wypełnione (lib_version, tags)
 *   3) combines_or_match_floor: filtr {should:[feature,combines]} (dokładnie to, czego używa
 *      retrieve_examples({feature})) zwraca >= podłoga — wykrywa np. przypadkowe wyzerowanie
 *      pola combines przy przyszłej re-ekstrakcji
 *
 * Wymaga: żywy Qdrant (KR_QDRANT_URL, domyślnie http://localhost:6401).
 * Uruchom: node tests/flow-evals/library-reference-schema/run.js
 */

const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const URL = process.env.KR_QDRANT_URL || 'http://localhost:6401';
const REPO = path.resolve(__dirname, '..', '..', '..');
// @qdrant/js-client-rest lives in knowledge-retriever's own node_modules, not the repo root's —
// resolve it from there explicitly (same reasoning as ../retrieval/run.js dynamic-importing dist/).
const requireFromKR = createRequire(path.join(REPO, 'mcp-server', 'knowledge-retriever', 'package.json'));
const { QdrantClient } = requireFromKR('@qdrant/js-client-rest');

async function main() {
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
  const client = new QdrantClient({ url: URL });
  const COLLECTION = golden.collection;

  let failures = 0;
  const rows = [];
  const ok = (id, detail) => rows.push(`  ✅ ${id} — ${detail}`);
  const fail = (id, detail) => { failures++; rows.push(`  ❌ ${id} — ${detail}`); };

  // 1) exact_counts
  const totalRes = await client.count(COLLECTION, {});
  const total = totalRes.count;
  if (total === golden.exact_counts.total) ok('TOTAL', `${total} punktów (== snapshot)`);
  else fail('TOTAL', `${total} punktów, oczekiwano DOKŁADNIE ${golden.exact_counts.total} — zawartość seedu się zmieniła (celowo? zaktualizuj snapshot świadomie)`);

  for (const [field, expected] of Object.entries({ kind: golden.exact_counts.kind, level: golden.exact_counts.level })) {
    for (const [value, expectedCount] of Object.entries(expected)) {
      const r = await client.count(COLLECTION, { filter: { must: [{ key: field, match: { value } }] } });
      if (r.count === expectedCount) ok(`${field.toUpperCase()}-${value}`, `${r.count} (== snapshot)`);
      else fail(`${field.toUpperCase()}-${value}`, `${r.count}, oczekiwano ${expectedCount}`);
    }
  }

  // 2) invariants (must_not_match — liczba punktów NIE pasujących do oczekiwanej wartości musi być expect_count)
  for (const inv of golden.invariants) {
    const r = await client.count(COLLECTION, {
      filter: { must_not: [{ key: inv.must_not_match.key, match: { value: inv.must_not_match.value } }] },
    });
    if (r.count === inv.expect_count) ok(inv.id, `${inv.desc} — ${r.count} naruszeń (oczekiwano ${inv.expect_count})`);
    else fail(inv.id, `${inv.desc} — ${r.count} naruszeń, oczekiwano ${inv.expect_count}`);
  }

  // 3) combines OR-match floor — dokładnie ten filtr, którego używa retrieve_examples({feature})
  for (const c of golden.combines_or_match_floor) {
    const r = await client.count(COLLECTION, {
      filter: { should: [{ key: 'feature', match: { value: c.feature } }, { key: 'combines', match: { value: c.feature } }] },
    });
    if (r.count >= c.min_count) ok(c.id, `feature="${c.feature}" OR-match = ${r.count} (>= podłoga ${c.min_count}) — ${c.note}`);
    else fail(c.id, `feature="${c.feature}" OR-match = ${r.count}, PONIŻEJ podłogi ${c.min_count} — ${c.note}`);
  }

  process.stdout.write(rows.join('\n') + '\n\n');
  if (failures === 0) {
    process.stdout.write(`✅ WSZYSTKIE SPRAWDZENIA OK (0/${rows.length} naruszeń)\n`);
    process.exit(0);
  } else {
    process.stdout.write(`❌ ${failures}/${rows.length} SPRAWDZEŃ NIE PRZESZŁO — regresja w danych seedu\n`);
    process.exit(1);
  }
}

main().catch((e) => { process.stderr.write(String(e) + '\n'); process.exit(2); });
