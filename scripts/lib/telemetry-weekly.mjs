// scripts/lib/telemetry-weekly.mjs — model raportu tygodniowego (TASK-OBS-017, ADR 0015 D6).
//
// Czysta funkcja: rollupy + ocenione claimy + wpisy rule-history → model { title, meta, sections } w tym samym
// formacie co reszta raportu (`telemetry-report-format.mjs` renderuje go do tekstu i markdownu). Cztery sekcje:
//   1. delta tydzień do tygodnia (w notatce: silniki, które pojawiły się w tygodniu)
//   2. claimy z werdyktem
//   3. jakość danych w tygodniu
//   4. reguły bez claimu (świeże, bez deklaracji, którą metrykę mają poprawić)
// Plik trafia do gita (`telemetry/reports/<RRRR>-W<ww>.md`), więc model nie niesie czasu generowania.

import { METRICS, classify, metricsOf, reportDataQuality, totalsOf } from './telemetry-report.mjs';
import { formatCell } from './telemetry-report-format.mjs';
import { previousWeek, weekRange } from './telemetry-claims.mjs';

const DAY_MS = 86400000;
// Reguła młodsza niż tyle dni, bez claimu, trafia na listę „do uzupełnienia".
export const RECENT_RULE_DAYS = 35;
export const MAX_RULES_LISTED = 30;
const MAX_ENGINES_LISTED = 12;

const inRange = (r, range) => r.day >= range.from && r.day <= range.to;

// Silniki, których pierwszy dzień w rollupach wypada w tygodniu — jedna linia, bo przy zmianie silnika
// niemal z każdym commitem tabela per hash to szum (większość ma po kilka przebiegów).
function enginesNote(rollups, cur) {
  const first = new Map();
  for (const r of rollups) for (const h of Object.keys(r.engines || {})) if (!first.has(h) || r.day < first.get(h)) first.set(h, r.day);
  const runs = new Map();
  for (const r of rollups.filter((x) => inRange(x, cur))) {
    for (const [h, procs] of Object.entries(r.engines || {})) {
      for (const d of Object.values(procs)) runs.set(h, (runs.get(h) || 0) + (Number.isFinite(d.started) ? d.started : 0));
    }
  }
  const fresh = [...first.entries()].filter(([, day]) => day >= cur.from && day <= cur.to)
    .map(([hash, day]) => ({ hash, day, runs: runs.get(hash) || 0 }))
    .sort((a, b) => a.day.localeCompare(b.day) || b.runs - a.runs || a.hash.localeCompare(b.hash));
  if (!fresh.length) return 'Silniki, które pojawiły się w tygodniu: brak.';
  const shown = fresh.slice(0, MAX_ENGINES_LISTED).map((e) => `${e.hash} (od ${e.day.slice(5)}, ${e.runs} przeb.)`).join(', ');
  return `Silniki, które pojawiły się w tygodniu (${fresh.length}): ${shown}${fresh.length > MAX_ENGINES_LISTED ? ', …' : ''}.`;
}

function deltaSection(rollups, cur, prev, week) {
  const pm = metricsOf(totalsOf(rollups.filter((r) => inRange(r, prev))));
  const cm = metricsOf(totalsOf(rollups.filter((r) => inRange(r, cur))));
  return {
    heading: `Delta tydzień do tygodnia i silniki (${week} względem ${previousWeek(cur.from)})`,
    note: [enginesNote(rollups, cur),
      'Szum: zmiana poniżej 20% albo 2 pp; próba poniżej 10 jednostek = insufficient_data. Podział przed/po jednego silnika: `telemetry-report.mjs --engine <hash>`.'].join('\n'),
    columns: [{ key: 'metric', label: 'metryka', fmt: 'text' }, { key: 'before', label: 'poprz. tydzień', fmt: 'pct' }, { key: 'after', label: 'ten tydzień', fmt: 'pct' },
      { key: 'deltaPct', label: 'zmiana', fmt: 'delta' }, { key: 'nBefore', label: 'n poprz.', fmt: 'int' }, { key: 'nAfter', label: 'n teraz', fmt: 'int' },
      { key: 'verdict', label: 'werdykt', fmt: 'text' }],
    rows: METRICS.map((def) => ({ metric: def.label, ...classify(def, pm[def.key], cm[def.key]) })),
  };
}

