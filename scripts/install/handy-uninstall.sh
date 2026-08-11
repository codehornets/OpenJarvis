#!/usr/bin/env bash
# handy-uninstall.sh — clean removal of Handymate from $HOME.
#
# Removes:
#   ~/.handymate/
#   ~/.local/bin/handy
#   ~/.local/bin/handy-uninstall
#
# Does NOT remove: ollama, uv, or the Rust toolchain.

set -euo pipefail

HANDYMATE_HOME="${HANDYMATE_HOME:-$HOME/.handymate}"

if [[ -f "$HANDYMATE_HOME/.state/bg.pid" ]]; then
    pid=$(cat "$HANDYMATE_HOME/.state/bg.pid" 2>/dev/null || echo "")
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        echo "Stopping background work (pid=$pid)..."
        kill "$pid" 2>/dev/null || true
    fi
fi

if command -v ollama >/dev/null 2>&1; then
    ollama stop >/dev/null 2>&1 || true
fi

if [[ -d "$HANDYMATE_HOME" ]]; then
    rm -rf "$HANDYMATE_HOME"
    echo "Removed $HANDYMATE_HOME"
fi

for f in "$HOME/.local/bin/handy" "$HOME/.local/bin/handy-uninstall"; do
    if [[ -L "$f" ]] || [[ -f "$f" ]]; then
        rm -f "$f"
        echo "Removed $f"
    fi
done

cat <<EOF

Handymate removed.

Left intact (may be used by other tools):
  - Ollama       (uninstall: brew uninstall ollama  /  rm -f /usr/local/bin/ollama)
  - uv           (uninstall: rm -rf ~/.local/share/uv ~/.cargo/bin/uv)
  - Rust toolchain (uninstall: rustup self uninstall)
EOF
