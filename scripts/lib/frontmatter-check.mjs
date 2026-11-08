/**
 * scripts/lib/frontmatter-check.mjs — twardy test, że frontmatter artefaktu analizy się parsuje (ANL-010, ANL-028).
 *
 * DLACZEGO: `rag: skipped (powód: …)` z nieocytowanym `: ` albo `#` w wartości to błąd YAML (pierwszy) albo
 * cicho obcięta wartość (drugi). Pierwszy wychodził dopiero w `/orchestrate` (exit 2), czyli po całym cyklu
 * analiza → zatwierdzenie. Ta funkcja biegnie na końcu `/analyze`, niezależnie od `analyze.resolve`.
 *
 * Czysta funkcja, bez zapisów. Nie zmienia zachowania `parseFrontmatter` ani `orchestrate-prepare.mjs`.
 */

import { parseDocument } from 'yaml';
import { extractFrontmatterBlock } from './frontmatter.mjs';

// Pola, których wartość bywa jednolinijkowym zdaniem — tam `: ` i ` #` robią szkody najczęściej.
const FREE_TEXT_KEYS = ['rag', 'stack_blocks'];
const REQUIRED_KEYS = ['task', 'status', 'rag'];
const QUOTE_HINT = 'ujmij wartość w cudzysłów ("…") albo w blok `>-`';

function plainScalarWithHash(line, key) {
  const m = line.match(new RegExp(`^${key}:\\s+(.*)$`));
  if (!m) return false;
  const value = m[1].trim();
  if (!value || /^["'>|\[{&*!]/.test(value)) return false; // cytowane, blok, flow — YAML radzi sobie sam
  return /\s#/.test(value); // ` #` w zwykłym skalarze zaczyna komentarz
}

/**
 * @param {string} content pełna treść pliku `*.analysis.md`
 * @returns {{ ok: boolean, problems: { line: number|null, text: string, fix: string }[] }}
 *          `line` = numer linii w CAŁYM pliku (1-based).
 */
export function checkAnalysisFrontmatter(content) {
  const block = extractFrontmatterBlock(content);
  if (!block) {
    return { ok: false, problems: [{ line: 1, text: 'brak frontmatteru (plik ma zaczynać się od linii `---`)', fix: 'dopisz frontmatter wg templates/task-analysis-template.md' }] };
  }
  const rawLines = block.raw.split('\n');
  const fileLine = (rawLine) => rawLine + 1; // +1 za otwierające `---`
  const problems = [];

  const doc = parseDocument(block.raw);
  for (const err of doc.errors) {
    const rawLine = err.linePos?.[0]?.line ?? null;
    const text = rawLine ? rawLines[rawLine - 1] : '';
    const nested = /Nested mappings|compact mappings|Implicit map keys/.test(err.message);
    problems.push({
      line: rawLine ? fileLine(rawLine) : null,
      text: `${err.message.split('\n')[0].replace(/ at line \d+, column \d+:?$/, '')}${text ? ` — „${text.trim().slice(0, 120)}"` : ''}`,
      fix: nested ? `wartość z \`: \` ${QUOTE_HINT}` : 'popraw składnię YAML w tej linii',
    });
  }
  if (problems.length) return { ok: false, problems };

  const data = doc.toJS();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, problems: [{ line: 2, text: 'frontmatter nie jest mapą YAML', fix: 'zacznij od `task: <ID>`' }] };
  }

  rawLines.forEach((line, i) => {
    for (const key of FREE_TEXT_KEYS) {
      if (plainScalarWithHash(line, key)) {
        problems.push({ line: fileLine(i + 1), text: `\`#\` w wartości ${key}: YAML uznaje go za komentarz i ucina wartość — „${line.trim().slice(0, 120)}"`, fix: QUOTE_HINT });
      }
    }
  });
  for (const key of REQUIRED_KEYS) {
    if (data[key] === undefined || data[key] === null || data[key] === '') {
      problems.push({ line: null, text: `brak pola \`${key}\` we frontmatterze`, fix: key === 'rag' ? 'ANL-010: lista zapytań z liczbą trafień albo `rag: "skipped (powód)"`' : 'uzupełnij wg templates/task-analysis-template.md' });
    }
  }
  return { ok: problems.length === 0, problems };
}
