/**
 * Claim wykonawcy (ADR 0006, D4) — atomowe rozstrzygnięcie, KTÓRA instancja repo
 * wykonuje obowiązek z wiadomości (`owner` jest per repo, a instancji jest kilka).
 *
 * `open(O_CREAT|O_EXCL|O_WRONLY)` na wspólnym filesystemie: wygrywa dokładnie jedna,
 * pozostałe widzą claim i kończą na ACK. Claim leży poza repozytoriami, więc działa
 * niezależnie od stanu branchy.
 *
 * UWAGA na dwie role `O_EXCL` w ADR: D0 rezerwuje ZASÓB (numer migracji) przed pracą,
 * tutaj rozstrzygamy WYKONAWCĘ konkretnej wiadomości. To jest ścieżka standardowa dla
 * każdej wiadomości z niepustym `owner`, nie awaryjna.
 */

const fs = require('fs');
const path = require('path');

const paths = require('./paths');

/**
 * @returns {{acquired: boolean, holder: object|null, path: string}}
 *          `acquired: false` + `holder` = ktoś inny już działa.
 */
function tryClaim(messageId, instance) {
  paths.ensureLayout();
  const target = paths.claimPath(messageId);
  const payload = { instance, ts: new Date().toISOString(), pid: process.pid };

  let fd;
  try {
    fd = fs.openSync(target, 'wx'); // 'wx' = O_CREAT | O_EXCL | O_WRONLY
  } catch (err) {
    if (err.code === 'EEXIST') return { acquired: false, holder: read(messageId), path: target };
    throw err;
  }

  try {
    fs.writeSync(fd, `${JSON.stringify(payload)}\n`);
  } finally {
    fs.closeSync(fd);
  }

  return { acquired: true, holder: payload, path: target };
}

function read(messageId) {
  try {
    return JSON.parse(fs.readFileSync(paths.claimPath(messageId), 'utf8'));
  } catch {
    return null;
  }
}

function exists(messageId) {
  return fs.existsSync(paths.claimPath(messageId));
}

/** Wszystkie claimy — `/broadcast-status` raportuje wiadomości z `owner`, ale bez claimu. */
function listAll() {
  try {
    return fs.readdirSync(paths.claimsDir()).map((file) => ({
      messageId: file,
      holder: (() => {
        try {
          return JSON.parse(fs.readFileSync(path.join(paths.claimsDir(), file), 'utf8'));
        } catch {
          return null;
        }
      })(),
    }));
  } catch {
    return [];
  }
}

module.exports = { tryClaim, read, exists, listAll };
