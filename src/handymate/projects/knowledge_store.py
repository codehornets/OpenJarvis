"""Project-scoped knowledge store — SQLite/FTS5, isolated from KnowledgeStore.

Deliberately separate from ``handymate.connectors.store.KnowledgeStore``
(the global connectors knowledge base): files uploaded to a project must
never surface in unrelated global searches (e.g. the ``knowledge_search``
tool), so this store owns its own tables and is never queried by that code
path. See ``handymate.projects.text_extract`` for the shared
extraction/chunking helpers used to build chunks before calling ``store``.
"""

from __future__ import annotations

import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Union

_CREATE_TABLES = """
-- No FK to ``projects`` here: this store is deliberately usable standalone
-- (unit tests, or a future export tool) as well as alongside ProjectStore
-- in the same db file. Project deletion cascades knowledge documents via
-- an explicit ``delete_document`` loop in the router, not a DB-level FK.
CREATE TABLE IF NOT EXISTS project_documents (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    title        TEXT NOT NULL DEFAULT '',
    filename     TEXT NOT NULL DEFAULT '',
    chunk_count  INTEGER NOT NULL DEFAULT 0,
    created_at   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pd_project ON project_documents(project_id);

CREATE TABLE IF NOT EXISTS project_knowledge_chunks (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    doc_id       TEXT NOT NULL,
    title        TEXT NOT NULL DEFAULT '',
    filename     TEXT NOT NULL DEFAULT '',
    content      TEXT NOT NULL,
    chunk_index  INTEGER NOT NULL DEFAULT 0,
    created_at   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pkc_project ON project_knowledge_chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_pkc_doc ON project_knowledge_chunks(doc_id);

CREATE VIRTUAL TABLE IF NOT EXISTS project_knowledge_fts
USING fts5(
    content,
    title,
    content='project_knowledge_chunks',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS pkc_ai AFTER INSERT ON project_knowledge_chunks BEGIN
    INSERT INTO project_knowledge_fts(rowid, content, title)
    VALUES (new.rowid, new.content, new.title);
END;

CREATE TRIGGER IF NOT EXISTS pkc_ad AFTER DELETE ON project_knowledge_chunks BEGIN
    INSERT INTO project_knowledge_fts(project_knowledge_fts, rowid, content, title)
    VALUES ('delete', old.rowid, old.content, old.title);
END;
"""


class ProjectKnowledgeStore:
    """Manages uploaded documents and their chunks for a project."""

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
    # Ingestion
    # ------------------------------------------------------------------

    def add_document(
        self,
        project_id: str,
        title: str,
        chunks: List[str],
        *,
        filename: str = "",
    ) -> Dict[str, Any]:
        """Store a document's chunks and return the document record."""
        doc_id = str(uuid.uuid4())
        now = time.time()
        for idx, chunk in enumerate(chunks):
            self._conn.execute(
                "INSERT INTO project_knowledge_chunks "
                "(id, project_id, doc_id, title, filename, content, chunk_index, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), project_id, doc_id, title, filename, chunk, idx, now),
            )
        self._conn.execute(
            "INSERT INTO project_documents "
            "(id, project_id, title, filename, chunk_count, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (doc_id, project_id, title, filename, len(chunks), now),
        )
        self._conn.commit()
        return self.get_document(doc_id)

    def get_document(self, doc_id: str) -> Dict[str, Any]:
        row = self._conn.execute(
            "SELECT * FROM project_documents WHERE id = ?", (doc_id,)
        ).fetchone()
        if row is None:
            raise KeyError(doc_id)
        return dict(row)

    def list_documents(self, project_id: str) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT * FROM project_documents WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def delete_document(self, project_id: str, doc_id: str) -> None:
        self._conn.execute(
            "DELETE FROM project_knowledge_chunks WHERE project_id = ? AND doc_id = ?",
            (project_id, doc_id),
        )
        cur = self._conn.execute(
            "DELETE FROM project_documents WHERE project_id = ? AND id = ?",
            (project_id, doc_id),
        )
        self._conn.commit()
        if cur.rowcount == 0:
            raise KeyError(doc_id)

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(self, project_id: str, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        sql = """
            SELECT
                pkc.id, pkc.doc_id, pkc.title, pkc.filename, pkc.content,
                pkc.chunk_index, bm25(project_knowledge_fts) AS score
            FROM project_knowledge_fts
            JOIN project_knowledge_chunks pkc ON project_knowledge_fts.rowid = pkc.rowid
            WHERE project_knowledge_fts MATCH ? AND pkc.project_id = ?
            ORDER BY score
            LIMIT ?
        """
        try:
            rows = self._conn.execute(sql, (query, project_id, top_k)).fetchall()
        except sqlite3.OperationalError:
            return []
        return [dict(r) for r in rows]
