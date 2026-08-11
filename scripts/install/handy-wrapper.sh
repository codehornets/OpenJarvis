#!/usr/bin/env bash
# handy-wrapper.sh — symlinked to ~/.local/bin/handy.
# Activates the managed venv and execs the real handy CLI.

OPENJARVIS_HOME="${OPENJARVIS_HOME:-$HOME/.openjarvis}"
VENV="$OPENJARVIS_HOME/.venv"

if [[ ! -d "$VENV" ]]; then
    echo "handy: venv not found at $VENV" >&2
    echo "Re-run the installer: curl -fsSL https://open-jarvis.github.io/OpenJarvis/install.sh | bash" >&2
    exit 1
fi

exec "$VENV/bin/handy" "$@"
