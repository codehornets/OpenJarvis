"""Tests for handymate.projects.knowledge_store.ProjectKnowledgeStore."""

from __future__ import annotations

import pytest

from handymate.projects.knowledge_store import ProjectKnowledgeStore
from handymate.projects.text_extract import chunk_text


@pytest.fixture
def store():
    s = ProjectKnowledgeStore(db_path=":memory:")
    yield s
    s.close()


def test_add_document_and_search(store):
    chunks = chunk_text("The client's budget is $42,750 and the deadline is October 1.")
    doc = store.add_document("proj-1", "Budget note", chunks, filename="budget.txt")
    assert doc["chunk_count"] == len(chunks)

    results = store.search("proj-1", "budget")
    assert any("42,750" in r["content"] for r in results)


def test_search_is_scoped_to_project(store):
    store.add_document("proj-1", "Doc A", chunk_text("apples are great"))
    store.add_document("proj-2", "Doc B", chunk_text("apples are terrible"))

    results = store.search("proj-1", "apples")
    assert len(results) == 1
    assert results[0]["title"] == "Doc A"


def test_delete_document_removes_chunks(store):
    doc = store.add_document("proj-1", "Doc", chunk_text("some content about oranges"))
    store.delete_document("proj-1", doc["id"])

    assert store.list_documents("proj-1") == []
    assert store.search("proj-1", "oranges") == []


def test_delete_missing_document_raises(store):
    with pytest.raises(KeyError):
        store.delete_document("proj-1", "does-not-exist")
