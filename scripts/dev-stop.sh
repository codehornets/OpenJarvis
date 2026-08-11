#!/usr/bin/env bash
set -uo pipefail

# ── OpenJarvis dev stop ──────────────────────────────────────────────
# Stops the backend/frontend dev servers started by scripts/dev-start.sh.
# Pass --cleanup to also remove logs/pid files and force-free ports
# 8000/5173 if something untracked is still squatting on them.
# ──────────────────────────────────────────────────────────────────────

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

LOG_DIR="$REPO_ROOT/logs"
CLEANUP=0
[[ "${1:-}" == "--cleanup" ]] && CLEANUP=1

alive() { [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }

# Recursively collect all descendant PIDs of $1 (npm -> vite -> esbuild, etc).
# Snapshotting this up front matters: once a parent dies, `pkill -P` can no
# longer find children that got reparented (e.g. to init) before they exit.
descendants() {
  local parent="$1" kids
  kids="$(pgrep -P "$parent" 2>/dev/null || true)"
  for k in $kids; do
    echo "$k"
    descendants "$k"
  done
}

stop_pidfile() {
  local name="$1" pidfile="$2"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile")"
    if alive "$pid"; then
      info "Stopping $name (pid $pid)..."
      local tree
      tree="$pid $(descendants "$pid")"
      kill -TERM $tree 2>/dev/null || true
      for _ in $(seq 1 20); do
        local any_alive=0
        for p in $tree; do alive "$p" && any_alive=1; done
        [[ "$any_alive" == "0" ]] && break
        sleep 0.2
      done
      kill -KILL $tree 2>/dev/null || true
      ok "$name stopped"
    else
      warn "$name pidfile stale (pid $pid not running)"
    fi
    rm -f "$pidfile"
  else
    warn "$name not tracked (no pidfile) — nothing to stop"
  fi
}

stop_pidfile "backend" "$LOG_DIR/backend.pid"
stop_pidfile "frontend" "$LOG_DIR/frontend.pid"

if [[ "$CLEANUP" == "1" ]]; then
  for port in 8000 5173; do
    pid="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pid" ]]; then
      warn "Port $port still held by untracked pid $pid — force-killing"
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
  info "Removing logs..."
  rm -rf "$LOG_DIR"
  ok "Cleanup done."
else
  info "Logs kept at $LOG_DIR (use 'make cleanup' to remove them too)"
fi
