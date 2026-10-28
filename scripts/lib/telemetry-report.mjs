// scripts/lib/telemetry-report.mjs — obliczenia raportu nad agregatami dziennymi (TASK-OBS-014, ADR 0015 D6).
//
// Czyste funkcje: tablica rollupów (`readRollups`) → model raportu. Żadnego I/O i zegara, więc eval liczy
// to samo na syntetycznych rollupach. Liczniki sumujemy po hostach i dniach; percentyle `durationMs`
// są per host i nie dają się sumować, dlatego raport ich nie używa.
//
// Model: { title, sections: [{ heading, note?, columns: [{ key, label, fmt }], rows: [...] }] }.
// Tekst i markdown renderuje `telemetry-report-format.mjs` z tego samego modelu; `--json` zwraca model.

// Progi jak w `workflow-metrics-report --regression`: zmiana poniżej 20% to szum.
export const NOISE_PCT = 20;
// Próg próby: poniżej tylu jednostek w którymkolwiek oknie nie wyciągamy wniosku.
export const MIN_N = 10;
// Różnica bezwzględna poniżej 2 pp to szum także wtedy, gdy wartość wyjściowa jest bliska zera.
export const ABS_FLOOR = 0.02;
export const DEFAULT_WINDOW = 7;

const num = (v) => (Number.isFinite(v) ? v : 0);

// Procesy spoza metryk jakości przebiegów: kroki review-panel to statystyka reviewerów (ran/skipped, findingi), bez
// werdyktów, kosztu i zgonów — wliczone do sum „wszystkich procesów" rozcieńczałyby mianowniki `died` i `retryCost`.
// Widać je tylko wprost: `--process review-panel` albo wiersz w widoku `--by process`.
export const NON_RUN_PROCESSES = new Set(['review-panel']);
const inScope = (p, process) => (process ? p === process : !NON_RUN_PROCESSES.has(p));

// Rollup z samym panelem (żadnego innego procesu, przebiegu ani odstępstwa) nie jest dniem „z danymi" dla metryk przebiegów:
// zajmowałby slot okna silnika i zawyżał kolumnę `dni`. Z jawnym `--process review-panel` liczy się normalnie.
const panelOnly = (r) => {
  const procs = Object.keys(r.processes || {});
  return procs.length > 0 && procs.every((p) => NON_RUN_PROCESSES.has(p))
    && Object.keys(r.runs || {}).length === 0 && Object.keys(r.deviations || {}).length === 0;
};
const countsAsDay = (r, process) => process === 'review-panel' || !panelOnly(r);
const ratio = (a, b) => (b > 0 ? a / b : null);

// Metryki jakości z ADR 0012 §6. `n` = liczność próby, od której zależy wiarygodność wartości.
export const METRICS = [
  { key: 'firstPass', label: 'first-pass (jednostki GO w 1. próbie)', better: 'higher', num: 'firstPassGo', den: 'units', n: 'units' },
  { key: 'falseGo', label: 'fałszywe GO', better: 'lower', num: 'falseGo', den: 'goJudged', n: 'goJudged' },
  { key: 'gateNoGo', label: 'NO_GO bramki końcowej', better: 'lower', num: 'gateNoGo', den: 'gateJudged', n: 'gateJudged' },
  { key: 'retryCost', label: 'udział kosztu powtórek', better: 'lower', num: 'costUsdRetried', den: 'costUsd', n: 'steps' },
  { key: 'died', label: 'cichy zgon (kroki)', better: 'lower', num: 'died', den: 'steps', n: 'steps' },
];

/** Suma liczników z rollupów. `process` zawęża do jednego procesu (odstępstwa nie mają procesu, więc wtedy ich pomijamy). */
export function totalsOf(rollups, { process } = {}) {
  const t = {
    days: 0, runs: 0, steps: 0, died: 0, costUsd: 0, costUsdRetried: 0, stepsWithoutCost: 0,
    units: 0, firstPassGo: 0, goJudged: 0, falseGo: 0, gateJudged: 0, gateNoGo: 0,
    causes: {}, deviations: {},
  };
  const days = new Set();
  for (const r of rollups) {
    if (countsAsDay(r, process)) days.add(r.day);
    for (const [p, d] of Object.entries(r.processes || {})) {
      if (!inScope(p, process)) continue;
      t.steps += num(d.steps); t.died += num(d.died); t.costUsd += num(d.costUsd);
      t.costUsdRetried += num(d.costUsdRetried); t.stepsWithoutCost += num(d.stepsWithoutCost);
      const v = d.verification || {};
      t.units += num(v.units); t.firstPassGo += num(v.firstPassGo);
      const verdicts = (d.roles && d.roles.verifier && d.roles.verifier.verdicts) || {};
      t.goJudged += num(verdicts.goJudged); t.falseGo += num(verdicts.falseGo);
      const gate = d.finalGate || {};
      t.gateJudged += num(gate.judged); t.gateNoGo += num(gate.noGo);
      for (const role of Object.values(d.roles || {})) {
        for (const [c, n] of Object.entries(role.causes || {})) t.causes[c] = (t.causes[c] || 0) + num(n);
      }
    }
    for (const [p, d] of Object.entries(r.runs || {})) {
      if (!process || p === process) t.runs += num(d.started);
    }
    if (!process) {
      for (const [sig, d] of Object.entries(r.deviations || {})) t.deviations[sig] = (t.deviations[sig] || 0) + num(d.n);
    }
  }
  t.days = days.size;
  return t;
}

