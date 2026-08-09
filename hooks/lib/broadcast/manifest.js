/**
 * Manifest instancji — `.claude/config/broadcast.yml` (ADR 0006, D3).
 *
 * Brak manifestu = broadcast nie istnieje dla tej instancji. To jedyny przełącznik
 * całego systemu: hooki sprawdzają `load()` i kończą `exit 0`, gdy go nie ma.
 *
 * Plik jest nieśledzony przez gita (wykluczenie w `.git/info/exclude`), więc każda
 * instancja tego samego repo ma własny. Ceną jest rozjazd deklaracji — dlatego przy
 * każdym użyciu CLI publikujemy kopię do rejestru `manifests/<instance>.json`, z którego
 * korzystają: walidacja `owner` (D4 — obowiązek przypisany komuś, kto topicu nie
 * subskrybuje, jest odrzucany) i raport rozjazdu w `/broadcast-status`.
 */

const fs = require('fs');
const path = require('path');

const paths = require('./paths');
const { parse: parseYaml, YamlSubsetError } = require('./yaml');

/** Topiki strukturalne — ten sam zestaw w każdym repo, nierozszerzalny ad hoc (D2). */
const STRUCTURAL_TOPICS = ['contracts', 'migrations', 'security', 'release', 'questions'];

/** Jedyny topic przychodzący: emitują na niego obce repa (wyjątek od D1). */
const INBOUND_TOPIC = 'questions';

const MANIFEST_RELATIVE_PATH = path.join('.claude', 'config', 'broadcast.yml');
const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/i;
const MAX_WALK_UP = 8;

/**
 * Szuka manifestu w górę drzewa katalogów (jak `findProjectRoot` w session-start-pm.js).
 * @returns {{manifestPath: string, root: string}|null}
 */
