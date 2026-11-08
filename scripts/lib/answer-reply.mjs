/**
 * scripts/lib/answer-reply.mjs — partia pytań, odpowiedź zbiorcza i miara jakości rekomendacji (ANL-057, ANL-059, ANL-060).
 *
 * Zero tokenów. Człowiek odpowiada krótko („ok", „ok poza 3 i 5", „2: nie", „cofnij 2"), a skrypt mówi
 * DOKŁADNIE, które pytanie dostaje jaką odpowiedź i które zostaje otwarte. Agent tylko zapisuje wynik
 * w `answer:`; nie interpretuje odpowiedzi sam (jedyna droga do `answer` prowadzi przez słowa człowieka,
 * z jednym wąskim wyjątkiem: automatyczne przyjęcie ze zweryfikowanego źródła, ANL-060).
 *
 * Zasady, które kod pilnuje:
 *   • „ok" / „ok wszystkie" / „przyjmuję rekomendacje" / „tak, zatwierdzam rekomendacje" obejmują WYŁĄCZNIE pytania
 *     `bulkEligible` (dwudrzwiowe, bez USER_CHALLENGE i flag decyzji; ze zweryfikowanym źródłem albo nowy wzorzec
 *     w domenie tech, ANL-057). Bez „poza" znaczą też „zatwierdź", o ile po tej odpowiedzi nic nie zostaje otwarte.
 *   • „ok 2 4" to jawne potwierdzenie wskazanych pytań — działa też dla one-way i produktu, bo człowiek je wskazał.
 *   • „zatwierdzam" (bez „rekomendacje") = przyjęcie `bulkEligible` + zatwierdzenie; gdy zostało pytanie one-way/USER_CHALLENGE
 *     albo niepokazane, `approve.granted: false` z numerami w `blockedBy`: status NIE jest zmieniany (ANL-034).
 *   • „cofnij 2" cofa automatyczną odpowiedź nr 2 (lista `auto`, ANL-060): pytanie wraca do człowieka.
 *   • pytanie bez odpowiedzi człowieka zostaje w `hold`; nic nie jest wypełniane domyślnie.
 */