export function claimsSection(claimResults) {
  const fmt = (c, v) => formatCell(c.claim.metric.startsWith('DEV-') ? 'dens' : 'pct', v);
  const rows = claimResults.map((c) => {
    const bad = c.errors.length > 0;
    return {
      id: c.id, metric: `${c.claim.metric} ${c.claim.direction === 'down' ? '↓' : '↑'} ${Math.round(c.claim.threshold * 100)}%${c.claim.process ? ` (${c.claim.process})` : ''}`, engine: c.claim.engine,
      verdict: bad ? 'błędny claim' : c.result.verdict,
      before: bad ? '–' : fmt(c, c.result.before), after: bad ? '–' : fmt(c, c.result.after),
      runs: bad ? '–' : `${c.result.runsBefore}/${c.result.runsAfter}`,
      share: bad ? '–' : formatCell('pct', c.result.engineShare),
      note: bad ? c.errors.join('; ') : (c.change ? `status: ${c.change.from} → ${c.change.to}` : (c.result.reason || (c.result.trusted ? '' : 'udział silnika poniżej 50%: status bez zmian'))),
    };
  });
  return {
    heading: `Claimy (${rows.length})`,
    note: 'Werdykt: confirmed | no_effect | regressed | insufficient_data (min. 20 przebiegów po każdej stronie). Status rekordu zmienia się tylko gdy w oknie „po" co najmniej połowa przebiegów szła pod hashem claimu.',
    columns: [{ key: 'id', label: 'wpis', fmt: 'text' }, { key: 'metric', label: 'metryka', fmt: 'text' }, { key: 'engine', label: 'silnik', fmt: 'text' },
      { key: 'verdict', label: 'werdykt', fmt: 'text' }, { key: 'before', label: 'przed', fmt: 'text' }, { key: 'after', label: 'po', fmt: 'text' },
      { key: 'runs', label: 'przebiegi przed/po', fmt: 'text' }, { key: 'share', label: 'udział silnika', fmt: 'text' }, { key: 'note', label: 'uwaga', fmt: 'text' }],
    rows,
  };
}

function rulesSection(rules, to) {
  const withClaim = rules.filter((r) => r.claim).length;
  const horizon = new Date(Date.parse(`${to}T00:00:00Z`) - RECENT_RULE_DAYS * DAY_MS).toISOString().slice(0, 10);
  const recent = rules.filter((r) => !r.claim && r.date && r.date >= horizon && r.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return {
    heading: `Reguły bez claimu (świeże: ${recent.length})`,
    note: `Wpisów w rule-history: ${rules.length}, z claimem: ${withClaim}. Lista: reguły z ostatnich ${RECENT_RULE_DAYS} dni bez linii \`**Claim:**\`${recent.length > MAX_RULES_LISTED ? `, pokazano ${MAX_RULES_LISTED}` : ''}. Reguł wstecz nie uzupełniamy hurtem.`,
    columns: [{ key: 'id', label: 'reguła', fmt: 'text' }, { key: 'date', label: 'data', fmt: 'text' }],
    rows: recent.slice(0, MAX_RULES_LISTED),
  };
}

/**
 * @param {object} o
 * @param {string} o.week RRRR-Www
 * @param {object[]} o.rollups wszystkie rollupy (tydzień, poprzedni tydzień i historia silników)
 * @param {object[]} o.claimResults [{ id, claim, errors, result, change? }]
 * @param {object[]} o.rules parseRuleHistory(...)
 */
export function buildWeekly({ week, rollups, claimResults, rules }) {
  const cur = weekRange(week);
  const prev = weekRange(previousWeek(cur.from));
  const weekRollups = rollups.filter((r) => inRange(r, cur));
  const quality = reportDataQuality(weekRollups).sections[0];
  return {
    title: `Raport tygodniowy telemetrii ${week}`,
    meta: `Tydzień ${week}: ${cur.from} … ${cur.to}, rollupów w tygodniu: ${weekRollups.length}`,
    sections: [
      deltaSection(rollups, cur, prev, week),
      claimsSection(claimResults),
      { ...quality, heading: 'Jakość danych w tygodniu' },
      rulesSection(rules, cur.to),
    ],
  };
}
