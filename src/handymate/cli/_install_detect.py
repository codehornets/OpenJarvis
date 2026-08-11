"""Detect how Handymate was installed so we can show the right upgrade
command (and run the right upgrade command for ``handy self-update``).

Three install paths are supported today:

- **PyPI** (``pip install handymate``). The package lives somewhere
  inside ``site-packages``. Upgrade with ``pip install --upgrade handymate``.
- **uv tool** (``uv tool install handymate``). Lives in a uv-managed
  isolated venv under ``~/.local/share/uv/tools/``. Upgrade with
  ``uv tool upgrade handymate``.
- **Editable git checkout** (``uv sync`` / ``pip install -e .`` from a
  cloned repo). The package's ``__file__`` is inside a working tree
  with a ``.git`` directory at the repo root. Upgrade with
  ``git pull && uv sync --inexact`` from the checkout. ``--inexact`` is
  important here: a bare ``uv sync`` removes packages installed by extras or
  dependency groups that are not part of the base project.

We detect by inspecting ``handymate.__file__``. If we can't tell with
confidence we fall back to the PyPI command — that's the most common
case and the worst outcome is a no-op for a user who has nothing to
pull from PyPI.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class InstallInfo:
    """How Handymate was installed."""

    kind: str  # "pypi" | "uv-tool" | "editable-git" | "unknown"
    upgrade_command: str
    repo_root: Optional[Path] = None  # only set for editable-git


def detect_install() -> InstallInfo:
    """Return an :class:`InstallInfo` for the running interpreter.

    Cheap: just walks the parent directories of ``handymate.__file__``
    once and checks for marker directories. No subprocess calls.
    """
    try:
        import handymate

        pkg_file = Path(handymate.__file__).resolve()
    except Exception:
        return InstallInfo(
            kind="unknown",
            upgrade_command="pip install --upgrade handymate",
        )

    parts = [p.lower() for p in pkg_file.parts]

    if "uv" in parts and "tools" in parts:
        return InstallInfo(
            kind="uv-tool",
            upgrade_command="uv tool upgrade handymate",
        )

    # Editable install: a ``.git`` dir within a few parents of the
    # package source. Walk up at most ~8 levels — enough for typical
    # ``<repo>/src/handymate/__init__.py`` layouts plus headroom, but
    # not so deep we wander into home or root.
    candidate = pkg_file.parent
    for _ in range(8):
        if (candidate / ".git").exists() and (candidate / "pyproject.toml").exists():
            return InstallInfo(
                kind="editable-git",
                upgrade_command=(f"cd {candidate} && git pull && uv sync --inexact"),
                repo_root=candidate,
            )
        if candidate.parent == candidate:
            break
        candidate = candidate.parent

    if "site-packages" in parts:
        return InstallInfo(
            kind="pypi",
            upgrade_command="pip install --upgrade handymate",
        )

    return InstallInfo(
        kind="unknown",
        upgrade_command="pip install --upgrade handymate",
    )
