#!/usr/bin/env node
// scripts/blog-seed-emit.mjs — zapis zalążka wpisu blogowego z przebiegu /analyze lub /orchestrate (ADR 0013).
//
// Kto decyduje, że temat jest wart wpisu: agent prowadzący przebieg (ma już pełny kontekst
// taska, więc nie odpalamy osobnego LLM w tle). Agent buduje payload (schemas/blog-seed-payload-v1)
// i woła ten skrypt — tak jak report-deviation.mjs dla skrzynki `_inbox`.
// Ten skrypt jest deterministyczny i jest TWARDĄ bramką: agent może się pomylić, skrypt nie
// przepuści identyfikatorów ani zakazanych tematów do repo bloga.
//
// Użycie:
//   node scripts/blog-seed-emit.mjs --project <ścieżka> --check
//        → JSON {enabled, mode, …}: czy projekt w ogóle zasila blogi (agent pomija ocenę, gdy nie)
//   node scripts/blog-seed-emit.mjs --project <ścieżka> --payload <plik.json|-> [--run-id <id>]
//
// Kody wyjścia: 0 = przetworzone (także gdy zalążek odrzucony — powód w stdout i telemetrii),
// 1 = błąd użycia lub niepoprawny payload, 2 = błąd wewnętrzny. Wołający traktuje każde ≠ 0
// jako jedną uwagę w raporcie — NIGDY nie zmienia to wyniku przebiegu (best-effort).
// Odwrotnie dla publikacji: każdy błąd configu, deny-listy lub redakcji = brak pliku (fail-closed).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { appendEvent, projectName, validateWith } from './lib/telemetry-events.mjs';
import { loadProjectSettings, loadBlog, effective } from './lib/blog-seed/config.mjs';
import { compileRules, scrubDeep, scanForLeaks } from './lib/blog-seed/scrub.mjs';
import {
  LOCKED_STATUSES, dedupKey, refPrivate, recordIndex, withLock, writeAtomic,
  listSeeds, weeklyCount, slugify, freePath,
} from './lib/blog-seed/store.mjs';
import { buildSections, renderSeed, parseSeed, mergeSeed } from './lib/blog-seed/render.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));

// Walidator repo nie zna $ref — rozwijamy {"$ref": "#nazwa"} z $defs przed użyciem.
function resolveRefs(schema) {
  const defs = schema.$defs || {};
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.$ref === 'string' && node.$ref.startsWith('#')) return walk(defs[node.$ref.slice(1)]);
    return Object.fromEntries(Object.entries(node).filter(([k]) => k !== '$defs').map(([k, v]) => [k, walk(v)]));
  };
  return walk(schema);
}

export const PAYLOAD_SCHEMA = resolveRefs(readJson('schemas/blog-seed-payload-v1.schema.json'));
export const SEED_SCHEMA = readJson('schemas/blog-seed-v1.schema.json');

// Wagi punktacji — PODPOWIEDŹ do kalibracji, nie warunek zapisu (max 45).
export const WEIGHTS = { tension: 3, uniqueness: 3, evidence_quality: 2, reader_value: 2, novelty: 2, numbers: 1, pillar_gap: 1, freshness: 1 };
const DEFAULT_LENGTH = {
  decision: '600-1200', 'post-mortem': '600-1500', conversation: '800-1500',
  interactive: '600-1200', note: '150-400', numbers: '400-800',
};
const OTHER = { personal: 'product', product: 'personal' };
const NO_SEED = { seedId: null, dedup: null, blog: null, confidence: null, mode: null, status: null };

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') args.check = true;
    else if (['--project', '--payload', '--run-id', '--today'].includes(a)) args[a.slice(2).replace('-', '_')] = argv[++i];
    else throw new Error(`nieznany argument: ${a}`);
  }
  if (!args.project) throw new Error('brak --project <ścieżka>');
  if (!args.check && !args.payload) throw new Error('brak --payload <plik.json|-> (albo --check)');
  if (args.today && !/^\d{4}-\d{2}-\d{2}$/.test(args.today)) throw new Error('--today musi być RRRR-MM-DD');
  return args;
}

