/**
 * scripts/lib/frontmatter.mjs — jeden parser frontmatteru dla walidatorów CI.
 *
 * DLACZEGO OSOBNY MODUŁ: przed K103 każdy walidator albo nie parsował frontmatteru
 * w ogóle (`validate-commands`, `validate-skills`), albo miał własny naiwny
 * `split(':')` (`validate-agents`), który gubił wartości wieloliniowe (`description: |`),
 * listy blokowe i cudzysłowy. Trzy kopie parsera to trzy różne odpowiedzi na pytanie
 * „czy ten plik ma pole X" — dokładnie ten rodzaj rozjazdu, który audyt 2026-09-07
 * wypunktował przy `project.yml` (A8).
 *
 * ESM, ale walidatory w `scripts/ci/` są CJS (`require`). Node ≥ 22 potrafi
 * `require()` modułu ESM bez top-level await — i tak ten moduł jest ładowany.
 * Nie dodawaj tu `await` na poziomie modułu, bo to zepsuje stronę CJS.
 */

import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';

/**
 * Wyciąga surowy blok frontmatteru.
 * @returns {{ raw: string, startLine: number, endLine: number } | null}
 *          startLine = numer linii pierwszego `---` (1-based), endLine = zamykającego.
 */
export function extractFrontmatterBlock(content) {
  const clean = content.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return { raw: lines.slice(1, i).join('\n'), startLine: 1, endLine: i + 1 };
    }
  }
  return null;
}

/**
 * Parsuje frontmatter pliku markdown.
 *
 * @returns {{ data: object, raw: string, endLine: number, error: string|null } | null}
 *          null = brak frontmatteru. `error` ≠ null = blok jest, ale YAML się nie parsuje
 *          (wtedy `data` pochodzi z awaryjnego parsera key:value — walidator ma co
 *          raportować zamiast wywalić się stack trace'em).
 */
export function parseFrontmatter(content) {
  const block = extractFrontmatterBlock(content);
  if (!block) return null;

  try {
    const parsed = parseYaml(block.raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { data: parsed, raw: block.raw, endLine: block.endLine, error: null };
    }
    return { data: {}, raw: block.raw, endLine: block.endLine, error: 'frontmatter nie jest mapą YAML' };
  } catch (err) {
    return { data: naiveParse(block.raw), raw: block.raw, endLine: block.endLine, error: err.message.split('\n')[0] };
  }
}

/** Awaryjny parser `klucz: wartość` — tylko dla plików z niepoprawnym YAML-em. */
function naiveParse(raw) {
  const out = {};
  for (const line of raw.split('\n')) {
    if (/^\s/.test(line) || !line.trim() || line.trimStart().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

/** Wczytuje i parsuje plik. Zwraca `null` przy braku frontmatteru. */
export function readFrontmatter(filePath) {
  return parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Numer linii (1-based, w całym pliku) deklaracji klucza we frontmatterze.
 * Zwraca 1, gdy klucza nie ma — komunikat `plik:1` wskazuje wtedy na sam frontmatter.
 */
export function frontmatterKeyLine(raw, key) {
  const lines = raw.split('\n');
  const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 2; // +1 za otwierające `---`, +1 na 1-based
  }
  return 1;
}

/**
 * Normalizuje pole, które bywa listą YAML albo stringiem po przecinkach
 * (`tools: Read, Glob` vs `tools:\n  - Read`).
 */
export function asList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Numer linii pierwszego wystąpienia wzorca w treści (1-based); 0 gdy brak. */
export function lineOf(content, needle) {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return 0;
}
