import { mkdir, readFile, writeFile, rename, rm, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolveCacheFilePath } from './cache-paths.js';
import type { CachedToken } from './types.js';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

export async function readCachedToken(iamBaseUrl: string, cacheKey?: string): Promise<CachedToken | null> {
  const filePath = resolveCacheFilePath(iamBaseUrl, cacheKey);

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return null;
    throw err;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isCachedTokenShape(parsed) ? parsed : null; // unrecognised shape -> treat as "no cache"
  } catch {
    return null; // corrupt file (e.g. a torn write that somehow survived) -> same fallback
  }
}

export async function writeCachedToken(iamBaseUrl: string, cacheKey: string | undefined, token: string): Promise<void> {
  const filePath = resolveCacheFilePath(iamBaseUrl, cacheKey);
  const dir = dirname(filePath);

  await mkdir(dir, { recursive: true });
  // Task-spec pt. 4: chmod EXPLICITLY, never rely on umask — mkdir's own `mode` option is
  // still subject to the process umask, so passing one there would not actually guarantee
  // 0700.
  await chmod(dir, DIR_MODE);

  const cached: CachedToken = { token, issuedAt: new Date().toISOString() };
  // Task-spec pt. 4: tmp-write + rename() in the SAME directory, never an in-place write —
  // rename() is atomic on a given filesystem, so a second CLI instance racing this one
  // always observes either the old file or the fully-written new one, never a half-written
  // one. The random suffix keeps two concurrent writers from colliding on the same tmp name.
  const tmpPath = `${filePath}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(tmpPath, JSON.stringify(cached), { mode: FILE_MODE });
  await chmod(tmpPath, FILE_MODE); // same umask caveat as the directory chmod above
  await rename(tmpPath, filePath);
}

export async function deleteCachedToken(iamBaseUrl: string, cacheKey?: string): Promise<void> {
  const filePath = resolveCacheFilePath(iamBaseUrl, cacheKey);
  await rm(filePath, { force: true });
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

function isCachedTokenShape(value: unknown): value is CachedToken {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)['token'] === 'string' &&
    typeof (value as Record<string, unknown>)['issuedAt'] === 'string'
  );
}