function scoreOf(score) {
  if (!score || !Object.keys(score).length) return { total: null, breakdown: {} };
  let total = 0;
  const breakdown = {};
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (!score[k]) continue;
    total += score[k].value * w;
    breakdown[k] = { value: score[k].value, why: score[k].why };
  }
  return { total, breakdown };
}

/** Plan celów wg pewności agenta i podpowiedzi projektu (uzgodnione z blogami 2026-10-12). */
export function planTargets(routing, hint) {
  const primary = routing.blog;
  const single = hint === 'personal' || hint === 'product';
  if (single && primary !== hint) return [{ role: primary, soft: 'routing' }];
  if (routing.confidence === 'low') return [{ role: primary, soft: 'routing' }];
  const plan = [{ role: primary, angle: null }];
  if (routing.confidence === 'medium' && !single && routing.alt_angle) plan.push({ role: OTHER[primary], angle: routing.alt_angle });
  return plan;
}

function runIdOf(raw) {
  const ok = typeof raw === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(raw);
  return ok ? raw : `blog-seed:${crypto.randomUUID().slice(0, 8)}`;
}

function makeEmitter(ctx) {
  return (seed) => {
    const res = appendEvent({ kind: 'seed', process: 'blog-seed', project: ctx.project, runId: ctx.runId, taskRef: null, seed });
    if (!res.ok) process.stderr.write(`blog-seed: telemetria nie zapisana (${res.error})\n`);
  };
}

function scrubbedPayload(payload, rules) {
  const { content, topic, slug, routing, source, author_input: authorInput } = payload;
  return scrubDeep({
    topic, slug: slug || null, area: source.area || null,
    test_answer: routing.test_answer, reason: routing.reason, alt_angle: routing.alt_angle || null,
    content, inferred: (authorInput && authorInput.inferred) || [],
  }, rules);
}

function linkSibling(file, siblingId) {
  const seed = parseSeed(fs.readFileSync(file, 'utf8'));
  if (!seed || seed.fm.target.sibling_seed) return;
  const fm = { ...seed.fm, target: { ...seed.fm.target, sibling_seed: siblingId } };
  writeAtomic(file, renderSeed(fm, seed.title, seed.sections));
}

function buildFrontmatter({ payload, settings, today }, plan, ctxSeed) {
  const { v, eff, blog, refPriv, dkey, score, soft, hasEvidence, existing, siblingId } = ctxSeed;
  const candidate = score.total !== null && eff.thresholds.candidate !== null && score.total >= eff.thresholds.candidate;
  return {
    schema: 'blog-seed-v1',
    seed_id: crypto.randomUUID(),
    created: today,
    updated: today,
    mode: eff.mode,
    status: candidate ? 'candidate' : 'new',
    source: {
      kind: payload.source.kind, trigger: payload.source.trigger, ref_private: refPriv,
      area: v.area ? `${settings.publicAlias} — ${v.area}` : settings.publicAlias,
    },
    target: {
      blog: plan.role, confidence: payload.routing.confidence, test_answer: v.test_answer, reason: v.reason,
      angle: plan.angle ? v.alt_angle : null, sibling_seed: siblingId || null,
    },
    suggested: {
      format: payload.suggested.format, pillar: payload.suggested.pillar,
      length: payload.suggested.length || DEFAULT_LENGTH[payload.suggested.format],
    },
    score,
    gates: { security: 'pass', evidence: hasEvidence ? 'pass' : 'fail', consent: 'pass', duplicate: existing ? 'merged' : 'pass' },
    security: { tier: 'green', deny_list_version: blog.denyListVersion, redactions: ctxSeed.redactions },
    suppressed: soft ? { reason: soft } : null,
    dedup_key: dkey,
    links: { related_seeds: [], related_posts: [] },
    author_input: { status: v.inferred.length ? 'inferred' : 'none', inferred: v.inferred },
    draft_path: null,
  };
}

