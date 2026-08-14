"""Upload / Paste router for ingesting documents into the knowledge store."""

from __future__ import annotations

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from handymate.connectors.store import KnowledgeStore
from handymate.core.config import DEFAULT_CONFIG_DIR
from handymate.projects.text_extract import chunk_text as _chunk_text
from handymate.projects.text_extract import extract_text as _extract_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/connectors/upload", tags=["upload"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_store() -> KnowledgeStore:
    """Return a KnowledgeStore pointing at the default knowledge DB."""
    db_path = DEFAULT_CONFIG_DIR / "knowledge.db"
    return KnowledgeStore(db_path=db_path)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class PasteRequest(BaseModel):
    title: str = ""
    content: str


class IngestResponse(BaseModel):
    chunks_added: int
    source: str = "upload"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/ingest", response_model=IngestResponse)
async def ingest_paste(body: PasteRequest) -> IngestResponse:
    """Ingest pasted text into the knowledge store."""
    text = body.content.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Content is empty")

    store = _get_store()
    doc_id = str(uuid.uuid4())
    chunks = _chunk_text(text)

    for idx, chunk in enumerate(chunks):
        store.store(
            chunk,
            source="upload",
            doc_type="paste",
            doc_id=doc_id,
            title=body.title or "Pasted text",
            chunk_index=idx,
        )

    logger.info("Ingested %d chunks from pasted text (doc_id=%s)", len(chunks), doc_id)
    return IngestResponse(chunks_added=len(chunks))


@router.post("/ingest/files", response_model=IngestResponse)
async def ingest_files(
    files: List[UploadFile] = File(...),
    title: Optional[str] = Form(None),
) -> IngestResponse:
    """Ingest uploaded files into the knowledge store."""
    store = _get_store()
    total_chunks = 0

    for upload in files:
        filename = upload.filename or "untitled"
        data = await upload.read()
        text, ext = _extract_text(filename, data)
        if not text:
            continue

        doc_id = str(uuid.uuid4())
        doc_title = title or filename
        chunks = _chunk_text(text)

        for idx, chunk in enumerate(chunks):
            store.store(
                chunk,
                source="upload",
                doc_type=ext.lstrip("."),
                doc_id=doc_id,
                title=doc_title,
                chunk_index=idx,
            )

        total_chunks += len(chunks)
        logger.info(
            "Ingested %d chunks from file %s (doc_id=%s)",
            len(chunks),
            filename,
            doc_id,
        )

    return IngestResponse(chunks_added=total_chunks)
