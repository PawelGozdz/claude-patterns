/**
 * Minimalny parser podzbioru YAML — wyłącznie na potrzeby `.claude/config/broadcast.yml`.
 *
 * NIE jest to parser YAML. Obsługuje dokładnie to, czego używa manifest z ADR 0006 (D3):
 *   - mapy z wcięciem 2-spacjowym
 *   - sekwencje blokowe (`- wartość`) — tylko skalary
 *   - tablice inline (`[a, b, c]`)
 *   - komentarze `#`, cudzysłowy pojedyncze i podwójne
 *
 * Wszystko poza tym (kotwice, wielolinijkowe skalary, zagnieżdżone sekwencje map)
 * kończy się błędem z numerem linii — lepszy jawny błąd niż ciche przekłamanie manifestu.
 *
 * Powód, dla którego nie bierzemy `js-yaml`: hooki w tym repo są uruchamiane gołym
 * `node` bez `node_modules` (patrz hooks/hooks.json) — zależność zewnętrzna zabiłaby
 * zasadę „brak manifestu = system nie istnieje, hook kończy exit 0".
 */

class YamlSubsetError extends Error {}

/**
 * @param {string} text zawartość pliku
 * @returns {object} sparsowany dokument (mapa najwyższego poziomu)
 */
function parse(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const entries = [];

  lines.forEach((raw, index) => {
    const line = stripComment(raw);
    if (!line.trim()) return;

    const indent = line.length - line.trimStart().length;
    if (indent % 2 !== 0) {
      throw new YamlSubsetError(`linia ${index + 1}: wcięcie musi być wielokrotnością 2 spacji`);
    }
    if (/^\t/.test(raw)) {
      throw new YamlSubsetError(`linia ${index + 1}: tabulatory nie są dozwolone w YAML`);
    }
    entries.push({ indent, text: line.trim(), line: index + 1 });
  });

  const [value, consumed] = parseBlock(entries, 0, 0);
  if (consumed !== entries.length) {
    throw new YamlSubsetError(`linia ${entries[consumed].line}: nieoczekiwane wcięcie`);
  }
  return value ?? {};
}

function parseBlock(entries, start, indent) {
  if (start >= entries.length) return [null, start];

  if (entries[start].text.startsWith('- ') || entries[start].text === '-') {
    return parseSequence(entries, start, indent);
  }
  return parseMap(entries, start, indent);
}

function parseMap(entries, start, indent) {
  const result = {};
  let i = start;

  while (i < entries.length) {
    const entry = entries[i];
    if (entry.indent < indent) break;
    if (entry.indent > indent) {
      throw new YamlSubsetError(`linia ${entry.line}: nieoczekiwane wcięcie`);
    }

    const match = entry.text.match(/^([^:#]+?):(?:\s+(.*))?$/);
    if (!match) {
      throw new YamlSubsetError(`linia ${entry.line}: oczekiwano "klucz: wartość"`);
    }

    const key = match[1].trim();
    const inline = (match[2] ?? '').trim();
    i++;

    if (inline) {
      result[key] = parseScalar(inline, entry.line);
      continue;
    }

    // Wartość w bloku poniżej (mapa albo sekwencja) — albo pusta.
    const next = entries[i];
    if (!next || next.indent <= indent) {
      const isSequence = next && next.indent === indent && next.text.startsWith('- ');
      if (isSequence) {
        const [value, consumed] = parseSequence(entries, i, indent);
        result[key] = value;
        i = consumed;
        continue;
      }
      result[key] = null;
      continue;
    }

    const [value, consumed] = parseBlock(entries, i, next.indent);
    result[key] = value;
    i = consumed;
  }

  return [result, i];
}

function parseSequence(entries, start, indent) {
  const result = [];
  let i = start;

  while (i < entries.length) {
    const entry = entries[i];
    if (entry.indent < indent) break;
    if (entry.indent > indent || !entry.text.startsWith('-')) {
      throw new YamlSubsetError(`linia ${entry.line}: oczekiwano elementu listy "- wartość"`);
    }

    const item = entry.text.replace(/^-\s*/, '').trim();
    if (!item) {
      throw new YamlSubsetError(
        `linia ${entry.line}: puste elementy listy i listy map nie są obsługiwane w tym podzbiorze`,
      );
    }
    if (/^[^:#]+:(\s|$)/.test(item)) {
      throw new YamlSubsetError(`linia ${entry.line}: listy map nie są obsługiwane w tym podzbiorze`);
    }

    result.push(parseScalar(item, entry.line));
    i++;
  }

  return [result, i];
}

function parseScalar(raw, line) {
  const value = raw.trim();

  if (value.startsWith('[')) {
    if (!value.endsWith(']')) {
      throw new YamlSubsetError(`linia ${line}: niedomknięta tablica inline`);
    }
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => parseScalar(item, line));
  }
  if (value.startsWith('{')) {
    throw new YamlSubsetError(`linia ${line}: mapy inline nie są obsługiwane w tym podzbiorze`);
  }

  if (
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2) ||
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }

  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~' || value === '') return null;
  if (/^-?\d+$/.test(value)) return Number(value);

  return value;
}

/** Usuwa komentarz `#`, nie tykając `#` wewnątrz cudzysłowów. */
function stripComment(line) {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "'" && !inDouble) inSingle = !inSingle;
    else if (char === '"' && !inSingle) inDouble = !inDouble;
    else if (char === '#' && !inSingle && !inDouble) {
      // `#` liczy się jako komentarz tylko na początku linii albo po białym znaku
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i);
    }
  }
  return line;
}

module.exports = { parse, YamlSubsetError };
