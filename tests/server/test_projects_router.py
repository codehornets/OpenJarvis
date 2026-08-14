"""Tests for the /v1/projects and /v1/conversations API router."""

from __future__ import annotations

import pytest


@pytest.fixture
def app(tmp_path, monkeypatch):
    try:
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
    except ImportError:
        pytest.skip("fastapi not installed")

    # ProjectStore/ProjectKnowledgeStore resolve their default db path via a
    # lazy ``from handymate.core.paths import get_config_dir`` inside
    # __init__, so patching the module attribute before
    # create_projects_router() constructs them redirects both.
    monkeypatch.setattr("handymate.core.paths.get_config_dir", lambda: tmp_path)

    from handymate.server.projects_router import create_projects_router

    _app = FastAPI()
    _app.include_router(create_projects_router())
    return TestClient(_app)


def test_project_crud(app):
    resp = app.post("/v1/projects", json={"name": "Kitchen Remodel", "custom_instructions": "Be Bob."})
    assert resp.status_code == 200
    project = resp.json()
    assert project["name"] == "Kitchen Remodel"
    assert project["custom_instructions"] == "Be Bob."
    project_id = project["id"]

    resp = app.get("/v1/projects")
    assert resp.status_code == 200
    assert any(p["id"] == project_id for p in resp.json()["projects"])

    resp = app.get(f"/v1/projects/{project_id}")
    assert resp.status_code == 200

    resp = app.patch(f"/v1/projects/{project_id}", json={"name": "Renamed"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"

    resp = app.get("/v1/projects/does-not-exist")
    assert resp.status_code == 404


def test_conversation_grouping_and_move(app):
    project_id = app.post("/v1/projects", json={"name": "P1"}).json()["id"]

    grouped = app.post("/v1/conversations", json={"project_id": project_id, "title": "Chat A"}).json()
    ungrouped = app.post("/v1/conversations", json={"title": "Chat B"}).json()

    resp = app.get("/v1/conversations", params={"project_id": project_id})
    ids = [c["id"] for c in resp.json()["conversations"]]
    assert grouped["id"] in ids
    assert ungrouped["id"] not in ids

    resp = app.get("/v1/conversations", params={"ungrouped": "true"})
    ids = [c["id"] for c in resp.json()["conversations"]]
    assert ungrouped["id"] in ids
    assert grouped["id"] not in ids

    # Move grouped -> ungrouped
    resp = app.patch(f"/v1/conversations/{grouped['id']}", json={"project_id": None})
    assert resp.status_code == 200
    assert resp.json()["project_id"] is None


def test_messages_lifecycle(app):
    conv = app.post("/v1/conversations", json={"title": "Chat"}).json()
    conv_id = conv["id"]

    resp = app.post(
        f"/v1/conversations/{conv_id}/messages",
        json={"role": "user", "content": "hello"},
    )
    assert resp.status_code == 200
    msg = resp.json()
    assert msg["role"] == "user"
    assert msg["seq"] == 0

    resp = app.post(
        f"/v1/conversations/{conv_id}/messages",
        json={"role": "assistant", "content": "", "metadata": {"streaming": True}},
    )
    assistant_msg = resp.json()
    assert assistant_msg["seq"] == 1

    resp = app.patch(
        f"/v1/conversations/{conv_id}/messages/{assistant_msg['id']}",
        json={"content": "hi there", "metadata": {"usage": {"total_tokens": 5}}},
    )
    assert resp.status_code == 200
    assert resp.json()["content"] == "hi there"

    resp = app.get(f"/v1/conversations/{conv_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["messages"]) == 2
    assert body["messages"][1]["content"] == "hi there"


def test_project_delete_cascades_conversations(app):
    project_id = app.post("/v1/projects", json={"name": "P"}).json()["id"]
    conv_id = app.post("/v1/conversations", json={"project_id": project_id}).json()["id"]
    app.post(f"/v1/conversations/{conv_id}/messages", json={"role": "user", "content": "hi"})

    resp = app.delete(f"/v1/projects/{project_id}")
    assert resp.status_code == 200

    resp = app.get(f"/v1/conversations/{conv_id}")
    assert resp.status_code == 404


def test_project_knowledge_paste_and_search(app):
    project_id = app.post("/v1/projects", json={"name": "P"}).json()["id"]

    resp = app.post(
        f"/v1/projects/{project_id}/knowledge/ingest",
        json={"title": "Budget note", "content": "The client's budget is $42,750 and the deadline is October 1."},
    )
    assert resp.status_code == 200
    assert resp.json()["chunks_added"] >= 1

    resp = app.get(f"/v1/projects/{project_id}/knowledge/documents")
    assert resp.status_code == 200
    docs = resp.json()["documents"]
    assert len(docs) == 1
    assert docs[0]["title"] == "Budget note"

    resp = app.get(f"/v1/projects/{project_id}/knowledge/search", params={"q": "budget"})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert any("42,750" in r["content"] for r in results)

    doc_id = docs[0]["id"]
    resp = app.delete(f"/v1/projects/{project_id}/knowledge/documents/{doc_id}")
    assert resp.status_code == 200
    assert app.get(f"/v1/projects/{project_id}/knowledge/documents").json()["documents"] == []
