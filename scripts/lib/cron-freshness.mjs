// scripts/lib/cron-freshness.mjs — czy codzienny audyt (cron `30 7 * * 1-5`) faktycznie chodzi (TASK-OBS-007).
//
// Cron, który przestał działać, jest cichy: wpis ma zaszytą ścieżkę node z nvm, więc po zmianie wersji
// padnie bez śladu. Dowodem życia jest mtime logu — `>>` dopisuje przy każdym uruchomieniu.

const RUN_HOUR = 7;
const RUN_MINUTE = 30;
const GRACE_MS = 2 * 60 * 60 * 1000; // audyt trwa i ma prawo się spóźnić

const isWorkday = (d) => d.getDay() >= 1 && d.getDay() <= 5;

/** Ostatni planowany start crona (dzień roboczy 07:30, czas lokalny), który minął z zapasem GRACE. */
export function lastExpectedRun(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), RUN_HOUR, RUN_MINUTE, 0, 0);
  for (let i = 0; i < 8; i++) {
    if (isWorkday(d) && d.getTime() + GRACE_MS <= now.getTime()) return d;
    d.setDate(d.getDate() - 1);
  }
  return null;
}

/** → null gdy świeży; inaczej { expected, last } (last = null, gdy logu nie ma). */
export function auditLogStale(lastWriteMs, now = new Date()) {
  const expected = lastExpectedRun(now);
  if (!expected) return null;
  if (lastWriteMs === null || lastWriteMs < expected.getTime()) return { expected, last: lastWriteMs };
  return null;
}
