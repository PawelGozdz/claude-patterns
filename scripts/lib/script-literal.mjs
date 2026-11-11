// scripts/lib/script-literal.mjs — literał JS z krótkimi liniami do wbudowania `args` w skrypt Workflow (ORC-165).
//
// Okno „Run a dynamic workflow?" (Claude Code 2.1.322) sanityzuje skrypt i obcina KAŻDĄ linię dłuższą niż 4096 znaków
// znacznikiem „… [+N graphemes]"; skrypt z takim znacznikiem uznaje za już obcięty i nie pozwala go zatwierdzić
// („cannot be shown in full — approval is unavailable"), choć całość jest krótsza niż 200 000 znaków. JSON w jednej
// linii albo karta reguł jako jeden długi string są więc niedopuszczalne. Długi string idzie jako łańcuch kawałków
// `"…" +` w osobnych liniach; kawałki liczone po punktach kodowych, więc nie rozcinamy par zastępczych (emoji).

export const CHUNK = 1200;

function piece(x) {
  return JSON.stringify(x).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function jsString(str) {
  if (str.length <= CHUNK) return piece(str);
  const cps = Array.from(str);
  const parts = [];
  for (let i = 0; i < cps.length; i += CHUNK) parts.push(piece(cps.slice(i, i + CHUNK).join('')));
  return '(' + parts.join(' +\n') + ')';
}

export function jsLiteral(v) {
  if (typeof v === 'string') return jsString(v);
  if (Array.isArray(v)) return v.length ? '[\n' + v.map((x) => jsLiteral(x === undefined ? null : x)).join(',\n') + '\n]' : '[]';
  if (v && typeof v === 'object') {
    const ent = Object.entries(v).filter(([, x]) => x !== undefined);
    return ent.length ? '{\n' + ent.map(([k, x]) => `${JSON.stringify(k)}: ${jsLiteral(x)}`).join(',\n') + '\n}' : '{}';
  }
  return JSON.stringify(v ?? null);
}

export function longestLine(text) {
  let max = 0;
  for (const l of text.split('\n')) if (l.length > max) max = l.length;
  return max;
}
