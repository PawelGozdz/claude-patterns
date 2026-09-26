#!/usr/bin/env node
// Zrzuty ekranu w macierzy motyw (light/dark) × viewport (desktop/mobile).
//
//   node capture.mjs --url <http://localhost:5173/ścieżka> [--name <ekran>] [--out <katalog>]
//                    [--app-dir <katalog z node_modules/@playwright/test>]
//
// Używa Playwrighta PROJEKTU (require z --app-dir, domyślnie cwd), nigdy nie instaluje
// niczego z sieci. Tryb ciemny: emulacja prefers-color-scheme + parametr `?theme=dark`
// + atrybut data-theme="dark" na <html> — aplikacja ma honorować któryś z nich
// (kontrakt opisany w SKILL.md tego skilla).
//
// Wynik: <out>/<name>-<light|dark>-<desktop|mobile>.png + podsumowanie JSON na stdout
// (ścieżki, status HTTP, końcowy URL, błędy konsoli). Kod wyjścia 1 = nie udało się
// zrobić żadnego zrzutu.

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const url = arg('--url');
if (!url) {
  console.error('użycie: capture.mjs --url <adres> [--name <ekran>] [--out <katalog>] [--app-dir <katalog>]');
  process.exit(1);
}
const name = arg('--name', 'screen');
const appDir = resolve(arg('--app-dir', process.cwd()));
const out = resolve(arg('--out', join(process.cwd(), '.claude', 'run-state', 'visual-check')));
mkdirSync(out, { recursive: true });

let chromium;
try {
  ({ chromium } = createRequire(join(appDir, 'package.json'))('@playwright/test'));
} catch {
  console.error(`Brak @playwright/test w ${appDir} — dodaj go do devDependencies aplikacji (nie instaluję globalnie).`);
  process.exit(1);
}

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const THEMES = ['light', 'dark'];

const withTheme = (address, theme) => {
  const u = new URL(address);
  if (theme === 'dark') u.searchParams.set('theme', 'dark');
  return u.toString();
};

const browser = await chromium.launch();
const results = [];
try {
  for (const theme of THEMES) {
    for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      const file = join(out, `${name}-${theme}-${vpName}.png`);
      try {
        const response = await page.goto(withTheme(url, theme), { waitUntil: 'networkidle', timeout: 30000 });
        if (theme === 'dark') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        await page.screenshot({ path: file, fullPage: true });
        results.push({ theme, viewport: vpName, file, status: response?.status() ?? null, finalUrl: page.url(), consoleErrors });
      } catch (error) {
        results.push({ theme, viewport: vpName, file: null, error: String(error), consoleErrors });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ url, out, results }, null, 2));
process.exit(results.some((r) => r.file) ? 0 : 1);
