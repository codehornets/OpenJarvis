"""Command-line interface for Handymate (Click-based)."""

from __future__ import annotations

import click

import handymate
from handymate.cli._bootstrap import bootstrap_cmd
from handymate.cli.add_cmd import add
from handymate.cli.agent_cmd import agent
from handymate.cli.ask import ask
from handymate.cli.bench_cmd import bench
from handymate.cli.channel_cmd import channel
from handymate.cli.channels_cmd import channels
from handymate.cli.chat_cmd import chat
from handymate.cli.compose_cmd import compose
from handymate.cli.config_cmd import config
from handymate.cli.connect_cmd import connect
from handymate.cli.daemon_cmd import restart, start, status, stop
from handymate.cli.digest_cmd import digest
from handymate.cli.doctor_cmd import doctor
from handymate.cli.eval_cmd import eval_group
from handymate.cli.feedback_cmd import feedback_group
from handymate.cli.gateway_cmd import gateway
from handymate.cli.host_cmd import host
from handymate.cli.init_cmd import init
from handymate.cli.memory_cmd import memory
from handymate.cli.mine_cmd import mine
from handymate.cli.model import model
from handymate.cli.operators_cmd import operators
from handymate.cli.optimize_cmd import optimize_group
from handymate.cli.pearl_cmd import pearl
from handymate.cli.quickstart_cmd import quickstart
from handymate.cli.registry_cmd import registry
from handymate.cli.scan_cmd import scan
from handymate.cli.scheduler_cmd import scheduler
from handymate.cli.self_update_cmd import self_update
from handymate.cli.serve import serve
from handymate.cli.skill_cmd import skill
from handymate.cli.telemetry_cmd import telemetry
from handymate.cli.tool_cmd import tool
from handymate.cli.vault_cmd import vault
from handymate.cli.workflow_cmd import workflow


@click.group(
    help="Handymate — modular AI assistant backend",
    invoke_without_command=True,
)
@click.version_option(version=handymate.__version__, prog_name="handy")
@click.option("--verbose", is_flag=True, default=False, help="Enable debug logging")
@click.option("--quiet", is_flag=True, default=False, help="Suppress non-error output")
@click.pass_context
def cli(ctx: click.Context, verbose: bool, quiet: bool) -> None:
    """Top-level CLI group."""
    from handymate.cli.log_config import setup_logging

    ctx.ensure_object(dict)
    ctx.obj["verbose"] = verbose
    ctx.obj["quiet"] = quiet
    setup_logging(verbose=verbose, quiet=quiet)

    # Check for updates on interactive commands. The banner is noise in
    # demo recordings of ``handy ask --research``, so skip it whenever
    # the research flag is in argv (cheap argv sniff — Click hasn't
    # parsed the subcommand's args yet at this point).
    import sys

    research_mode_active = "--research" in sys.argv
    if not quiet and ctx.invoked_subcommand and not research_mode_active:
        import threading

        from handymate.cli._version_check import check_for_updates

        # Run the PyPI version poll off the hot path: on a cache miss it does
        # a blocking urlopen (up to 3s) that otherwise delays every command,
        # notably `handy serve` startup (#263). It's best-effort and never
        # raises, and the nudge prints to stderr, so a daemon thread is safe —
        # for long-lived commands (serve) it finishes; for short commands that
        # exit first, the check is simply skipped this run (same as a miss).
        threading.Thread(
            target=check_for_updates,
            args=(ctx.invoked_subcommand,),
            daemon=True,
        ).start()

    # First-run guard — routes bare `handy` to chat or init.
    if ctx.invoked_subcommand is None:
        from handymate.cli._first_run import check_and_route

        check_and_route(ctx)


cli.add_command(init, "init")
cli.add_command(ask, "ask")
cli.add_command(chat, "chat")
cli.add_command(serve, "serve")
cli.add_command(model, "model")
cli.add_command(memory, "memory")
cli.add_command(mine, "mine")
cli.add_command(pearl, "pearl")
cli.add_command(telemetry, "telemetry")
cli.add_command(bench, "bench")
cli.add_command(channel, "channel")
cli.add_command(channels, "channels")
cli.add_command(scheduler, "scheduler")
cli.add_command(doctor, "doctor")
cli.add_command(agent, "agents")
cli.add_command(workflow, "workflow")
cli.add_command(skill, "skill")
cli.add_command(start, "start")
cli.add_command(stop, "stop")
cli.add_command(restart, "restart")
cli.add_command(status, "status")
cli.add_command(vault, "vault")
cli.add_command(add, "add")
cli.add_command(operators, "operators")
cli.add_command(eval_group, "eval")
cli.add_command(host, "host")
cli.add_command(quickstart, "quickstart")
cli.add_command(optimize_group, "optimize")
cli.add_command(feedback_group, "feedback")
cli.add_command(compose, "compose")
cli.add_command(gateway, "gateway")
cli.add_command(tool, "tool")
cli.add_command(registry, "registry")
cli.add_command(config, "config")
cli.add_command(scan, "scan")
cli.add_command(connect, "connect")
cli.add_command(digest, "digest")
# deep-research setup pulls the ingestion pipeline (embeddings/numpy). Guard it
# so a broken or slow numpy on Windows — which can raise at IMPORT time, not
# just ImportError (#404) — can never take down the whole CLI, including
# `handy serve`. Invoking `handy deep-research-setup` without the deps still
# errors clearly on demand.
try:
    from handymate.cli.deep_research_setup_cmd import deep_research_setup

    cli.add_command(deep_research_setup, "deep-research-setup")
    cli.add_command(deep_research_setup, "research")
except Exception as _dr_exc:
    import logging as _logging

    _logging.getLogger(__name__).debug("deep-research command unavailable: %s", _dr_exc)
cli.add_command(self_update, "self-update")
cli.add_command(bootstrap_cmd, "_bootstrap")

# Gateway CLI commands (lazy import to avoid pulling starlette)
try:
    from handymate.cli.auth_cmd import auth

    cli.add_command(auth, "auth")
except ImportError:
    pass

try:
    from handymate.cli.tunnel_cmd import tunnel

    cli.add_command(tunnel, "tunnel")
except ImportError:
    pass


def main() -> None:
    """Entry point registered as ``handy`` console script."""
    import sys

    if sys.platform == "win32":
        for _stream in (sys.stdout, sys.stderr):
            if hasattr(_stream, "reconfigure"):
                try:
                    _stream.reconfigure(encoding="utf-8", errors="replace")
                except (AttributeError, OSError):
                    pass
    cli()


__all__ = ["cli", "main"]
