#!/usr/bin/env bash
set -euo pipefail

# ── Handymate Quickstart ─────────────────────────────────────────────
# One-command setup: installs deps, starts Ollama + model, launches
# the backend API server and frontend, then opens the browser.
#
# Usage:
#   git clone https://github.com/codehornets/handymate.git
#   cd Handymate
#   ./scripts/quickstart.sh
# ──────────────────────────────────────────────────────────────────────

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
fail()  { echo -e "${RED}[fail]${NC}  $*"; exit 1; }

CLEANUP_PIDS=()
CLEANUP_RUNNING=0
cleanup() {
  if [[ "$CLEANUP_RUNNING" == "1" ]]; then
    # Already shutting down and the user is impatient — hard-kill and bail.
    warn "Forcing shutdown..."
    for pid in "${CLEANUP_PIDS[@]}"; do
      pkill -KILL -P "$pid" 2>/dev/null || true
      kill -KILL "$pid" 2>/dev/null || true
    done
    exit 1
  fi
  CLEANUP_RUNNING=1
  echo ""
  info "Shutting down..."
  for pid in "${CLEANUP_PIDS[@]}"; do
    # Kill the whole subtree (npm -> vite, uv run -> python), not just the wrapper.
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null || true
  done
  # Give processes a bounded grace period instead of blocking on `wait` forever.
  for _ in $(seq 1 20); do
    alive=0
    for pid in "${CLEANUP_PIDS[@]}"; do
      kill -0 "$pid" 2>/dev/null && alive=1
    done
    [[ "$alive" == "0" ]] && break
    sleep 0.2
  done
  for pid in "${CLEANUP_PIDS[@]}"; do
    pkill -KILL -P "$pid" 2>/dev/null || true
    kill -KILL "$pid" 2>/dev/null || true
  done
  ok "Done."
  exit 0
}
trap cleanup EXIT INT TERM

# ── Navigate to repo root ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ── Log setup ────────────────────────────────────────────────────────
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"
OLLAMA_LOG="$LOG_DIR/ollama.log"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

echo -e "${BOLD}"
echo "  ┌──────────────────────────────────┐"
echo "  │       Handymate Quickstart      │"
echo "  └──────────────────────────────────┘"
echo -e "${NC}"

# ── 1. Check Python ──────────────────────────────────────────────────
# Prefer python3, fall back to python (Windows / minimal distros that ship
# only the unversioned name).
info "Checking Python..."
if command -v python3 &>/dev/null; then
  PY_CMD="python3"
elif command -v python &>/dev/null; then
  PY_CMD="python"
else
  fail "Python 3 not found. Install from https://python.org"
fi
PY_VERSION=$("$PY_CMD" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 10 ]; then
  ok "Python $PY_VERSION ($PY_CMD)"
else
  fail "Python 3.10+ required (found $PY_VERSION)"
fi

# ── 2. Check / install uv ───────────────────────────────────────────
info "Checking uv..."
if command -v uv &>/dev/null; then
  ok "uv $(uv --version 2>/dev/null | head -1)"
else
  warn "uv not found — installing..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  ok "uv installed"
fi

# ── 3. Check Node.js ────────────────────────────────────────────────
info "Checking Node.js..."
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    ok "Node.js $NODE_VERSION"
  else
    fail "Node.js 18+ required (found $NODE_VERSION). Install from https://nodejs.org"
  fi
else
  fail "Node.js not found. Install from https://nodejs.org"
fi

# ── 4. Check / install Ollama ────────────────────────────────────────
info "Checking Ollama..."
if command -v ollama &>/dev/null; then
  ok "Ollama found"
else
  warn "Ollama not found — installing..."
  case "$(uname -s)" in
    Darwin)
      if command -v brew &>/dev/null; then
        brew install ollama
      else
        echo "  Download Ollama from https://ollama.com/download"
        echo "  Then re-run this script."
        exit 1
      fi
      ;;
    Linux)
      curl -fsSL https://ollama.com/install.sh | sh
      ;;
    *)
      echo "  Download Ollama from https://ollama.com/download"
      echo "  Then re-run this script."
      exit 1
      ;;
  esac
  ok "Ollama installed"
