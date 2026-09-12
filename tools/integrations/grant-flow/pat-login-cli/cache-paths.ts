import { homedir } from 'node:os';
import { join } from 'node:path';

const APP_DIR_NAME = 'iam-pat-cli';

// Task-spec pt. 4: the OS profile cache directory (XDG_CACHE_HOME or its per-platform
// equivalent) — NEVER /tmp (world-readable on most systems, cleared unpredictably), never
// this repo's own directory (the cache is per-machine-user, not per-checkout, and must
// survive a `git clean`), and never a known cloud-synced folder. This deliberately never
// falls back to a bare guess under the home directory for anything OTHER than the
// documented per-platform cache root below — that is what keeps it out of
// OneDrive/iCloud/Dropbox's default sync roots, which live elsewhere under $HOME.
export function resolveCacheRootDir(): string {
  const xdg = process.env['XDG_CACHE_HOME'];
  if (xdg && xdg.trim() !== '') return xdg;

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Caches');
  }
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'];
    return localAppData && localAppData.trim() !== '' ? localAppData : join(homedir(), 'AppData', 'Local');
  }
  // Linux and everything else POSIX-like: the XDG spec's own default when
  // XDG_CACHE_HOME is unset.
  return join(homedir(), '.cache');
}

export function resolveCacheDir(): string {
  return join(resolveCacheRootDir(), APP_DIR_NAME);
}

function sanitizeForFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// One cache file per (iamBaseUrl host, cacheKey) pair — a token minted against one iam
// environment (or scoped to one purpose via cacheKey) must never be handed back for a
// different one just because both share this machine's single cache directory.
export function resolveCacheFilePath(iamBaseUrl: string, cacheKey?: string): string {
  const host = new URL(iamBaseUrl).host;
  const suffix = cacheKey ? `-${sanitizeForFilename(cacheKey)}` : '';
  return join(resolveCacheDir(), `token-${sanitizeForFilename(host)}${suffix}.json`);
}
