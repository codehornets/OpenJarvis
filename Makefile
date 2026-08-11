.PHONY: setup build test lint format start stop cleanup claude reset

# Mirrors .github/workflows/ci.yml so `make test` matches CI locally.

setup:
	uv sync --extra dev --extra framework-comparison --extra server

build:
	uv run maturin develop --manifest-path rust/crates/openjarvis-python/Cargo.toml

test: build
	uv run pytest tests/ -n auto -q --tb=short -m "not live and not cloud and not hub"

lint:
	uv run ruff check src/ tests/
	uv run ruff format --check src/ tests/

format:
	uv run ruff format src/ tests/

# Backend + frontend dev servers, backgrounded (see scripts/quickstart.sh
# for first-time setup — install Ollama/deps/build the Rust extension).
start:
	./scripts/dev-start.sh

stop:
	./scripts/dev-stop.sh

# Like stop, but also force-frees ports 8000/5173 if something untracked
# is squatting on them, and removes logs/pid files under logs/.
cleanup:
	./scripts/dev-stop.sh --cleanup

claude:
	claude --dangerously-skip-permissions --dangerously-load-development-channels plugin:annotate@claude-annotate --model sonnet --name Handymate --effort medium

# Full wipe + reinstall: drops the venv, Rust build artifacts, and frontend
# node_modules, then rebuilds everything from scratch. Use when the venv or
# build cache is suspect and `make setup && make build` alone isn't enough.
reset:
	rm -rf .venv rust/target frontend/src-tauri/target frontend/node_modules
	$(MAKE) setup
	$(MAKE) build
	cd frontend && npm install