/**
 * scripts/lib/answer-reply.mjs — partia pytań, odpowiedź zbiorcza i miara jakości rekomendacji (ANL-057, ANL-059).
 *
 * Zero tokenów. Człowiek odpowiada krótko („ok wszystkie", „ok poza 3 i 5", „2: nie"), a skrypt mówi
 * DOKŁADNIE, które pytanie dostaje jaką odpowiedź i które zostaje otwarte. Agent tylko zapisuje wynik
 * w `answer:`; nie interpretuje odpowiedzi sam (jedyna droga do `answer` prowadzi przez słowa człowieka).
 *
 * Zasady, które kod pilnuje:
 *   • „ok wszystkie" obejmuje WYŁĄCZNIE pytania `bulkEligible` (zweryfikowane źródło, dwudrzwiowe, bez USER_CHALLENGE).
 *   • „ok 2 4" to jawne potwierdzenie wskazanych pytań — działa też dla one-way i nowego wzorca, bo człowiek je wskazał.
 *   • pytanie bez odpowiedzi człowieka zostaje w `hold`; nic nie jest wypełniane domyślnie.
 */

import { recommendedOption } from './answer-evidence.mjs';

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').toLowerCase().trim();
const strip = (s) => String(s ?? '').replace(/\s*\(recommended\)\s*$/i, '').trim();
const isOpen = (q) => q.answer === null || q.answer === undefined;

/**
 * Partia pytań do człowieka: najwyżej `batchSize` naraz. Kolejność: USER_CHALLENGE i one-way, potem TASTE i reszta;
 * w obrębie grupy więcej blokowanych SP (`blocks_sp`) wcześniej, dalej kolejność z artefaktu.
 */
export function selectBatch(questions, { batchSize = 5 } = {}) {
  const open = questions.map((q, i) => ({ q, i })).filter(({ q }) => isOpen(q));
  const rank = ({ q }) => (q.class === 'USER_CHALLENGE' || q.door_type !== 'two-way' ? 0 : q.class === 'TASTE' ? 1 : 2);
  open.sort((a, b) => rank(a) - rank(b) || (Number(b.q.blocks_sp) || 0) - (Number(a.q.blocks_sp) || 0) || a.i - b.i);
  return { batch: open.slice(0, batchSize).map(({ q }) => q), remaining: Math.max(0, open.length - batchSize) };
}

const nums = (s) => [...String(s).matchAll(/\d+/g)].map((m) => Number(m[0]));

function matchOption(q, text) {
  const opts = (Array.isArray(q.options) ? q.options : []).map(strip);
  if (!opts.length) return { free: true, text: String(text).trim() };
  const t = fold(text);
  const exact = opts.find((o) => fold(o) === t);
  if (exact) return { option: exact };
  if (/^[a-z]$/.test(t) && opts[t.charCodeAt(0) - 97]) return { option: opts[t.charCodeAt(0) - 97] };
  const starts = opts.filter((o) => fold(o).startsWith(t) && t.length >= 2);
  if (starts.length === 1) return { option: starts[0] };
  return { none: true };
}

/**
 * @param {string} text   odpowiedź człowieka
 * @param {Array<{q: object, bulkEligible: boolean, bulkReasons?: string[]}>} batch  pytania w kolejności wyświetlenia (numer = indeks + 1)
 * @returns {{ answers: Array<{id: string, answer: string, via: string}>, hold: Array<{id: string, reason: string}>, unparsed: string[] }}
 */
export function parseReply(text, batch) {
  const answers = new Map();
  const hold = new Map();
  const unparsed = [];
  const byNo = (n) => batch[n - 1];
  const setAnswer = (entry, answer, via) => { answers.set(entry.q.id, { id: entry.q.id, answer, via }); hold.delete(entry.q.id); };
  const setHold = (entry, reason) => { if (!answers.has(entry.q.id)) hold.set(entry.q.id, { id: entry.q.id, reason }); };
  const confirm = (entry, via) => {
    const rec = recommendedOption(entry.q);
    if (!rec) { setHold(entry, 'brak rekomendacji do potwierdzenia — odpowiedz wprost'); return; }
    setAnswer(entry, rec, via);
  };

  const segments = String(text ?? '').split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const f = fold(seg);
    let m;
    if ((m = /^(ok|zgoda|akceptuje)(\s+(wszystkie|wszystko))?(\s+(poza|oprocz|z wyjatkiem)\s+(.+))?$/.exec(f))) {
      const except = new Set(m[6] ? nums(m[6]) : []);
      for (const n of except) if (!byNo(n)) unparsed.push(`${seg} (nie ma pytania ${n})`);
      batch.forEach((entry, i) => {
        if (except.has(i + 1)) return setHold(entry, 'wyłączone przez człowieka');
        if (!entry.bulkEligible) return setHold(entry, `wymaga osobnej odpowiedzi: ${(entry.bulkReasons ?? []).join('; ') || 'brak podstawy do hurtowej zgody'}`);
        confirm(entry, 'bulk');
      });
    } else if ((m = /^ok\s+(\d+(?:\s*(?:,|i|oraz)?\s*\d+)*)$/.exec(f))) {
      for (const n of nums(m[1])) {
        if (!byNo(n)) unparsed.push(`${seg} (nie ma pytania ${n})`);
        else confirm(byNo(n), 'explicit-ok');
      }
    } else if ((m = /^(?:ok\s+)?(\d+)\s*[:=-]\s*(.+)$/.exec(seg.normalize('NFC')))) {
      const entry = byNo(Number(m[1]));
      if (!entry) { unparsed.push(`${seg} (nie ma pytania ${m[1]})`); continue; }
      const hit = matchOption(entry.q, m[2]);
      if (hit.none) setHold(entry, `odpowiedź „${m[2].trim()}" nie pasuje do żadnej opcji`);
      else setAnswer(entry, hit.option ?? hit.text, 'explicit');
    } else {
      unparsed.push(seg);
    }
  }
  // pytania, których odpowiedź człowieka w ogóle nie dotknęła, zostają otwarte — jawnie, nie cicho
  for (const entry of batch) if (!answers.has(entry.q.id) && !hold.has(entry.q.id)) hold.set(entry.q.id, { id: entry.q.id, reason: 'bez odpowiedzi' });
  return { answers: [...answers.values()], hold: [...hold.values()], unparsed };
}

/**
 * Miara jakości rekomendacji (ANL-059): ile rekomendacji człowiek odrzucił. Liczy tylko pytania z `rec` i odpowiedzią.
 * Wysoki odsetek = złe rekomendacje albo za słabe źródła, nie „wybredny człowiek".
 */
export function resolveStats(questions) {
  const withRec = questions.filter((q) => typeof q.rec === 'string' && q.rec.trim() && !isOpen(q));
  const out = { rec_total: withRec.length, rec_accepted: 0, rec_rejected: 0, rec_rejected_ratio: null, by_basis: {} };
  for (const q of withRec) {
    const accepted = strip(q.answer) === recommendedOption(q);
    out[accepted ? 'rec_accepted' : 'rec_rejected'] += 1;
    const b = (out.by_basis[q.basis ?? 'unknown'] ??= { total: 0, rejected: 0 });
    b.total += 1;
    if (!accepted) b.rejected += 1;
  }
  if (out.rec_total) out.rec_rejected_ratio = Number((out.rec_rejected / out.rec_total).toFixed(2));
  return out;
}
