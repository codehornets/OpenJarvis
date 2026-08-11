"""Storage primitive — persistent searchable storage."""

from __future__ import annotations

# Always-available backend
import handymate.tools.storage.sqlite  # noqa: F401

# Optional backends — import to trigger registration
try:
    import handymate.tools.storage.bm25  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.storage.faiss_backend  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.storage.colbert_backend  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.storage.hybrid  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.storage.dense  # noqa: F401
except ImportError:
    pass

from handymate.tools.storage._stubs import MemoryBackend, RetrievalResult
from handymate.tools.storage.chunking import Chunk, ChunkConfig, chunk_text
from handymate.tools.storage.context import ContextConfig, inject_context
from handymate.tools.storage.ingest import ingest_path, read_document

__all__ = [
    "Chunk",
    "ChunkConfig",
    "ContextConfig",
    "MemoryBackend",
    "RetrievalResult",
    "chunk_text",
    "inject_context",
    "ingest_path",
    "read_document",
]
