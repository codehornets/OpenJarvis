"""Native persistent long-term memory for Handymate.

This package provides the automatic memory service that extracts durable facts
from conversations in the background and persists them across sessions. It is
started and stopped as part of the ``handy serve`` / ``handy chat`` lifecycle
and configured via the ``[memory]`` section of ``config.toml``.
"""

from __future__ import annotations

from handymate.memory.extractor import FactExtractor
from handymate.memory.service import (
    MemoryService,
    build_memory_service,
    publish_completed_exchange,
)
from handymate.memory.store import (
    Fact,
    FactStore,
    LocalFactStore,
    create_fact_store,
)

__all__ = [
    "Fact",
    "FactStore",
    "FactExtractor",
    "LocalFactStore",
    "MemoryService",
    "build_memory_service",
    "create_fact_store",
    "publish_completed_exchange",
]
