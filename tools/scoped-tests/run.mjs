#!/usr/bin/env node
// tools/scoped-tests/run.mjs — jedyny sposób, w jaki silnik /orchestrate uruchamia testy (wbudowana kontrola `test*` w `checks:`).
//
// Co robi: bierze pliki testowe, które ZMIENIŁ przebieg (git: working tree vs --base + nieśledzone), dzieli je na
// integration / e2e (po sufiksie nazwy) i dla każdego pakietu woła DOKŁADNIE
//   pnpm test:integration <plik>…   /   pnpm test:e2e <plik>…
// (w marketing-hub i grant-flow: test:l2 / test:l3). Nigdy cały zestaw, nigdy `npm run test`, nigdy `--`.
// Hook block-unscoped-tests.js egzekwuje tę samą regułę dla wszystkich innych ścieżek (wspólna biblioteka hooks/lib/test-guard.js).
//
// Użycie:
//   node run.mjs [--base <sha>] [--only <dir|plik>]… [--files <plik>…] [--dry-run]
//   --files   uruchom dokładnie te pliki (ponowienie padających, ORC-103); pomija git
// Testy jednostkowe (*.spec.ts bez .integration/.e2e) są pomijane z głośnym komunikatem, chyba że projekt ma
// `.claude/test-guard.json` z `allowUnit: true` (wtedy `pnpm test <plik>…`).
// Kody wyjścia: 0 uruchomiono i zielono · 1 czerwono · 3 nic nie uruchomiono (skipped: brak plików / brak skryptu / polityka).

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const guard = require(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hooks', 'lib', 'test-guard.js'))

const argv = process.argv.slice(2)
function opt(name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null }
function optAll(name) { const out = []; argv.forEach((a, i) => { if (a === name && argv[i + 1]) out.push(argv[i + 1]) }); return out }
function filesArg() {
  const i = argv.indexOf('--files')
  if (i < 0) return null
  const out = []
  for (let k = i + 1; k < argv.length && !argv[k].startsWith('--'); k++) out.push(argv[k])
  return out
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return r.status === 0 ? r.stdout : null
}

const root = (git(['rev-parse', '--show-toplevel'], process.cwd()) || '').trim()
if (!root) { console.error('scoped-tests: to nie jest repozytorium git'); process.exit(3) }
const cfg = guard.loadConfig(root)
const dry = argv.includes('--dry-run')

// ── 1. pliki testowe zmiany ──
let files
const explicit = filesArg()
if (explicit) {
  // ścieżki z logu runnera (ORC-103) są względem PAKIETU, nie korzenia repo: gdy plik nie istnieje od cwd, szukamy go po końcówce ścieżki
  files = explicit.map((f) => {
    const abs = resolve(process.cwd(), f)
    if (existsSync(abs)) return relative(root, abs).split(sep).join('/')
    const hits = (git(['ls-files', '-co', '--exclude-standard', '--', `:(glob)**/${f.replace(/^\.?\//, '')}`], root) || '').split('\n').filter(Boolean)
    return hits.length === 1 ? hits[0] : relative(root, abs).split(sep).join('/')
  })
} else {
  const base = opt('--base') || 'HEAD'
  const changed = git(['diff', '--name-only', '--diff-filter=ACMR', base, '--'], root)
  const untracked = git(['ls-files', '-o', '--exclude-standard'], root)
  if (changed === null) { console.error(`scoped-tests: git diff względem "${base}" nie powiódł się`); process.exit(3) }
  files = [...new Set(`${changed}\n${untracked || ''}`.split('\n').map((s) => s.trim()).filter(Boolean))]
}
files = files.filter((f) => guard.TEST_FILE.test(f) && existsSync(join(root, f)))
const only = optAll('--only').map((d) => d.replace(/\/+$/, ''))
if (only.length && !explicit) {
  files = files.filter((f) => only.some((d) => f === d || f.startsWith(d + '/') || f.includes('/' + d + '/')))
}
if (files.length === 0) {
  console.log('scoped-tests: SKIPPED — brak zmienionych plików testowych w zakresie; nic do uruchomienia (cały zestaw nigdy).')
  process.exit(3)
}

// ── 2. pakiet, skrypt, grupa ──
function pkgDirOf(file) {
  let d = dirname(join(root, file))
  while (d.startsWith(root)) {
    if (existsSync(join(d, 'package.json'))) return d
    const up = dirname(d)
    if (up === d) break
    d = up
  }
  return null
}
const CANDIDATES = { integration: ['test:integration', 'test:l2'], e2e: ['test:e2e', 'test:l3'], unit: ['test'] }
const allowed = guard.allowedScripts(cfg)
const groups = new Map()
const skipped = []
for (const f of files) {
  const kind = guard.classifyTestFile(f)
  if (kind === 'unit' && !cfg.allowUnit) { skipped.push({ f, why: 'unit' }); continue }
  const pkg = pkgDirOf(f)
  if (!pkg) { skipped.push({ f, why: 'no-package' }); continue }
  let scripts = {}
  try { scripts = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).scripts || {} } catch { /* brak scripts */ }
  const script = CANDIDATES[kind].find((s) => allowed.has(s) && scripts[s])
  if (!script) { skipped.push({ f, why: `no-script:${kind}` }); continue }
  const key = pkg + '\0' + script
  if (!groups.has(key)) groups.set(key, { pkg, script, files: [] })
  groups.get(key).files.push(relative(pkg, join(root, f)).split(sep).join('/'))
}

// ── 3. uruchomienie ──
let ran = 0
let failed = 0
for (const g of groups.values()) {
  const cmd = `pnpm ${g.script} ${g.files.join(' ')}`
  console.log(`scoped-tests: (${relative(root, g.pkg) || '.'}) ${cmd}`)
  if (dry) { ran += g.files.length; continue }
  const r = spawnSync('pnpm', [g.script, ...g.files], { cwd: g.pkg, stdio: 'inherit' })
  if (r.error) { console.error(`scoped-tests: nie można uruchomić pnpm: ${r.error.message}`); failed++; continue }
  ran += g.files.length
  if (r.status !== 0) failed++
}

const unit = skipped.filter((s) => s.why === 'unit')
const noScript = skipped.filter((s) => s.why.startsWith('no-script'))
const noPkg = skipped.filter((s) => s.why === 'no-package')
if (unit.length) console.log(`scoped-tests: POMINIĘTO ${unit.length} plik(ów) jednostkowych — polityka: testy tylko pnpm test:{e2e|integration} <pliki> (.claude/test-guard.json allowUnit:true to zmienia): ${unit.slice(0, 5).map((s) => s.f).join(', ')}${unit.length > 5 ? ', …' : ''}`)
if (noScript.length) console.log(`scoped-tests: POMINIĘTO ${noScript.length} plik(ów) bez skryptu w package.json (${[...new Set(noScript.map((s) => s.why.split(':')[1]))].join(', ')}): ${noScript.slice(0, 5).map((s) => s.f).join(', ')}`)
if (noPkg.length) console.log(`scoped-tests: POMINIĘTO ${noPkg.length} plik(ów) bez package.json na ścieżce`)

if (ran === 0) { console.log('scoped-tests: SKIPPED — żaden plik nie spełnił polityki, nic nie uruchomiono.'); process.exit(3) }
console.log(`scoped-tests: uruchomiono ${ran} plik(ów) w ${groups.size} przebiegu(ach), ${failed ? 'CZERWONO' : 'zielono'}`)
process.exit(failed ? 1 : 0)
