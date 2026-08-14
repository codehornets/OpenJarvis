## RULES

1. Read this first. Handymate is a single repository with three main surfaces:
   - `src/handymate/`: the Python package, CLI, and backend runtime.
   - `frontend/`: the Vite + React + Tauri application. Use npm here.
   - `rust/`: the native Rust/PyO3 extension and Tauri-side crates.
   Supporting code lives in `docs/`, `scripts/`, `deploy/`, `examples/`, `configs/`, and `tests/`.

2. Use the right package manager for the right surface.
   - Python work uses `uv`.
   - Frontend work uses `npm ci` in `frontend/`, then `npm run typecheck` and `npm run build`.
   - Do not introduce pnpm or yarn unless the repo is explicitly migrated.

3. Formatting is repo-level, not ad hoc.
   - Python formatting and import order are owned by Ruff.
   - `.editorconfig` enforces UTF-8, LF, and the local indentation defaults.
   - Keep YAML, JSON, and TOML files whitespace-clean and syntactically valid.

4. Verify the smallest useful slice before claiming success.
   - Prefer targeted checks over full-suite runs when the change is scoped.
   - For Python, use Ruff, pytest, or the smallest relevant command.
   - For frontend changes, use `npm run typecheck` and `npm run build`.

5. Keep changes scoped.
   - Do not touch unrelated files.
   - If a requirement is ambiguous, note the assumption and proceed with the most reasonable local fix when running unattended.
   - Surface architecture or workflow issues you discover, but do not fold unrelated cleanup into the same change.

6. For local repo context, prefer `bash scripts/context.sh` or the
   `.codex/skills/context` skill. It should show branch, status, recent commits,
   and PR metadata when `gh` is available.
