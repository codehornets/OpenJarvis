"""Tests for the claude-subscription OAuth router.

Covers regex extraction against synthetic (non-real) `claude setup-token`
output, and the not-installed error path. Does NOT spawn a real `claude`
process or drive a real OAuth flow -- that was verified manually.
"""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from handymate.server.app import create_app  # noqa: E402
from handymate.server.claude_oauth_routes import (  # noqa: E402
    _strip_ansi,
    _TOKEN_RE,
    _TRUST_PROMPT_RE,
    _URL_RE,
)


def _make_engine():
    engine = MagicMock()
    engine.engine_id = "mock"
    engine.health.return_value = True
    engine.list_models.return_value = ["test-model"]
    return engine


@pytest.fixture
def client():
    app = create_app(_make_engine(), "test-model")
    return TestClient(app)


# ---------------------------------------------------------------------------
# Regex extraction against synthetic output shaped like the real CLI's
# ---------------------------------------------------------------------------

_SYNTHETIC_SUCCESS_OUTPUT = (
    "Browser didn't open? Use the url below to sign in (c to copy)\n\n"
    "https://claude.com/cai/oauth/authorize?code=true&client_id=abc123&"
    "response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode"
    "%2Fcallback&scope=user%3\nAinference&state=xyz\n\n\n"
    "Pastecodehereifprompted>\n"
    "✓ Long-lived authentication token created successfully! Your OAuth token "
    "(valid for 1 year):sk-ant-oat01-FAKETESTTOKENNOTREAL1234567890\n"
    "Store this token securely. You won't be able to see it again.\n"
)


class TestRegexExtraction:
    def test_url_extracted_without_embedded_newline(self):
        clean = _strip_ansi(_SYNTHETIC_SUCCESS_OUTPUT)
        m = _URL_RE.search(clean.replace("\n", ""))
        assert m is not None
        assert m.group(1).startswith("https://claude.com/cai/oauth/authorize?")
        assert "\n" not in m.group(1)
        # the wrap-split "user%3" + "Ainference" must be rejoined
        assert "user%3Ainference" in m.group(1)

    def test_token_extracted(self):
        clean = _strip_ansi(_SYNTHETIC_SUCCESS_OUTPUT)
        m = _TOKEN_RE.search(clean)
        assert m is not None
        assert m.group(1) == "sk-ant-oat01-FAKETESTTOKENNOTREAL1234567890"

    def test_trust_prompt_not_present_in_success_output(self):
        clean = _strip_ansi(_SYNTHETIC_SUCCESS_OUTPUT)
        assert _TRUST_PROMPT_RE.search(clean) is None

    def test_trust_prompt_detected(self):
        sample = "Do you trust the files in this folder?\n❯ 1. Yes, proceed"
        assert _TRUST_PROMPT_RE.search(_strip_ansi(sample)) is not None


# ---------------------------------------------------------------------------
# Endpoint behavior
# ---------------------------------------------------------------------------


class TestClaudeOAuthRoutes:
    def test_connect_reports_not_installed_when_claude_missing(self, client):
        with patch(
            "handymate.server.claude_oauth_routes._find_claude_binary",
            return_value=None,
        ):
            resp = client.post("/v1/cloud/claude-subscription/connect")
            assert resp.status_code == 200

            # Background thread runs fast when there's nothing to spawn;
            # poll briefly for it to land in the error state.
            for _ in range(20):
                status_resp = client.get("/v1/cloud/claude-subscription/status")
                body = status_resp.json()
                if body["status"] == "error":
                    break
                time.sleep(0.05)

            assert body["status"] == "error"
            assert "claude" in body["error"].lower()
            assert body["token"] is None

    def test_cancel_resets_state(self, client):
        resp = client.post("/v1/cloud/claude-subscription/cancel")
        assert resp.status_code == 200
        assert resp.json()["status"] == "idle"

        status_resp = client.get("/v1/cloud/claude-subscription/status")
        body = status_resp.json()
        assert body["status"] == "idle"
        assert body["token"] is None

    def test_token_returned_exactly_once(self, client):
        from handymate.server import claude_oauth_routes as mod

        with mod._lock:
            mod._state.update(
                status="success", url=None, error=None, token="sk-ant-oat01-fake"
            )

        first = client.get("/v1/cloud/claude-subscription/status").json()
        assert first["token"] == "sk-ant-oat01-fake"

        second = client.get("/v1/cloud/claude-subscription/status").json()
        assert second["token"] is None
        assert second["status"] == "success"
