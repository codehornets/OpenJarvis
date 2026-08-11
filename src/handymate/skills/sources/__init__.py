"""Skill source resolvers — Hermes, OpenClaw, generic GitHub."""

from handymate.skills.sources.base import ResolvedSkill, SourceResolver
from handymate.skills.sources.github import GitHubResolver
from handymate.skills.sources.hermes import HERMES_REPO_URL, HermesResolver
from handymate.skills.sources.openclaw import OPENCLAW_REPO_URL, OpenClawResolver

__all__ = [
    "GitHubResolver",
    "HERMES_REPO_URL",
    "HermesResolver",
    "OPENCLAW_REPO_URL",
    "OpenClawResolver",
    "ResolvedSkill",
    "SourceResolver",
]
