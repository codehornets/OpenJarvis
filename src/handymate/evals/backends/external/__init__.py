"""External-framework subprocess backends (Hermes Agent, OpenClaw)."""

from handymate.evals.backends.external.hermes_agent import HermesBackend
from handymate.evals.backends.external.openclaw import OpenClawBackend

__all__ = ["HermesBackend", "OpenClawBackend"]
