#!/usr/bin/env node
// tools/lint-ratchet/run.mjs — wbudowana kontrola `lint-ratchet` w `checks:` silnika /orchestrate (TASK-ORC-LINT-DELEGATION-001, E1).
//
// Co robi: bierze pliki, które ZMIENIŁ przebieg (git: working tree vs --base + nieśledzone), zawęża je do zakresu warstwy
// (`--only`), odfiltrowuje cudzą pracę sprzed startu (`--skip`) i pliki spoza `--match`, a potem woła skrypt RATCHET
// PROJEKTU na tej liście. Zakres liczy kod, nie sonda (model): sonda dostaje jedną komendę i jej kod wyjścia.
//
//   <runner> <skrypt> [--base <sha>] --files <plik>…     (opcje PRZED --files: tego wymaga ratchet juz-ide-api)
//
// Kontrakt skryptu projektu: wywołanie jak wyżej; kod 0 = bez regresji, 1 = regresja (nowe trafienia reguł względem punktu
// odniesienia), inny = błąd narzędzia. Skrypt liczy każde trafienie reguły, także na poziomie `warn` (Q6: tak ma być).
//
// Użycie:
//   node run.mjs --script <nazwa> [--base <sha>] [--only <dir|plik>]… [--skip <ścieżka>]… [--match <regex>] [--dry-run]
//   --match   regex względem ścieżki pliku (domyślnie pliki kodu JS/TS). Pusta lista po filtrze = SKIPPED, nigdy pełny lint.
// Kody wyjścia (jak conformance i scoped-tests): 0 zielono · 1 czerwono (regresja) · 3 SKIPPED (nic nie sprawdzono:
// brak plików w zakresie, brak skryptu, błąd narzędzia projektu). `skipped` NIE jest zielenią: silnik nie deleguje wtedy reguł
// z weryfikatora (pełny zakres), a w raporcie zostaje ostrzeżenie.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
function opt(name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null }
function optAll(name) { const out = []; argv.forEach((a, i) => { if (a === name && argv[i + 1]) out.push(argv[i + 1]) }); return out }

const SCRIPT_RE = /^[A-Za-z0-9:_-]{1,64}$/
const SHA_RE = /^[0-9a-f]{40,64}$/
const DEFAULT_MATCH = '\\.[cm]?[jt]sx?$'
const CHUNK = 150 // limit długości wiersza poleceń; ratchet liczy pliki niezależnie, więc kawałki można łączyć

function skipped(why) {
  console.log(`lint-ratchet: SKIPPED — ${why}`)
  process.exit(3)
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return r.status === 0 ? r.stdout : null
}

const script = opt('--script')
if (!script || !SCRIPT_RE.test(script)) skipped('brak poprawnej nazwy skryptu (--script) — projekt nie skonfigurował kontroli')

const root = (git(['rev-parse', '--show-toplevel'], process.cwd()) || '').trim()
if (!root) skipped('to nie jest repozytorium git')

let scripts = {}
try { scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts || {} } catch { /* brak package.json */ }
if (!scripts[script]) skipped(`brak skryptu "${script}" w package.json`)

let matcher
try { matcher = new RegExp(opt('--match') || DEFAULT_MATCH) } catch { skipped('niepoprawny regex --match') }

const baseOpt = opt('--base')
if (baseOpt && !SHA_RE.test(baseOpt)) skipped('--base nie jest hashem commita')
const gitBase = baseOpt || 'HEAD'
const changed = git(['diff', '--name-only', '--diff-filter=ACMR', gitBase, '--'], root)
const untracked = git(['ls-files', '-o', '--exclude-standard'], root)
if (changed === null) skipped(`git diff względem "${gitBase}" nie powiódł się`)

const trimDir = (d) => d.replace(/\/+$/, '')
const only = optAll('--only').map(trimDir)
const skip = optAll('--skip').map(trimDir)
const inScope = (f) => !only.length || only.some((d) => f === d || f.startsWith(d + '/') || f.includes('/' + d + '/'))
const isSkipped = (f) => skip.some((p) => f === p || f.startsWith(p + '/'))

const files = [...new Set(`${changed}\n${untracked || ''}`.split('\n').map((s) => s.trim()).filter(Boolean))]
  .filter((f) => existsSync(join(root, f)) && matcher.test(f) && inScope(f) && !isSkipped(f))
if (files.length === 0) skipped('brak zmienionych plików w zakresie kontroli — nic do sprawdzenia (pełny lint nigdy)')

const useBase = baseOpt ? ['--base', baseOpt] : []
const pnpm = existsSync(join(root, 'pnpm-lock.yaml'))
const yarn = !pnpm && existsSync(join(root, 'yarn.lock'))
function invocation(chunk) {
  const tail = [...useBase, '--files', ...chunk]
  if (pnpm) return ['pnpm', ['-s', script, ...tail]]
  if (yarn) return ['yarn', ['-s', script, ...tail]]
  return ['npm', ['run', '-s', script, '--', ...tail]]
}

let regressed = false
let broken = null
for (let i = 0; i < files.length; i += CHUNK) {
  const [cmd, args] = invocation(files.slice(i, i + CHUNK))
  if (argv.includes('--dry-run')) { console.log(`lint-ratchet: ${cmd} ${args.join(' ')}`); continue }
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.error) { broken = `nie można uruchomić ${cmd}: ${r.error.message}`; continue }
  if (r.status === 1) regressed = true
  else if (r.status !== 0) {
    // stderr tylko przy błędzie narzędzia: przy regresji niesie szum (np. ostrzeżenia ESLint o ignore), a raport jest na stdout
    if (r.stderr) process.stdout.write(r.stderr.split('\n').slice(-20).join('\n') + '\n')
    broken = `skrypt "${script}" zakończył się kodem ${r.status} (błąd narzędzia, nie wynik kontroli)`
  }
}

if (regressed) {
  console.log(`lint-ratchet: CZERWONO — regresja w ${files.length} sprawdzanych plik(ach) (skrypt "${script}")`)
  process.exit(1)
}
if (broken) skipped(broken)
console.log(`lint-ratchet: zielono — ${files.length} plik(ów), skrypt "${script}"`)
process.exit(0)
