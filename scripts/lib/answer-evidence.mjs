/**
 * scripts/lib/answer-evidence.mjs — deterministyczna kontrola pytań do człowieka (ANL-054, ANL-055, ANL-056).
 *
 * Zero tokenów. Odpowiada na trzy pytania o `open_questions[]` w artefakcie analizy:
 *   1. Czy cytat z `evidence[]` naprawdę stoi w podanym pliku i linii? (zmyślone „zgodne z BDR-xx" to najgorszy błąd
 *      tego kroku: człowiek ufa podstawie, której nie ma.)
 *   2. Czy pytanie ma kształt z ANL-055: `ask` jedno pytanie, `rec` jedno zdanie z podstawą, razem ≤ 2 zdania?
 *   3. Czy pytanie wolno przyjąć hurtem („ok wszystkie")? Tylko takie, które mają zweryfikowane źródło i są dwudrzwiowe.
 *
 * Nie ocenia treści rekomendacji ani nie podejmuje decyzji. Decyduje człowiek (ANL-056).
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, basename } from 'node:path';
import { createRequire } from 'node:module';

const voice = createRequire(import.meta.url)('../../hooks/check-human-voice.js');

export const BASES = ['precedent', 'canon', 'new-pattern', 'none'];
export const DOMAINS = ['tech', 'product', 'legal'];
export const MIN_QUOTE = 12;

const strip = (s) => String(s ?? '').replace(/\s*\(recommended\)\s*$/i, '').trim();
const squash = (s) => String(s).normalize('NFC').replace(/\s+/g, ' ').trim();

/** Linia 1 z `source: "plik:linia"`. */
export function parseSource(source) {
  const m = /^(.+?):(\d+)$/.exec(String(source ?? '').trim());
  return m ? { path: m[1], line: Number(m[2]) } : null;
}

function underRoot(rel, roots) {
  return roots.some((root) => {
    const r = normalize(root).replace(/\/+$/, '');
    // wpis bez katalogu (np. BUSINESS_RULES.yaml) pasuje po nazwie pliku na dowolnej głębokości
    if (!r.includes('/') && /\.[a-z]+$/i.test(r)) return rel === r || basename(rel) === r;
    return rel === r || rel.startsWith(`${r}/`);
  });
}

/**
 * Sprawdza jeden wpis `evidence`. Cytat musi mieścić się w JEDNEJ linii (po zwinięciu białych znaków).
 * @returns {{ ok: boolean, reason?: string }}
 */
export function verifyEvidence(projectDir, item, roots = []) {
  const src = parseSource(item?.source);
  if (!src) return { ok: false, reason: 'source ma mieć postać plik:linia' };
  const quote = squash(item?.quote ?? '');
  if (quote.length < MIN_QUOTE) return { ok: false, reason: `quote krótszy niż ${MIN_QUOTE} znaków — to nie jest cytat, który coś dowodzi` };
  const rel = normalize(src.path);
  if (rel.startsWith('/') || rel.split('/').includes('..')) return { ok: false, reason: 'ścieżka musi być względna, bez ..' };
  if (/(^|\/)\.env(\.[^/]*)?$/.test(rel)) return { ok: false, reason: 'pliki .env* są poza zasięgiem (reguła deny)' };
  if (roots.length && !underRoot(rel, roots)) return { ok: false, reason: `plik poza źródłami projektu (lookup_order, katalogi decyzji, kanon): ${rel}` };
  const abs = join(projectDir, rel);
  if (!existsSync(abs) || !statSync(abs).isFile()) return { ok: false, reason: `plik nie istnieje: ${rel}` };
  const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
  if (src.line < 1 || src.line > lines.length) return { ok: false, reason: `linia ${src.line} poza plikiem (${lines.length} linii)` };
  if (!squash(lines[src.line - 1]).includes(quote)) return { ok: false, reason: `cytatu nie ma w ${rel}:${src.line}` };
  return { ok: true };
}

const optionsOf = (q) => (Array.isArray(q.options) ? q.options.map(String) : []);
export const recommendedOption = (q) => {
  const marked = optionsOf(q).filter((o) => /\(recommended\)\s*$/i.test(o));
  return marked.length === 1 ? strip(marked[0]) : null;
};

/** Decyzje z flagą kontroli (ANL-049/050) — pytanie sparowane z nimi nigdy nie idzie hurtem. */
function flaggedDecisionIds(decisions = []) {
  return new Set(decisions
    .filter((d) => d && (d.premise_failed === true || (Array.isArray(d.card_conflict) && d.card_conflict.length)
      || (Array.isArray(d.premises) && d.premises.some((p) => p?.holds === false))))
    .map((d) => String(d.id).toUpperCase()));
}

