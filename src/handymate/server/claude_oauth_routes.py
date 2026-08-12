"""FastAPI router that drives ``claude setup-token`` to mint a
``CLAUDE_CODE_OAUTH_TOKEN`` via the Claude Code CLI's own browser-based
OAuth flow, so a Claude subscription can be connected from the Settings UI
instead of the user running the command in a terminal.

``claude setup-token`` is an interactive, full-screen (Ink/React) TUI --
it errors immediately under a plain subprocess with piped stdio ("Raw mode
is not supported"). We drive it through a real pseudo-terminal (stdlib
``pty``) in a background thread, watch for the small set of known screens
it prints, and extract the OAuth token from its success screen.

Security note: the PTY transcript transiently contains a live, long-lived
credential once the flow succeeds. We never write it to disk or to the
logger, and we deliberately drop the in-memory buffer the moment the token
is extracted. ``GET /status`` hands the token back to the caller exactly
once (the frontend must persist it immediately via the existing secure
key-storage path and must not itself log or persist it further).
"""

from __future__ import annotations

import fcntl
import logging
import os
import pty
import re
import select
import shutil
import struct
import subprocess
import termios
import threading
import time
from typing import Any, Optional

from fastapi import APIRouter

from handymate.core.paths import get_config_dir

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/cloud/claude-subscription", tags=["cloud"])

_ANSI_RE = re.compile(r"\x1b(?:\[[0-9;?<>=]*[a-zA-Z]|\][^\x07]*\x07|[()][A-Za-z0-9])")
_URL_RE = re.compile(r"(https://\S+?)(?=Pastecodehereifprompted|$)")
_TOKEN_RE = re.compile(r"\(\s*valid\s*for\s*1\s*year\s*\)\s*:\s*(sk-ant-oat[\w-]+)")
_TRUST_PROMPT_RE = re.compile(r"Do you trust the files in this folder")

_WORKDIR = get_config_dir() / "claude_setup_token_work"
_OVERALL_TIMEOUT_SECONDS = 180

_lock = threading.Lock()
_state: dict[str, Any] = {"status": "idle", "url": None, "error": None, "token": None}
_thread: Optional[threading.Thread] = None
_child_pid: Optional[int] = None


def _strip_ansi(raw: str) -> str:
    return _ANSI_RE.sub("", raw).replace("\r", "")


def _set_winsize(fd: int, rows: int = 50, cols: int = 4000) -> None:
    """Give the child a very wide terminal so long URLs never hard-wrap.

    A hard-wrapped URL would embed a literal newline mid-string, breaking
    naive regex extraction; a wide pty sidesteps that instead of trying to
    reassemble wrapped text.
    """
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)


def _find_claude_binary() -> Optional[str]:
    """Locate the standalone ``claude`` CLI (not the bundled agent SDK).

    The npm package Handymate auto-installs for ``ClaudeCodeAgent``
    (``@anthropic-ai/claude-code``) does not reliably run ``setup-token``
    headlessly under a pty -- in testing it fell through into the general
    interactive REPL instead. Only the separately-installed ``claude``
    binary is used here.
    """
    return shutil.which("claude")


def _run_setup_token() -> None:
    """Background-thread worker: drive ``claude setup-token`` over a pty."""
    global _child_pid

    claude_bin = _find_claude_binary()
    if not claude_bin:
        with _lock:
            _state.update(
                status="error",
                url=None,
                token=None,
                error=(
                    "The `claude` CLI isn't installed or isn't on PATH. "
                    "Install the Claude Code CLI and ensure `claude` is on "
                    "PATH, or paste a token from running `claude setup-token` "
                    "yourself into the field above instead."
                ),
            )
        return

    _WORKDIR.mkdir(parents=True, exist_ok=True)

    master_fd, slave_fd = pty.openpty()
    _set_winsize(slave_fd)

    try:
        proc = subprocess.Popen(
            [claude_bin, "setup-token"],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            cwd=str(_WORKDIR),
            start_new_session=True,
            close_fds=True,
        )
    except Exception as exc:  # noqa: BLE001
        os.close(master_fd)
        os.close(slave_fd)
        with _lock:
            _state.update(
                status="error", url=None, token=None,
                error=f"Failed to start claude: {exc}",
            )
        return

    os.close(slave_fd)
    _child_pid = proc.pid

    buf = ""
    trust_confirmed = False
    url_sent = False
    succeeded = False
    deadline = time.time() + _OVERALL_TIMEOUT_SECONDS

    try:
        while time.time() < deadline:
            if proc.poll() is not None:
                break
            ready, _, _ = select.select([master_fd], [], [], 1.0)
            if not ready:
                continue
            try:
                chunk = os.read(master_fd, 65536)
            except OSError:
                break
            if not chunk:
                break
            buf += chunk.decode("utf-8", errors="replace")
            if len(buf) > 200_000:
                buf = buf[-20_000:]

            clean = _strip_ansi(buf)

            if not trust_confirmed and _TRUST_PROMPT_RE.search(clean):
                try:
                    os.write(master_fd, b"\r")
                except OSError:
                    pass
                trust_confirmed = True

            if not url_sent:
                m = _URL_RE.search(clean.replace("\n", ""))
                if m:
                    with _lock:
                        _state.update(status="awaiting_browser", url=m.group(1))
                    url_sent = True

            m = _TOKEN_RE.search(clean)
            if m:
                token = m.group(1)
                with _lock:
                    _state.update(status="success", url=None, token=token, error=None)
                succeeded = True
                buf = ""  # drop the transcript immediately -- it held a live secret
                break
        else:
            pass  # fell through the while on deadline
    finally:
        buf = ""  # never let the transcript (may contain the token) linger
        try:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
        except Exception:  # noqa: BLE001
            pass
        try:
            os.close(master_fd)
        except OSError:
            pass
        _child_pid = None

    if not succeeded:
        with _lock:
            if _state["status"] != "success":
                _state.update(
                    status="error", url=None, token=None,
                    error="Timed out or exited before completing sign-in.",
                )


@router.post("/connect")
async def connect() -> dict[str, Any]:
    """Start (or report the status of an already-running) sign-in flow."""
    global _thread

    with _lock:
        if _thread is not None and _thread.is_alive():
            return {"status": _state["status"]}
        _state.update(status="starting", url=None, error=None, token=None)
        _thread = threading.Thread(target=_run_setup_token, daemon=True)
        _thread.start()

    return {"status": "starting"}


@router.get("/status")
async def status() -> dict[str, Any]:
    """Poll current state.

    The token, if present, is included exactly once -- a subsequent poll
    after a successful run will report ``status: "success"`` with
    ``token: null``, since it has already been handed to the caller.
    """
    with _lock:
        resp = {
            "status": _state["status"],
            "url": _state["url"],
            "error": _state["error"],
            "token": _state["token"],
        }
        if _state["token"] is not None:
            _state["token"] = None
    return resp


@router.post("/cancel")
async def cancel() -> dict[str, Any]:
    """Cancel an in-flight sign-in attempt."""
    pid = _child_pid
    if pid is not None:
        try:
            os.kill(pid, 15)
        except ProcessLookupError:
            pass
    with _lock:
        _state.update(status="idle", url=None, error=None, token=None)
    return {"status": "idle"}


__all__ = ["router"]
