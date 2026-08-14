"""``/v1/projects`` and ``/v1/conversations`` routes.

Projects group conversations, carry custom instructions applied at chat
time (see ``handymate.server.routes``), and own a per-project knowledge
base for uploaded files (isolated from the global connectors knowledge
store — see ``handymate.projects.knowledge_store``).
"""

from __future__ import annotations

import logging
from typing import Any, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FastAPI/pydantic types used in route-handler annotations must be resolvable
# at *module* scope: this file uses ``from __future__ import annotations``,
# so every annotation is a string that FastAPI evaluates against module
# globals. Types imported only inside create_projects_router() are invisible
# there, which makes FastAPI misparse params (e.g. a required body model
# gets treated as a query param -> spurious 422). See connectors_router.py's
# identical note (issue #512) for the pattern this mirrors.
# ---------------------------------------------------------------------------
try:
    from fastapi import File as _File
    from fastapi import Form as _Form
    from fastapi import UploadFile as _UploadFile
    from pydantic import BaseModel as _BaseModel

    class ProjectCreateRequest(_BaseModel):
        name: str
        description: str = ""
        custom_instructions: str = ""
        color: str = ""

    class ProjectUpdateRequest(_BaseModel):
        name: Optional[str] = None
        description: Optional[str] = None
        custom_instructions: Optional[str] = None
        color: Optional[str] = None

    class ConversationCreateRequest(_BaseModel):
        # Optional client-supplied id — the frontend generates its own id so
        # it can update local UI state before this request round-trips.
        id: Optional[str] = None
        project_id: Optional[str] = None
        title: str = "New chat"
        model: str = "default"

    class ConversationUpdateRequest(_BaseModel):
        title: Optional[str] = None
        # Sentinel default lets a client explicitly send null to move a
        # conversation to "Ungrouped" without ambiguity vs. "unchanged".
        project_id: Optional[str] = "__unset__"

    class MessageCreateRequest(_BaseModel):
        role: str
        content: str
        metadata: Optional[dict] = None

    class MessageUpdateRequest(_BaseModel):
        content: Optional[str] = None
        metadata: Optional[dict] = None

    class PasteRequest(_BaseModel):
        title: str = ""
        content: str

    class IngestResponse(_BaseModel):
        chunks_added: int
        doc_id: str

except ImportError:  # pragma: no cover - fastapi/pydantic are hard deps of "server" extra
    ProjectCreateRequest = None  # type: ignore[assignment,misc]
    ProjectUpdateRequest = None  # type: ignore[assignment,misc]
    ConversationCreateRequest = None  # type: ignore[assignment,misc]
    ConversationUpdateRequest = None  # type: ignore[assignment,misc]
    MessageCreateRequest = None  # type: ignore[assignment,misc]
    MessageUpdateRequest = None  # type: ignore[assignment,misc]
    PasteRequest = None  # type: ignore[assignment,misc]
    IngestResponse = None  # type: ignore[assignment,misc]
    _File = _Form = _UploadFile = Any  # type: ignore[assignment,misc]

File = _File
Form = _Form
UploadFile = _UploadFile