/**
 * @param {object} q  pozycja open_questions[]
 * @param {{ cfg: object, decisions?: object[] }} ctx  cfg z loadResolveConfig
 * @returns {{ id: string, problems: string[], evidence: object[], verified: boolean, bulkEligible: boolean, bulkReasons: string[] }}
 */
export function checkQuestion(q, { cfg, decisions = [] }) {
  const problems = [];
  const id = String(q?.id ?? '?');
  const hasRec = typeof q?.rec === 'string' && q.rec.trim() !== '';
  const basis = q?.basis ?? (hasRec ? undefined : 'none');
  const evidenceRaw = Array.isArray(q?.evidence) ? q.evidence : [];

  if (basis !== undefined && !BASES.includes(basis)) problems.push(`basis "${basis}" poza słownikiem ${BASES.join('|')}`);
  if (hasRec && !basis) problems.push('rec bez basis (precedent | canon | new-pattern)');
  if (basis === 'none' && hasRec) problems.push('basis: none nie ma rec — pytanie bez rekomendacji nie udaje, że ją ma');

  if (hasRec) {
    problems.push(...voice.checkRecommendation(q.ask, q.rec));
    const ask = String(q.ask ?? '').trim();
    if (voice.sentenceCount(ask) !== 1 || !/\?\s*["”]?$/.test(ask)) problems.push('ask to jedno pytanie (jedno zdanie zakończone „?")');
    const askTells = voice.TELLS.filter((t) => t.re.test(ask)).map((t) => t.what);
    if (askTells.length) problems.push(`ask zawiera ${[...new Set(askTells)].join(', ')} — pytanie czyta człowiek, nie kod`);
    if (!recommendedOption(q)) problems.push('rec wymaga options w jednej linii z DOKŁADNIE jedną opcją „(recommended)"');
    if ((basis === 'precedent' || basis === 'canon') && !/zgodne z/i.test(q.rec)) problems.push('basis precedent/canon: rec kończy się „(zgodne z BDR-xx / KANON §y)"');
    if (basis === 'new-pattern' && !/nowy wzorzec/i.test(q.rec)) problems.push('basis new-pattern: rec mówi uczciwie „(nowy wzorzec, oparty o …)"');
  }

  const evidence = evidenceRaw.map((e) => ({ source: e?.source, kind: e?.kind, ...verifyEvidence(cfg.projectDir, e, cfg.lookupRoots) }));
  for (const e of evidence) if (!e.ok) problems.push(`evidence ${e.source ?? '?'}: ${e.reason}`);
  const verified = evidence.length > 0 && evidence.every((e) => e.ok);
  if ((basis === 'precedent' || basis === 'canon') && !verified) problems.push(`basis ${basis} wymaga ≥1 zweryfikowanego evidence — brak źródła to new-pattern albo none`);

  if (cfg.format !== 'none' && !DOMAINS.includes(q?.domain)) problems.push(`brak domain (${DOMAINS.join('|')}) — wskazuje, dokąd trafi decyzja`);
  // Produkt/prawo bez źródła nigdy nie dostaje „zgadniętej" wartości: pytanie żyje u właściciela decyzji (ANL-056).
  if (cfg.format === 'file' && (q?.domain === 'product' || q?.domain === 'legal') && !verified && !q?.question_file) {
    problems.push('produkt/prawo bez zweryfikowanego źródła wymaga pliku pytania (question_file)');
  }

  const bulkReasons = [];
  if (!hasRec) bulkReasons.push('brak rekomendacji');
  if (basis !== 'precedent' && basis !== 'canon') bulkReasons.push('nowy wzorzec albo brak podstawy — wymaga uważnego spojrzenia');
  if (!verified) bulkReasons.push('źródło niezweryfikowane');
  if (q?.door_type !== 'two-way') bulkReasons.push('one-way albo brak door_type (brak = one-way)');
  if (q?.class === 'USER_CHALLENGE') bulkReasons.push('USER_CHALLENGE');
  if (q?.decision && flaggedDecisionIds(decisions).has(String(q.decision).toUpperCase())) bulkReasons.push('decyzja z premise_failed/card_conflict');
  if (!recommendedOption(q)) bulkReasons.push('brak jednej opcji (recommended)');

  return { id, problems, evidence, verified, bulkEligible: bulkReasons.length === 0, bulkReasons };
}