/** Jeden cel (blog). Zwraca wynik do stdout; zdarzenie telemetrii emituje sam. */
function processTarget(ctx, plan, blogs, siblingId) {
  const { payload, settings, today, emit } = ctx;
  const done = (outcome, extra = {}) => {
    const r = { blog: plan.role, confidence: payload.routing.confidence, outcome, reason: null, ...extra };
    emit({
      event: outcome, seedId: r.seedId || null, dedup: r.dedup || null, blog: plan.role,
      reason: r.reason, confidence: payload.routing.confidence, mode: r.mode || null, status: r.status || null,
    });
    return r;
  };

  const blog = blogs.get(plan.role);
  if (!blog) return done('suppressed', { reason: 'config' });
  const eff = effective(settings, blog);

  let rules;
  try {
    rules = compileRules({
      denyList: blog.denyList, projectName: settings.projectName, publicAlias: settings.publicAlias,
      sourceRef: payload.source.ref, excludeTopics: settings.excludeTopics,
    });
  } catch {
    return done('suppressed', { reason: 'config', mode: eff.mode });
  }
  const sc = scrubbedPayload(payload, rules);
  if (sc.ban) return done('suppressed', { reason: 'security', mode: eff.mode });
  const consent = payload.consent || {};
  if ((consent.third_parties || settings.thirdParties) && !consent.obtained) {
    return done('suppressed', { reason: 'consent', mode: eff.mode });
  }

  const dkey = dedupKey(settings.projectName, payload.source.kind, payload.source.ref, plan.role);
  const dedup = dkey.slice(0, 12);
  const refPriv = refPrivate(settings.projectName, payload.source.kind, payload.source.ref);
  const score = scoreOf(payload.score);

  return withLock(dkey, () => {
    const seeds = listSeeds(blog.root, eff.mode);
    const existing = seeds.find((s) => s.fm.dedup_key === dkey);
    if (existing && LOCKED_STATUSES.has(existing.fm.status)) {
      return done('suppressed', { reason: 'duplicate', mode: eff.mode, dedup, seedId: existing.fm.seed_id, status: existing.fm.status });
    }
    const v = sc.value;
    const hasEvidence = v.content.evidence.length > 0;
    let soft = plan.soft || null;
    if (!soft && !hasEvidence) soft = 'evidence';
    if (!soft && !existing && weeklyCount(seeds, today) >= eff.rateLimit) soft = 'rate';
    if (!soft && eff.enforceThresholds && score.total !== null && eff.thresholds.seed !== null && score.total < eff.thresholds.seed) soft = 'score';
    // Live: odrzucony kandydat nie zostawia pliku. Dry-run: zostawia (materiał do kalibracji).
    if (soft && eff.mode === 'live') return done('suppressed', { reason: soft, mode: eff.mode, dedup });

    const fm = buildFrontmatter(ctx, plan, {
      v, eff, blog, refPriv, dkey, score, soft, hasEvidence, existing, siblingId, redactions: sc.redactions,
    });
    const fresh = { fm, sections: buildSections(v.content, fm.suggested) };
    const merged = existing ? mergeSeed(parseSeed(fs.readFileSync(existing.file, 'utf8')), fresh) : fresh;
    const content = renderSeed(merged.fm, v.topic, merged.sections);

    // Druga linia obrony: skan gotowego ciała tymi samymi regułami. Trafienie = nie piszemy.
    const body = content.slice(content.indexOf('\n---\n') + 5);
    if (scanForLeaks(body, rules).length) return done('suppressed', { reason: 'security', mode: eff.mode, dedup });
    const schemaErrors = validateWith(SEED_SCHEMA, merged.fm, 'seed');
    if (schemaErrors.length) throw new Error(`frontmatter poza schematem: ${schemaErrors.join('; ')}`);

    const slug = slugify(v.slug || v.topic) || `zalazek-${dedup}`;
    const file = existing ? existing.file : freePath(blog.root, eff.mode, today, slug);
    writeAtomic(file, content);
    recordIndex(refPriv, settings.projectName, payload.source.ref);
    return done(soft ? 'suppressed' : existing ? 'updated' : 'emitted', {
      reason: soft, mode: eff.mode, dedup, seedId: merged.fm.seed_id, status: merged.fm.status,
      file: path.relative(blog.root, file),
    });
  });
}

