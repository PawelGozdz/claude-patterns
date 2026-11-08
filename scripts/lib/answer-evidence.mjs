/**
 * scripts/lib/answer-evidence.mjs — deterministyczna kontrola pytań do człowieka (ANL-054, ANL-055, ANL-056).
 *
 * Zero tokenów. Odpowiada na cztery pytania o `open_questions[]` w artefakcie analizy:
 *   1. Czy cytat z `evidence[]` naprawdę stoi w podanym pliku i linii? (zmyślone „zgodne z BDR-xx" to najgorszy błąd
 *      tego kroku: człowiek ufa podstawie, której nie ma.)
 *   2. Czy pytanie ma kształt z ANL-055: `ask` jedno pytanie, `rec` jedno zdanie z podstawą, razem ≤ 2 zdania?
 *   3. Czy pytanie wolno przyjąć hurtem („ok wszystkie")? Dwudrzwiowe, bez USER_CHALLENGE i flag decyzji; ze zweryfikowanym źródłem
 *      albo (`new-pattern`) techniczne (ANL-057).
 *
 * Cztery pytania: czy pytanie wolno też przyjąć samo (`autoEligible`, ANL-060)? Tylko `canon`/`precedent` ze zweryfikowanym
 * cytatem, dwudrzwiowe, techniczne, bez skutku prawnego/bezpieczeństwa. Reszta zawsze idzie do człowieka.
 *
 * Nie ocenia treści rekomendacji. Decyduje człowiek (ANL-056); wyjątek ANL-060 jest wąski i cofalny.
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

// Słowa, po których pytanie nigdy nie jest „czysto techniczne": retencja, RODO, prawo, bezpieczeństwo. Zachowawcze (fałszywe
// trafienie = pytanie idzie do człowieka, czyli koszt jednego „ok"); brak trafienia nie zastępuje pola `domain`.
const SENSITIVE_RE = /retencj|\brodo\b|gdpr|dane osobow|danych osobow|\bprawn|prawo\b|regulamin|bezpieczeństw|bezpieczenstw|uwierzytel|autoryzac|szyfr|\bpii\b/i;

// Pytanie o PROCES analizy („kontrola nie przeczytała trzech plików", „budżet bramki się skończył") nie jest decyzją człowieka:
// luka przeglądu idzie do `## Przebieg`, nigdy do `open_questions` (ANL-051, ADR 0017 „Poprawka 2026-11-08").
const PROCESS_RE = /kontrol\w* decyzji.{0,60}(?:nie (?:przeczyta|sprawdzi|zdąż)|budżet|limit|niepełn|wynik częściowy)|bramk\w+ (?:decyzji|końcow\w+).{0,40}\bnie (?:przeczyta|sprawdzi|zdąż)|\bnie (?:przeczyta|sprawdzi)\w*.{0,60}\b(?:plik|kontrol|bramk|przegląd)|doczyta\w* (?:brakując|plik\w* z przegląd)|budżet\w* (?:kontrol|narzędzi|bramk|analiz|panel)|luk\w+ (?:w )?przegląd/i;
// Znaczniki podstawy w `rec` („canon", „precedent", „basis: …") — podstawa to tylko „zgodne z BDR-xx / KANON §y" albo „nowy wzorzec".
const BASIS_MARKER_RE = /\b(?:canon|precedent|new-pattern|basis)\b/i;

/**
 * Czy pytanie wolno przyjąć BEZ słów człowieka (ANL-060): `answer` = opcja `(recommended)`, `answered_by: auto`.
 * Niezależne od tego, czy pytanie ma już odpowiedź (używa tego też `orchestrate-prepare` do sprawdzenia `answered_by: auto`).
 * @param {object} q
 * @param {{ cfg: object, decisions?: object[], verified: boolean }} ctx  `verified`: cytat sprawdzony (verify) albo
 *   przynajmniej obecny (prepare nie sprawdza numerów linii po fakcie: utrwalenie decyzji w KANON przesuwa linie).
 * @returns {{ eligible: boolean, reasons: string[] }}
 */
