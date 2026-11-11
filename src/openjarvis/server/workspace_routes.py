"""HTTP API for the persistent workspace (tasks, memory, events, integrations).

This is the routing/dispatch surface for the J&M Visuals business workspace and
personal assistant features. External side effects never execute here: actions
that send messages, sync an external account or delete data are queued in the
existing approval store and only marked approved by the user in the UI.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from openjarvis.workspace.routing import AssistantRouter
from openjarvis.workspace.store import (
    MEMORY_CATEGORIES,
    WORKSPACES,
    WorkspaceStore,
)

try:
    from fastapi import APIRouter, HTTPException, Query
    from pydantic import BaseModel

    HAS_FASTAPI = True
except ImportError:  # pragma: no cover - server extras not installed
    HAS_FASTAPI = False

logger = logging.getLogger(__name__)

# Integration catalog for the business workspace. Connector-backed entries
# resolve their status from the live connector registry; the rest depend on
# third-party credentials that the app cannot fabricate.
INTEGRATION_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "google_workspace",
        "name": "Google Workspace",
        "description": "Gmail, Calendar, Drive and Tasks",
        "connectors": ["gmail_imap", "gcalendar", "gdrive", "google_tasks"],
        "category": "communication",
        "credential": "Google app password or OAuth client",
    },
    {
        "id": "slack",
        "name": "Slack",
        "description": "Team conversations and channels",
        "connectors": ["slack"],
        "category": "communication",
        "credential": "Slack bot token",
    },
    {
        "id": "notion",
        "name": "Notion",
        "description": "Briefs, notes and project pages",
        "connectors": ["notion"],
        "category": "documents",
        "credential": "Notion integration token",
    },
    {
        "id": "stripe",
        "name": "Stripe",
        "description": "Invoices and client payments",
        "connectors": [],
        "category": "finance",
        "credential": "Stripe secret key (server-side only)",
        "requires_credentials": True,
    },
    {
        "id": "meta_business",
        "name": "Instagram & Facebook",
        "description": "Publishing and message inbox via Meta Business",
        "connectors": [],
        "category": "marketing",
        "credential": "Meta Business app credentials",
        "requires_credentials": True,
    },
    {
        "id": "quickbooks",
        "name": "QuickBooks",
        "description": "Bookkeeping and expense categorisation",
        "connectors": [],
        "category": "finance",
        "credential": "QuickBooks OAuth app credentials",
        "requires_credentials": True,
    },
]

J_AND_M_PROFILE = {
    "id": "jm-visuals",
    "name": "J&M Visuals",
    "kind": "business",
    "tagline": "Photo & video production studio",
    "services": [
        "Brand photography",
        "Event coverage",
        "Product & content shoots",
        "Video editing",
    ],
    "projects": ["Brand shoots", "Weddings", "Product launches", "Retainers"],
}

router = APIRouter(prefix="/v1/workspace", tags=["workspace"])

_store: Optional[WorkspaceStore] = None
_router = AssistantRouter()


def _get_store() -> WorkspaceStore:
    global _store
    if _store is None:
        _store = WorkspaceStore()
    return _store


_approvals = None


def _approval_store():
    """Return the shared approval store (same DB the bell reads)."""
    global _approvals
    if _approvals is None:
        from openjarvis.tools.approval_store import ApprovalStore

        _approvals = ApprovalStore()
    return _approvals


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

if HAS_FASTAPI:

    class TaskCreateRequest(BaseModel):
        title: str
        notes: str = ""
        priority: str = "medium"
        due_at: Optional[str] = None
        project: str = ""
        workspace: str = "personal"

    class TaskUpdateRequest(BaseModel):
        title: Optional[str] = None
        notes: Optional[str] = None
        priority: Optional[str] = None
        status: Optional[str] = None
        due_at: Optional[str] = None
        project: Optional[str] = None
        workspace: Optional[str] = None

    class MemoryCreateRequest(BaseModel):
        category: str
        content: str
        source: str = "manual"
        project: str = ""

    class MemoryUpdateRequest(BaseModel):
        category: Optional[str] = None
        content: Optional[str] = None
        project: Optional[str] = None

    class EventCreateRequest(BaseModel):
        title: str
        starts_at: str
        location: str = ""
        workspace: str = "business"

    class AssistantRequest(BaseModel):
        message: str
        workspace: Optional[str] = None
        task_id: Optional[str] = None
        starts_at: Optional[str] = None
        location: str = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _error(message: str, status_code: int = 400) -> "HTTPException":
    return HTTPException(status_code=status_code, detail=message)


def _connector_status() -> Dict[str, Dict[str, Any]]:
    """Best-effort live status for every registered connector."""
    statuses: Dict[str, Dict[str, Any]] = {}
    try:
        from openjarvis.core.registry import ConnectorRegistry
        from openjarvis.server import connectors_router as cr

        cr._ensure_connectors_registered()
        for key in ConnectorRegistry.keys():
            try:
                instance = cr._instances.get(key)
                if instance is None:
                    instance = ConnectorRegistry.get(key)()
                connected = bool(instance.is_connected())
                state = "idle"
                error = None
                last_sync = None
                if connected:
                    try:
                        sync = instance.sync_status()
                        state = getattr(sync, "state", "idle") or "idle"
                        error = getattr(sync, "error", None)
                        last_sync = (
                            sync.last_sync.isoformat()
                            if getattr(sync, "last_sync", None)
                            else None
                        )
                    except Exception:
                        state = "idle"
                statuses[key] = {
                    "connected": connected,
                    "state": state,
                    "error": error,
                    "last_sync": last_sync,
                }
            except Exception:
                statuses[key] = {"connected": False, "state": "unknown"}
    except Exception as exc:  # pragma: no cover - registry optional at import
        logger.debug("Connector status unavailable: %s", exc)
    return statuses


def _integration_status(
    entry: Dict[str, Any], statuses: Dict[str, Dict[str, Any]]
) -> str:
    connector_ids = entry.get("connectors") or []
    if not connector_ids:
        return "not_connected"
    live = [statuses.get(cid) for cid in connector_ids if statuses.get(cid)]
    connected = [item for item in live if item.get("connected")]
    if not connected:
        return "not_connected"
    if any(item.get("state") == "syncing" for item in connected):
        return "syncing"
    if any(item.get("state") == "error" for item in connected):
        return "error"
    return "connected"


def _integration_payload(
    entry: Dict[str, Any], statuses: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    live = [
        {
            "connector_id": cid,
            **(statuses.get(cid) or {"connected": False, "state": "unknown"}),
        }
        for cid in entry.get("connectors", [])
    ]
    last_syncs = [item["last_sync"] for item in live if item.get("last_sync")]
    return {
        "id": entry["id"],
        "name": entry["name"],
        "description": entry["description"],
        "category": entry.get("category", "other"),
        "credential": entry.get("credential", ""),
        "requires_credentials": bool(entry.get("requires_credentials")),
        "connectors": live,
        "status": _integration_status(entry, statuses),
        "last_sync": max(last_syncs) if last_syncs else None,
        "errors": [item["error"] for item in live if item.get("error")],
    }


def _title_from_request(message: str) -> str:
    """Reduce a natural-language request to a task title."""
    text = message.strip()
    lowered = text.lower()
    for prefix in (
        "please ",
        "can you ",
        "could you ",
        "add a task to ",
        "add a task ",
        "add task ",
        "create a task to ",
        "create a task ",
        "create task ",
        "new task ",
        "remind me to ",
        "todo: ",
        "todo ",
    ):
        if lowered.startswith(prefix):
            text = text[len(prefix) :].strip()
            lowered = text.lower()
            break
    return text[:1].upper() + text[1:] if text else "Untitled task"


def _memory_content(message: str, entities: Dict[str, Any]) -> str:
    if entities.get("quoted"):
        return entities["quoted"]
    text = message.strip()
    lowered = text.lower()
    for prefix in (
        "remember that ",
        "remember ",
        "please remember ",
        "note that ",
        "keep in mind that ",
        "save that ",
    ):
        if lowered.startswith(prefix):
            return text[len(prefix) :].strip()
    return text


# ---------------------------------------------------------------------------
# Overview & business workspace
# ---------------------------------------------------------------------------


@router.get("/overview")
async def workspace_overview(
    workspace: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    if workspace is not None and workspace not in WORKSPACES:
        raise _error(f"workspace must be one of {', '.join(WORKSPACES)}")
    store = _get_store()
    payload = store.overview(workspace=workspace)
    payload["profile"] = J_AND_M_PROFILE if workspace in (None, "business") else None
    payload["integrations"] = [
        _integration_payload(entry, _connector_status())
        for entry in INTEGRATION_CATALOG
    ]
    return payload


@router.get("/business")
async def business_workspace() -> Dict[str, Any]:
    store = _get_store()
    payload = store.overview(workspace="business")
    return {
        "profile": J_AND_M_PROFILE,
        "overview": payload,
        "integrations": [
            _integration_payload(entry, _connector_status())
            for entry in INTEGRATION_CATALOG
        ],
    }


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------


@router.get("/tasks")
async def list_tasks(
    status: Optional[str] = Query(default=None),
    workspace: Optional[str] = Query(default=None),
    project: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    try:
        tasks = _get_store().list_tasks(
            status=status, workspace=workspace, project=project
        )
    except ValueError as exc:
        raise _error(str(exc))
    return {"tasks": tasks, "count": len(tasks)}


@router.post("/tasks")
async def create_task(req: "TaskCreateRequest") -> Dict[str, Any]:
    try:
        task = _get_store().create_task(
            req.title,
            notes=req.notes,
            priority=req.priority,
            due_at=req.due_at,
            project=req.project,
            workspace=req.workspace,
        )
    except ValueError as exc:
        raise _error(str(exc))
    return {"task": task}


@router.patch("/tasks/{task_id}")
async def update_task(task_id: str, req: "TaskUpdateRequest") -> Dict[str, Any]:
    try:
        task = _get_store().update_task(task_id, req.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise _error(str(exc))
    if task is None:
        raise _error("Task not found", 404)
    return {"task": task}


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str) -> Dict[str, Any]:
    if not _get_store().delete_task(task_id):
        raise _error("Task not found", 404)
    return {"status": "deleted", "id": task_id}


# ---------------------------------------------------------------------------
# Categorised memory
# ---------------------------------------------------------------------------


@router.get("/memory")
async def list_memory(category: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    try:
        entries = _get_store().list_memory(category=category)
    except ValueError as exc:
        raise _error(str(exc))
    return {
        "entries": entries,
        "count": len(entries),
        "categories": list(MEMORY_CATEGORIES),
    }


@router.post("/memory")
async def create_memory(req: "MemoryCreateRequest") -> Dict[str, Any]:
    try:
        entry = _get_store().create_memory(
            req.category, req.content, source=req.source, project=req.project
        )
    except ValueError as exc:
        raise _error(str(exc))
    return {"entry": entry}


@router.patch("/memory/{memory_id}")
async def update_memory(memory_id: str, req: "MemoryUpdateRequest") -> Dict[str, Any]:
    try:
        entry = _get_store().update_memory(
            memory_id, req.model_dump(exclude_unset=True)
        )
    except ValueError as exc:
        raise _error(str(exc))
    if entry is None:
        raise _error("Memory entry not found", 404)
    return {"entry": entry}


@router.delete("/memory/{memory_id}")
async def delete_memory(memory_id: str) -> Dict[str, Any]:
    if not _get_store().delete_memory(memory_id):
        raise _error("Memory entry not found", 404)
    return {"status": "deleted", "id": memory_id}


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------


@router.get("/events")
async def list_events(upcoming: bool = Query(default=False)) -> Dict[str, Any]:
    events = _get_store().list_events(upcoming_only=upcoming)
    return {"events": events, "count": len(events)}


@router.post("/events")
async def create_event(req: "EventCreateRequest") -> Dict[str, Any]:
    try:
        event = _get_store().create_event(
            req.title, req.starts_at, location=req.location, workspace=req.workspace
        )
    except ValueError as exc:
        raise _error(str(exc))
    return {"event": event}


@router.delete("/events/{event_id}")
async def delete_event(event_id: str) -> Dict[str, Any]:
    if not _get_store().delete_event(event_id):
        raise _error("Event not found", 404)
    return {"status": "deleted", "id": event_id}


# ---------------------------------------------------------------------------
# Integrations
# ---------------------------------------------------------------------------


@router.get("/integrations")
async def list_integrations() -> Dict[str, Any]:
    statuses = _connector_status()
    return {
        "integrations": [
            _integration_payload(entry, statuses) for entry in INTEGRATION_CATALOG
        ],
        "statuses": ["connected", "not_connected", "syncing", "error"],
    }


# ---------------------------------------------------------------------------
# Assistant routing layer
# ---------------------------------------------------------------------------


@router.post("/assistant/route")
async def assistant_route(req: "AssistantRequest") -> Dict[str, Any]:
    """Return the routing decision without executing anything."""
    decision = _router.route(
        req.message, context={"workspace": req.workspace}
    ).to_dict()
    return {"decision": decision}


@router.post("/assistant/execute")
async def assistant_execute(req: "AssistantRequest") -> Dict[str, Any]:
    """Execute local-safe actions; queue everything else for approval."""
    return _dispatch(req)


def _dispatch(req: "AssistantRequest") -> Dict[str, Any]:
    decision = _router.route(req.message, context={"workspace": req.workspace})
    store = _get_store()
    intent = decision.intent

    if decision.requires_approval:
        action = _queue_approval(req, decision)
        payload: Dict[str, Any] = {
            "status": "pending_approval",
            "decision": decision.to_dict(),
            "approval": {
                "id": action.id,
                "description": action.description,
                "tier": action.tier,
                "permission_key": action.permission_key,
            },
            "message": (
                "Queued for your approval. Nothing was sent or changed."
                if intent == "messages.send"
                else "Queued for your approval before anything changes."
            ),
        }
        if intent == "messages.send":
            # There is no outbound sender wired yet; say so instead of letting
            # an approval look like a delivery.
            payload["delivery_status"] = "not_configured"
        return payload

    if intent == "tasks.create":
        task = store.create_task(
            _title_from_request(req.message),
            priority=decision.entities.get("priority", "medium"),
            workspace=req.workspace if req.workspace in WORKSPACES else "personal",
            project=(J_AND_M_PROFILE["id"] if req.workspace == "business" else ""),
        )
        return {"status": "done", "decision": decision.to_dict(), "task": task}

    if intent in ("tasks.update", "tasks.list"):
        tasks = store.list_tasks(status="open")
        if intent == "tasks.list":
            return {"status": "done", "decision": decision.to_dict(), "tasks": tasks}
        target = _find_task(store, req.task_id, req.message)
        if target is None:
            return {
                "status": "needs_input",
                "decision": decision.to_dict(),
                "message": "Tell me which task to update.",
                "candidates": tasks[:10],
            }
        updated = store.update_task(
            target["id"],
            {"status": "done"} if "done" in req.message.lower() else {},
        )
        return {"status": "done", "decision": decision.to_dict(), "task": updated}

    if intent == "memory.remember":
        category = decision.entities.get("memory_category", "personal")
        entry = store.create_memory(
            category,
            _memory_content(req.message, decision.entities),
            source="assistant",
            project=(J_AND_M_PROFILE["id"] if req.workspace == "business" else ""),
        )
        return {"status": "done", "decision": decision.to_dict(), "memory": entry}

    if intent == "memory.recall":
        needle = req.message.lower()
        matches = [
            entry
            for entry in store.list_memory()
            if any(
                word in entry["content"].lower()
                for word in needle.split()
                if len(word) > 3
            )
        ]
        return {
            "status": "done",
            "decision": decision.to_dict(),
            "memories": matches[:10],
            "message": (
                "Here is what I have stored." if matches else "No matching memory yet."
            ),
        }

    if intent == "events.create":
        if not req.starts_at:
            return {
                "status": "needs_input",
                "decision": decision.to_dict(),
                "message": "When should this happen? Provide a start time.",
            }
        event = store.create_event(
            _title_from_request(req.message),
            req.starts_at,
            location=req.location,
            workspace=req.workspace if req.workspace in WORKSPACES else "business",
        )
        return {"status": "done", "decision": decision.to_dict(), "event": event}

    if intent == "integrations.status":
        statuses = _connector_status()
        return {
            "status": "done",
            "decision": decision.to_dict(),
            "integrations": [
                _integration_payload(entry, statuses) for entry in INTEGRATION_CATALOG
            ],
        }

    if intent == "business.report":
        return {
            "status": "done",
            "decision": decision.to_dict(),
            "business": {
                "profile": J_AND_M_PROFILE,
                "overview": store.overview(workspace="business"),
            },
        }

    if intent in ("research", "integrations.sync", "messages.send"):
        # Approval-gated intents returned earlier; defensive fallthrough.
        return {
            "status": "needs_input",
            "decision": decision.to_dict(),
            "message": (
                "This request needs a connected integration or a conversation turn."
            ),
        }

    return {
        "status": "routed",
        "decision": decision.to_dict(),
        "message": "No local action needed — continue in Chat with the assistant.",
        "chat_path": "/",
    }


def _find_task(
    store: WorkspaceStore, task_id: Optional[str], message: str
) -> Optional[Dict[str, Any]]:
    if task_id:
        return store.get_task(task_id)
    lowered = message.lower()
    for task in store.list_tasks(status="open"):
        if task["title"].lower() in lowered:
            return task
    return None


def _queue_approval(req: "AssistantRequest", decision) -> Any:
    payload: Dict[str, Any] = {
        "message": req.message,
        "intent": decision.intent,
        "workspace": req.workspace,
    }
    if decision.intent == "tasks.delete" and req.task_id:
        payload["task_id"] = req.task_id
    description = decision.label
    if decision.intent == "tasks.delete":
        description = f"Delete task: {req.message.strip()[:120]}"
    elif decision.intent == "messages.send":
        description = f"Send message: {req.message.strip()[:120]}"
    elif decision.intent == "integrations.sync":
        description = f"Sync integration: {req.message.strip()[:120]}"
    store = _approval_store()
    return store.queue_action(
        action_type=f"assistant.{decision.intent.replace('.', '_')}",
        description=description,
        payload=payload,
        permission_key=f"assistant:{decision.intent}",
        tier="high",
        ttl_hours=24,
    )


__all__ = [
    "INTEGRATION_CATALOG",
    "J_AND_M_PROFILE",
    "router",
]
