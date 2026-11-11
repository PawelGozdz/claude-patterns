// scripts/lib/script-offload.mjs — wynosi z args wyemitowanego skryptu Workflow to, co nie musi w nim siedzieć.
//
// Po co: okno „Run a dynamic workflow?" pokazuje skrypt do 200 000 znaków (zob. script-minify.mjs).
// Skrypt Workflow nie ma filesystemu, więc treść kart reguł trzeba było wklejać w args (ORC-044), a to
// 96 KB z 178 KB args w największym przebiegu. Gdy całość się nie mieści, karty idą do plików obok
// skryptu, a prompt agenta każe je wczytać jednym Readem (`renderCards` w szablonie, tryb pliku).
//
// Stopnie (każdy kolejny dopiero, gdy poprzedni nie wystarczył — małe zadania zostają z wbudowaną
// treścią, czyli ze sprawdzoną ścieżką ORC-044):
//   1. `patterns[].content` → pliki `cards-<warstwaBazowa>.md` + `cards-__all.md`,
//   2. `canon.refs[].text` → null (renderCanon już mówi „przeczytaj plik sam, jednym Readem").
// `task.decisions[]` i `layers[]` zostają w skrypcie: silnik czyta je w kodzie, nie tylko w promptach.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cardsFor, cardsForVerifier, baseId } from '../workflow/orchestrate-core.mjs';

export const OFFLOAD_STEPS = ['patterns', 'canon-refs'];

function bundleText(cards) {
  return cards
    .map((p) => '--- ' + p.path + (p.card ? ' (karta reguł)' : ' (PEŁNY wzorzec — karty brak)') + ' ---\n' + p.content)
    .join('\n') + '\n';
}

// Zwraca NOWY obiekt `out` (bez mutacji wejścia) z wyniesionymi kartami; pliki zapisuje w `dir`.
export function offloadPatterns(out, dir) {
  mkdirSync(dir, { recursive: true });
  const bundles = {};
  const write = (key, cards, mapKey = key) => {
    if (!cards.length) return;
    const file = join(dir, `cards-${key}.md`);
    writeFileSync(file, bundleText(cards));
    bundles[mapKey] = file;
  };
  const keys = [...new Set((out.layers ?? []).map((l) => baseId(l)))];
  for (const key of keys) {
    write(key, cardsFor(out, key));
    write(`verify-${key}`, cardsForVerifier(out, key), `verify:${key}`);
  }
  write('__all', out.patterns ?? []);
  return {
    ...out,
    cardBundles: bundles,
    patterns: (out.patterns ?? []).map(({ content: _omit, ...rest }) => rest),
  };
}

export function offloadCanonRefs(out) {
  if (!out.canon?.refs?.length) return out;
  return { ...out, canon: { ...out.canon, refs: out.canon.refs.map((r) => ({ ...r, text: null })) } };
}

export function applyOffload(out, steps, dir) {
  let cur = out;
  if (steps.includes('patterns')) cur = offloadPatterns(cur, dir);
  if (steps.includes('canon-refs')) cur = offloadCanonRefs(cur);
  return cur;
}
