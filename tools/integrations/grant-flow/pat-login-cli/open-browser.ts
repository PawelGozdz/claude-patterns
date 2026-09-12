import { spawn } from 'node:child_process';
import { infoLog } from './log.js';

// Task-spec pt. 7: kept deliberately simple — a plain per-platform spawn, no "open"-style
// npm dependency (D2/pt. 9: as close to zero deps as possible). If the spawn fails
// (missing xdg-open, a restricted/headless environment, etc.) the flow does not die — the
// URL was already printed by login-flow.ts before this is called, so manual open-and-paste
// still works.
export function openBrowser(url: string): void {
  const [cmd, args] = platformOpenCommand(url);
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    // spawn() failures (e.g. ENOENT for a missing binary) surface asynchronously via
    // 'error', not as a thrown exception — an unhandled listener here would crash the
    // whole CLI over something that has a perfectly fine manual fallback.
    child.on('error', (err) => reportFailure(err, url));
    child.unref();
  } catch (err) {
    reportFailure(err as Error, url);
  }
}

function reportFailure(err: Error, url: string): void {
  infoLog(`Nie udało się automatycznie otworzyć przeglądarki (${err.message}) — otwórz ten adres ręcznie:`);
  infoLog(url);
}

function platformOpenCommand(url: string): [string, string[]] {
  if (process.platform === 'darwin') return ['open', [url]];
  if (process.platform === 'win32') {
    // `cmd /c start` treats its first quoted arg as the window title, not the target — the
    // empty "" placeholder keeps `url` from being swallowed into that role.
    return ['cmd', ['/c', 'start', '""', url]];
  }
  return ['xdg-open', [url]];
}
