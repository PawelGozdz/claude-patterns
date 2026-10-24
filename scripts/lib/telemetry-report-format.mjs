// scripts/lib/telemetry-report-format.mjs — render modelu raportu (telemetry-report.mjs) do tekstu i markdownu.
//
// Model z `telemetry-report.mjs`: { title, meta?, sections: [{ heading, note?, columns, rows }] }. Oba formaty
// powstają z tego samego modelu, więc terminal i plik `--md` (konsument: TASK-OBS-017) pokazują te same liczby.
// Raport nie niesie czasu generowania: plik w gicie ma się zmieniać tylko wraz z danymi.

const FORMATTERS = {
  text: (v) => (v === null || v === undefined || v === '' ? '–' : String(v)),
  int: (v) => (Number.isFinite(v) ? String(Math.round(v)) : '–'),
  pct: (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '–'),
  usd: (v) => (Number.isFinite(v) ? `$${v.toFixed(2)}` : '–'),
  dens: (v) => (Number.isFinite(v) ? v.toFixed(2) : '–'),
  delta: (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(0)}%` : '–'),
};

export function formatCell(fmt, value) {
  return (FORMATTERS[fmt] || FORMATTERS.text)(value);
}

const cellsOf = (section) => section.rows.map((row) => section.columns.map((c) => formatCell(c.fmt, row[c.key])));

function textTable(section) {
  const header = section.columns.map((c) => c.label);
  const body = cellsOf(section);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => (section.columns[i].fmt === 'text' ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ').trimEnd();
  return [line(header), widths.map((w) => '─'.repeat(w)).join('  '), ...body.map(line)];
}

export function renderText(model) {
  const out = [model.title];
  if (model.meta) out.push(model.meta);
  for (const s of model.sections) {
    out.push('', s.heading);
    if (s.note) out.push(...s.note.split('\n').map((l) => `  ${l}`));
    if (s.columns.length) out.push(...(s.rows.length ? textTable(s).map((l) => `  ${l}`) : ['  (brak danych)']));
  }
  return `${out.join('\n')}\n`;
}

const mdEscape = (s) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderMarkdown(model) {
  const out = [`# ${model.title}`];
  if (model.meta) out.push('', `_${model.meta}_`);
  for (const s of model.sections) {
    out.push('', `## ${s.heading}`);
    if (s.note) out.push('', ...s.note.split('\n').map((l) => `- ${l}`));
    if (!s.columns.length) continue;
    if (!s.rows.length) { out.push('', '_brak danych_'); continue; }
    out.push('', `| ${s.columns.map((c) => c.label).join(' | ')} |`,
      `| ${s.columns.map((c) => (c.fmt === 'text' ? ':--' : '--:')).join(' | ')} |`,
      ...cellsOf(s).map((r) => `| ${r.map(mdEscape).join(' | ')} |`));
  }
  return `${out.join('\n')}\n`;
}
