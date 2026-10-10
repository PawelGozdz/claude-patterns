// Małe, czyste checki dla scripts/audit-projects.mjs. Każdy zwraca listę znalezisk
// [co, jak naprawić, waga] i NICZEGO nie zapisuje w projekcie: git jest wołany wyłącznie
// poleceniami czytającymi (ls-files, cat-file, check-ignore), z GIT_OPTIONAL_LOCKS=0,
// żeby audyt nie odświeżył nawet indeksu cudzego repo.
//
// Wydzielone z audit-projects.mjs 2026-10-10: skrypt miał już 330 linii, a dochodziły
// cztery nowe grupy checków (martwe dowiązania, higiena gita, bezpieczeństwo/konfiguracja,
// flota poza systemem bloków).

import { readFileSync, existsSync, readdirSync, readlinkSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';

export const ERROR = 'error', WARN = 'warn', INFO = 'info';

const SAMPLE = 4;
const sample = (list) => list.slice(0, SAMPLE).join(', ') + (list.length > SAMPLE ? ` (+${list.length - SAMPLE})` : '');

// ── (1) martwe dowiązania ─────────────────────────────────────────────────
// Incydent 2026-10-10: audyt skanował stare ścieżki `.claude/knowledge/{skills,rules}` i
// meldował 0 martwych dowiązań, podczas gdy feature-flags miał martwe
// `.claude/skills/continuous-learning-v2` (cel usunięty z centrali). Skan musi obejmować
// katalogi, do których setup-project.sh NAPRAWDĘ linkuje. Sam wpis + jeden poziom w głąb
// katalogów prawdziwych (kategorie wzorców, katalogi skilli); bez podążania za
// symlinkiem katalogu — vytches-ddd linkuje całe drzewo centrali i skan wyszedłby poza projekt.
// `.claude/worktrees/**` pomijamy: to cudze, tymczasowe checkouty z własnym stanem.
export const LINK_DIRS = ['.claude/skills', '.claude/rules', '.claude/hooks', '.claude/agents',
  '.claude/knowledge/patterns', '.claude/knowledge/decisions', '.claude/knowledge/patterns-local'];

const isDeadLink = (p) => {
  try { return lstatSync(p).isSymbolicLink() && !existsSync(p); } catch { return false; }
};

export const findDeadLinks = (P) => {
  const out = [];
  const visit = (dir, depth) => {
    if (isDeadLink(dir)) { out.push([dir, readlinkSync(dir)]); return; }
    let st;
    try { st = lstatSync(dir); } catch { return; }       // katalogu nie ma — nic do sprawdzenia
    if (!st.isDirectory()) return;                       // żywy symlink katalogu: nie schodzimy
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isSymbolicLink()) { if (isDeadLink(p)) out.push([p, readlinkSync(p)]); }
      else if (e.isDirectory() && depth < 1) visit(p, depth + 1);
    }
  };
  for (const d of LINK_DIRS) visit(join(P, d), 0);
  return out;
};

export const deadLinkIssues = (P) => findDeadLinks(P).map(([p, target]) =>
  [`martwe dowiązanie: ${p.slice(P.length + 1)} → ${target}`,
    `./scripts/setup-project.sh ${P}   # sprząta je automatycznie`, ERROR]);

// ── (2) higiena gita ──────────────────────────────────────────────────────
const git = (P, args, input) => execFileSync('git', args, {
  cwd: P, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
});

// Własne repo projektu, nie repo nadrzędne: `--show-prefix` jest puste tylko w korzeniu.
const isOwnRepo = (P) => {
  try { return git(P, ['rev-parse', '--show-prefix']).trim() === ''; } catch { return false; }
};

