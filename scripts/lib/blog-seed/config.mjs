// scripts/lib/blog-seed/config.mjs — trzy warstwy konfiguracji zalążków wpisów (ADR 0013).
//
//   A. projekt źródłowy: sekcja `blog_seeds:` w .claude/config/project.yml (opt-in);
//   B. domyślne mechanizmu: DEFAULTS poniżej (nadpisywalne z A);
//   C. repo bloga: blog-seed.config.yml + deny-lista (własność bloga).
//
// Rozstrzyganie: zakazy się sumują (scrub.mjs), limity i progi = wartość bardziej restrykcyjna,
// wyłączenie projektu wygrywa ze wszystkim, brak sekcji/pliku = pominięcie ze zdarzeniem.
// Loader bloga jest FAIL-CLOSED: każdy brak lub błąd configu/deny-listy = ten blog nie
// dostaje zalążka. Nigdy nie tworzymy `stage/` ani configu po stronie bloga.
//
// Dlaczego domyślne w kodzie, a nie blok w runtime.yml: emitter wołany jest z claude-patterns
// i czyta project.yml bezpośrednio; blok w stack_blocks wymagałby ponownej materializacji
// każdego projektu, a nie dodałby niczego, czego nie da sekcja `blog_seeds:` (ADR 0013, D4).

import fs from 'node:fs';
import path from 'node:path';
import { loadProjectYml } from '../project-yml.mjs';
import YAML from 'yaml';

export const DEFAULTS = Object.freeze({
  mode: 'dry-run',
  max_payload_kb: 64,
  rate_limit_per_week: 3,
  triggers: ['adr', 'decision', 'halt', 'go_with_gaps', 'no_go', 'discussion', 'monthly'],
});

export const BLOG_ROLES = ['personal', 'product'];

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/**
 * Warstwa A+B. Zwraca { enabled: false, reason, detail } albo { enabled: true, settings }.
 * reason ∈ disabled | embargo | config (config = sekcja jest, ale niepoprawna).
 */
export function loadProjectSettings(projectRoot, today) {
  const file = path.join(projectRoot, '.claude', 'config', 'project.yml');
  let doc;
  try {
    doc = loadProjectYml(file);
  } catch {
    return { enabled: false, reason: 'disabled', detail: 'brak lub niepoprawny project.yml' };
  }
  const sec = doc && doc.blog_seeds;
  if (!sec || typeof sec !== 'object') return { enabled: false, reason: 'disabled', detail: 'brak sekcji blog_seeds' };
  if (sec.enabled !== true) return { enabled: false, reason: 'disabled', detail: 'blog_seeds.enabled ≠ true' };
  const exclude = sec.exclude || {};
  if (exclude.project === true) return { enabled: false, reason: 'disabled', detail: 'exclude.project' };
  if (sec.embargo_until != null) {
    const until = sec.embargo_until instanceof Date ? sec.embargo_until.toISOString().slice(0, 10) : String(sec.embargo_until);
    if (!isDate(until)) return { enabled: false, reason: 'config', detail: 'embargo_until nie jest datą RRRR-MM-DD' };
    if (today < until) return { enabled: false, reason: 'embargo', detail: `embargo do ${until}` };
  }
  const alias = typeof sec.public_alias === 'string' ? sec.public_alias.trim() : '';
  if (!alias) return { enabled: false, reason: 'config', detail: 'brak public_alias' };
  const targets = (Array.isArray(sec.targets) ? sec.targets : [])
    .filter((t) => t && typeof t.path === 'string')
    .map((t) => ({ id: String(t.id || ''), path: path.resolve(projectRoot, t.path) }));
  if (!targets.length) return { enabled: false, reason: 'config', detail: 'brak targets' };
  return {
    enabled: true,
    settings: {
      projectName: path.basename(path.resolve(projectRoot)),
      publicAlias: alias,
      targets,
      routingHint: ['auto', 'personal', 'product', 'both'].includes(sec.routing_hint) ? sec.routing_hint : 'auto',
      excludeTopics: Array.isArray(exclude.topics) ? exclude.topics.map(String) : [],
      artifactGlobs: Array.isArray(exclude.artifact_globs) ? exclude.artifact_globs.map(String) : [],
      triggers: Array.isArray(sec.triggers) && sec.triggers.length ? sec.triggers.map(String) : [...DEFAULTS.triggers],
      thirdParties: sec.third_parties === true,
      mode: sec.mode === 'live' ? 'live' : DEFAULTS.mode,
      maxPayloadKb: Number.isFinite(sec.max_payload_kb) ? Math.min(sec.max_payload_kb, DEFAULTS.max_payload_kb) : DEFAULTS.max_payload_kb,
      rateLimit: Number.isInteger(sec.rate_limit_per_week) ? sec.rate_limit_per_week : null,
      enforceThresholds: sec.enforce_thresholds === true,
    },
  };
}

