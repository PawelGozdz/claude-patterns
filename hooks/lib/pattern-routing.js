/**
 * pattern-routing.js — shared source-file → canonical-pattern routing.
 *
 * Single source of truth for "which architecture pattern governs this file".
 * Consumed by:
 *   - check-patterns-read.js  (blocks edits until the governing pattern is read)
 *   - check-delegation.js     (blocks the MAIN agent from editing pattern files;
 *                              forces delegation to a subagent / /orchestrate)
 *
 * Keep PATH_RULES / FILENAME_RULES here so both gates agree on what counts
 * as "real architecture" vs. a utility/config/module file.
 */

const path = require('path');

const EXEMPT_EXTENSIONS = ['.md', '.yaml', '.yml', '.json', '.lock', '.txt', '.gitignore'];

const EXEMPT_PATH_FRAGMENTS = [
  '__tests__/',
  '/test/',
  '/tests/',
  '.spec.',
  '.test.',
  'CHANGELOG',
  'README',
  '.claude/',
  'project-orchestration/',
  'node_modules/',
];

const ENFORCED_EXTENSIONS = ['.ts', '.tsx', '.dart', '.py', '.svelte'];

/**
 * Path-fragment → pattern mapping. First match wins.
 * Order matters: more specific paths must come BEFORE more generic ones.
 */
const PATH_RULES = [
  // Domain layer
  { match: '/domain/aggregates/',         pattern: 'domain/aggregate-pattern.md' },
  { match: '/domain/value-objects/',      pattern: 'domain/value-object-pattern.md' },
  { match: '/domain/entities/',           pattern: 'domain/entity-pattern.md' },
  { match: '/domain/events/',             pattern: 'domain/domain-event-pattern.md' },
  { match: '/domain/services/',           pattern: 'domain/domain-service-pattern.md' },
  { match: '/domain/specifications/',     pattern: 'domain/specification-policy-pattern.md' },
  { match: '/domain/policies/',           pattern: 'domain/specification-policy-pattern.md' },
  { match: '/domain/repositories/',       pattern: 'infrastructure/repository-pattern.md' },

  // Application layer
  { match: '/application/commands/',      pattern: 'application/command-handler-pattern.md' },
  { match: '/application/queries/',       pattern: 'application/query-handler-pattern.md' },
  { match: '/application/event-handlers/',pattern: 'application/audit-handler-pattern.md' },
  { match: '/application/services/',      pattern: 'application/application-service-pattern.md' },

  // Infrastructure layer
  { match: '/infrastructure/persistence/',          pattern: 'infrastructure/repository-pattern.md' },
  { match: '/infrastructure/repositories/mappers/', pattern: 'infrastructure/mapper-pattern.md' },
  { match: '/infrastructure/acl/',                  pattern: 'architecture/acl-registry-pattern.md' },
  { match: '/infrastructure/controllers/',          pattern: 'infrastructure/controller-schema-pattern.md' },
];

/**
 * Filename-suffix → pattern mapping (fallback when path didn't match).
 */
const FILENAME_RULES = [
  { match: /\.aggregate\.ts$/,       pattern: 'domain/aggregate-pattern.md' },
  { match: /\.vo\.ts$/,              pattern: 'domain/value-object-pattern.md' },
  { match: /\.entity\.ts$/,          pattern: 'domain/entity-pattern.md' },
  { match: /\.event\.ts$/,           pattern: 'domain/domain-event-pattern.md' },
  { match: /\.specification\.ts$/,   pattern: 'domain/specification-policy-pattern.md' },
  { match: /\.policy\.ts$/,          pattern: 'domain/specification-policy-pattern.md' },
  { match: /\.repository\.ts$/,      pattern: 'infrastructure/repository-pattern.md' },
  { match: /\.controller\.ts$/,      pattern: 'infrastructure/controller-schema-pattern.md' },
  { match: /\.handler\.ts$/,         pattern: 'application/command-handler-pattern.md' },
  { match: /\.mapper\.ts$/,          pattern: 'infrastructure/mapper-pattern.md' },
  { match: /\.adapter\.ts$/,         pattern: 'architecture/acl-registry-pattern.md' },
];

/**
 * True if the file should be skipped entirely (docs, tests, config, non-enforced
 * extensions). Such files never need pattern grounding or delegation.
 */
function isExempt(filePath) {
  if (!filePath) return true;
  for (const frag of EXEMPT_PATH_FRAGMENTS) {
    if (filePath.includes(frag)) return true;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (EXEMPT_EXTENSIONS.includes(ext)) return true;
  if (!ENFORCED_EXTENSIONS.includes(ext)) return true;
  return false;
}

/**
 * Returns the canonical pattern path (relative, e.g. 'domain/aggregate-pattern.md')
 * that governs the given source file, or null if no rule applies.
 *
 * null = "not a pattern file" — a utility/config/module file. Both gates treat
 * null as "allow" (the verifier tier catches drift later).
 */
function findRequiredPattern(filePath) {
  for (const rule of PATH_RULES) {
    if (typeof rule.match === 'string') {
      if (filePath.includes(rule.match)) return rule.pattern;
    } else if (rule.match instanceof RegExp) {
      if (rule.match.test(filePath)) return rule.pattern;
    }
  }
  for (const rule of FILENAME_RULES) {
    if (rule.match.test(filePath)) return rule.pattern;
  }
  return null;
}

module.exports = {
  EXEMPT_EXTENSIONS,
  EXEMPT_PATH_FRAGMENTS,
  ENFORCED_EXTENSIONS,
  PATH_RULES,
  FILENAME_RULES,
  isExempt,
  findRequiredPattern,
};
