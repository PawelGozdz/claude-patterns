// scripts/workflow/orchestrate-core.mjs — czysta logika kanonicznego skryptu Workflow,
// wystawiona jako zwykły moduł Node, żeby dało się ją testować BEZ uruchamiania Workflow.
// (TASK-KAIZEN-002 / K93)
//
// ─── Dlaczego wycinanie, a nie drugi plik z tymi samymi funkcjami ─────────────────
// Skrypt Workflow nie ma `import` ani dostępu do filesystemu, więc nie może zaciągnąć
// modułu w czasie wykonania. Zostają dwie drogi: (a) skopiować funkcje tutaj i pilnować,
// żeby obie kopie się nie rozjechały, albo (b) trzymać JEDNO źródło w skrypcie i wyciąć
// z niego blok do testów. (a) rozjeżdża się zawsze — a rozjazd akurat tutaj znaczy, że
// eval przechodzi na kodzie, którego przebieg nie wykonuje. Stąd (b).
//
// Wycinany jest blok między sentinelami `// >>> CORE` i `// <<< CORE` w
// `orchestrate.template.mjs`. Blok jest z założenia czysty: zero `agent()`, zero `args`,
// zero wywołań asynchronicznych — same funkcje budujące prompty i podejmujące decyzje.
// `new Function` PARSUJE i wykonuje wyłącznie ten fragment; reszta skryptu (pętla, wywołania
// agentów) nigdy tu nie trafia.
//
// Eksport jest wyliczany z deklaracji najwyższego poziomu wyciętego bloku, nie z ręcznej
// listy — dopisanie funkcji do CORE nie wymaga pamiętania o tym pliku.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_PATH = join(HERE, 'orchestrate.template.mjs');

const BEGIN = '// >>> CORE';
const END = '// <<< CORE';

export function extractCoreSource(templateSource) {
  const from = templateSource.indexOf(BEGIN);
  const to = templateSource.indexOf(END);
  if (from === -1 || to === -1 || to < from) {
    throw new Error(`orchestrate.template.mjs: brak sentineli ${BEGIN} / ${END} — core nieodczytywalny`);
  }
  return templateSource.slice(from + BEGIN.length, to);
}

function buildCore(coreSource) {
  // Deklaracje najwyższego poziomu = te bez wcięcia. Wcięte `const` żyją wewnątrz funkcji
  // i nie są częścią API core'u.
  const names = [...coreSource.matchAll(/^(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)]
    .map((m) => m[1]);
  const unique = [...new Set(names)];
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${coreSource}\nreturn { ${unique.join(', ')} };`);
  return factory();
}

const core = buildCore(extractCoreSource(readFileSync(TEMPLATE_PATH, 'utf8')));

export default core;
export const {
  DEFAULTS,
  modelFor,
  budgetFor,
  layerPlan,
  cardsFor,
  renderCards,
  scopeBlock,
  buildImplPrompt,
  buildProbePrompt,
  buildDiffProbePrompt,
  buildVerifierPrompt,
  buildFinalGatePrompt,
  decideVerdict,
  formatViolations,
  layerTouches,
  deltaGateFails,
  CHECKS_SCHEMA,
  DIFF_PROBE_SCHEMA,
  IMPL_SCHEMA,
  VERDICT_SCHEMA,
} = core;
