"""SQLite-backed store for Projects, Conversations, and Conversation messages.

Projects group conversations, carry per-project custom instructions applied
at chat time (see ``handymate.server.routes``), and own a knowledge base
(``handymate.projects.knowledge_store.ProjectKnowledgeStore``).

No migration framework is used in this repo — schema changes are additive
``ALTER TABLE`` calls guarded by ``PRAGMA table_info`` checks, matching
``handymate.connectors.store.KnowledgeStore``.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

_CREATE_TABLES = """
CREATE TABLE IF NOT EXISTS projects (
    id                   TEXT PRIMARY KEY,
    user_id              TEXT NOT NULL DEFAULT 'local',
    name                 TEXT NOT NULL,
    description          TEXT NOT NULL DEFAULT '',
    custom_instructions  TEXT NOT NULL DEFAULT '',
    color                TEXT NOT NULL DEFAULT '',
    created_at           REAL NOT NULL,
    updated_at           REAL NOT NULL,
    archived_at          REAL
);

CREATE TABLE IF NOT EXISTS conversations (
    id           TEXT PRIMARY KEY,
    project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL DEFAULT 'local',
    title        TEXT NOT NULL DEFAULT 'New chat',
    model        TEXT NOT NULL DEFAULT 'default',
    created_at   REAL NOT NULL,
    updated_at   REAL NOT NULL,
    deleted_at   REAL
);
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    timestamp       REAL NOT NULL,
    metadata        TEXT NOT NULL DEFAULT '{}',
    seq             INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON conversation_messages(conversation_id, seq);
"""


class ProjectNotFoundError(KeyError):
    """Raised when a project id doesn't exist."""


class ConversationNotFoundError(KeyError):
    """Raised when a conversation id doesn't exist."""