import { recommendedOption } from './answer-evidence.mjs';

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').toLowerCase().trim();
const strip = (s) => String(s ?? '').replace(/\s*\(recommended\)\s*$/i, '').trim();
const isOpen = (q) => q.answer === null || q.answer === undefined;
// fold + bez interpunkcji: „Tak, zatwierdzam rekomendacje!" i „tak zatwierdzam rekomendacje" to to samo zdanie
const plain = (s) => fold(s).replace(/[.,!?;:"„”()]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Partia pytań do człowieka: najwyżej `batchSize` naraz. Kolejność: USER_CHALLENGE i one-way, potem TASTE i reszta;
 * w obrębie grupy więcej blokowanych SP (`blocks_sp`) wcześniej, dalej kolejność z artefaktu.
 * `exclude`: id pytań przyjmowanych automatycznie (ANL-060) — nie trafiają do partii człowieka.
 */
export function selectBatch(questions, { batchSize = 10, exclude = new Set() } = {}) {
  const open = questions.map((q, i) => ({ q, i })).filter(({ q }) => isOpen(q) && !exclude.has(String(q.id)));
  const rank = ({ q }) => (q.class === 'USER_CHALLENGE' || q.door_type !== 'two-way' ? 0 : q.class === 'TASTE' ? 1 : 2);
  open.sort((a, b) => rank(a) - rank(b) || (Number(b.q.blocks_sp) || 0) - (Number(a.q.blocks_sp) || 0) || a.i - b.i);
  return { batch: open.slice(0, batchSize).map(({ q }) => q), remaining: Math.max(0, open.length - batchSize) };
}

/**
 * Jedna linia instrukcji dla człowieka, zgodna z tym, co parser `parseReply` naprawdę zrobi (ANL-040):
 * „ok" (zatwierdza) tylko gdy wszystkie pytania partii są `bulkEligible`; inaczej „ok 1,2 · 3: odpowiedź" — „ok" przyjmuje
 * wskazane numery, reszta (one-way, USER_CHALLENGE, bez źródła) wymaga własnej odpowiedzi. Pusta partia = null.
 * @param {Array<{bulkEligible: boolean}>} batch  w kolejności wyświetlenia (numer = indeks + 1)
 */
export function instructionLine(batch, { remaining = 0 } = {}) {
  if (!batch.length) return null;
  const okNos = batch.flatMap((b, i) => (b.bulkEligible ? [i + 1] : []));
  const ownNos = batch.flatMap((b, i) => (b.bulkEligible ? [] : [i + 1]));
  const parts = ownNos.length
    ? [...(okNos.length ? [`ok ${okNos.join(',')}`] : []), ...ownNos.map((n) => `${n}: odpowiedź`)]
    : ['ok'];
  if (remaining > 0) parts.push(`Zostało ${remaining} pytań, pokażę je po tych`);
  return parts.join(' · ');
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

// Czasowniki zgody: samo „ok"/„zgoda"/„akceptuję" wystarcza; „przyjmuję/biorę/zatwierdzam" tylko razem z „rekomendacje".
const BULK_RE = /^(?:tak )?(ok|okej|zgoda|akceptuje|przyjmuje|biore|zatwierdzam)(?: (wszystkie|wszystko))?(?: (rekomendacj\w+))?(?: (?:poza|oprocz|z wyjatkiem) (.+))?$/;
const NEEDS_REC = new Set(['przyjmuje', 'biore', 'zatwierdzam']);
const APPROVE_RE = /^(?:tak )?zatwierdzam(?: (?:wszystkie|wszystko))?$/;

/**
 * @param {string} text   odpowiedź człowieka
 * @param {Array<{q: object, bulkEligible: boolean, bulkReasons?: string[]}>} batch  pytania w kolejności wyświetlenia (numer = indeks + 1)
 * @param {{ remaining?: number, auto?: Array<{no: number, id: string}> }} [ctx]  `remaining`: pytania poza partią (człowiek
 *   ich nie widział, więc nie da się ich zatwierdzić); `auto`: automatycznie przyjęte odpowiedzi (numeracja dla „cofnij N")
 * @returns {{ answers: Array<{id: string, answer: string, via: string}>,
 *   hold: Array<{no: number, id: string, reason: string}>, reverted: Array<{no: number, id: string}>,
 *   approve: { requested: boolean, granted: boolean, blockedBy: Array<{no: number|null, id: string|null, reason: string}> },
 *   unparsed: string[] }}
 */
export function parseReply(text, batch, { remaining = 0, auto = [] } = {}) {
  const answers = new Map();
  const hold = new Map();
  const reverted = new Map();
  const excluded = new Set();
  const unparsed = [];
  let approveRequested = false;
  let approveAll = false; // „zatwierdzam" bez „rekomendacje": przyjmij bulkEligible na końcu
  const byNo = (n) => batch[n - 1];
  const noOf = (entry) => batch.indexOf(entry) + 1;
  const setAnswer = (entry, answer, via) => { answers.set(entry.q.id, { id: entry.q.id, answer, via }); hold.delete(entry.q.id); };
  const setHold = (entry, reason) => { if (!answers.has(entry.q.id)) hold.set(entry.q.id, { no: noOf(entry), id: entry.q.id, reason }); };
  const confirm = (entry, via) => {
    const rec = recommendedOption(entry.q);
    if (!rec) { setHold(entry, 'brak rekomendacji do potwierdzenia — odpowiedz wprost'); return; }
    setAnswer(entry, rec, via);
  };
  const notBulk = (entry) => `wymaga osobnej odpowiedzi: ${(entry.bulkReasons ?? []).join('; ') || 'brak podstawy do hurtowej zgody'}`;

  const segments = String(text ?? '').split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const g = plain(seg);
    let m;
    if ((m = /^cofnij (.+)$/.exec(g))) {
      const wanted = /^(wszystkie|wszystko)$/.test(m[1]) ? auto.map((a) => a.no) : nums(m[1]);
      if (!wanted.length) unparsed.push(seg);
      for (const n of wanted) {
        const hit = auto.find((a) => a.no === n);
        if (hit) reverted.set(hit.id, { no: hit.no, id: hit.id });
        else unparsed.push(`${seg} (nie ma automatycznej odpowiedzi ${n})`);
      }
    } else if ((m = BULK_RE.exec(g)) && (!NEEDS_REC.has(m[1]) || m[3])) {
      const except = new Set(m[4] ? nums(m[4]) : []);
      for (const n of except) if (!byNo(n)) unparsed.push(`${seg} (nie ma pytania ${n})`);
      batch.forEach((entry, i) => {
        if (except.has(i + 1)) { excluded.add(entry.q.id); return setHold(entry, 'wyłączone przez człowieka'); }
        if (!entry.bulkEligible) return setHold(entry, notBulk(entry));
        confirm(entry, 'bulk');
      });
      if (!except.size) approveRequested = true; // „ok" bez „poza" = przyjmij rekomendacje i zatwierdź, o ile nic nie zostaje
    } else if (APPROVE_RE.test(g)) {
      approveRequested = true;
      approveAll = true;
    } else if ((m = /^ok (\d+(?: (?:i |oraz )?\d+)*)$/.exec(g))) {
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
  if (approveAll) {
    for (const entry of batch) {
      if (answers.has(entry.q.id) || excluded.has(entry.q.id)) continue;
      if (entry.bulkEligible) confirm(entry, 'approve');
      else setHold(entry, notBulk(entry));
    }
  }
  // pytania, których odpowiedź człowieka w ogóle nie dotknęła, zostają otwarte — jawnie, nie cicho
  for (const entry of batch) if (!answers.has(entry.q.id) && !hold.has(entry.q.id)) hold.set(entry.q.id, { no: noOf(entry), id: entry.q.id, reason: 'bez odpowiedzi' });

  const blockedBy = [];
  if (approveRequested) {
    for (const h of hold.values()) blockedBy.push({ no: h.no, id: h.id, reason: h.reason });
    if (remaining > 0) blockedBy.push({ no: null, id: null, reason: `${remaining} pytań poza tą partią — człowiek ich jeszcze nie widział` });
    if (reverted.size) blockedBy.push({ no: null, id: null, reason: 'cofnięte odpowiedzi wróciły do listy pytań' });
  }
  return {
    answers: [...answers.values()],
    hold: [...hold.values()],
    reverted: [...reverted.values()],
    unparsed,
    approve: { requested: approveRequested, granted: approveRequested && blockedBy.length === 0, blockedBy },
  };
}

/**
 * Miara jakości rekomendacji (ANL-059): ile rekomendacji człowiek odrzucił. Liczy tylko pytania z `rec` i odpowiedzią człowieka:
 * odpowiedzi przyjęte automatycznie (ANL-060) nie są jego decyzją i zawyżyłyby akceptację, więc idą osobno do `auto_*`
 * (ile przyjęto samo, ile człowiek cofnął; wysoki `auto_reverted_ratio` = za luźne warunki auto).
 * Wysoki odsetek odrzuceń = złe rekomendacje albo za słabe źródła, nie „wybredny człowiek".
 */
export function resolveStats(questions) {
  const withRec = questions.filter((q) => typeof q.rec === 'string' && q.rec.trim() && !isOpen(q) && q.answered_by !== 'auto');
  const autoReverted = questions.filter((q) => q.auto_reverted === true).length;
  const autoTotal = questions.filter((q) => q.answered_by === 'auto').length + autoReverted;
  const out = {
    rec_total: withRec.length, rec_accepted: 0, rec_rejected: 0, rec_rejected_ratio: null, by_basis: {},
    auto_total: autoTotal, auto_reverted: autoReverted, auto_reverted_ratio: autoTotal ? Number((autoReverted / autoTotal).toFixed(2)) : null,
  };
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
