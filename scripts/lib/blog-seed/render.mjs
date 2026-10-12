// scripts/lib/blog-seed/render.mjs — payload (już wyczyszczony) → plik *.seed.md i scalanie (ADR 0013).
//
// Plik jest kontraktem dla modelu piszącego wpis, dlatego każda pozycja niesie etykietę:
// FAKT (wolno twierdzić), HIPOTEZA (agent — oznaczać), WNIOSEK (z odpowiedzi autora —
// potwierdzić przed użyciem w 1. osobie). "Czego nie wiem" jest zawsze obecne: bez jawnych
// luk model piszący zaczyna je wypełniać zmyśleniami.
//
// Scalanie (ten sam dedup_key): sekcje generatora są podmieniane, ale `## Pytania do autora`
// (tam autor odpisuje) i pola należące do człowieka (status, created, draft_path, linki)
// zostają nietknięte.

import YAML from 'yaml';
import { parseFrontmatter } from '../frontmatter.mjs';

export const SECTIONS = [
  'Kontekst',
  'Fakty',
  'Decyzja i alternatywy',
  'Co poszło nie tak',
  'Dowody',
  'Liczby',
  'Hipoteza (agent)',
  'Czego nie wiem',
  'Pytania do autora',
  'Proponowany kształt',
];
export const AUTHOR_SECTION = 'Pytania do autora';
export const REQUIRED_NONEMPTY = ['Fakty', 'Dowody', 'Czego nie wiem'];
export const EMPTY = '_brak_';

const LABEL = { fact: 'FAKT', hypothesis: 'HIPOTEZA', inference: 'WNIOSEK' };
const ORIGIN = { measured: 'zmierzone', estimated: 'oszacowane', external: 'zewnętrzne' };
const oneLine = (s) => String(s).replace(/\s*\n\s*/g, ' ').trim();
const cell = (s) => oneLine(s || '').replace(/\|/g, '\\|');

function item(it, fallback = 'fact') {
  if (typeof it === 'string') return `- [${LABEL[fallback]}] ${oneLine(it)}`;
  return `- [${LABEL[it.label] || LABEL[fallback]}] ${oneLine(it.text)}`;
}

const list = (arr, fallback) => (arr && arr.length ? arr.map((x) => item(x, fallback)).join('\n') : EMPTY);

function decisionSection(d) {
  if (!d) return EMPTY;
  const lines = [];
  if (d.choice) lines.push(`- [FAKT] Wybór: ${oneLine(d.choice)}`);
  for (const a of d.alternatives || []) lines.push(`- [FAKT] Odrzucone: ${oneLine(a.option)} — powód: ${oneLine(a.why_rejected)}`);
  for (const u of d.unknowns_then || []) lines.push(item(u).replace(/^- \[(\w+)\] /, '- [$1] Niewiadoma w chwili decyzji: '));
  return lines.length ? lines.join('\n') : EMPTY;
}

function evidenceSection(ev) {
  const head = '| Twierdzenie | Typ | Pochodzenie | Forma publiczna |\n|---|---|---|---|';
  return `${head}\n${ev.map((e) => `| ${cell(e.claim)} | ${e.type} | ${ORIGIN[e.origin]} | ${cell(e.public_form || e.claim)} |`).join('\n')}`;
}

function numbersSection(nums) {
  if (!nums || !nums.length) return EMPTY;
  return nums.map((n) => `- [FAKT] ${oneLine(n.value)} — ${oneLine(n.what)} (pochodzenie: ${ORIGIN[n.origin]})`).join('\n');
}

function questionsSection(qs) {
  if (!qs || !qs.length) return EMPTY;
  return qs.map((q) => `- question: ${JSON.stringify(oneLine(q))}\n  answer: null`).join('\n');
}

function shapeSection(shape, suggested) {
  const lines = [];
  for (const o of (shape && shape.openings) || []) lines.push(`- [FAKT] Możliwe otwarcie: ${oneLine(o)}`);
  lines.push(`- Format: ${suggested.format}; filar: ${suggested.pillar}; długość: ${suggested.length} słów`);
  for (const x of (shape && shape.do_not_use) || []) lines.push(`- NIE UŻYWAĆ: ${oneLine(x)}`);
  return lines.join('\n');
}

/** Sekcje ciała z wyczyszczonej treści payloadu. */
export function buildSections(content, suggested) {
  return {
    Kontekst: list(content.context, 'fact'),
    Fakty: list(content.facts, 'fact'),
    'Decyzja i alternatywy': decisionSection(content.decision),
    'Co poszło nie tak': list(content.went_wrong, 'fact'),
    Dowody: evidenceSection(content.evidence),
    Liczby: numbersSection(content.numbers),
    'Hipoteza (agent)': list(content.hypothesis, 'hypothesis'),
    'Czego nie wiem': content.unknowns.map((u) => `- ${oneLine(u)}`).join('\n'),
    'Pytania do autora': questionsSection(content.questions),
    'Proponowany kształt': shapeSection(content.shape, suggested),
  };
}

export function renderSeed(fm, title, sections) {
  const body = SECTIONS.map((h) => `## ${h}\n\n${sections[h] || EMPTY}`).join('\n\n');
  return `---\n${YAML.stringify(fm, { lineWidth: 0 })}---\n\n# ${oneLine(title)}\n\n${body}\n`;
}

/** { fm, title, sections } z istniejącego pliku albo null, gdy frontmatter się nie parsuje. */
export function parseSeed(content) {
  const parsed = parseFrontmatter(content);
  if (!parsed || parsed.error) return null;
  const body = content.split('\n').slice(parsed.endLine).join('\n');
  const title = (body.match(/^# (.+)$/m) || [])[1] || '';
  const sections = {};
  for (const p of body.split(/^## /m).slice(1)) {
    const nl = p.indexOf('\n');
    const head = (nl === -1 ? p : p.slice(0, nl)).trim();
    sections[head] = (nl === -1 ? '' : p.slice(nl + 1)).trim();
  }
  return { fm: parsed.data, title, sections, endLine: parsed.endLine };
}

const union = (a = [], b = []) => [...new Set([...a, ...b])];

/**
 * Scalenie przy ponownym trafieniu dedup_key. Nowe = treść generatora; z istniejącego
 * zostaje wszystko, co należy do człowieka.
 */
export function mergeSeed(existing, fresh) {
  const old = existing.fm;
  const fm = {
    ...fresh.fm,
    seed_id: old.seed_id,
    created: old.created,
    // Jedyny awans, który robi generator: new → candidate. Resztę statusów zmienia człowiek.
    status: old.status === 'new' && fresh.fm.status === 'candidate' ? 'candidate' : old.status,
    draft_path: old.draft_path ?? null,
    links: {
      related_seeds: union(old.links && old.links.related_seeds, fresh.fm.links.related_seeds),
      related_posts: union(old.links && old.links.related_posts, fresh.fm.links.related_posts),
    },
    target: { ...fresh.fm.target, sibling_seed: (old.target && old.target.sibling_seed) || fresh.fm.target.sibling_seed },
    author_input: ['asked', 'provided'].includes(old.author_input && old.author_input.status) ? old.author_input : fresh.fm.author_input,
  };
  const sections = { ...fresh.sections };
  const answers = existing.sections[AUTHOR_SECTION];
  if (answers && answers !== EMPTY) sections[AUTHOR_SECTION] = answers;
  return { fm, sections };
}
