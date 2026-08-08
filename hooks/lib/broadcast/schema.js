/**
 * Schemat wiadomości v1 + walidacja na zapisie (ADR 0006, „Model wiadomości").
 *
 * Walidacja jest deterministyczna i wykonuje się PRZED zapisem — reguły, których model
 * nie ma prawa obejść, siedzą tutaj, nie w prompcie komendy:
 *
 *   - `hops >= 1` odrzucane            → bariera kaskady (sekcja Ryzyka)
 *   - `body` > 2 KB odrzucane          → mitygacja prompt injection
 *   - linia > 4 KB odrzucana           → atomowy append (D9)
 *   - cross-repo tylko `questions`     → D1, wyjątek dla `kind ∈ {question, answer}`
 *   - `severity: critical` tylko dla `class: deterministic` albo od człowieka → D11
 *   - `owner` musi subskrybować topic  → D4
 */

const paths = require('./paths');
const { isUlid, ulid } = require('./ulid');
const manifestLib = require('./manifest');

const SCHEMA_VERSION = 1;

const KINDS = ['discovery', 'done', 'question', 'answer', 'invalidate'];
const CLASSES = ['deterministic', 'interpretive'];
const SEVERITIES = ['critical', 'important', 'info'];

/**
 * Kindy dopuszczone do emisji na dziś.
 *
 * 6.1 startowała z `discovery` + `done`; 6.5 dokłada `question` + `answer` (D7).
 * `invalidate` NADAL zablokowane — OQ5 (kto ma prawo je emitować) i OQ6 (co ono
 * znaczy u odbiorcy) czekają na decyzję człowieka. To najsilniejszy sygnał w systemie
 * i odblokowanie go bez odpowiedzi na te dwa pytania byłoby przekroczeniem mandatu.
 * Obejście na własną odpowiedzialność: `--allow-experimental`.
 */
const ENABLED_KINDS = ['discovery', 'done', 'question', 'answer'];

/** @deprecated nazwa z fazy 6.1 — alias, żeby nie zerwać istniejących importów */
const PHASE_1_KINDS = ENABLED_KINDS;

/** Kindy, dla których wolno emitować na cudzy `<repo>/questions`. */
const CROSS_REPO_KINDS = ['question', 'answer'];

const MAX_TITLE_CHARS = 200;
const MAX_PATHS = 20;
const MAX_PATH_CHARS = 300;
const MAX_BRANCH_CHARS = 200;

/**
 * Buduje wiadomość z surowego wejścia CLI. Nie waliduje — to robi `validate`.
 * @param {object} input pola wiadomości (bez `v`, `id`, `ts`)
 * @param {object} ctx   { manifest, branch }
 */
function buildMessage(input, ctx = {}) {
  const manifest = ctx.manifest || {};
  return {
    v: SCHEMA_VERSION,
    id: input.id || ulid(),
    ts: input.ts || new Date().toISOString(),
    topic: str(input.topic),
    kind: str(input.kind) || 'discovery',
    class: str(input.class) || 'interpretive',
    severity: str(input.severity) || 'info',
    instance: str(input.instance) || str(manifest.instance),
    branch: str(input.branch) || str(ctx.branch),
    owner: str(input.owner),
    hops: Number.isFinite(input.hops) ? input.hops : 0,
    reply_to: input.reply_to || null,
    title: str(input.title),
    body: str(input.body),
    paths: Array.isArray(input.paths) ? input.paths.map(str).filter(Boolean) : [],
  };
}

