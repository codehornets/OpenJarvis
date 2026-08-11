"""Data source connectors for Deep Research."""

from handymate.connectors._stubs import (
    Attachment,
    BaseConnector,
    Document,
    SyncStatus,
)
from handymate.connectors.store import KnowledgeStore

__all__ = ["Attachment", "BaseConnector", "Document", "KnowledgeStore", "SyncStatus"]

# Auto-register built-in connectors
import handymate.connectors.obsidian  # noqa: F401

try:
    import handymate.connectors.gmail  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.gmail_imap  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.gdrive  # noqa: F401
except ImportError:
    pass  # httpx may not be installed

try:
    import handymate.connectors.notion  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.granola  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.gcontacts  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.imessage  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.apple_notes  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.apple_music  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.apple_contacts  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.slack_connector  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.outlook  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.gcalendar  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.dropbox  # noqa: F401
except ImportError:
    pass  # httpx may not be installed

try:
    import handymate.connectors.whatsapp  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.oura  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.apple_health  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.strava  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.spotify  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.google_tasks  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.weather  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.github_notifications  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.hackernews  # noqa: F401
except ImportError:
    pass

try:
    import handymate.connectors.news_rss  # noqa: F401
except ImportError:
    pass
