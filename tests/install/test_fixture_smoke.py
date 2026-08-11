"""Smoke test that the tmp_handymate_home fixture works."""

from __future__ import annotations

from pathlib import Path

from handymate.core import config as config_mod


def test_fixture_redirects_default_config_dir(tmp_handymate_home: Path) -> None:
    assert config_mod.DEFAULT_CONFIG_DIR == tmp_handymate_home
    assert tmp_handymate_home.exists()
    assert (tmp_handymate_home / ".state").exists()
    assert (tmp_handymate_home / ".state" / "models").exists()


def test_fixture_redirects_config_path(tmp_handymate_home: Path) -> None:
    assert config_mod.DEFAULT_CONFIG_PATH == tmp_handymate_home / "config.toml"
