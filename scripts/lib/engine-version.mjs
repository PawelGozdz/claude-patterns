// scripts/lib/engine-version.mjs — wersja silnika claude-patterns do pola `engine` w `run.start` (ADR 0012).
//
// Zmiany w claude-patterns wchodzą do wszystkich projektów naraz (symlinki), więc zdarzenie musi
// nieść stan repo, który je wygenerował — inaczej „przed i po zmianie orchestratora" to tylko data.
// Bez gita (kopia bez .git, brak binarki) → null; to nie jest błąd.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHORT_HASH = /^[0-9a-f]{7,40}$/;

export function engineVersion(repoRoot = REPO_ROOT) {
  try {
    const out = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
    return SHORT_HASH.test(out) ? out : null;
  } catch {
    return null;
  }
}
