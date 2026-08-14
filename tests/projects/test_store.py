"""Tests for handymate.projects.store.ProjectStore."""

from __future__ import annotations

import pytest

from handymate.projects.store import (
    ConversationNotFoundError,
    ProjectNotFoundError,
    ProjectStore,
)


@pytest.fixture
def store():
    s = ProjectStore(db_path=":memory:")
    yield s
    s.close()


def test_create_and_get_project(store):
    project = store.create_project("Kitchen Remodel", custom_instructions="Be Bob.")
    assert project["name"] == "Kitchen Remodel"
    fetched = store.get_project(project["id"])
    assert fetched == project


def test_get_missing_project_raises(store):
    with pytest.raises(ProjectNotFoundError):
        store.get_project("nope")


def test_update_project_partial(store):
    project = store.create_project("A", description="d1")
    updated = store.update_project(project["id"], name="B")
    assert updated["name"] == "B"
    assert updated["description"] == "d1"  # untouched fields survive


def test_create_conversation_with_client_supplied_id(store):
    conv = store.create_conversation(id="client-generated-id", title="A")
    assert conv["id"] == "client-generated-id"
    assert store.get_conversation("client-generated-id")["id"] == "client-generated-id"


def test_conversation_ordering_and_grouping(store):
    project = store.create_project("P")
    grouped = store.create_conversation(project_id=project["id"], title="A")
    ungrouped = store.create_conversation(title="B")

    scoped = store.list_conversations(project_id=project["id"])
    assert [c["id"] for c in scoped] == [grouped["id"]]

    only_ungrouped = store.list_conversations(only_ungrouped=True)
    assert [c["id"] for c in only_ungrouped] == [ungrouped["id"]]


def test_move_conversation_between_projects(store):
    p1 = store.create_project("P1")
    p2 = store.create_project("P2")
    conv = store.create_conversation(project_id=p1["id"])

    moved = store.update_conversation(conv["id"], project_id=p2["id"])
    assert moved["project_id"] == p2["id"]

    orphaned = store.update_conversation(conv["id"], project_id=None)
    assert orphaned["project_id"] is None


def test_delete_project_cascades_conversations(store):
    project = store.create_project("P")
    conv = store.create_conversation(project_id=project["id"])
    store.add_message(conv["id"], "user", "hi")

    store.delete_project(project["id"])

    with pytest.raises(ConversationNotFoundError):
        store.get_conversation(conv["id"])


def test_message_sequence_and_update(store):
    conv = store.create_conversation()
    m1 = store.add_message(conv["id"], "user", "hello")
    m2 = store.add_message(conv["id"], "assistant", "", metadata={"streaming": True})
    assert m1["seq"] == 0
    assert m2["seq"] == 1

    updated = store.update_message(conv["id"], m2["id"], content="hi there", metadata={"usage": {"total_tokens": 3}})
    assert updated["content"] == "hi there"
    assert updated["metadata"]["usage"]["total_tokens"] == 3

    messages = store.list_messages(conv["id"])
    assert [m["content"] for m in messages] == ["hello", "hi there"]
