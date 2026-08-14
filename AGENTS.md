# AGENTS.md

@RULES.md

This repository is Handymate, a single checkout with a Python backend/runtime,
a Vite + React + Tauri frontend, and a Rust extension layer.

## Working rules

1. Read `RULES.md` before making changes.
2. Keep scope tight. Do not touch unrelated files or clean up adjacent code
   unless it is required for the fix.
3. Use the repo-native tools:
   - `uv` for Python packaging, linting, and tests.
   - `npm ci` plus `npm run typecheck` / `npm run build` inside `frontend/`.
4. Gather local repo context with `bash scripts/context.sh` or the
   `.codex/skills/context` skill instead of asking for pasted status.
5. Prefer the smallest useful verification command.
6. If a requirement is ambiguous, state the assumption and proceed with the
   most reasonable local interpretation when running unattended.

## Layout

- `src/handymate/`: Python package, CLI, backend runtime, and server assets.
- `frontend/`: frontend application source and lockfile-managed Node setup.
- `rust/`: Rust workspace and PyO3 extension.
- `docs/`, `scripts/`, `deploy/`, `tests/`: documentation, installers, packaging,
  and test coverage.
- `.codex/skills/`: repo-embedded workflows for context, pull, push, commit,
  and land tasks.

## Local overrides

Tree-specific `.claude/` or `.codex/` directories may override these rules for
their own subtree. Check the closest instructions first.