/**
 * Warstwa C dla jednego celu. Zwraca { ok: true, blog } albo { ok: false, detail }.
 * Fail-closed: brak configu, brak `stage/`, brak/niepoprawna deny-lista = ok: false.
 */
export function loadBlog(target) {
  const root = target.path;
  const cfgFile = path.join(root, 'blog-seed.config.yml');
  if (!fs.existsSync(cfgFile)) return { ok: false, detail: 'brak blog-seed.config.yml' };
  if (!fs.existsSync(path.join(root, 'stage'))) return { ok: false, detail: 'brak katalogu stage/' };
  let cfg;
  try {
    cfg = YAML.parse(fs.readFileSync(cfgFile, 'utf8')) || {};
  } catch {
    return { ok: false, detail: 'niepoprawny blog-seed.config.yml' };
  }
  if (!BLOG_ROLES.includes(cfg.role)) return { ok: false, detail: 'role spoza personal|product' };
  if (!cfg.deny_list_file) return { ok: false, detail: 'brak deny_list_file' };
  const denyFile = path.resolve(root, String(cfg.deny_list_file));
  if (!denyFile.startsWith(path.resolve(root) + path.sep)) return { ok: false, detail: 'deny_list_file poza repo bloga' };
  let denyList;
  try {
    denyList = YAML.parse(fs.readFileSync(denyFile, 'utf8'));
  } catch {
    return { ok: false, detail: 'brak lub niepoprawna deny-lista' };
  }
  if (!denyList || typeof denyList !== 'object' || !denyList.version) return { ok: false, detail: 'deny-lista bez version' };
  const weekly = cfg.rate_limit && cfg.rate_limit.new_seeds_per_week;
  return {
    ok: true,
    blog: {
      id: String(cfg.blog_id || target.id || cfg.role),
      role: cfg.role,
      root,
      postGuide: cfg.post_guide || null,
      denyList,
      denyListVersion: String(denyList.version),
      mode: cfg.mode === 'dry-run' ? 'dry-run' : null,
      rateLimit: Number.isInteger(weekly) ? weekly : null,
      thresholds: cfg.thresholds || {},
      enforceThresholds: cfg.enforce_thresholds === true,
    },
  };
}

/** Efektywne ustawienia pary projekt×blog wg reguł rozstrzygania. */
export function effective(settings, blog) {
  // Domyślny limit tylko wtedy, gdy żadna strona go nie ustawiła — inaczej bardziej restrykcyjny.
  const limits = [settings.rateLimit, blog.rateLimit].filter(Number.isInteger);
  return {
    // live tylko, gdy OBIE strony pozwalają; blog może wymusić dry-run.
    mode: settings.mode === 'live' && blog.mode !== 'dry-run' ? 'live' : 'dry-run',
    rateLimit: limits.length ? Math.min(...limits) : DEFAULTS.rate_limit_per_week,
    enforceThresholds: settings.enforceThresholds || blog.enforceThresholds,
    thresholds: {
      seed: Number.isFinite(blog.thresholds.seed) ? blog.thresholds.seed : null,
      candidate: Number.isFinite(blog.thresholds.candidate) ? blog.thresholds.candidate : null,
    },
  };
}