function loadBlogs(settings) {
  const blogs = new Map();
  for (const t of settings.targets) {
    const res = loadBlog(t);
    if (res.ok && !blogs.has(res.blog.role)) blogs.set(res.blog.role, res.blog);
    else if (!res.ok) process.stderr.write(`blog-seed: cel "${t.id}" pominięty (${res.detail})\n`);
  }
  return blogs;
}

function readPayload(src, maxKb) {
  const raw = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
  if (Buffer.byteLength(raw) > maxKb * 1024) throw new Error(`payload większy niż ${maxKb} KB`);
  return JSON.parse(raw);
}

function checkOutput(loaded) {
  if (!loaded.enabled) return { enabled: false, reason: loaded.reason, detail: loaded.detail };
  const s = loaded.settings;
  return {
    enabled: true, mode: s.mode, routing_hint: s.routingHint, triggers: s.triggers,
    exclude_topics: s.excludeTopics, artifact_globs: s.artifactGlobs, third_parties: s.thirdParties,
  };
}

export function run(argv) {
  const args = parseArgs(argv);
  const projectRoot = path.resolve(args.project);
  const today = args.today || new Date().toISOString().slice(0, 10);
  const ctx = { project: projectName(projectRoot), runId: runIdOf(args.run_id), today };
  const emit = makeEmitter(ctx);
  const loaded = loadProjectSettings(projectRoot, today);

  if (args.check) return { code: 0, out: checkOutput(loaded) };
  if (!loaded.enabled) {
    emit({ ...NO_SEED, event: 'suppressed', reason: loaded.reason });
    return { code: 0, out: { results: [], skipped: loaded.reason } };
  }
  const settings = loaded.settings;
  let payload;
  try {
    payload = readPayload(args.payload, settings.maxPayloadKb);
  } catch (e) {
    emit({ ...NO_SEED, event: 'suppressed', reason: 'invalid' });
    return { code: 1, err: `payload: ${e.message}` };
  }
  const errors = validateWith(PAYLOAD_SCHEMA, payload, 'payload');
  if (errors.length) {
    emit({ ...NO_SEED, event: 'suppressed', reason: 'invalid' });
    return { code: 1, err: `payload niezgodny ze schematem:\n  ${errors.join('\n  ')}` };
  }
  if (!settings.triggers.includes(payload.source.trigger)) {
    emit({ ...NO_SEED, event: 'suppressed', reason: 'config', blog: payload.routing.blog, confidence: payload.routing.confidence });
    return { code: 0, out: { results: [], skipped: 'trigger' } };
  }

  const blogs = loadBlogs(settings);
  const full = { ...ctx, payload, settings, emit };
  const results = [];
  for (const plan of planTargets(payload.routing, settings.routingHint)) {
    const primary = results[0];
    const primaryOk = primary && primary.outcome !== 'suppressed' && primary.seedId;
    let r;
    try {
      r = processTarget(full, plan, blogs, primaryOk ? primary.seedId : null);
    } catch (e) {
      // Awaria jednego celu nie blokuje drugiego i nie zostawia pliku (zapis jest atomowy).
      process.stderr.write(`blog-seed: błąd dla bloga ${plan.role}: ${e.message}\n`);
      emit({ ...NO_SEED, event: 'suppressed', reason: 'error', blog: plan.role, confidence: payload.routing.confidence });
      r = { blog: plan.role, outcome: 'suppressed', reason: 'error' };
    }
    results.push(r);
    if (primaryOk && r.outcome !== 'suppressed' && r.seedId) {
      linkSibling(path.join(blogs.get(primary.blog).root, primary.file), r.seedId);
    }
  }
  return { code: 0, out: { results } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let res;
  try {
    res = run(process.argv.slice(2));
  } catch (e) {
    const usage = /^(nieznany argument|brak --|--today)/.test(e.message);
    res = { code: usage ? 1 : 2, err: e.message };
  }
  if (res.out) process.stdout.write(JSON.stringify(res.out) + '\n');
  if (res.err) process.stderr.write(`blog-seed: ${res.err}\n`);
  process.exit(res.code);
}
