"""Tests for the workspace store, routing layer and HTTP routes."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from openjarvis.workspace.routing import AssistantRouter
from openjarvis.workspace.store import MEMORY_CATEGORIES, WorkspaceStore

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------


@pytest.fixture
def store(tmp_path):
    s = WorkspaceStore(db_path=str(tmp_path / "workspace.db"))
    yield s
    s.close()


def test_task_lifecycle_and_ordering(store):
    low = store.create_task("Low thing", priority="low")
    urgent = store.create_task("Urgent thing", priority="urgent")
    soon = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    store.create_task("Due soon", priority="medium", due_at=soon)

    open_tasks = store.list_tasks(status="open")
    # Open work is ordered by priority: urgent, medium (the deadline task),
    # then low.
    assert open_tasks[0]["id"] == urgent["id"]
    assert [t["priority"] for t in open_tasks] == ["urgent", "medium", "low"]

    done = store.update_task(low["id"], {"status": "done"})
    assert done["status"] == "done"
    assert done["completed_at"]

    reopened = store.update_task(low["id"], {"status": "open"})
    assert reopened["completed_at"] is None

    assert store.delete_task(urgent["id"]) is True
    assert store.get_task(urgent["id"]) is None


def test_task_validation_rejects_unknown_priority(store):
    with pytest.raises(ValueError):
        store.create_task("Bad", priority="critical")
    with pytest.raises(ValueError):
        store.create_task("   ")


def test_memory_categories_are_separate(store):
    for category in MEMORY_CATEGORIES:
        store.create_memory(category, f"{category} fact")
    assert {e["category"] for e in store.list_memory()} == set(MEMORY_CATEGORIES)
    assert len(store.list_memory("preference")) == 1
    with pytest.raises(ValueError):
        store.create_memory("random", "nope")


def test_overview_reports_today_and_overdue(store):
    now = datetime.now(timezone.utc)
    store.create_task("Due today", due_at=now.isoformat(), workspace="business")
    store.create_task(
        "Overdue", due_at=(now - timedelta(days=2)).isoformat(), workspace="business"
    )
    store.create_task("No deadline", workspace="business")
    store.create_memory("business", "J&M Visuals invoices monthly")
    store.create_event("Shoot", (now + timedelta(days=1)).isoformat())

    overview = store.overview(workspace="business")
    assert overview["tasks"]["open"] == 3
    assert overview["tasks"]["due_today"] == 1
    assert overview["tasks"]["overdue"] == 1
    assert overview["memory"]["total"] == 1
    assert len(overview["events"]) == 1
    assert overview["updates"], "activity feed should record changes"


def test_event_requires_iso_timestamp(store):
    with pytest.raises(ValueError):
        store.create_event("Bad", "next tuesday")


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------


@pytest.fixture
def router():
    return AssistantRouter()


@pytest.mark.parametrize(
    "message,intent",
    [
        ("Add a task to edit the wedding highlight reel", "tasks.create"),
        ("Show me my tasks for today", "tasks.list"),
        ("Remember that I prefer natural light for portraits", "memory.remember"),
        ("What do you remember about the client preferences?", "memory.recall"),
        ("Schedule a meeting with the client on Friday", "events.create"),
        ("Sync my gmail before the briefing", "integrations.sync"),
        ("Send an email to the client about the invoice", "messages.send"),
        ("How is J&M Visuals doing this month?", "business.report"),
    ],
)
def test_router_intents(router, message, intent):
    decision = router.route(message)
    assert decision.intent == intent, decision.to_dict()


def test_external_and_destructive_actions_require_approval(router):
    for message in (
        "Send an email to the client about the shoot",
        "Sync my gmail now",
    ):
        decision = router.route(message)
        assert decision.requires_approval is True
        assert decision.approval_reason


def test_local_actions_do_not_require_approval(router):
    for message in ("Add a task to cull photos", "Remember that I prefer dark mode"):
        decision = router.route(message)
        assert decision.requires_approval is False


def test_unknown_request_falls_back_to_conversation(router):
    decision = router.route("Hey, how are you?")
    assert decision.intent == "conversation"
    assert decision.requires_approval is False


# ---------------------------------------------------------------------------
# HTTP routes
# ---------------------------------------------------------------------------


@pytest.fixture
def client(tmp_path, monkeypatch):
    if not HAS_FASTAPI:  # pragma: no cover
        pytest.skip("fastapi not installed")
    import openjarvis.server.workspace_routes as wr
    from openjarvis.tools.approval_store import ApprovalStore

    workspace = WorkspaceStore(db_path=str(tmp_path / "workspace.db"))
    approvals = ApprovalStore(db_path=str(tmp_path / "approvals.db"))
    monkeypatch.setattr(wr, "_store", workspace)
    monkeypatch.setattr(wr, "_approval_store", lambda: approvals)

    app = FastAPI()
    app.include_router(wr.router)
    with TestClient(app) as c:
        c.workspace_store = workspace
        c.approval_store = approvals
        yield c
    workspace.close()
    approvals.close()


def test_task_endpoints_roundtrip(client):
    created = client.post(
        "/v1/workspace/tasks",
        json={"title": "Deliver gallery", "priority": "high", "workspace": "business"},
    )
    assert created.status_code == 200
    task_id = created.json()["task"]["id"]

    listed = client.get("/v1/workspace/tasks", params={"workspace": "business"})
    assert [t["id"] for t in listed.json()["tasks"]] == [task_id]

    updated = client.patch(f"/v1/workspace/tasks/{task_id}", json={"status": "done"})
    assert updated.json()["task"]["status"] == "done"

    assert client.delete(f"/v1/workspace/tasks/{task_id}").status_code == 200
    assert client.delete(f"/v1/workspace/tasks/{task_id}").status_code == 404


def test_memory_endpoints_validate_category(client):
    bad = client.post("/v1/workspace/memory", json={"category": "misc", "content": "x"})
    assert bad.status_code == 400
    ok = client.post(
        "/v1/workspace/memory",
        json={"category": "business", "content": "Invoices on the 1st"},
    )
    assert ok.status_code == 200
    assert client.get("/v1/workspace/memory").json()["count"] == 1


def test_overview_includes_business_profile(client):
    payload = client.get(
        "/v1/workspace/overview", params={"workspace": "business"}
    ).json()
    assert payload["profile"]["name"] == "J&M Visuals"
    assert payload["tasks"]["open"] == 0
    assert payload["integrations"], "integration catalog should be listed"


def test_assistant_creates_local_task(client):
    res = client.post(
        "/v1/workspace/assistant/execute",
        json={
            "message": "Add a task to cull the wedding photos",
            "workspace": "business",
        },
    )
    body = res.json()
    assert body["status"] == "done"
    assert body["task"]["title"].lower().startswith("cull")
    assert client.get("/v1/workspace/tasks").json()["count"] == 1


def test_assistant_queues_message_for_approval_without_sending(client):
    res = client.post(
        "/v1/workspace/assistant/execute",
        json={"message": "Send an email to the client about the invoice"},
    )
    body = res.json()
    assert body["status"] == "pending_approval"
    assert body["delivery_status"] == "not_configured"
    assert body["approval"]["id"]
    pending = client.approval_store.list_pending()
    assert len(pending) == 1
    assert pending[0].action_type == "assistant.messages_send"
    # No task/message side effect happened.
    assert client.get("/v1/workspace/tasks").json()["count"] == 0


def test_assistant_route_endpoint_does_not_execute(client):
    res = client.post(
        "/v1/workspace/assistant/route",
        json={"message": "Add a task to back up footage"},
    )
    assert res.json()["decision"]["intent"] == "tasks.create"
    assert client.get("/v1/workspace/tasks").json()["count"] == 0


def test_assistant_asks_for_details_on_update_without_target(client):
    res = client.post(
        "/v1/workspace/assistant/execute",
        json={"message": "Mark the task as done"},
    )
    assert res.json()["status"] == "needs_input"
