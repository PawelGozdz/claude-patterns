/**
 * scripts/lib/resolve-write-scope.mjs — zakres zapisów /analyze po odpowiedzi człowieka (ANL-058).
 *
 * ANL-001 mówiło „zapisy wyłącznie z listy zamkniętej". Utrwalenie decyzji rozszerza tę listę, ale WĄSKO:
 * tylko ścieżki z configu projektu (`resolution_sink`, `questions_dir`, `question_task_link`) i tylko w określony
 * sposób. Ta funkcja jest jedyną definicją zakresu; `resolve-finalize.mjs check-write` odpowiada na nią exit code'em.
 *
 *   create — nowy plik w `sink.tech` / `sink.product` (uchylenie = NOWY wpis, nigdy edycja starego) albo plik pytania
 *   edit   — wyłącznie pliki z `sink.canon_edit` (jawna lista), indeks pytań (format index), pole zadania (question_task_link)
 *   delete — wyłącznie plik pytania w `questions_dir` (zamyka go `resolve-finalize close-questions` po sprawdzeniu BDR/ADR)
 * Format `none`: żadnych zapisów poza artefaktem analizy.
 */

import { normalize } from 'node:path';

const within = (rel, dir) => dir && (rel === dir || rel.startsWith(`${dir}/`));

/**
 * @param {object} cfg  z loadResolveConfig
 * @param {{ path: string, op: 'create'|'edit'|'delete', exists: boolean, taskId: string }} req
 * @returns {{ allowed: boolean, why: string }}
 */
export function checkWrite(cfg, { path, op, exists, taskId }) {
  const rel = normalize(String(path ?? '')).replace(/^\.\//, '');
  const no = (why) => ({ allowed: false, why });
  const yes = (why) => ({ allowed: true, why });
  if (!rel || rel.startsWith('/') || rel.split('/').includes('..')) return no('ścieżka względna, bez ..');
  if (/(^|\/)\.env(\.[^/]*)?$/.test(rel)) return no('pliki .env* są poza zasięgiem');
  if (!['create', 'edit', 'delete'].includes(op)) return no(`nieznana operacja ${op}`);

  if (rel === `project-orchestration/analysis/${taskId}.analysis.md`) {
    return op === 'delete' ? no('artefaktu analizy nie usuwa nikt automatycznie') : yes('artefakt analizy (ANL-001)');
  }
  if (!cfg.active || cfg.format === 'none') return no('questions_format: none — poza artefaktem nie wolno zapisywać niczego');

  // Szczegółowe ścieżki PRZED katalogami ujścia: w juz-ide-api `questions_dir` i indeks pytań leżą wewnątrz `bdr_dir`
  // (docs/decisions/questions), więc sprawdzenie ujścia pierwsze odmawiałoby zamknięcia pytania („tylko nowe wpisy”).
  if (cfg.sink.canonEdit.includes(rel)) {
    if (op !== 'edit') return no('plik kanonu wolno tylko edytować');
    return exists ? yes('kanon z resolution_sink.canon_edit') : no('plik kanonu nie istnieje');
  }
  if (cfg.format === 'file' && within(rel, cfg.questionsDir)) {
    // README i pliki pomocnicze katalogu pytań (`_*`, nie-.md) to nie pytania — adapter ich nie dotyka
    if (!/\.md$/.test(rel) || /^(README|_)/i.test(rel.split('/').pop())) return no('to nie plik pytania (README, pliki pomocnicze) — adapter ich nie dotyka');
    if (op === 'edit') return no('plik pytania nie jest edytowany — nowe pytanie to nowy plik, rozstrzygnięte kasuje close-questions');
    if (op === 'create' && exists) return no('plik pytania już istnieje');
    return yes(op === 'create' ? 'nowe pytanie (questions_dir)' : 'zamknięcie pytania (questions_dir)');
  }
  if (cfg.format === 'index' && rel === cfg.indexFile) return op === 'edit' ? yes('indeks pytań (open_questions)') : no('indeks pytań tylko się edytuje');
  for (const [kind, dir] of [['tech', cfg.sink.tech], ['product', cfg.sink.product]]) {
    if (!within(rel, dir)) continue;
    if (op !== 'create') return no(`${dir}/ przyjmuje tylko NOWE wpisy (uchylenie = nowy wpis, nigdy edycja ani usunięcie starego)`);
    if (exists) return no(`plik ${rel} już istnieje — nowy wpis dostaje nowy numer`);
    return yes(`nowa decyzja ${kind} (resolution_sink.${kind})`);
  }
  if (cfg.taskLink && op === 'edit' && within(rel, cfg.taskLink.dir) && rel.slice(cfg.taskLink.dir.length + 1).startsWith(taskId)) {
    return yes(`pole ${cfg.taskLink.field} zadania ${taskId} (question_task_link) — dopisz TYLKO id pytań`);
  }
  return no('ścieżka spoza configu (resolution_sink, questions_dir, question_task_link)');
}
