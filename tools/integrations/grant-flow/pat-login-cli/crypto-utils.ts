import { randomBytes, timingSafeEqual } from 'node:crypto';

// Mirrors src/admin/step-up.ts's own generateState() (crypto.randomBytes, never
// Math.random() — task-spec pt. 3) but is NOT imported from it: this directory is
// deliberately self-contained (D2), so it re-implements this three-line primitive rather
// than reaching across the module boundary this task must not touch (src/admin/).
export function generateState(): string {
  return randomBytes(32).toString('base64url');
}

// Same rationale/shape as src/http/secret-compare.ts's secretMatches(), duplicated here
// for the same self-containment reason as generateState() above. Constant-time: a
// length-dependent early return would leak the state's length, a byte-wise compare would
// leak its prefix — this is the ONLY defence (task-spec pt. 3) against another open
// browser tab racing the real callback with a guessed/observed state value.
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