// Ścieżki, od których zależy kompozycja: lokalne wzorce z runtime.yml (always, triggers[].include,
// wkład warstw), lokalne bloki i project.yml. Brak któregokolwiek w czystym klonie = wisząca
// ścieżka przy materializacji.
export const compositionDeps = (P) => {
  const deps = new Set(['.claude/config/project.yml']);
  const blocksDir = join(P, '.claude/blocks');
  if (existsSync(blocksDir))
    for (const f of readdirSync(blocksDir).filter((f) => f.endsWith('.yml'))) deps.add(`.claude/blocks/${f}`);
  let rt = null;
  try { rt = YAML.parse(readFileSync(join(P, '.claude/config/runtime.yml'), 'utf8')); } catch { /* brak = bez wzorców */ }
  const strings = (v) => (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string');
  const patterns = [
    ...strings(rt?.patterns?.always),
    ...(rt?.patterns?.triggers ?? []).flatMap((t) => strings(t?.include)),
    ...(rt?.orchestrate?.layers ?? []).flatMap((l) => strings(l?.patterns)),
  ];
  for (const p of patterns) if (p.startsWith('.claude/')) deps.add(p);
  return [...deps];
};

export const gitHygieneIssues = (P) => {
  if (!existsSync(join(P, '.git')) || !isOwnRepo(P))
    return [['nie jest repozytorium git — higiena gita pominięta', '—', INFO]];
  const issues = [];
  let tracked = [];
  try {
    tracked = git(P, ['ls-files', '-s', '-z', '--', '.claude']).split('\0').filter(Boolean)
      .map((l) => { const m = l.match(/^(\d+) ([0-9a-f]+) \d\t(.*)$/s); return m && { mode: m[1], sha: m[2], path: m[3] }; })
      .filter(Boolean);
  } catch { return [['git ls-files .claude nie powiódł się — higiena gita pominięta', '—', INFO]]; }

  // a) Bezwzględny cel symlinka w gicie jest martwy na każdej innej maszynie. Incydent
  //    2026-10-10: agenci jako `/opt/projects/claude-patterns/...` śledzeni w grant-flow,
  //    juz-ide-api-1..4, marketing-hub i innych — czysty klon u kogokolwiek poza tym hostem
  //    zaczynał od ~wiszących agentów.
  const absolute = tracked.filter((t) => t.mode === '120000').flatMap((t) => {
    try { const target = git(P, ['cat-file', '-p', t.sha]); return target.startsWith('/') ? [`${t.path} → ${target}`] : []; }
    catch { return []; }
  });
  if (absolute.length)
    issues.push([`symlink z absolutną ścieżką w gicie — martwy na innej maszynie (${absolute.length}): ${sample(absolute)}; ` +
      'git rm --cached + .gitignore', `git -C ${P} rm --cached <ścieżka> && echo <ścieżka> >> .gitignore`, ERROR]);

  // b) Pliki .bak w gicie to ślad po ręcznej edycji, który nikt nie przegląda.
  const baks = tracked.map((t) => t.path).filter((p) => /\.bak(\.|$)/.test(p.split('/').pop()));
  if (baks.length)
    issues.push([`śledzone pliki .bak w .claude (${baks.length}): ${sample(baks)}`,
      `git -C ${P} rm --cached ${baks[0]}   # i dopisz *.bak* do .gitignore`, ERROR]);

  // c) Ścieżka, od której zależy kompozycja, a którą .gitignore ukrywa. Incydent 2026-10-10:
  //    ignorowany `.claude/knowledge/` z lokalnymi wzorcami — u autora wszystko działa, a na
  //    czystym klonie materializacja pada na wiszącej ścieżce.
  const deps = compositionDeps(P);
  let ignored = [];
  try {
    ignored = git(P, ['check-ignore', '--stdin', '-z'], deps.join('\0') + '\0').split('\0').filter(Boolean);
  } catch (e) {
    if (e.status !== 1) return [...issues, ['git check-ignore nie powiódł się — część higieny pominięta', '—', INFO]];
  }
  if (ignored.length)
    issues.push([`plik, od którego zależy kompozycja, jest w .gitignore — na czystym klonie materializacja padnie (wisząca ścieżka): ${sample(ignored)}`,
      `usuń wpis z .gitignore projektu (git -C ${P} check-ignore -v ${ignored[0]})`, ERROR]);
  return issues;
};

// ── (3a) deny dla .env w settings.json ────────────────────────────────────
// Reguła `Read(.env)` w deny to jedyna ochrona sekretów przed wczytaniem do kontekstu
// (rules/common/searching.md). Incydent 2026-10-10: feature-flags i my-intelligence nie
// miały jej wcale.
const denyTarget = (rule) => {
  const m = String(rule).match(/^Read\((.*)\)$/);
  return m ? m[1].replace(/^(\.\/|\/)+/, '').replace(/^(\*\*\/)+/, '') : null;
};
const COVERS_ENV = new Set(['.env', '.env*', '.env**']);
const COVERS_ALL_VARIANTS = new Set(['.env*', '.env.*', '.env**', '.env.**']);

export const envDenyIssues = (P) => {
  const settings = join(P, '.claude/settings.json');
  if (!existsSync(settings))
    return [['brak .claude/settings.json — nic nie blokuje odczytu .env', `./scripts/setup-project.sh ${P}`, ERROR]];
  let deny;
  try { deny = JSON.parse(readFileSync(settings, 'utf8'))?.permissions?.deny; }
  catch { return [['.claude/settings.json nie parsuje się jako JSON', `jq . ${settings}`, ERROR]]; }
  const targets = (Array.isArray(deny) ? deny : []).map(denyTarget).filter(Boolean);
  const fix = `dodaj "Read(./.env)" i "Read(./.env.*)" do permissions.deny w ${settings}`;
  if (!targets.some((t) => COVERS_ENV.has(t)))
    return [['permissions.deny nie obejmuje odczytu .env (brak Read(.env))', fix, ERROR]];
  if (!targets.some((t) => COVERS_ALL_VARIANTS.has(t)))
    return [['permissions.deny blokuje .env, ale nie .env.* — .env.production / .env.local nadal czytelne' +
      `${targets.some((t) => /^\.env\..*local$/.test(t)) ? ' (są tylko warianty .env.*.local)' : ''}`, fix, WARN]];
  return [];
};

// ── (3b) CLAUDE.md bez generatora i bez CLAUDE-LOCAL.md ───────────────────────
// setup-project.sh regeneruje CLAUDE.md w całości. Ręcznie pisany plik bez
// `.claude/config/CLAUDE-LOCAL.md` ginie przy następnym setupie (2026-10-10: auth,
// platform, nest-kit). CLAUDE-LOCAL.md w korzeniu repo generator ignoruje — stąd osobne OSTRZEŻENIE.
const GENERATOR_HEADER = 'Auto-generated by `generate-claude-md.sh`';

export const claudeMdIssues = (P) => {
  const md = join(P, 'CLAUDE.md');
  if (!existsSync(md)) return [];
  const issues = [];
  const localOk = existsSync(join(P, '.claude/config/CLAUDE-LOCAL.md'));
  const rootOnly = !localOk && existsSync(join(P, 'CLAUDE-LOCAL.md'));
  if (rootOnly)
    issues.push(['CLAUDE-LOCAL.md leży w korzeniu repo, a generator czyta tylko .claude/config/CLAUDE-LOCAL.md',
      `git mv ${P}/CLAUDE-LOCAL.md ${P}/.claude/config/CLAUDE-LOCAL.md`, WARN]);
  if (!readFileSync(md, 'utf8').includes(GENERATOR_HEADER) && !localOk && !rootOnly)
    issues.push(['ręcznie pisany CLAUDE.md bez CLAUDE-LOCAL.md — setup-project.sh nadpisze treść; ' +
      'przenieś ją do .claude/config/CLAUDE-LOCAL.md', `mkdir -p ${P}/.claude/config && cp ${P}/CLAUDE.md ${P}/.claude/config/CLAUDE-LOCAL.md`, ERROR]);
  return issues;
};

// ── (3c) flota: katalogi z .claude/, ale poza systemem bloków ──────────────────
export const outsideBlockSystem = (root, skip = []) => readdirSync(root, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !skip.includes(e.name))
  .filter((e) => existsSync(join(root, e.name, '.claude')) && !existsSync(join(root, e.name, '.claude/config/project.yml')))
  .map((e) => e.name).sort();