export function metricsOf(t) {
  return Object.fromEntries(METRICS.map((m) => [m.key, { value: ratio(t[m.num], t[m.den]), n: t[m.n] }]));
}

/** Wynik porównania jednej metryki: improved | regressed | noise | insufficient_data. */
export function classify(def, before, after) {
  const out = { before: before.value, after: after.value, nBefore: before.n, nAfter: after.n, deltaPct: null, verdict: 'insufficient_data' };
  if (before.value === null || after.value === null || before.n < MIN_N || after.n < MIN_N) return out;
  const diff = after.value - before.value;
  out.deltaPct = before.value === 0 ? null : (diff / before.value) * 100;
  if (Math.abs(diff) < ABS_FLOOR || (out.deltaPct !== null && Math.abs(out.deltaPct) < NOISE_PCT)) {
    out.verdict = 'noise';
    return out;
  }
  const good = def.better === 'higher' ? diff > 0 : diff < 0;
  out.verdict = good ? 'improved' : 'regressed';
  return out;
}

/** Gęstość odstępstw per sygnatura: wystąpienia na 100 kroków, przed i po. Mniej znaczy lepiej. */
export function compareDeviations(before, after) {
  const sigs = new Set([...Object.keys(before.deviations), ...Object.keys(after.deviations)]);
  const enough = before.steps >= MIN_N && after.steps >= MIN_N;
  const rows = [...sigs].map((sig) => {
    const nb = before.deviations[sig] || 0;
    const na = after.deviations[sig] || 0;
    const db = ratio(nb * 100, before.steps);
    const da = ratio(na * 100, after.steps);
    let verdict = 'insufficient_data';
    let deltaPct = null;
    if (enough) {
      deltaPct = db ? ((da - db) / db) * 100 : null;
      if (Math.max(nb, na) < 3) verdict = 'noise';
      else if (db === 0) verdict = 'regressed';
      else if (da === 0) verdict = 'improved';
      else if (Math.abs(deltaPct) < NOISE_PCT) verdict = 'noise';
      else verdict = da < db ? 'improved' : 'regressed';
    }
    return { sig, nBefore: nb, nAfter: na, before: db, after: da, deltaPct, verdict };
  });
  return rows.sort((a, b) => Math.max(b.nBefore, b.nAfter) - Math.max(a.nBefore, a.nAfter) || a.sig.localeCompare(b.sig));
}

/**
 * Okno przed i po pierwszym dniu, w którym silnik `hash` pojawia się w rollupach. Okna liczone po dniach
 * Z DANYMI (rollup istnieje tylko, gdy coś się działo), po `window` dni z każdej strony.
 * `engineShare` = udział przebiegów pod tym hashem w oknie „po": gdy niski, stary silnik nadal pracuje
 * w części projektów i różnica nie jest czystym efektem zmiany.
 */
export function engineWindows(rollups, hash, { window = DEFAULT_WINDOW, process } = {}) {
  const hits = rollups.filter((r) => r.engines && r.engines[hash] && (!process || r.engines[hash][process]));
  if (!hits.length) return { found: false, hash };
  const firstDay = hits.map((r) => r.day).sort()[0];
  const lastDay = hits.map((r) => r.day).sort().at(-1);
  const days = [...new Set(rollups.filter((r) => countsAsDay(r, process)).map((r) => r.day))].sort();
  const beforeDays = new Set(days.filter((d) => d < firstDay).slice(-window));
  const afterDays = new Set(days.filter((d) => d >= firstDay).slice(0, window));
  const pick = (set) => rollups.filter((r) => set.has(r.day));
  const before = totalsOf(pick(beforeDays), { process });
  const after = totalsOf(pick(afterDays), { process });
  let underHash = 0;
  for (const r of pick(afterDays)) {
    for (const [p, d] of Object.entries((r.engines && r.engines[hash]) || {})) {
      if (!process || p === process) underHash += num(d.started);
    }
  }
  return {
    found: true, hash, firstDay, lastDay, window, process: process || null,
    beforeDays: [...beforeDays], afterDays: [...afterDays], before, after,
    engineShare: ratio(underHash, after.runs),
  };
}