function findManifestPath(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < MAX_WALK_UP; i++) {
    const candidate = path.join(dir, MANIFEST_RELATIVE_PATH);
    if (fs.existsSync(candidate)) return { manifestPath: candidate, root: dir };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Ładuje i waliduje manifest.
 * @returns {{ok: boolean, manifest: object|null, errors: string[], manifestPath: string|null, root: string|null}}
 *          `ok: false` z pustą listą błędów oznacza po prostu brak manifestu (system wyłączony).
 */
function load(startDir = process.cwd()) {
  const found = findManifestPath(startDir);
  if (!found) return { ok: false, manifest: null, errors: [], manifestPath: null, root: null };

  let raw;
  try {
    raw = fs.readFileSync(found.manifestPath, 'utf8');
  } catch (err) {
    return {
      ok: false,
      manifest: null,
      errors: [`nie można odczytać ${found.manifestPath}: ${err.message}`],
      manifestPath: found.manifestPath,
      root: found.root,
    };
  }

  let doc;
  try {
    doc = parseYaml(raw);
  } catch (err) {
    const prefix = err instanceof YamlSubsetError ? 'manifest nie jest poprawny' : 'błąd parsowania';
    return {
      ok: false,
      manifest: null,
      errors: [`${prefix}: ${err.message}`],
      manifestPath: found.manifestPath,
      root: found.root,
    };
  }

  const { manifest, errors } = normalize(doc, found.root);
  return {
    ok: errors.length === 0,
    manifest: errors.length === 0 ? { ...manifest, manifestPath: found.manifestPath, root: found.root } : null,
    errors,
    manifestPath: found.manifestPath,
    root: found.root,
  };
}

function normalize(doc, root) {
  const errors = [];
  const source = doc && typeof doc === 'object' ? doc : {};

  const repo = typeof source.repo === 'string' ? source.repo.trim() : '';
  if (!repo) errors.push('brak wymaganego pola `repo`');
  else if (!NAME_RE.test(repo)) errors.push(`\`repo\` ma nieprawidłową nazwę: ${repo}`);

  // Fallback na basename katalogu roboczego, gdy pole puste (D3, „Źródło instance").
  let instance = typeof source.instance === 'string' ? source.instance.trim() : '';
  if (!instance) instance = root ? path.basename(root) : '';
  if (!instance) errors.push('brak `instance` i nie da się go wywieść z katalogu');
  else if (!NAME_RE.test(instance)) errors.push(`\`instance\` ma nieprawidłową nazwę: ${instance}`);

  const emitsRaw = source.emits && typeof source.emits === 'object' ? source.emits : {};
  const domainRaw = emitsRaw.domain == null ? [] : emitsRaw.domain;
  const domain = Array.isArray(domainRaw) ? domainRaw.map((d) => String(d).trim()).filter(Boolean) : null;
  if (domain === null) errors.push('`emits.domain` musi być listą');
  else {
    for (const item of domain) {
      if (!NAME_RE.test(item)) errors.push(`nieprawidłowy topic domenowy w \`emits.domain\`: ${item}`);
      if (STRUCTURAL_TOPICS.includes(item)) {
        errors.push(
          `\`emits.domain\` nie może zawierać topicu strukturalnego \`${item}\` — dochodzi automatycznie (D2)`,
        );
      }
    }
  }

  const subsRaw = source.subscribes == null ? [] : source.subscribes;
  const subscribes = Array.isArray(subsRaw) ? subsRaw.map((s) => String(s).trim()).filter(Boolean) : null;
  if (subscribes === null) errors.push('`subscribes` musi być listą');
  else {
    for (const entry of subscribes) {
      if (!isValidSubscription(entry)) {
        errors.push(`nieprawidłowa subskrypcja: ${entry} (oczekiwano \`repo/topic\` albo \`repo/*\`)`);
      }
    }
  }

  // Wstrzykiwanie do promptu (faza 6.4) — domyślnie WYŁĄCZONE (D11: „w pilocie
  // wstrzykiwanie jest wyłączone w całości"). Tylko jawne `inject: true` je włącza.
  if (source.inject != null && typeof source.inject !== 'boolean') {
    errors.push('`inject` musi być wartością logiczną (true/false)');
  }

  return {
    manifest: {
      repo,
      instance,
      emits: { domain: domain || [] },
      subscribes: subscribes || [],
      inject: source.inject === true,
    },
    errors,
  };
}

function isValidSubscription(entry) {
  const parts = String(entry).split('/');
  if (parts.length !== 2) return false;
  const [repo, topic] = parts;
  return NAME_RE.test(repo) && (topic === '*' || NAME_RE.test(topic));
}

function splitTopic(topic) {
  const parts = String(topic || '').split('/');
  if (parts.length !== 2 || !NAME_RE.test(parts[0]) || !NAME_RE.test(parts[1])) return null;
  return { repo: parts[0], name: parts[1] };
}

function isStructural(topic) {
  const parsed = splitTopic(topic);
  return !!parsed && STRUCTURAL_TOPICS.includes(parsed.name);
}

/** Topiki, na które ta instancja ma prawo nadawać we własnym prefiksie. */
function ownTopics(manifest) {
  return [...STRUCTURAL_TOPICS, ...manifest.emits.domain].map((name) => `${manifest.repo}/${name}`);
}

/**
 * Czy instancja subskrybuje topic.
 * Własny `<repo>/questions` jest subskrybowany implicit — inaczej nikt nie odpowiadałby
 * na pytania kierowane do repo (ADR, „Reguła implicit").
 */
function subscribesTo(manifest, topic) {
  const parsed = splitTopic(topic);
  if (!parsed) return false;
  if (parsed.repo === manifest.repo && parsed.name === INBOUND_TOPIC) return true;

  return manifest.subscribes.some((entry) => {
    const [repo, name] = entry.split('/');
    return repo === parsed.repo && (name === '*' || name === parsed.name);
  });
}

/**
 * Publikuje kopię manifestu do rejestru. Idempotentne — zapis tylko przy zmianie treści.
 */
function syncRegistry(manifest) {
  paths.ensureLayout();
  const target = paths.registryPath(manifest.instance);
  const payload = {
    repo: manifest.repo,
    instance: manifest.instance,
    emits: manifest.emits,
    subscribes: manifest.subscribes,
    manifest_path: manifest.manifestPath || null,
    updated_at: new Date().toISOString(),
  };

  try {
    const existing = JSON.parse(fs.readFileSync(target, 'utf8'));
    const same =
      existing.repo === payload.repo &&
      JSON.stringify(existing.emits) === JSON.stringify(payload.emits) &&
      JSON.stringify(existing.subscribes) === JSON.stringify(payload.subscribes);
    if (same) return target;
  } catch {
    // brak pliku albo uszkodzony — nadpisujemy
  }

  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, target);
  return target;
}

/** Wszystkie znane instancje (te, które choć raz użyły broadcastu). */
function loadRegistry() {
  let files;
  try {
    files = fs.readdirSync(paths.manifestsDir()).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const entries = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(paths.manifestsDir(), file), 'utf8'));
      if (parsed && parsed.repo && parsed.instance) entries.push(parsed);
    } catch {
      // uszkodzony wpis rejestru nigdy nie wywraca odczytu
    }
  }
  return entries;
}

/**
 * Czy którakolwiek znana instancja repo subskrybuje topic.
 * @returns {'yes'|'no'|'unknown'} `unknown` = repo nie ma ani jednego wpisu w rejestrze
 */
function repoSubscribesTo(registry, repo, topic) {
  const instances = registry.filter((entry) => entry.repo === repo);
  if (instances.length === 0) return 'unknown';

  const parsed = splitTopic(topic);
  if (!parsed) return 'no';

  const covered = instances.some((entry) => {
    if (parsed.repo === entry.repo && parsed.name === INBOUND_TOPIC) return true;
    return (entry.subscribes || []).some((sub) => {
      const [subRepo, subName] = String(sub).split('/');
      return subRepo === parsed.repo && (subName === '*' || subName === parsed.name);
    });
  });

  return covered ? 'yes' : 'no';
}

module.exports = {
  STRUCTURAL_TOPICS,
  INBOUND_TOPIC,
  MANIFEST_RELATIVE_PATH,
  NAME_RE,
  findManifestPath,
  load,
  splitTopic,
  isStructural,
  ownTopics,
  subscribesTo,
  syncRegistry,
  loadRegistry,
  repoSubscribesTo,
};