def create_projects_router():
    """Return an APIRouter with the projects/conversations/messages endpoints.

    Importing FastAPI inside the factory avoids a hard import-time
    dependency, mirroring ``handymate.server.connectors_router``.
    """
    try:
        from fastapi import APIRouter, HTTPException
    except ImportError as exc:
        raise ImportError(
            "fastapi and pydantic are required for the projects router"
        ) from exc

    from handymate.projects.knowledge_store import ProjectKnowledgeStore
    from handymate.projects.store import (
        ConversationNotFoundError,
        ProjectNotFoundError,
        ProjectStore,
    )
    from handymate.projects.text_extract import chunk_text, extract_text

    _store = ProjectStore()
    _knowledge = ProjectKnowledgeStore()

    router = APIRouter(tags=["projects"])

    # ------------------------------------------------------------------
    # Projects
    # ------------------------------------------------------------------

    @router.get("/v1/projects")
    async def list_projects():
        return {"projects": _store.list_projects()}

    @router.post("/v1/projects")
    async def create_project(body: ProjectCreateRequest):
        return _store.create_project(
            body.name,
            description=body.description,
            custom_instructions=body.custom_instructions,
            color=body.color,
        )

    @router.get("/v1/projects/{project_id}")
    async def get_project(project_id: str):
        try:
            return _store.get_project(project_id)
        except ProjectNotFoundError:
            raise HTTPException(status_code=404, detail="Project not found")

    @router.patch("/v1/projects/{project_id}")
    async def update_project(project_id: str, body: ProjectUpdateRequest):
        try:
            return _store.update_project(
                project_id,
                name=body.name,
                description=body.description,
                custom_instructions=body.custom_instructions,
                color=body.color,
            )
        except ProjectNotFoundError:
            raise HTTPException(status_code=404, detail="Project not found")

    @router.delete("/v1/projects/{project_id}")
    async def delete_project(project_id: str):
        try:
            _store.delete_project(project_id)
        except ProjectNotFoundError:
            raise HTTPException(status_code=404, detail="Project not found")
        for doc in _knowledge.list_documents(project_id):
            _knowledge.delete_document(project_id, doc["id"])
        return {"status": "deleted", "project_id": project_id}

    # ------------------------------------------------------------------
    # Conversations
    # ------------------------------------------------------------------

    @router.get("/v1/conversations")
    async def list_conversations(project_id: Optional[str] = None, ungrouped: bool = False):
        return {
            "conversations": _store.list_conversations(
                project_id=project_id, only_ungrouped=ungrouped
            )
        }

    @router.post("/v1/conversations")
    async def create_conversation(body: ConversationCreateRequest):
        try:
            return _store.create_conversation(
                id=body.id, project_id=body.project_id, title=body.title, model=body.model
            )
        except ProjectNotFoundError:
            raise HTTPException(status_code=404, detail="Project not found")

    @router.get("/v1/conversations/{conversation_id}")
    async def get_conversation(conversation_id: str):
        try:
            conv = _store.get_conversation(conversation_id)
        except ConversationNotFoundError:
            raise HTTPException(status_code=404, detail="Conversation not found")
        conv = dict(conv)
        conv["messages"] = _store.list_messages(conversation_id)
        return conv

    @router.patch("/v1/conversations/{conversation_id}")
    async def update_conversation(conversation_id: str, body: ConversationUpdateRequest):
        try:
            return _store.update_conversation(
                conversation_id, title=body.title, project_id=body.project_id
            )
        except ConversationNotFoundError:
            raise HTTPException(status_code=404, detail="Conversation not found")
        except ProjectNotFoundError:
            raise HTTPException(status_code=404, detail="Project not found")

    @router.delete("/v1/conversations/{conversation_id}")
    async def delete_conversation(conversation_id: str):
        try:
            _store.delete_conversation(conversation_id)
        except ConversationNotFoundError:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"status": "deleted", "conversation_id": conversation_id}

    # ------------------------------------------------------------------
    # Messages
    # ------------------------------------------------------------------

    @router.get("/v1/conversations/{conversation_id}/messages")
    async def list_messages(conversation_id: str):
        try:
            return {"messages": _store.list_messages(conversation_id)}
        except ConversationNotFoundError:
            raise HTTPException(status_code=404, detail="Conversation not found")

    @router.post("/v1/conversations/{conversation_id}/messages")
    async def create_message(conversation_id: str, body: MessageCreateRequest):
        try:
            return _store.add_message(
                conversation_id, body.role, body.content, metadata=body.metadata
            )
        except ConversationNotFoundError:
            raise HTTPException(status_code=404, detail="Conversation not found")

    @router.patch("/v1/conversations/{conversation_id}/messages/{message_id}")
    async def update_message(conversation_id: str, message_id: str, body: MessageUpdateRequest):
        try:
            return _store.update_message(
                conversation_id, message_id, content=body.content, metadata=body.metadata
            )
        except KeyError:
            raise HTTPException(status_code=404, detail="Message not found")

    # ------------------------------------------------------------------
    # Project knowledge (files)
    # ------------------------------------------------------------------

    @router.post("/v1/projects/{project_id}/knowledge/ingest")
    async def ingest_paste(project_id: str, body: PasteRequest):
        try:
            _store.get_project(project_id)
        except ProjectNotFoundError:
            raise HTTPException(status_code=404, detail="Project not found")
        text = body.content.strip()
        if not text:
            raise HTTPException(status_code=400, detail="Content is empty")
        chunks = chunk_text(text)
        doc = _knowledge.add_document(project_id, body.title or "Pasted text", chunks)
        logger.info(
            "Ingested %d chunks into project %s (doc_id=%s)", len(chunks), project_id, doc["id"]
        )
        return IngestResponse(chunks_added=len(chunks), doc_id=doc["id"])

    @router.post("/v1/projects/{project_id}/knowledge/ingest/files")
    async def ingest_files(
        project_id: str,
        files: List[UploadFile] = File(...),
        title: Optional[str] = Form(None),
    ):
        try:
            _store.get_project(project_id)
        except ProjectNotFoundError:
            raise HTTPException(status_code=404, detail="Project not found")

        total_chunks = 0
        last_doc_id = ""
        for upload in files:
            filename = upload.filename or "untitled"
            data = await upload.read()
            text, _ext = extract_text(filename, data)
            if not text:
                continue
            chunks = chunk_text(text)
            doc = _knowledge.add_document(
                project_id, title or filename, chunks, filename=filename
            )
            total_chunks += len(chunks)
            last_doc_id = doc["id"]
            logger.info(
                "Ingested %d chunks from %s into project %s (doc_id=%s)",
                len(chunks),
                filename,
                project_id,
                doc["id"],
            )
        return IngestResponse(chunks_added=total_chunks, doc_id=last_doc_id)

    @router.get("/v1/projects/{project_id}/knowledge/documents")
    async def list_documents(project_id: str):
        try:
            _store.get_project(project_id)
        except ProjectNotFoundError:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"documents": _knowledge.list_documents(project_id)}

    @router.delete("/v1/projects/{project_id}/knowledge/documents/{doc_id}")
    async def delete_document(project_id: str, doc_id: str):
        try:
            _knowledge.delete_document(project_id, doc_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="Document not found")
        return {"status": "deleted", "doc_id": doc_id}

    @router.get("/v1/projects/{project_id}/knowledge/search")
    async def search_knowledge(project_id: str, q: str, top_k: int = 5):
        try:
            _store.get_project(project_id)
        except ProjectNotFoundError:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"results": _knowledge.search(project_id, q, top_k=top_k)}

    return router
