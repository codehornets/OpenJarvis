#!/usr/bin/env bash
set -euo pipefail

# ── OpenJarvis dev start ─────────────────────────────────────────────
# Starts backend + frontend dev servers in the background (detached),
# assuming deps are already installed (see scripts/quickstart.sh for
# first-time setup). Pairs with scripts/dev-stop.sh.
# ──────────────────────────────────────────────────────────────────────

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
fail()  { echo -e "${RED}[fail]${NC}  $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_PID_FILE="$LOG_DIR/backend.pid"
FRONTEND_PID_FILE="$LOG_DIR/frontend.pid"

alive() { [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }

# ── Backend ──────────────────────────────────────────────────────────
if [[ -f "$BACKEND_PID_FILE" ]] && alive "$(cat "$BACKEND_PID_FILE")"; then
  warn "Backend already running (pid $(cat "$BACKEND_PID_FILE")). Skipping."
elif curl -sf http://localhost:8000/health &>/dev/null; then
  fail "Something is already serving http://localhost:8000 (not tracked by dev-start). Run 'make stop' or free the port manually."
else
  info "Starting backend on port 8000..."
  nohup uv run handy serve --port 8000 >"$BACKEND_LOG" 2>&1 &
  echo $! >"$BACKEND_PID_FILE"
  disown
  sleep 2
  if alive "$(cat "$BACKEND_PID_FILE")"; then
    ok "Backend running at http://localhost:8000 (pid $(cat "$BACKEND_PID_FILE"))"
  else
    rm -f "$BACKEND_PID_FILE"
    fail "Backend exited during startup. See $BACKEND_LOG"
  fi
fi

# ── Frontend ─────────────────────────────────────────────────────────
if [[ -f "$FRONTEND_PID_FILE" ]] && alive "$(cat "$FRONTEND_PID_FILE")"; then
  warn "Frontend already running (pid $(cat "$FRONTEND_PID_FILE")). Skipping."
else
  info "Starting frontend dev server..."
  pushd frontend >/dev/null
  nohup npm run dev >"$FRONTEND_LOG" 2>&1 &
  echo $! >"$FRONTEND_PID_FILE"
  disown
  popd >/dev/null
  sleep 2
  if alive "$(cat "$FRONTEND_PID_FILE")"; then
    ok "Frontend starting — check $FRONTEND_LOG for the actual port (pid $(cat "$FRONTEND_PID_FILE"))"
  else
    rm -f "$FRONTEND_PID_FILE"
    fail "Frontend exited during startup. See $FRONTEND_LOG"
  fi
fi

echo ""
info "Logs: $BACKEND_LOG, $FRONTEND_LOG"
info "Use 'make stop' to shut both down, 'make cleanup' to also clear logs/pids."