/**
 * @param {object} message
 * @param {object} ctx { manifest, registry, human }
 *        `human` = wiadomość podyktowana przez człowieka (D11 — tylko wtedy `critical`
 *        wolno nadać wiadomości klasy interpretacyjnej).
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
function validate(message, ctx = {}) {
  const errors = [];
  const warnings = [];
  const manifest = ctx.manifest;
  const msg = message || {};

  if (msg.v !== SCHEMA_VERSION) errors.push(`\`v\` musi wynosić ${SCHEMA_VERSION} (jest: ${msg.v})`);
  if (!isUlid(msg.id)) errors.push('`id` musi być ULID-em (26 znaków Crockford base32)');
  if (!isIsoTimestamp(msg.ts)) errors.push('`ts` musi być znacznikiem ISO 8601');

  const topic = manifestLib.splitTopic(msg.topic);
  if (!topic) errors.push(`\`topic\` musi mieć postać <repo>/<domain> (jest: ${msg.topic})`);

  if (!KINDS.includes(msg.kind)) errors.push(`\`kind\` spoza zbioru: ${msg.kind}`);
  if (!CLASSES.includes(msg.class)) errors.push(`\`class\` spoza zbioru: ${msg.class}`);
  if (!SEVERITIES.includes(msg.severity)) errors.push(`\`severity\` spoza zbioru: ${msg.severity}`);

  if (!msg.instance || !manifestLib.NAME_RE.test(msg.instance)) {
    errors.push('`instance` jest wymagane i musi być nazwą instancji');
  }
  if (typeof msg.branch !== 'string' || msg.branch.length > MAX_BRANCH_CHARS) {
    errors.push('`branch` musi być stringiem krótszym niż 200 znaków');
  }

  if (msg.hops !== 0) {
    errors.push('`hops` musi wynosić 0 — wiadomości pochodne (hops >= 1) są odrzucane (bariera kaskady)');
  }

  if (msg.reply_to !== null && !isUlid(msg.reply_to)) errors.push('`reply_to` musi być ULID-em albo null');
  if (msg.kind === 'answer' && !msg.reply_to) errors.push('`answer` wymaga `reply_to` z id pytania');

  if (!msg.title || msg.title.length > MAX_TITLE_CHARS) {
    errors.push(`\`title\` jest wymagany i nie może przekraczać ${MAX_TITLE_CHARS} znaków`);
  }

  const bodyBytes = Buffer.byteLength(String(msg.body ?? ''), 'utf8');
  if (bodyBytes > paths.MAX_BODY_BYTES) {
    errors.push(`\`body\` ma ${bodyBytes} B, limit to ${paths.MAX_BODY_BYTES} B`);
  }

  if (!Array.isArray(msg.paths)) errors.push('`paths` musi być listą');
  else if (msg.paths.length > MAX_PATHS) errors.push(`\`paths\` może mieć najwyżej ${MAX_PATHS} pozycji`);
  else if (msg.paths.some((p) => typeof p !== 'string' || p.length > MAX_PATH_CHARS)) {
    errors.push('`paths` musi zawierać stringi krótsze niż 300 znaków');
  }

  // D11 — kto ustala wagę.
  if (msg.severity === 'critical' && msg.class !== 'deterministic' && !ctx.human) {
    errors.push(
      '`severity: critical` wolno nadać wyłącznie wiadomości `class: deterministic` albo emitowanej przez człowieka (D11)',
    );
  }

  const lineBytes = Buffer.byteLength(`${JSON.stringify(msg)}\n`, 'utf8');
  if (lineBytes > paths.MAX_LINE_BYTES) {
    errors.push(`cała wiadomość ma ${lineBytes} B, limit linii to ${paths.MAX_LINE_BYTES} B`);
  }

  if (manifest && topic) {
    errors.push(...validateAgainstManifest(msg, topic, manifest));
  }

  if (ctx.registry && msg.owner) {
    const coverage = manifestLib.repoSubscribesTo(ctx.registry, msg.owner, msg.topic);
    if (coverage === 'no') {
      errors.push(
        `\`owner: ${msg.owner}\` nie subskrybuje \`${msg.topic}\` — obowiązek przypisany komuś, kto go nie zobaczy (D4)`,
      );
    } else if (coverage === 'unknown') {
      warnings.push(
        `nie da się zweryfikować \`owner: ${msg.owner}\` — to repo nie ma jeszcze wpisu w rejestrze manifestów`,
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function validateAgainstManifest(msg, topic, manifest) {
  const errors = [];
  const isOwnRepo = topic.repo === manifest.repo;

  if (!isOwnRepo) {
    // D1 — jedyne dozwolone cross-repo: pytania i odpowiedzi na cudzy `<repo>/questions`.
    if (topic.name !== manifestLib.INBOUND_TOPIC || !CROSS_REPO_KINDS.includes(msg.kind)) {
      errors.push(
        `nie wolno emitować na cudzy topic \`${msg.topic}\` — dozwolone wyłącznie ` +
          `\`<repo>/questions\` z \`kind\` w {${CROSS_REPO_KINDS.join(', ')}} (D1)`,
      );
    }
    return errors;
  }

  const allowed = new Set([...manifestLib.STRUCTURAL_TOPICS, ...manifest.emits.domain]);
  if (!allowed.has(topic.name)) {
    errors.push(
      `topic \`${msg.topic}\` nie jest zadeklarowany — dopisz \`${topic.name}\` do \`emits.domain\` w manifeście`,
    );
  }

  if (msg.instance !== manifest.instance) {
    errors.push(`\`instance\` (${msg.instance}) nie zgadza się z manifestem (${manifest.instance})`);
  }

  return errors;
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function str(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

module.exports = {
  SCHEMA_VERSION,
  KINDS,
  CLASSES,
  SEVERITIES,
  ENABLED_KINDS,
  PHASE_1_KINDS,
  CROSS_REPO_KINDS,
  buildMessage,
  validate,
};
