"""Persistent personal/business workspace primitives.

The workspace layer sits beside the existing agent runtime: it stores the
user's own tasks, categorised memories, calendar events and activity feed, and
provides a deterministic routing layer that maps a request to a handler while
deciding whether the action needs explicit user approval.
"""

from openjarvis.workspace.routing import AssistantRouter, route_request
from openjarvis.workspace.store import (
    MEMORY_CATEGORIES,
    PRIORITIES,
    WorkspaceStore,
)

__all__ = [
    "AssistantRouter",
    "MEMORY_CATEGORIES",
    "PRIORITIES",
    "WorkspaceStore",
    "route_request",
]
