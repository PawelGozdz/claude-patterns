#!/usr/bin/env node
// Waliduje blocks/**/*.yml wobec schemas/block.schema.json (K110, 2026-09-07).
// Bez ajv (jedyną zależnością repo jest `yaml`) — sprawdzamy to, co schemat deklaruje
// wprost: wymagane klucze, dozwolone klucze najwyższego poziomu, enumy pól skalarnych.
// Po co: schemat bloku bez konsumenta rozjeżdża się z materialize-runtime.mjs tak samo,
// jak rozjechał się hooks.schema.json. Ten walidator jest tym konsumentem.
//   node scripts/ci/validate-blocks.mjs      # exit 1 przy błędzie
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const YAML = (await import('yaml')).default;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const schema = JSON.parse(readFileSync(join(REPO, 'schemas/block.schema.json'), 'utf8'));
const allowed = new Set(Object.keys(schema.properties ?? {}));
const required = schema.required ?? ['name'];
const enums = Object.fromEntries(Object.entries(schema.properties ?? {})
  .filter(([, v]) => Array.isArray(v.enum)).map(([k, v]) => [k, v.enum]));

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (f.endsWith('.yml') && !f.startsWith('_')) yield p;
  }
}

const errors = [];
let count = 0;
for (const file of walk(join(REPO, 'blocks'))) {
  count++;
  const rel = relative(REPO, file);
  let doc;
  try { doc = YAML.parse(readFileSync(file, 'utf8')); }
  catch (e) { errors.push(`${rel}: niepoprawny YAML — ${e.message.split('\n')[0]}`); continue; }
  if (!doc || typeof doc !== 'object') { errors.push(`${rel}: pusty dokument`); continue; }
  for (const k of required) if (!(k in doc)) errors.push(`${rel}: brak wymaganego klucza \`${k}\``);
  for (const k of Object.keys(doc)) if (!allowed.has(k)) errors.push(`${rel}: nieznany klucz \`${k}\` (schemas/block.schema.json)`);
  for (const [k, vals] of Object.entries(enums)) if (k in doc && !vals.includes(doc[k])) errors.push(`${rel}: \`${k}: ${doc[k]}\` poza słownikiem ${vals.join('|')}`);
  const expectName = rel.replace(/^blocks\//, '').replace(/\.yml$/, '');
  if (doc.name && doc.name !== expectName) errors.push(`${rel}: \`name: ${doc.name}\` ≠ ścieżka \`${expectName}\``);
}

if (errors.length) { console.error(errors.join('\n')); console.error(`\n${errors.length} błąd(ów) w ${count} blokach`); process.exit(1); }
console.log(`✔ validate-blocks: ${count} bloków zgodnych ze schemas/block.schema.json`);