export function autoEligibility(q, { cfg, decisions = [], verified }) {
  const reasons = [];
  const basis = q?.basis;
  if (!cfg?.autoAccept) reasons.push('analyze.resolve.auto_accept wyłączone');
  if (basis !== 'precedent' && basis !== 'canon') reasons.push('podstawa inna niż canon/precedent');
  if (!verified) reasons.push('źródło niezweryfikowane');
  if (q?.door_type !== 'two-way') reasons.push('one-way albo brak door_type (brak = one-way)');
  if (q?.class === 'USER_CHALLENGE') reasons.push('USER_CHALLENGE');
  if (q?.domain !== 'tech') reasons.push('domena inna niż tech (produkt/prawo zawsze człowiek)');
  if (SENSITIVE_RE.test(`${q?.ask ?? ''} ${q?.rec ?? ''} ${q?.q ?? ''}`)) reasons.push('retencja/RODO/prawo/bezpieczeństwo w treści pytania');
  if (q?.decision && flaggedDecisionIds(decisions).has(String(q.decision).toUpperCase())) reasons.push('decyzja z premise_failed/card_conflict');
  if (q?.auto_reverted === true) reasons.push('człowiek cofnął automatyczną odpowiedź');
  if (!recommendedOption(q)) reasons.push('brak jednej opcji (recommended)');
  return { eligible: reasons.length === 0, reasons };
}

/**
 * @param {object} q  pozycja open_questions[]
 * @param {{ cfg: object, decisions?: object[] }} ctx  cfg z loadResolveConfig
 * @returns {{ id: string, problems: string[], processQuestion: boolean, evidence: object[], verified: boolean, bulkEligible: boolean, bulkReasons: string[], autoEligible: boolean, autoReasons: string[] }}
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

  // Pytanie o proces odpada nawet z `decision:` (reguła niżej jest wąska, żeby nie łapać pytań o domenę); pytanie bez `decision:`, `rec`
  // i jawnego `basis` to luka przeglądu (nadmiar ponad max_questions ma `basis: none`, ANL-051).
  const processQuestion = PROCESS_RE.test(`${q?.ask ?? ''} ${q?.q ?? ''}`) || (!hasRec && !q?.decision && q?.basis === undefined);
  if (processQuestion) problems.push('pytanie o proces analizy albo bez `decision:` i `rec` — luka przeglądu idzie do `## Przebieg`, nie do człowieka (ANL-051)');

  if (hasRec) {
    problems.push(...voice.checkRecommendation(q.ask, q.rec));
    if (BASIS_MARKER_RE.test(q.rec)) problems.push('rec zawiera znacznik podstawy (canon/precedent/basis…) — podstawa tylko jako „zgodne z BDR-xx / KANON §y" albo „nowy wzorzec"');
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
  if (basis === 'precedent' || basis === 'canon') {
    if (!verified) bulkReasons.push('źródło niezweryfikowane');
  } else if (basis === 'new-pattern') {
    // nowy wzorzec bez źródła idzie hurtem tylko w domenie tech; product/legal to decyzja właściciela (ANL-057)
    if (q?.domain !== 'tech') bulkReasons.push('nowy wzorzec w domenie produkt/prawo — wymaga osobnej odpowiedzi');
  } else bulkReasons.push('brak podstawy');
  if (q?.door_type !== 'two-way') bulkReasons.push('one-way albo brak door_type (brak = one-way)');
  if (q?.class === 'USER_CHALLENGE') bulkReasons.push('USER_CHALLENGE');
  if (q?.decision && flaggedDecisionIds(decisions).has(String(q.decision).toUpperCase())) bulkReasons.push('decyzja z premise_failed/card_conflict');
  if (!recommendedOption(q)) bulkReasons.push('brak jednej opcji (recommended)');

  const auto = hasRec ? autoEligibility(q, { cfg, decisions, verified }) : { eligible: false, reasons: ['brak rekomendacji'] };
  if (q?.answered_by === 'auto' && !auto.eligible) problems.push(`answered_by: auto bez uprawnień (ANL-060): ${auto.reasons.join('; ')}`);
  if (q?.answered_by === 'auto' && recommendedOption(q) && strip(q?.answer) !== recommendedOption(q)) problems.push('answered_by: auto wymaga answer = opcja (recommended)');
  if (q?.answered_by !== undefined && !['auto', 'human'].includes(q.answered_by)) problems.push(`answered_by "${q.answered_by}" poza słownikiem auto|human`);

  return { id, problems, processQuestion, evidence, verified, bulkEligible: bulkReasons.length === 0, bulkReasons, autoEligible: auto.eligible, autoReasons: auto.reasons };
}
