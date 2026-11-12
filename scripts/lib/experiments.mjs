// scripts/lib/experiments.mjs — eksperymenty silnika włączane per projekt z claude-patterns (ORC-166).
//
// Po co: opcje `gateDelta` (E2) i `gateDiff` (E3) z TASK-ORC-GATE-COST-001 włącza się dotąd tylko przez
// `--overrides` przy wywołaniu `prepare`, czyli po stronie instancji. Reguły współpracy między projektami
// zabraniają wpisywać cokolwiek w cudzą sesję albo repo bez zgody, a eksperyment na JEDNEJ instancji musi
// być powtarzalny (każdy przebieg tej instancji w tym samym trybie). Plik w claude-patterns załatwia jedno
// i drugie: instancja nic nie zmienia, a wyłączenie to usunięcie wpisu.
//
// Plik: `config/orchestrate-experiments.json`, np. {"juz-ide-api-8": {"gateDelta": true}}.
// Klucz = nazwa katalogu projektu. Dozwolone tylko opcje z ALLOWED i tylko wartości boolowskie.
// Literówka w tym pliku NIE blokuje przebiegu (to konfiguracja eksperymentu, nie wejście zadania):
// zwracamy ostrzeżenia, a nieznane/zepsute pozycje pomijamy. Jawne `--overrides` wygrywa z plikiem.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED = ['gateDelta', 'gateDiff'];
export const EXPERIMENTS_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'orchestrate-experiments.json');

export function loadExperiments(projectDir, file = process.env.ORC_EXPERIMENTS_FILE || EXPERIMENTS_FILE) {
  const result = { options: {}, warnings: [], file };
  if (!existsSync(file)) return result;
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch (e) {
    result.warnings.push(`eksperymenty: nie da się wczytać ${file}: ${e.message} — pomijam`);
    return result;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    result.warnings.push(`eksperymenty: ${file} musi być obiektem { "<projekt>": { opcja: true } } — pomijam`);
    return result;
  }
  const mine = doc[basename(resolve(projectDir))];
  if (mine === undefined) return result;
  if (!mine || typeof mine !== 'object' || Array.isArray(mine)) {
    result.warnings.push('eksperymenty: wpis projektu musi być obiektem — pomijam');
    return result;
  }
  for (const [k, v] of Object.entries(mine)) {
    if (!ALLOWED.includes(k)) result.warnings.push(`eksperymenty: nieznana opcja \`${k}\` (dozwolone: ${ALLOWED.join(', ')}) — pomijam`);
    else if (typeof v !== 'boolean') result.warnings.push(`eksperymenty: \`${k}\` musi być true/false — pomijam`);
    else result.options[k] = v;
  }
  return result;
}