class ProjectStore:
    """Manages projects, conversations, and their messages."""

    def __init__(self, db_path: Union[str, Path] = "") -> None:
        if not db_path:
            from handymate.core.paths import get_config_dir

            db_path = get_config_dir() / "projects.db"

        self._db_path = str(db_path)
        if self._db_path != ":memory:":
            from handymate.security.file_utils import secure_create

            secure_create(Path(self._db_path))

        self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys=ON;")
        self._conn.executescript(_CREATE_TABLES)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    # ------------------------------------------------------------------
    # Projects
    # ------------------------------------------------------------------

    def create_project(
        self,
        name: str,
        *,
        description: str = "",
        custom_instructions: str = "",
        color: str = "",
        user_id: str = "local",
    ) -> Dict[str, Any]:
        project_id = str(uuid.uuid4())
        now = time.time()
        self._conn.execute(
            "INSERT INTO projects "
            "(id, user_id, name, description, custom_instructions, color, "
            " created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (project_id, user_id, name, description, custom_instructions, color, now, now),
        )
        self._conn.commit()
        return self.get_project(project_id)

    def list_projects(self) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT * FROM projects WHERE archived_at IS NULL ORDER BY updated_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def get_project(self, project_id: str) -> Dict[str, Any]:
        row = self._conn.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        if row is None:
            raise ProjectNotFoundError(project_id)
        return dict(row)

    def update_project(
        self,
        project_id: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        custom_instructions: Optional[str] = None,
        color: Optional[str] = None,
    ) -> Dict[str, Any]:
        current = self.get_project(project_id)
        fields = {
            "name": name if name is not None else current["name"],
            "description": description if description is not None else current["description"],
            "custom_instructions": (
                custom_instructions if custom_instructions is not None else current["custom_instructions"]
            ),
            "color": color if color is not None else current["color"],
        }
        self._conn.execute(
            "UPDATE projects SET name = ?, description = ?, custom_instructions = ?, "
            "color = ?, updated_at = ? WHERE id = ?",
            (*fields.values(), time.time(), project_id),
        )
        self._conn.commit()
        return self.get_project(project_id)

    def delete_project(self, project_id: str) -> None:
        """Delete a project and cascade-delete its conversations/messages.

        SQLite enforces ``ON DELETE CASCADE`` for ``conversations`` (and
        transitively ``conversation_messages``) since foreign keys are
        enabled on this connection. Project knowledge chunks/documents are
        deleted separately by the caller via ``ProjectKnowledgeStore``
        (different store/table, same db file).
        """
        self.get_project(project_id)  # raises if missing
        self._conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        self._conn.commit()

    # ------------------------------------------------------------------
    # Conversations
    # ------------------------------------------------------------------

    def create_conversation(
        self,
        *,
        id: Optional[str] = None,
        project_id: Optional[str] = None,
        title: str = "New chat",
        model: str = "default",
        user_id: str = "local",
    ) -> Dict[str, Any]:
        """Create a conversation, optionally with a client-supplied id.

        The frontend generates the id itself (see ``lib/store.ts``) so it can
        add the conversation to local UI state synchronously while this
        persists in the background — accepting the id here keeps both sides
        in agreement instead of needing a round-trip before the UI can react.
        """
        if project_id is not None:
            self.get_project(project_id)  # raises if missing
        conv_id = id or str(uuid.uuid4())
        now = time.time()
        self._conn.execute(
            "INSERT INTO conversations "
            "(id, project_id, user_id, title, model, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (conv_id, project_id, user_id, title, model, now, now),
        )
        self._conn.commit()
        return self.get_conversation(conv_id)

    def list_conversations(
        self, *, project_id: Optional[str] = None, only_ungrouped: bool = False
    ) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM conversations WHERE deleted_at IS NULL"
        params: list = []
        if only_ungrouped:
            sql += " AND project_id IS NULL"
        elif project_id is not None:
            sql += " AND project_id = ?"
            params.append(project_id)
        sql += " ORDER BY updated_at DESC"
        rows = self._conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def get_conversation(self, conversation_id: str) -> Dict[str, Any]:
        row = self._conn.execute(
            "SELECT * FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        if row is None:
            raise ConversationNotFoundError(conversation_id)
        return dict(row)

    def update_conversation(
        self,
        conversation_id: str,
        *,
        title: Optional[str] = None,
        project_id: Any = "__unset__",
    ) -> Dict[str, Any]:
        """Rename a conversation and/or move it to a different project.

        ``project_id`` defaults to a sentinel so callers can explicitly pass
        ``None`` to move a conversation to "Ungrouped" without that being
        ambiguous with "leave unchanged".
        """
        current = self.get_conversation(conversation_id)
        new_title = title if title is not None else current["title"]
        if project_id == "__unset__":
            new_project_id = current["project_id"]
        else:
            if project_id is not None:
                self.get_project(project_id)  # raises if missing
            new_project_id = project_id
        self._conn.execute(
            "UPDATE conversations SET title = ?, project_id = ?, updated_at = ? WHERE id = ?",
            (new_title, new_project_id, time.time(), conversation_id),
        )
        self._conn.commit()
        return self.get_conversation(conversation_id)

    def touch_conversation(self, conversation_id: str) -> None:
        self._conn.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (time.time(), conversation_id),
        )
        self._conn.commit()

    def delete_conversation(self, conversation_id: str) -> None:
        self.get_conversation(conversation_id)  # raises if missing
        self._conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        self._conn.commit()

    # ------------------------------------------------------------------
    # Messages
    # ------------------------------------------------------------------

    def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        *,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        self.get_conversation(conversation_id)  # raises if missing
        message_id = str(uuid.uuid4())
        now = time.time()
        next_seq = self._conn.execute(
            "SELECT COALESCE(MAX(seq), -1) + 1 FROM conversation_messages "
            "WHERE conversation_id = ?",
            (conversation_id,),
        ).fetchone()[0]
        self._conn.execute(
            "INSERT INTO conversation_messages "
            "(id, conversation_id, role, content, timestamp, metadata, seq) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (message_id, conversation_id, role, content, now, json.dumps(metadata or {}), next_seq),
        )
        self._conn.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conversation_id)
        )
        self._conn.commit()
        return self._row_to_message(
            self._conn.execute(
                "SELECT * FROM conversation_messages WHERE id = ?", (message_id,)
            ).fetchone()
        )

    def list_messages(self, conversation_id: str) -> List[Dict[str, Any]]:
        self.get_conversation(conversation_id)  # raises if missing
        rows = self._conn.execute(
            "SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY seq",
            (conversation_id,),
        ).fetchall()
        return [self._row_to_message(r) for r in rows]

    def update_message(
        self,
        conversation_id: str,
        message_id: str,
        *,
        content: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        row = self._conn.execute(
            "SELECT * FROM conversation_messages WHERE id = ? AND conversation_id = ?",
            (message_id, conversation_id),
        ).fetchone()
        if row is None:
            raise KeyError(message_id)
        current = self._row_to_message(row)
        new_content = content if content is not None else current["content"]
        new_metadata = metadata if metadata is not None else current["metadata"]
        self._conn.execute(
            "UPDATE conversation_messages SET content = ?, metadata = ? WHERE id = ?",
            (new_content, json.dumps(new_metadata), message_id),
        )
        self._conn.commit()
        return self._row_to_message(
            self._conn.execute(
                "SELECT * FROM conversation_messages WHERE id = ?", (message_id,)
            ).fetchone()
        )

    @staticmethod
    def _row_to_message(row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        d["metadata"] = json.loads(d["metadata"]) if d["metadata"] else {}
        return d
