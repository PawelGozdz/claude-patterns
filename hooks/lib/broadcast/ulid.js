/**
 * ULID — sortowalny identyfikator wiadomości (ADR 0006, model wiadomości).
 *
 * Sortowalność leksykograficzna jest tu wymaganiem funkcjonalnym, nie ozdobą:
 * kursor (D6) porównuje `id` między segmentami dziennymi, więc kolejność
 * leksykograficzna musi odpowiadać chronologicznej.
 *
 * 26 znaków Crockford base32: 10 znaków czasu (48 bitów ms) + 16 znaków losowości (80 bitów).
 * Bez zależności zewnętrznych — hooki w tym repo nie mają node_modules.
 */

const crypto = require('crypto');

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: bez I, L, O, U
const TIME_LEN = 10;
const RANDOM_LEN = 16;
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function encodeTime(ms, len = TIME_LEN) {
  if (!Number.isFinite(ms) || ms < 0) throw new Error(`ulid: nieprawidłowy czas ${ms}`);
  let value = Math.floor(ms);
  let out = '';
  for (let i = 0; i < len; i++) {
    const mod = value % 32;
    out = ENCODING[mod] + out;
    value = (value - mod) / 32;
  }
  return out;
}

function encodeRandom(len = RANDOM_LEN) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ENCODING[bytes[i] & 31];
  return out;
}

function ulid(seedTime = Date.now()) {
  return encodeTime(seedTime) + encodeRandom();
}

function isUlid(value) {
  return typeof value === 'string' && ULID_RE.test(value);
}

/** Znacznik czasu zakodowany w ULID-zie (ms epoch) albo null dla niepoprawnego id. */
function ulidTime(value) {
  if (!isUlid(value)) return null;
  let ms = 0;
  for (const char of value.slice(0, TIME_LEN)) {
    const digit = ENCODING.indexOf(char);
    if (digit < 0) return null;
    ms = ms * 32 + digit;
  }
  return ms;
}

module.exports = { ulid, isUlid, ulidTime, ENCODING };
