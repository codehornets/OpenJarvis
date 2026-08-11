.PHONY: setup build test lint format start stop cleanup

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
