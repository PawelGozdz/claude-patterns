#!/usr/bin/env node
// Renderuje PNG dla każdego artboardu z backupu canvasu Claude Design.
//
//   node render-artboards.mjs --dir <design-archive/data/> [--app-dir <katalog>]
//
// Czyta <dir>/project/canvas.json (albo <dir>/canvas.json), próbuje wyciągnąć listę
// artboardów (id/nazwa + rozmiar ramki + plik .dc.html), otwiera każdy plik lokalnie
// w headless Chromium (Playwright PROJEKTU, z --app-dir, nigdy nie instaluje niczego)
// w viewporcie = rozmiar ramki, i zapisuje <nazwa>.png obok źródła.
//
// Schemat canvas.json nie jest udokumentowany — jeśli żaden znany kształt nie pasuje,
// skrypt loguje surowe klucze najwyższego poziomu i kończy z kodem 2, zamiast zgadywać.

import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const dir = arg('--dir');
if (!dir) {
  console.error('użycie: render-artboards.mjs --dir <design-archive/data/> [--app-dir <katalog>]');
  process.exit(1);
}
const root = resolve(dir);
const appDir = resolve(arg('--app-dir', process.cwd()));

function findCanvasJson(base) {
  const candidates = [join(base, 'project', 'canvas.json'), join(base, 'canvas.json')];
  return candidates.find(existsSync) ?? null;
}

const canvasPath = findCanvasJson(root);
if (!canvasPath) {
  console.error(
    `Brak canvas.json w ${root} (sprawdzone: project/canvas.json, canvas.json). ` +
    'Backup plików źródłowych (krok 1 skilla) musi być zrobiony pierwszy.'
  );
  process.exit(1);
}
const canvas = JSON.parse(readFileSync(canvasPath, 'utf8'));

// Znane, prawdopodobne kształty indeksu artboardów. Pierwszy, który zwróci niepustą
// listę, wygrywa — dopasuj tutaj, jeśli rzeczywisty schemat canvas.json jest inny.
function extractArtboards(json) {
  const shapes = [
    () => json.artboards,
    () => json.pages?.flatMap((p) => p.artboards ?? []),
    () => json.project?.artboards,
    () => (Array.isArray(json) ? json : null),
  ];
  for (const shape of shapes) {
    const result = shape();
    if (Array.isArray(result) && result.length > 0) return result;
  }
  return null;
}

const artboards = extractArtboards(canvas);
if (!artboards) {
  console.error('Nie rozpoznano listy artboardów w canvas.json. Klucze najwyższego poziomu:', Object.keys(canvas));
  console.error('Dopasuj extractArtboards() w tym skrypcie do rzeczywistego schematu, zamiast zgadywać dalej.');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = createRequire(join(appDir, 'package.json'))('@playwright/test'));
} catch {
  console.error(`Brak @playwright/test w ${appDir} — dodaj go do devDependencies aplikacji (nie instaluję globalnie).`);
  process.exit(1);
}

const results = [];
const browser = await chromium.launch();
try {
  for (const board of artboards) {
    const name = board.name ?? board.id ?? `artboard-${results.length + 1}`;
    const file = board.file ?? board.path ?? `${board.id ?? name}.dc.html`;
    const width = Math.round(board.width ?? board.frame?.width ?? 1440);
    const height = Math.round(board.height ?? board.frame?.height ?? 900);
    const source = resolve(root, file);
    const out = join(root, `${name}.png`);
    if (!existsSync(source)) {
      results.push({ name, error: `plik źródłowy nie istnieje: ${source}` });
      continue;
    }
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    try {
      await page.goto(pathToFileURL(source).toString(), { waitUntil: 'networkidle', timeout: 30000 });
      await page.screenshot({ path: out, fullPage: false });
      results.push({ name, file: out, width, height });
    } catch (error) {
      results.push({ name, error: String(error) });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ dir: root, canvasPath, results }, null, 2));
process.exit(results.length > 0 && results.every((r) => r.error) ? 1 : 0);
