#!/usr/bin/env bash
# Report-only diagnostic for two recurring host issues:
#   1. VS Code Remote-SSH leaves old extensionHost/fileWatcher/tsserver
#      generations running after every reconnect instead of replacing them.
#   2. MCP helper subprocesses (npx ...-mcp, chrome-devtools-mcp, etc.)
#      get orphaned when their parent `claude` process dies uncleanly
#      (tmux kill-session, crash) instead of exiting with it.
# Never kills anything — prints ready-to-copy `kill -TERM` lines instead.
set -euo pipefail

GROUP_WINDOW_SECS=20
LOCK_GLOB="/tmp/*.lock"
LOCK_WARN_SECS=300

section() { printf '\n=== %s ===\n' "$1"; }

mem_summary() {
  section "Pamięć / swap"
  free -h
}

vscode_generations() {
  section "Generacje VS Code Remote-SSH (extensionHost / fileWatcher / tsserver / jsonServerMain)"

  local tmp boot_epoch clk_tck
  tmp=$(mktemp)
  clk_tck=$(getconf CLK_TCK)
  boot_epoch=$(( $(date +%s) - $(cut -d. -f1 /proc/uptime) ))

  pgrep -f 'bootstrap-fork --type=(extensionHost|fileWatcher|ptyHost)|tsserver\.js|jsonServerMain' 2>/dev/null \
    | while read -r pid; do
        [ -d "/proc/$pid" ] || continue
        cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | sed 's/ *$//')
        [[ "$cmd" == *.vscode-server* ]] || continue
        stat_line=$(cat "/proc/$pid/stat" 2>/dev/null) || continue
        rest="${stat_line##*) }"
        starttime_ticks=$(awk '{print $20}' <<<"$rest")
        [ -n "$starttime_ticks" ] || continue
        start_epoch=$(( boot_epoch + starttime_ticks / clk_tck ))
        rss_kb=$(awk '/VmRSS/{print $2}' "/proc/$pid/status" 2>/dev/null || echo 0)
        type=$(grep -oE 'type=[a-zA-Z]+' <<<"$cmd" || echo "tsserver/jsonServer")
        printf '%s\t%s\t%s\t%s\n' "$start_epoch" "$pid" "$rss_kb" "$type" >> "$tmp"
      done

  if [ ! -s "$tmp" ]; then
    echo "(brak procesów vscode-server)"
    rm -f "$tmp"
    return
  fi

  sort -n "$tmp" | awk -F'\t' -v window="$GROUP_WINDOW_SECS" -v now="$(date +%s)" '
    function flush() {
      if (n == 0) return
      cmd = "date -d @" gstart " \"+%Y-%m-%d %H:%M:%S\""
      cmd | getline when; close(cmd)
      age_min = int((now - gstart) / 60)
      printf "\n[generacja @ %s, wiek ~%d min, RSS łącznie %.0f MB, %d procesów]\n", when, age_min, total_rss/1024, n
      printf "  pidy:%s\n", pids
      printf "  typy:%s\n", types
      printf "  kill -TERM%s\n", pids
    }
    {
      start=$1; pid=$2; rss=$3; type=$4
      if (n>0 && start-last>window) { flush(); n=0; pids=""; types=""; total_rss=0 }
      if (n==0) gstart=start
      n++; pids = pids " " pid; types = types " " type; total_rss += rss; last = start
    }
    END { flush() }
  '
  rm -f "$tmp"
}

orphaned_mcp_helpers() {
  section "Osierocone procesy MCP / npx (ppid=1 = rodzic-claude już nie żyje)"

  local found=0
  while read -r pid ppid cmd; do
    [ "$ppid" = "1" ] || continue
    case "$cmd" in
      *mcp*|*npm\ exec*|*npx*) ;;
      *) continue ;;
    esac
    found=1
    etime=$(ps -o etime= -p "$pid" 2>/dev/null | tr -d ' ')
    rss_kb=$(awk '/VmRSS/{print $2}' "/proc/$pid/status" 2>/dev/null || echo 0)
    printf '  PID %-8s etime=%-12s RSS=%sKB  %s\n' "$pid" "$etime" "$rss_kb" "$cmd"
  done < <(ps -eo pid,ppid,cmd --no-headers)

  if [ "$found" = 0 ]; then
    echo "(brak kandydatów)"
  else
    echo
    ps -eo pid,ppid,cmd --no-headers | awk '$2==1 && ($0 ~ /mcp/ || $0 ~ /npm exec/ || $0 ~ /npx/) {printf "%s ", $1} END{if(NR>0) print ""}' \
      | sed 's/^/  kill -TERM /'
  fi
}

stuck_locks() {
  section "Długo trzymane locki w /tmp (>${LOCK_WARN_SECS}s)"

  local found=0
  for lock in $LOCK_GLOB; do
    [ -e "$lock" ] || continue
    holder=$(lsof -t "$lock" 2>/dev/null | head -1) || true
    [ -n "$holder" ] || continue
    etime_secs=$(ps -o etimes= -p "$holder" 2>/dev/null | tr -d ' ')
    [ -n "$etime_secs" ] || continue
    if [ "$etime_secs" -gt "$LOCK_WARN_SECS" ]; then
      found=1
      cmd=$(ps -o cmd= -p "$holder" 2>/dev/null)
      printf '  %s trzymany od %ss przez PID %s: %s\n' "$lock" "$etime_secs" "$holder" "$cmd"
    fi
  done
  [ "$found" = 0 ] && echo "(brak)"
}

mem_summary
vscode_generations
orphaned_mcp_helpers
stuck_locks
