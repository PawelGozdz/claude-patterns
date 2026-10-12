// scripts/lib/blog-seed/store.mjs — klucze, lokalny indeks, lock i zapis zalążków (ADR 0013).
//
// Prywatne rzeczy zostają LOKALNIE (domyślnie ~/.claude/blog-seeds, nadpisuje BLOG_SEEDS_HOME):
//   key          — sekret HMAC (0600). ID typu TASK-123 mają małą entropię, więc zwykły hash
//                  w pliku bloga dałoby się odwrócić zgadywaniem; HMAC z lokalnym kluczem nie.
//   index.jsonl  — mapa ref_private → prywatne źródło (projekt, ref). Poza gitem i poza blogami.
//   locks/       — lock per dedup_key: kilka terminali może kończyć przebiegi równocześnie.
// W repo bloga piszemy WYŁĄCZNIE stage/{inbox,dry-run}/RRRR-MM-DD/<slug>.seed.md.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFrontmatter } from '../frontmatter.mjs';

export const MODE_DIR = { live: 'inbox', 'dry-run': 'dry-run' };
// Od `picked` wzwyż plik należy do człowieka/etapu pisania — emitter go nie rusza.
export const LOCKED_STATUSES = new Set(['picked', 'drafted', 'published', 'discarded', 'merged']);
const LOCK_STALE_MS = 120_000;
const LOCK_WAIT_MS = 3_000;

export function seedsHome() {
  return process.env.BLOG_SEEDS_HOME || path.join(os.homedir(), '.claude', 'blog-seeds');
}

function hmacKey() {
  const dir = seedsHome();
  const file = path.join(dir, 'key');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e; // równoległy przebieg zdążył pierwszy — użyj jego klucza
    }
  }
  return fs.readFileSync(file, 'utf8').trim();
}

const hmac = (msg) => crypto.createHmac('sha256', hmacKey()).update(msg).digest('hex');

export function dedupKey(project, kind, ref, blogRole) {
  return hmac(`dedup|${project}|${kind}|${ref}|${blogRole}`).slice(0, 32);
}

export function refPrivate(project, kind, ref) {
  return `bsr_${hmac(`ref|${project}|${kind}|${ref}`).slice(0, 16)}`;
}

export function recordIndex(refPriv, project, ref) {
  const file = path.join(seedsHome(), 'index.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(`"${refPriv}"`)) return;
  fs.appendFileSync(file, JSON.stringify({ ref_private: refPriv, project, ref, ts: new Date().toISOString() }) + '\n', { mode: 0o600 });
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Wykonuje fn pod lockiem pliku (O_EXCL). Przeterminowany lock (padły proces) jest zdejmowany. */
export function withLock(key, fn) {
  const dir = path.join(seedsHome(), 'locks');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, `${key}.lock`);
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) { fs.rmSync(lock, { force: true }); continue; }
      } catch { continue; }
      if (Date.now() > deadline) throw new Error('lock zajęty');
      sleep(50);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

export function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp-${process.pid}`);
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

/** Wszystkie zalążki w stage/<modeDir>/RRRR-MM-DD/*.seed.md. Uszkodzone pliki są pomijane. */
export function listSeeds(blogRoot, mode) {
  const base = path.join(blogRoot, 'stage', MODE_DIR[mode]);
  if (!fs.existsSync(base)) return [];
  const out = [];
  for (const day of fs.readdirSync(base)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const dir = path.join(base, day);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.seed.md')) continue;
      const file = path.join(dir, f);
      const parsed = parseFrontmatter(fs.readFileSync(file, 'utf8'));
      if (parsed && !parsed.error) out.push({ file, day, fm: parsed.data });
    }
  }
  return out;
}

/** Poniedziałek tygodnia ISO dla daty RRRR-MM-DD (UTC — liczą się nazwy folderów, nie strefy). */
export function isoWeekStart(day) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Nowe (nieodrzucone) zalążki z bieżącego tygodnia — licznik limitu bez osobnego stanu. */
export function weeklyCount(seeds, today) {
  const start = isoWeekStart(today);
  return seeds.filter((s) => s.day >= start && s.day <= today && !s.fm.suppressed).length;
}

const PL = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };

export function slugify(text) {
  return String(text)
    .replace(/\[usunięto:[^\]]*\]/g, ' ')
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL[c])
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Wolna ścieżka pliku w folderze dnia; kolizja nazw różnych tematów dostaje sufiks -2, -3… */
export function freePath(blogRoot, mode, day, slug) {
  const dir = path.join(blogRoot, 'stage', MODE_DIR[mode], day);
  let name = `${slug}.seed.md`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${slug}-${i}.seed.md`;
  return path.join(dir, name);
}
