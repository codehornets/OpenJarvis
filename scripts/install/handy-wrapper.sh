#!/usr/bin/env bash
# handy-wrapper.sh — symlinked to ~/.local/bin/handy.
# Activates the managed venv and execs the real handy CLI.

HANDYMATE_HOME="${HANDYMATE_HOME:-$HOME/.handymate}"
VENV="$HANDYMATE_HOME/.venv"

if [[ ! -d "$VENV" ]]; then
    echo "handy: venv not found at $VENV" >&2
    echo "Re-run the installer: curl -fsSL https://codehornets.github.io/handymate/install.sh | bash" >&2
    exit 1
fi

exec "$VENV/bin/handy" "$@"
