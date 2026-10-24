// scripts/lib/inbox-claims.mjs — claimy ze skrzynki i rule-history oraz zmiana statusu rekordu po werdykcie
// (TASK-OBS-017, ADR 0015 D6).
//
// Czytanie: rekord skrzynki z polem `claim` (obiekt YAML) i wpisy rule-history z linią `**Claim:**`.
// Zapis: wyłącznie linie `status:` i towarzyszące pola daty. Rekordy bywają edytowane ręcznie w triage
// (bloki `>` w `resolution:`), więc NIE przepisujemy frontmattera przez YAML.stringify — zmieniamy tekst.
// Skrypt nigdy nie commituje ani nie staguje: zmianę statusu commituje człowiek.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INBOX_DIR, readInboxEntries } from './inbox.mjs';
import { normalizeClaim, parseRuleHistory, validateClaim } from './telemetry-claims.mjs';

/** [{ source: 'inbox'|'rule-history', id, file, status, claim, errors }]; rekord z błędnym claimem trafia z `errors`. */
export function collectClaims({ inboxDir = INBOX_DIR, historyText = '' } = {}) {
  const out = [];
  for (const row of readInboxEntries(inboxDir)) {
    if (!row.claim) continue;
    const errors = validateClaim(row.claim);
    out.push({
      source: 'inbox', id: row.id || row.file.replace(/\.md$/, ''), file: row.file, status: row.status || null,
      claim: errors.length ? row.claim : normalizeClaim(row.claim), errors,
    });
  }
  for (const r of parseRuleHistory(historyText)) {
    if (r.claim) out.push({ source: 'rule-history', id: r.id, file: null, status: null, claim: r.claim, errors: r.claimErrors });
  }
  return out;
}

/**
 * Jaką zmianę statusu uzasadnia werdykt. Tylko rekordy skrzynki z poprawnym claimem i tylko gdy werdykt jest
 * zaufany (`result.trusted`: w oknie „po" dość przebiegów szło pod claimowanym haszem):
 *   confirmed + promoted            → resolved
 *   regressed + promoted|resolved   → proposed (reopen jak w report-deviation)
 */
export function statusChangeFor(entry, result) {
  if (entry.source !== 'inbox' || entry.errors.length || !result.trusted) return null;
  if (result.verdict === 'confirmed' && entry.status === 'promoted') return { to: 'resolved' };
  if (result.verdict === 'regressed' && (entry.status === 'promoted' || entry.status === 'resolved')) return { to: 'proposed', reopen: true };
  return null;
}

const OWN_FIELDS = /^(resolved_at|resolved_by|reopened_at|reopened_from_status):.*\r?\n?/gm;

/** Zapisuje zmianę statusu w pliku rekordu. Zwraca { changed, from, to }. */
export function applyStatusChange(entry, change, today, inboxDir = INBOX_DIR) {
  const file = join(inboxDir, entry.file);
  const raw = readFileSync(file, 'utf8');
  const m = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!m || !/^status:/m.test(m[2])) return { changed: false, from: entry.status, to: entry.status };
  const from = (m[2].match(/^status:\s*(\S+)/m) || [])[1];
  const extra = change.reopen
    ? [`reopened_at: ${today}`, `reopened_from_status: ${from}`]
    : [`resolved_at: ${today}`, 'resolved_by: telemetry-report'];
  const head = m[2].replace(OWN_FIELDS, '').replace(/^status:.*$/m, ['status: ' + change.to, ...extra].join('\n'));
  writeFileSync(file, raw.replace(m[0], `${m[1]}${head}${m[3]}`));
  return { changed: true, from, to: change.to };
}
