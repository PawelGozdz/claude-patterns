/**
 * scripts/lib/resolve-config.mjs — konfiguracja kroku „rozstrzygnij otwarte pytania" w /analyze.
 *
 * Jedno źródło prawdy dla `verify-answer-sources.mjs` i `resolve-finalize.mjs`: skąd brać źródła
 * odpowiedzi, dokąd wolno utrwalić decyzję i jakie limity obowiązują. Czyta wyłącznie
 * `.claude/config/runtime.yml` (materializacja bloków, ADR 0008) — żadnej własnej konfiguracji.
 *
 * Klucze (blok `decision-registry`):
 *   questions_format   file | index | none (domyślnie none = dzisiejszy flow, nic nie jest utrwalane)
 *   questions_dir      katalog plików pytań (format file)
 *   open_questions     plik indeksu pytań (format index) — istniejący parametr bloku
 *   resolution_sink    { tech, product, canon_edit[], link_field } — dokąd trafia decyzja
 *   question_task_link true | { dir, field } — opcjonalnie: pole zadania z listą id pytań (domyślnie awaits_question)
 * Limity: `analyze.resolve` { max_questions, batch_size, auto_accept }. `auto_accept` (ANL-060): brak klucza = wyłączone
 * (runtime.yml sprzed zmiany nie włącza go po cichu); blok `decision-registry` wpisuje domyślnie `true`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveGlobParams } from './param-drift.mjs';

const YAML = (await import('yaml')).default;

export const FORMATS = ['file', 'index', 'none'];
export const DEFAULT_LIMITS = { maxQuestions: 12, batchSize: 10 };

const dirOf = (p) => (p ? String(p).replace(/\/+$/, '') : null);
const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

/**
 * @returns {{ active: boolean, format: 'file'|'index'|'none', warnings: string[], projectDir: string,
 *   questionsDir: string|null, indexFile: string|null, adrDir: string|null, bdrDir: string|null,
 *   sink: { tech: string|null, product: string|null, canonEdit: string[], linkField: string },
 *   taskLink: { dir: string, field: string }|null, lookupRoots: string[], limits: {maxQuestions:number, batchSize:number}, autoAccept: boolean }}
 *   `active: false` = projekt bez bloku decision-registry: krok rozstrzygania jest pomijany, flow bez zmian.
 */
export function loadResolveConfig(projectDir) {
  const rtPath = join(projectDir, '.claude/config/runtime.yml');
  const warnings = [];
  const empty = {
    active: false, format: 'none', warnings, projectDir, questionsDir: null, indexFile: null, adrDir: null, bdrDir: null,
    sink: { tech: null, product: null, canonEdit: [], linkField: 'rozstrzyga' }, taskLink: null, lookupRoots: [],
    limits: { ...DEFAULT_LIMITS }, autoAccept: false,
  };
  if (!existsSync(rtPath)) return empty;
  const rt = YAML.parse(readFileSync(rtPath, 'utf8')) ?? {};
  const reg = rt.params?.['decision-registry'];
  if (!reg) return empty;

  let format = String(reg.questions_format ?? 'none');
  if (!FORMATS.includes(format)) {
    warnings.push(`questions_format "${format}" poza słownikiem ${FORMATS.join('|')} — traktuję jak "none"`);
    format = 'none';
  }
  const questionsDir = dirOf(reg.questions_dir);
  const indexFile = reg.open_questions ? String(reg.open_questions) : null;
  if (format === 'file' && !questionsDir) {
    warnings.push('questions_format: file wymaga questions_dir — traktuję jak "none"');
    format = 'none';
  }
  if (format === 'index' && !indexFile) {
    warnings.push('questions_format: index wymaga open_questions — traktuję jak "none"');
    format = 'none';
  }

  const sinkRaw = reg.resolution_sink && typeof reg.resolution_sink === 'object' ? reg.resolution_sink : {};
  const adrDir = dirOf(reg.adr_dir);
  const bdrDir = dirOf(reg.bdr_dir);
  const sink = {
    tech: dirOf(sinkRaw.tech ?? adrDir),
    product: dirOf(sinkRaw.product ?? bdrDir),
    canonEdit: list(sinkRaw.canon_edit).filter((f) => !/[*?]/.test(f)), // tylko nazwane pliki, nigdy globy
    linkField: String(sinkRaw.link_field ?? 'rozstrzyga'),
  };
  if (list(sinkRaw.canon_edit).some((f) => /[*?]/.test(f))) warnings.push('resolution_sink.canon_edit: glob odrzucony — wymień pliki jawnie');

  // `true` = konwencja juz-ide-api (zadania w project-orchestration/tasks, pole awaits_question); obiekt nadpisuje oba.
  const tl = reg.question_task_link === true ? {} : reg.question_task_link;
  const taskLink = tl && typeof tl === 'object'
    ? { dir: dirOf(tl.dir ?? 'project-orchestration/tasks'), field: String(tl.field ?? 'awaits_question') }
    : null;

  // Korzenie, w których wolno szukać źródła odpowiedzi: lookup_order + katalogi decyzji + pytania + kanon.
  const roots = new Set([...list(reg.lookup_order), adrDir, bdrDir, questionsDir, indexFile].filter(Boolean));
  let canon = list(rt.params?.governance?.canon);
  try {
    const live = resolveGlobParams(projectDir, rt, { block: 'governance', param: 'canon' })[0];
    if (live && !live.error && live.live.length) canon = live.live; // stan teraz, nie migawka setupu (ANL-042)
  } catch { /* migawka wystarczy */ }
  for (const f of canon) roots.add(f);

  const lim = rt.analyze?.resolve ?? {};
  const limits = {
    maxQuestions: Number.isInteger(lim.max_questions) && lim.max_questions > 0 ? lim.max_questions : DEFAULT_LIMITS.maxQuestions,
    batchSize: Number.isInteger(lim.batch_size) && lim.batch_size > 0 ? lim.batch_size : DEFAULT_LIMITS.batchSize,
  };

  const autoRaw = lim.auto_accept;
  const autoAccept = autoRaw === true || String(autoRaw).toLowerCase() === 'true';
  if (autoRaw !== undefined && autoRaw !== null && typeof autoRaw !== 'boolean' && !['true', 'false'].includes(String(autoRaw).toLowerCase())) {
    warnings.push(`analyze.resolve.auto_accept "${autoRaw}" nie jest true/false — traktuję jak false`);
  }

  return { active: true, format, warnings, projectDir, questionsDir, indexFile, adrDir, bdrDir, sink, taskLink, lookupRoots: [...roots], limits, autoAccept };
}
