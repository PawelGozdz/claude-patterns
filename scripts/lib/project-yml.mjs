#!/usr/bin/env node
// Jeden parser `project.yml` dla skryptów basha (K65, TASK-KAIZEN-002).
//
// Użycie:
//   node scripts/lib/project-yml.mjs <project.yml> get  <ścieżka.kropkowana>
//   node scripts/lib/project-yml.mjs <project.yml> list <ścieżka.kropkowana>
//
// Po co: `yml_get`/`yml_list` istniały w trzech kopiach grep/sed
// (`setup-project.sh`, `generate-claude-md.sh`, `migrate-v2.sh`) i już się
// rozjechały — kopia z `generate-claude-md.sh` ucinała komentarz inline
// (`stack_profile: nestjs-ddd  # szablon`), pozostałe dwie wciągały go do
// wartości. Ten sam plik dawał więc dwie różne odpowiedzi zależnie od tego,
// który skrypt akurat pytał. ADR 0008 nazywa ręczny parser najsłabszym miejscem
// systemu; `materialize-runtime.mjs` od początku czyta ten plik prawdziwym
// parserem, więc źródłem prawdy jest tu pakiet `yaml`.
//
// Dlaczego CLI, a nie import: `setup-project.sh` (1074 linie) i
// `generate-claude-md.sh` zostają na razie w bashu — port do Node to osobny
// task. Do tego czasu bash woła ten moduł przez `node` i dostaje dokładnie to,
// co widzi Node.
//
// Kody wyjścia:
//   0 — wartość wypisana na stdout
//   1 — klucza nie ma (albo lista jest pusta); stdout pusty, stderr cichy —
//       to normalny wynik dla pola opcjonalnego, dlatego bash woła z `|| true`
//   2 — błąd realny: brak pliku, niepoprawny YAML, złe użycie (opis na stderr)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const USAGE = 'użycie: project-yml.mjs <project.yml> get|list <ścieżka.kropkowana>';

/** Parsuje plik albo rzuca — wołający decyduje, czy to błąd twardy. */
export function loadProjectYml(file) {
  if (!existsSync(file)) throw new Error(`brak pliku: ${file}`);
  try {
    return YAML.parse(readFileSync(file, 'utf8')) ?? {};
  } catch (e) {
    throw new Error(`niepoprawny YAML w ${file}: ${e.message}`);
  }
}

/** Schodzi po ścieżce kropkowanej; `undefined`, gdy któregoś ogniwa nie ma. */
export function resolvePath(doc, dotted) {
  return String(dotted)
    .split('.')
    .filter(Boolean)
    .reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), doc);
}

/**
 * Formatowanie skalara pod basha. Listy proste zostają w formie `[a, b, c]` —
 * dokładnie tak, jak zwracały kopie grep/sed, bo `setup-project.sh` liczy na to
 * przy `broadcast.emits` (`tr -d '[] '` → `a,b,c`). Zmiana tej formy zepsułaby
 * wywołanie CLI broadcastu po cichu.
 */
export function formatScalar(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    if (value.some((v) => v !== null && typeof v === 'object')) return null;
    return `[${value.map((v) => String(v)).join(', ')}]`;
  }
  if (typeof value === 'object') return null;
  return String(value);
}

export function main(argv) {
  const [file, mode, dotted] = argv;
  if (!file || !mode || !dotted) { console.error(USAGE); return 2; }
  if (mode !== 'get' && mode !== 'list') { console.error(USAGE); return 2; }

  let doc;
  try { doc = loadProjectYml(file); } catch (e) { console.error(e.message); return 2; }

  const value = resolvePath(doc, dotted);
  if (value === undefined || value === null) return 1;

  if (mode === 'get') {
    const out = formatScalar(value);
    if (out === null) {
      console.error(`${dotted}: wartość nie jest skalarem ani listą prostą — użyj trybu \`list\``);
      return 2;
    }
    process.stdout.write(`${out}\n`);
    return 0;
  }

  if (!Array.isArray(value)) { console.error(`${dotted}: to nie jest lista`); return 2; }
  if (!value.length) return 1;
  for (const item of value)
    // Element złożony (np. `contexts:` z polami name/status/tests) nie ma sensownej
    // formy jednolinijkowej — JSON jest jedyną, która nie gubi informacji.
    process.stdout.write(`${item !== null && typeof item === 'object' ? JSON.stringify(item) : String(item)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exit(main(process.argv.slice(2)));