/** ISO 8601: '2026-10-21' → '2026-W43'. */
export function isoWeek(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // pon = 0
  d.setUTCDate(d.getUTCDate() - dow + 3); // czwartek tego tygodnia wyznacza rok ISO
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const QUALITY_COLUMNS = [
  { key: 'days', label: 'dni', fmt: 'int' }, { key: 'runs', label: 'przebiegi', fmt: 'int' }, { key: 'steps', label: 'kroki', fmt: 'int' },
  { key: 'firstPass', label: 'first-pass', fmt: 'pct' }, { key: 'falseGo', label: 'fałsz. GO', fmt: 'pct' },
  { key: 'gateNoGo', label: 'NO_GO bramki', fmt: 'pct' }, { key: 'retryCost', label: 'koszt powtórek', fmt: 'pct' },
  { key: 'died', label: 'zgon', fmt: 'pct' }, { key: 'costUsd', label: 'koszt', fmt: 'usd' },
];

function qualityRow(key, t) {
  const m = metricsOf(t);
  return {
    key, days: t.days, runs: t.runs, steps: t.steps, costUsd: t.costUsd,
    ...Object.fromEntries(METRICS.map((d) => [d.key, m[d.key].value])),
  };
}

function groupRollups(rollups, keyOf) {
  const g = new Map();
  for (const r of rollups) {
    const k = keyOf(r);
    g.set(k, [...(g.get(k) || []), r]);
  }
  return [...g.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

function roleSection(rollups, process) {
  const roles = new Map();
  for (const r of rollups) {
    for (const [p, d] of Object.entries(r.processes || {})) {
      if (!inScope(p, process)) continue;
      for (const [name, role] of Object.entries(d.roles || {})) {
        const cur = roles.get(name) || { key: name, steps: 0, ok: 0, costUsd: 0, causes: 0, other: 0 };
        cur.steps += num(role.n); cur.ok += num((role.outcomes || {}).ok); cur.costUsd += num(role.costUsd);
        for (const [c, n] of Object.entries(role.causes || {})) { cur.causes += num(n); if (c === 'other') cur.other += num(n); }
        roles.set(name, cur);
      }
    }
  }
  return [...roles.values()].sort((a, b) => b.steps - a.steps || a.key.localeCompare(b.key))
    .map((r) => ({ key: r.key, steps: r.steps, ok: ratio(r.ok, r.steps), costUsd: r.costUsd, causes: r.causes, other: ratio(r.other, r.causes) }));
}

function engineSection(rollups, process) {
  const rows = new Map();
  for (const r of rollups) {
    for (const [hash, procs] of Object.entries(r.engines || {})) {
      for (const [p, d] of Object.entries(procs)) {
        if (process && p !== process) continue;
        const k = `${hash}|${p}`;
        const cur = rows.get(k) || { key: hash, process: p, first: r.day, last: r.day, runs: 0, steps: 0, died: 0, costUsd: 0 };
        cur.first = cur.first < r.day ? cur.first : r.day;
        cur.last = cur.last > r.day ? cur.last : r.day;
        cur.runs += num(d.started); cur.steps += num(d.steps); cur.died += num(d.died); cur.costUsd += num(d.costUsd);
        rows.set(k, cur);
      }
    }
  }
  return [...rows.values()].sort((a, b) => a.first.localeCompare(b.first) || a.key.localeCompare(b.key) || a.process.localeCompare(b.process));
}

/** Widok `--by`: engine | process | role | project | week. */
export function reportView(by, rollups, { process } = {}) {
  const common = { title: `Raport telemetrii: widok ${by}` };
  if (by === 'engine') {
    return {
      ...common,
      sections: [{
        heading: 'Silniki (pierwszy i ostatni dzień w rollupach)',
        note: 'Rollup trzyma per silnik tylko przebiegi, kroki, zgony i koszt — jakość (first-pass, fałszywe GO) liczy `--engine <hash>` oknami dni.',
        columns: [{ key: 'key', label: 'silnik', fmt: 'text' }, { key: 'process', label: 'proces', fmt: 'text' },
          { key: 'first', label: 'od', fmt: 'text' }, { key: 'last', label: 'do', fmt: 'text' },
          { key: 'runs', label: 'przebiegi', fmt: 'int' }, { key: 'steps', label: 'kroki', fmt: 'int' },
          { key: 'died', label: 'zgony', fmt: 'int' }, { key: 'costUsd', label: 'koszt', fmt: 'usd' }],
        rows: engineSection(rollups, process),
      }],
    };
  }
  if (by === 'role') {
    return {
      ...common,
      sections: [{
        heading: 'Role',
        columns: [{ key: 'key', label: 'rola', fmt: 'text' }, { key: 'steps', label: 'kroki', fmt: 'int' }, { key: 'ok', label: 'ok', fmt: 'pct' },
          { key: 'costUsd', label: 'koszt', fmt: 'usd' }, { key: 'causes', label: 'z przyczyną', fmt: 'int' }, { key: 'other', label: 'w tym other', fmt: 'pct' }],
        rows: roleSection(rollups, process),
      }],
    };
  }
  let groups;
  const counted = rollups.filter((r) => countsAsDay(r, process));
  if (by === 'project') groups = groupRollups(counted, (r) => r.project).map(([k, rs]) => [k, totalsOf(rs, { process })]);
  else if (by === 'week') groups = groupRollups(counted, (r) => isoWeek(r.day)).map(([k, rs]) => [k, totalsOf(rs, { process })]);
  else if (by === 'process') {
    const names = [...new Set(rollups.flatMap((r) => Object.keys(r.processes || {})))].sort();
    groups = names.map((p) => [p, totalsOf(rollups, { process: p })]);
    // Panel nie ma zgonów ani kosztu (to statystyka reviewerów): „0.0%" i „$0.00" udawałyby pomiar, więc pokazujemy „–".
    const blank = new Set(names.filter((p) => NON_RUN_PROCESSES.has(p)));
    return {
      ...common,
      sections: [{
        heading: 'Per process',
        columns: [{ key: 'key', label: 'process', fmt: 'text' }, ...QUALITY_COLUMNS],
        rows: groups.map(([k, t]) => (blank.has(k) ? { ...qualityRow(k, t), died: null, costUsd: null } : qualityRow(k, t))),
      }],
    };
  } else throw new Error(`--by musi być jednym z: engine, process, role, project, week (jest: ${by})`);
  return {
    ...common,
    sections: [{
      heading: by === 'week' ? 'Tydzień do tygodnia' : `Per ${by}`,
      columns: [{ key: 'key', label: by === 'week' ? 'tydzień' : by, fmt: 'text' }, ...QUALITY_COLUMNS],
      rows: groups.map(([k, t]) => qualityRow(k, t)),
    }],
  };
}

/** `--engine <hash>`: delta przed/po dla metryk jakości i gęstości odstępstw. */
export function reportEngine(rollups, hash, opts = {}) {
  const w = engineWindows(rollups, hash, opts);
  if (!w.found) {
    return { title: `Silnik ${hash}`, sections: [{ heading: 'Brak danych', note: `Silnik ${hash} nie występuje w rollupach${opts.process ? ` (proces ${opts.process})` : ''}.`, columns: [], rows: [] }], window: w };
  }
  const bm = metricsOf(w.before);
  const am = metricsOf(w.after);
  const rows = METRICS.map((def) => ({ metric: def.label, ...classify(def, bm[def.key], am[def.key]) }));
  const short = w.beforeDays.length < w.window || w.afterDays.length < w.window;
  const notes = [
    `Silnik ${hash}: pierwszy dzień ${w.firstDay}, ostatni ${w.lastDay}. Okno przed: ${w.beforeDays.length} dni z danymi, po: ${w.afterDays.length} (cel ${w.window}).`,
    `Przebiegi pod tym silnikiem w oknie po: ${w.engineShare === null ? '–' : `${Math.round(w.engineShare * 100)}%`} (poniżej 100% = część pracy szła jeszcze starym silnikiem).`,
    `Szum: zmiana poniżej ${NOISE_PCT}% albo ${ABS_FLOOR * 100} pp; próba poniżej ${MIN_N} jednostek = insufficient_data.`,
  ];
  if (short) notes.push('Okno krótsze niż zamierzone — wnioski wstępne.');
  return {
    title: `Silnik ${hash}: przed i po`,
    sections: [
      {
        heading: 'Metryki jakości', note: notes.join('\n'),
        columns: [{ key: 'metric', label: 'metryka', fmt: 'text' }, { key: 'before', label: 'przed', fmt: 'pct' }, { key: 'after', label: 'po', fmt: 'pct' },
          { key: 'deltaPct', label: 'zmiana', fmt: 'delta' }, { key: 'nBefore', label: 'n przed', fmt: 'int' }, { key: 'nAfter', label: 'n po', fmt: 'int' },
          { key: 'verdict', label: 'werdykt', fmt: 'text' }],
        rows,
      },
      {
        heading: 'Gęstość odstępstw (na 100 kroków)',
        note: opts.process ? 'Pominięte przy --process: odstępstwa w rollupie nie mają procesu, więc nie da się ich policzyć na kroki jednego procesu.' : undefined,
        columns: [{ key: 'sig', label: 'sygnatura', fmt: 'text' }, { key: 'before', label: 'przed', fmt: 'dens' }, { key: 'after', label: 'po', fmt: 'dens' },
          { key: 'deltaPct', label: 'zmiana', fmt: 'delta' }, { key: 'nBefore', label: 'n przed', fmt: 'int' }, { key: 'nAfter', label: 'n po', fmt: 'int' },
          { key: 'verdict', label: 'werdykt', fmt: 'text' }],
        rows: compareDeviations(w.before, w.after).slice(0, 15),
      },
    ],
    window: { hash: w.hash, firstDay: w.firstDay, beforeDays: w.beforeDays, afterDays: w.afterDays, engineShare: w.engineShare },
  };
}

/**
 * `--data-quality`: cztery liczniki jakości danych z ADR 0012. Dwa pierwsze wprost z rollupów; „bez engine" to
 * różnica start-ów przebiegów i start-ów przypisanych silnikowi (w tym samym rollupie), a „bez taskRef" to
 * różnica start-ów orchestrate+analyze i przebiegów w bloku `tasks` (klucz bloku to dzień ostatniego run.end,
 * więc na granicach okna wynik jest przybliżony).
 */
export function reportDataQuality(rollups) {
  let causeTotal = 0; let causeOther = 0; let devTotal = 0; let devOther = 0;
  let steps = 0; let noCost = 0; let started = 0; let withEngine = 0; let taskable = 0; let taskRuns = 0;
  for (const r of rollups) {
    for (const [p, d] of Object.entries(r.processes || {})) {
      if (NON_RUN_PROCESSES.has(p)) continue;
      steps += num(d.steps); noCost += num(d.stepsWithoutCost);
      for (const role of Object.values(d.roles || {})) {
        for (const [c, n] of Object.entries(role.causes || {})) { causeTotal += num(n); if (c === 'other') causeOther += num(n); }
      }
    }
    for (const d of Object.values(r.deviations || {})) { devTotal += num(d.n); if (d.cause === 'other') devOther += num(d.n); }
    const engineStarts = {};
    for (const procs of Object.values(r.engines || {})) {
      for (const [p, d] of Object.entries(procs)) engineStarts[p] = (engineStarts[p] || 0) + num(d.started);
    }
    for (const [p, d] of Object.entries(r.runs || {})) {
      started += num(d.started);
      withEngine += Math.min(num(d.started), engineStarts[p] || 0);
      if (p === 'orchestrate' || p === 'analyze') taskable += num(d.started);
    }
    for (const t of Object.values(r.tasks || {})) taskRuns += num(t.runs) + num(t.analyzeRuns);
  }
  const withoutTask = Math.max(0, taskable - taskRuns);
  const rows = [
    { metric: 'udział `other` w cause (kroki)', value: ratio(causeOther, causeTotal), num: causeOther, den: causeTotal, note: 'role.causes ze wszystkich procesów' },
    { metric: 'udział `other` w cause (odstępstwa)', value: ratio(devOther, devTotal), num: devOther, den: devTotal, note: 'kategoria zgłoszeń deviation' },
    { metric: 'kroki bez kosztu', value: ratio(noCost, steps), num: noCost, den: steps, note: 'stepsWithoutCost / steps' },
    { metric: 'przebiegi bez engine', value: ratio(started - withEngine, started), num: started - withEngine, den: started, note: 'start-y przebiegów bez przypisanego silnika' },
    { metric: 'przebiegi bez taskRef', value: ratio(withoutTask, taskable), num: withoutTask, den: taskable, note: 'przybliżenie: orchestrate+analyze względem bloku tasks' },
  ];
  return {
    title: 'Jakość danych telemetrii',
    sections: [{
      heading: 'Liczniki jakości danych',
      columns: [{ key: 'metric', label: 'miara', fmt: 'text' }, { key: 'value', label: 'udział', fmt: 'pct' }, { key: 'num', label: 'licznik', fmt: 'int' },
        { key: 'den', label: 'mianownik', fmt: 'int' }, { key: 'note', label: 'uwaga', fmt: 'text' }],
      rows,
    }],
  };
}
