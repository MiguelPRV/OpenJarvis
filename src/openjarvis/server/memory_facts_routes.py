"""Review/management API for automatically extracted long-term memory facts.

The memory service learns short, durable facts about the user in the
background (see :mod:`openjarvis.memory`). This router is the read/write
surface the "Memories" screen uses so a person can see, correct and delete
what was learned — the trust requirement for storing personal data.

Routes are mounted under ``/v1/memory/facts`` (facts) and
``/v1/memory/extraction`` (background extraction status).
"""

from __future__ import annotations

import logging
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openjarvis.memory.store import Fact, FactStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/memory/facts", tags=["memory"])
extraction_router = APIRouter(prefix="/v1/memory/extraction", tags=["memory"])

_FALLBACK_STORE_ATTR = "_fallback_fact_store"


class FactUpdateRequest(BaseModel):
    """Edit a stored fact. Every field is optional; omitted = unchanged."""

    text: Optional[str] = None
    trust: Optional[str] = None
    # The text the client believes the fact currently has, so a concurrent
    # extraction/eviction can never rewrite or delete the wrong entry.
    expected_text: Optional[str] = None


def _memory_service(request: Request) -> Any:
    return getattr(request.app.state, "memory_service", None)


def _fact_store(request: Request) -> FactStore:
    """Return the live service's store, else a store over the same file.

    Extraction can be switched off (``[memory] enabled = false``) while the
    user still wants to review facts learned earlier, so the management API
    must not depend on the background service being up.
    """
    service = _memory_service(request)
    if service is not None:
        return service.store

    store = getattr(request.app.state, _FALLBACK_STORE_ATTR, None)
    if store is None:
        from openjarvis.core.config import load_config
        from openjarvis.memory import create_fact_store

        memory_config = load_config().memory
        store = create_fact_store(
            memory_config.backend,
            path=memory_config.facts_path,
            max_facts=memory_config.max_facts,
        )
        setattr(request.app.state, _FALLBACK_STORE_ATTR, store)
    return store


def _serialize(index: int, fact: Fact) -> dict:
    return {
        "index": index,
        "text": fact.text,
        "source": fact.source,
        "created_at": fact.created_at,
        "trust": fact.trust,
        "trusted_for_recall": fact.trusted_for_recall,
    }


def _facts(store: FactStore) -> List[dict]:
    return [_serialize(index, fact) for index, fact in enumerate(store.list())]


def _extraction_status(request: Request) -> dict:
    service = _memory_service(request)
    return {
        "enabled": service is not None,
        "running": bool(service is not None and service.is_running),
    }


@router.get("")
def list_facts(request: Request) -> dict:
    """List every stored fact, oldest first, plus extraction status."""
    facts = _facts(_fact_store(request))
    return {
        "facts": facts,
        "count": len(facts),
        "extraction": _extraction_status(request),
    }


@router.patch("/{index}")
def update_fact(index: int, body: FactUpdateRequest, request: Request) -> dict:
    """Edit a fact's text and/or its trust tier."""
    store = _fact_store(request)
    current = store.list()
    if not 0 <= index < len(current):
        raise HTTPException(status_code=404, detail="No memory found at that position")

    changed = False
    try:
        if body.text is not None:
            if not store.update_text(index, body.text, expected_text=body.expected_text or ""):
                raise HTTPException(
                    status_code=409,
                    detail="Memory changed while it was being edited, or the new text duplicates another memory. Reload and retry.",
                )
            changed = True
        if body.trust is not None:
            if not store.set_trust(index, body.trust):
                raise HTTPException(
                    status_code=409,
                    detail="Memory changed while it was being edited. Reload and retry.",
                )
            changed = True
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=501,
            detail="This memory backend does not support editing facts.",
        ) from exc

    if not changed:
        raise HTTPException(status_code=400, detail="Nothing to update")

    updated = store.list()
    if not 0 <= index < len(updated):
        raise HTTPException(status_code=404, detail="No memory found at that position")
    return {"fact": _serialize(index, updated[index]), "count": len(updated)}


@router.delete("/{index}")
def delete_fact(index: int, request: Request, expected_text: str = "") -> dict:
    """Delete one fact. ``expected_text`` guards against deleting the wrong one."""
    store = _fact_store(request)
    try:
        removed = store.remove(index, expected_text=expected_text)
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=501,
            detail="This memory backend does not support deleting facts.",
        ) from exc
    if not removed:
        raise HTTPException(
            status_code=404,
            detail="Memory not found — it may have changed since the list was loaded.",
        )
    facts = _facts(store)
    return {"deleted": True, "count": len(facts)}


@extraction_router.get("")
def extraction_status(request: Request) -> dict:
    """Whether background fact extraction is configured and currently running."""
    return _extraction_status(request)


@extraction_router.post("/pause")
def pause_extraction(request: Request) -> dict:
    """Stop learning new facts until resumed (in-memory, cleared on restart)."""
    service = _memory_service(request)
    if service is None:
        raise HTTPException(
            status_code=409,
            detail="Memory extraction is disabled on this server (memory.enabled = false).",
        )
    service.stop()
    return _extraction_status(request)


@extraction_router.post("/resume")
def resume_extraction(request: Request) -> dict:
    """Resume background fact extraction."""
    service = _memory_service(request)
    if service is None:
        raise HTTPException(
            status_code=409,
            detail="Memory extraction is disabled on this server (memory.enabled = false).",
        )
    service.start()
    return _extraction_status(request)