fi

# ── 5. Start Ollama if not running ───────────────────────────────────
info "Checking if Ollama is running..."
if curl -sf http://localhost:11434/api/tags &>/dev/null; then
  ok "Ollama is running"
else
  info "Starting Ollama..."
  ollama serve >"$OLLAMA_LOG" 2>&1 &
  CLEANUP_PIDS+=($!)
  info "Ollama logs: $OLLAMA_LOG"
  sleep 3
  if curl -sf http://localhost:11434/api/tags &>/dev/null; then
    ok "Ollama started"
  else
    fail "Could not start Ollama. Try running 'ollama serve' manually."
  fi
fi

# ── 6. Pull a starter model ─────────────────────────────────────────
MODEL="${HANDYMATE_MODEL:-qwen3:0.6b}"
info "Ensuring model '$MODEL' is available..."
if ollama list 2>/dev/null | grep -q "$MODEL"; then
  ok "Model '$MODEL' already pulled"
else
  info "Pulling '$MODEL' (this may take a minute)..."
  ollama pull "$MODEL"
  ok "Model '$MODEL' ready"
fi

# ── 7. Install Python dependencies ──────────────────────────────────
info "Installing Python dependencies..."
uv sync --extra desktop --extra tools-search --quiet 2>/dev/null \
  || uv sync --extra desktop --extra tools-search
ok "Python dependencies installed"

# ── 7b. Build Rust extension ──────────────────────────────────────
info "Building Rust extension..."
uv run maturin develop -m rust/crates/handymate-python/Cargo.toml --quiet 2>/dev/null \
  || uv run maturin develop -m rust/crates/handymate-python/Cargo.toml
ok "Rust extension built"

# ── 8. Install frontend dependencies ────────────────────────────────
info "Installing frontend dependencies..."
(cd frontend && npm install --silent 2>/dev/null || npm install)
ok "Frontend dependencies installed"

# ── 9. Start backend ────────────────────────────────────────────────
info "Starting backend API server on port 8000..."
if curl -sf http://localhost:8000/health &>/dev/null; then
  fail "An Handymate server is already running on port 8000. Stop it before re-running quickstart so updated environment variables are applied."
fi
uv run handy serve --port 8000 >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
CLEANUP_PIDS+=("$BACKEND_PID")
info "Backend logs: $BACKEND_LOG"
sleep 3

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  fail "Backend exited during startup. See $BACKEND_LOG for the error."
elif curl -sf http://localhost:8000/health &>/dev/null; then
  ok "Backend running at http://localhost:8000"
else
  warn "Backend may still be starting... check $BACKEND_LOG"
fi

# ── 10. Start frontend ──────────────────────────────────────────────
info "Starting frontend dev server on port 5273..."
(cd frontend && npm run dev) >"$FRONTEND_LOG" 2>&1 &
CLEANUP_PIDS+=($!)
info "Frontend logs: $FRONTEND_LOG"
sleep 3
ok "Frontend running at http://localhost:5273"

# ── 11. Open browser ────────────────────────────────────────────────
URL="http://localhost:5273"
info "Opening $URL ..."
case "$(uname -s)" in
  Darwin) open "$URL" ;;
  Linux)  xdg-open "$URL" 2>/dev/null || true ;;
  MINGW*|MSYS*|CYGWIN*) cmd /c start "" "$URL" 2>/dev/null || true ;;
  *)      true ;;
esac

echo ""
echo -e "${GREEN}${BOLD}  Handymate is running!${NC}"
echo ""
echo "  Chat UI:  http://localhost:5273"
echo "  API:      http://localhost:8000"
echo "  Model:    $MODEL"
echo ""
echo "  Logs:"
echo "    Ollama:    $OLLAMA_LOG"
echo "    Backend:   $BACKEND_LOG"
echo "    Frontend:  $FRONTEND_LOG"
echo ""
echo "  Press Ctrl+C to stop all services."
echo ""

wait
