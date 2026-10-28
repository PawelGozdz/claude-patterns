#!/usr/bin/env node
// scripts/osv-ignore-check.mjs — walidacja wyjątków w .osv-scanner.toml (TASK-GSTACK-ADOPT-001, C1).
//
// Wzorzec z gstack: wyjątek od skanu zależności bez daty wygaśnięcia jest błędem. Wyłączony alert, o którym
// nikt nie pamięta, to dokładnie ten rodzaj długu, który skan miał wykryć. Skrypt czyta tylko te fragmenty
// formatu TOML, których używa osv-scanner (tablice `[[IgnoredVulns]]` i `[[PackageOverrides]]` z prostymi
// polami `klucz = wartość`); pełny parser TOML to przerost formy.
//
// Reguły:
//   [[IgnoredVulns]]      — wymagane: id, ignoreUntil (RRRR-MM-DD, realna data), reason (min. 10 znaków)
//   [[PackageOverrides]]  — gdy `ignore = true`: wymagane effectiveUntil (jw.) i reason (jw.)
//   wygasły wyjątek       — OSTRZEŻENIE (osv-scanner sam przestaje go respektować), nie błąd
//
// Użycie:
//   node scripts/osv-ignore-check.mjs [plik]   # domyślnie .osv-scanner.toml w korzeniu repo; exit 1 przy błędzie

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_REASON = 10;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/;

function parseValue(raw) {
  const t = raw.trim();
  // Literał w cudzysłowie parsujemy PRZED zdjęciem komentarza: `#` wewnątrz cudzysłowu jest treścią.
  const q = t.match(/^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/) || t.match(/^'([^']*)'\s*(?:#.*)?$/);
  if (q) return q[1];
  return t.replace(/\s+#.*$/, '').trim(); // wartość bez cudzysłowu: komentarz po spacji
}

/** Zwraca bloki `[[Nazwa]]` jako [{ table, line, fields }]. */
export function parseBlocks(src) {
  const blocks = [];
  let cur = null;
  src.split('\n').forEach((text, i) => {
    const line = text.trim();
    if (!line || line.startsWith('#')) return;
    const head = line.match(/^\[\[\s*([A-Za-z0-9_.]+)\s*\]\]\s*(?:#.*)?$/);
    if (head) { cur = { table: head[1], line: i + 1, fields: {} }; blocks.push(cur); return; }
    // Linia zaczynająca się od `[[`, której nie rozpoznaliśmy, nie może po cichu wyciszyć luki.
    if (line.startsWith('[[')) { cur = null; blocks.push({ table: '__NIEROZPOZNANY__', line: i + 1, fields: { text: line } }); return; }
    if (/^\[[^\[]/.test(line)) { cur = null; return; } // zwykła tabela [x] — poza zakresem
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (kv && cur) { cur.fields[kv[1]] = parseValue(kv[2]); return; }
    // Zapis inline (`IgnoredVulns = [{ id = "X" }]`) jest poprawnym TOML-em dla osv-scannera, ale nie dla tej walidacji.
    if (kv && /^(IgnoredVulns|PackageOverrides)$/.test(kv[1])) blocks.push({ table: '__INLINE__', line: i + 1, fields: { name: kv[1] } });
  });
  return blocks;
}

function realDate(s) {
  const m = String(s ?? '').match(DATE_RE);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

/** @returns {{ errors: string[], warnings: string[], checked: number }} */
export function validateConfig(src, now = new Date()) {
  const errors = [];
  const warnings = [];
  let checked = 0;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const requireExpiry = (b, key, what) => {
    checked++;
    const at = `linia ${b.line}: ${what}`;
    const reason = b.fields.reason ?? '';
    if (reason.trim().length < MIN_REASON) errors.push(`${at} — brak uzasadnienia (\`reason\`, min. ${MIN_REASON} znaków)`);
    const raw = b.fields[key];
    if (raw === undefined || raw === '') { errors.push(`${at} — brak \`${key}\` (wyjątek bez daty wygaśnięcia jest błędem)`); return; }
    const date = realDate(raw);
    if (!date) { errors.push(`${at} — \`${key} = ${raw}\` nie jest datą RRRR-MM-DD`); return; }
    if (date.getTime() < today) warnings.push(`${at} — \`${key}\` ${raw} już minęło; osv-scanner znów zgłasza ten wpis, usuń wyjątek albo przedłuż z nowym uzasadnieniem`);
  };

  for (const b of parseBlocks(src)) {
    if (b.table === '__NIEROZPOZNANY__') {
      errors.push(`linia ${b.line}: nierozpoznany nagłówek tablicy \`${b.fields.text}\` — zapis \`[[IgnoredVulns]]\` / \`[[PackageOverrides]]\` w osobnej linii`);
    } else if (b.table === '__INLINE__') {
      errors.push(`linia ${b.line}: zapis inline \`${b.fields.name} = [...]\` omija walidację dat wygaśnięcia — użyj bloków \`[[${b.fields.name}]]\``);
    } else if (b.table === 'IgnoredVulns') {
      if (!b.fields.id) { errors.push(`linia ${b.line}: IgnoredVulns bez \`id\``); continue; }
      requireExpiry(b, 'ignoreUntil', `IgnoredVulns ${b.fields.id}`);
    } else if (b.table === 'PackageOverrides' && b.fields.ignore === 'true') {
      const name = b.fields.name || '(bez nazwy)';
      requireExpiry(b, 'effectiveUntil', `PackageOverrides ${name}`);
    }
  }
  return { errors, warnings, checked };
}

function main() {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
  const file = process.argv[2] || join(repo, '.osv-scanner.toml');
  if (!existsSync(file)) {
    process.stderr.write(`✘ osv-ignore-check: brak pliku ${file}\n`);
    process.exit(1);
  }
  const { errors, warnings, checked } = validateConfig(readFileSync(file, 'utf8'));
  for (const w of warnings) process.stderr.write(`⚠ osv-ignore-check: ${w}\n`);
  if (errors.length) {
    for (const e of errors) process.stderr.write(`✘ osv-ignore-check: ${e}\n`);
    process.stderr.write(`✘ osv-ignore-check: ${errors.length} błąd(ów) w ${file}\n`);
    process.exit(1);
  }
  process.stdout.write(`✔ osv-ignore-check: ${checked} wyjątek(ów) z datą wygaśnięcia i uzasadnieniem\n`);
}

// `import.meta.url` jest już po realpath; `argv[1]` nie — bez tego uruchomienie przez symlink kończyło się cicho exit 0.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main();
