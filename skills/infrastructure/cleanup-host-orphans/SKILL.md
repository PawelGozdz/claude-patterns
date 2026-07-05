---
name: cleanup-host-orphans
description: "Report-only diagnostic for a slow/frozen host: lists stacked VS Code Remote-SSH generations (extensionHost/fileWatcher/tsserver that pile up instead of being replaced on reconnect), orphaned MCP/npx helper processes whose parent claude died, and long-held /tmp locks. Prints ready-to-copy kill commands, never kills automatically. Use when a project's terminal/VS Code window is sluggish or freezes and you suspect leftover processes rather than a live workload."
origin: claude-patterns
allowed-tools: Read, Bash
effort: low
---

# /cleanup-host-orphans — Host Process Diagnostic

Report-only. Never kills anything on its own — every finding comes with a
ready-to-copy `kill -TERM <pids>` line so a human (or Claude, after reading
the output) decides what's actually safe to stop.

## When to invoke

- A specific project's VS Code window or terminal becomes sluggish/frozen
  after some time, especially if restarting the window doesn't fix it.
- Swap usage is high and you're not sure why.
- After killing a stuck build/test process, to check whether it left
  orphaned children (MCP helpers, lock files) behind.

## What it checks

1. **VS Code Remote-SSH generations** — VS Code's remote server does not
   reliably terminate the previous `extensionHost`/`fileWatcher`/`tsserver`
   set on reconnect; they pile up across restarts, each `tsserver` capable
   of growing to whatever `typescript.tsserver.maxTsServerMemory` allows
   (commonly several GB). The script clusters these processes by real
   start time (via `/proc/PID/stat` starttime, not directory mtime) and
   prints one block per generation with age and total RSS.
2. **Orphaned MCP/npx helpers** — subprocesses like `chrome-devtools-mcp`
   or other `npx`-launched MCP servers reparent to PID 1 when their parent
   `claude` process dies uncleanly (e.g. `tmux kill-session` instead of a
   graceful exit). Flagged by `ppid == 1` + command matching `mcp`/`npx`/
   `npm exec`.
3. **Long-held /tmp locks** — `flock`-style lock files held for more than
   5 minutes, with the holder PID and command shown (catches the same
   pattern as a leaking integration test that never releases its lock).

## Steps

```bash
bash /opt/projects/claude-patterns/scripts/cleanup-host-orphans.sh
```

Read the output. For any generation/process block that's clearly stale
(compare against what VS Code windows / sessions are actually supposed to
be open), copy its `kill -TERM ...` line and run it. Re-run the script
afterward to confirm `free -h` improved and the stale block is gone.

## Output example

```
=== Generacje VS Code Remote-SSH (...) ===

[generacja @ 2026-07-04 15:03:50, wiek ~1137 min, RSS łącznie 744 MB, 2 procesów]
  pidy: 1897452 1897464
  typy: type=extensionHost type=fileWatcher
  kill -TERM 1897452 1897464
```

## Anti-patterns

- Don't blind-kill the newest generation without checking it isn't the
  window you're currently using — the tool can't tell live from idle,
  only old from new.
- Don't turn this into an unattended cron auto-kill: an old generation
  can still be a legitimately open (just idle) VS Code window for a
  different project.
