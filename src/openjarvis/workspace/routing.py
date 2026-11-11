"""Deterministic intent routing for the OpenJarvis assistant.

Every user request passes through :class:`AssistantRouter` before anything is
executed. The router decides *which* domain handler owns the request and
whether the action is safe to run locally or must be queued for explicit user
approval first (sending messages, external sync, destructive deletes).

The classifier is rule based on purpose: it is fast, runs offline, needs no
model download, and — critically — its decisions are testable and predictable.
A local LLM can still handle the conversation itself; routing is the guardrail
that stops an external side effect from happening without consent.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple

# Handlers the router can dispatch to. Each maps to a concrete capability in
# ``workspace_routes`` (local, safe) or to an approval-gated action.
HANDLERS = (
    "tasks.create",
    "tasks.update",
    "tasks.delete",
    "tasks.list",
    "memory.remember",
    "memory.recall",
    "events.create",
    "integrations.status",
    "integrations.sync",
    "messages.send",
    "business.report",
    "research",
    "conversation",
)

# Actions that must never fire from a single click: they leave the device or
# destroy data. Anything listed here returns ``requires_approval=True``.
APPROVAL_REQUIRED = {
    "tasks.delete",
    "integrations.sync",
    "messages.send",
}

APPROVAL_REASONS = {
    "tasks.delete": "Deleting a task is permanent.",
    "integrations.sync": "Syncing pulls data from an external account.",
    "messages.send": "Sending a message leaves this device.",
}


@dataclass
class RouteDecision:
    """The router's verdict for one request."""

    intent: str
    label: str
    confidence: float
    handler: str
    requires_approval: bool
    approval_reason: str = ""
    rationale: str = ""
    matched: List[str] = field(default_factory=list)
    entities: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# (pattern, intent, label, weight). Longer, more specific patterns carry more
# weight so "delete the task" wins over the bare noun "task".
_RULES: Tuple[Tuple[str, str, str, float], ...] = (
    # Tasks
    (r"\b(delete|remove|cancel)\b.*\btask\b", "tasks.delete", "Delete a task", 3.0),
    (
        r"\b(mark|set)\b.*\b(done|complete|completed|finished)\b",
        "tasks.update",
        "Complete a task",
        2.5,
    ),
    (
        r"\b(due|deadline|priorit\w*|reschedule)\b.*\btask\b",
        "tasks.update",
        "Update a task",
        2.0,
    ),
    (r"\b(add|create|new|remember)\b.*\btask\b", "tasks.create", "Create a task", 2.5),
    (r"\btodo\b", "tasks.create", "Create a task", 1.5),
    (r"\b(my|list|show|what are)\b.*\btasks?\b", "tasks.list", "List tasks", 2.0),
    # Memory
    (
        r"\b(remember|note|save)\b.*\b(prefer\w*|like|always|never)\b",
        "memory.remember",
        "Save a preference",
        2.5,
    ),
    (r"\b(remember|note|save|keep in mind)\b", "memory.remember", "Save a memory", 2.0),
    (
        r"\b(what do you (know|remember)|recall|remind me what)\b",
        "memory.recall",
        "Recall memory",
        3.0,
    ),
    # Events
    (
        r"\b(schedule|book|add|create)\b.*\b(meeting|event|shoot|call|session)\b",
        "events.create",
        "Schedule an event",
        2.5,
    ),
    (r"\bcalendar\b.*\b(add|create|new)\b", "events.create", "Schedule an event", 2.0),
    # Integrations
    (
        r"\b(sync|refresh|pull)\b.*\b(gmail|email|calendar|drive|slack|notion|integration\w*)\b",
        "integrations.sync",
        "Sync an integration",
        3.0,
    ),
    (
        r"\b(integration|connected|connection|status of)\b",
        "integrations.status",
        "Check integrations",
        2.0,
    ),
    # Messaging (external side effect)
    (
        r"\b(send|email|text|message|dm|post|reply)\b.*\b(to|them|client|customer|team)\b",
        "messages.send",
        "Send a message",
        3.0,
    ),
    (
        r"\b(send|draft)\b.*\b(email|message|text|reply|dm)\b",
        "messages.send",
        "Send a message",
        2.5,
    ),
    # Business reporting
    (r"\b(j&m|jm visuals)\b", "business.report", "J&M Visuals workspace", 3.0),
    (
        r"\b(revenue|invoice|quote|client|project|pipeline|bookings?)\b",
        "business.report",
        "Business overview",
        1.5,
    ),
    # Research
    (
        r"\b(research|investigate|look up|find out|summar\w+)\b",
        "research",
        "Research",
        2.0,
    ),
)

_COMPILED = tuple(
    (re.compile(pattern, re.IGNORECASE), intent, label, weight)
    for pattern, intent, label, weight in _RULES
)

_PRIORITY_HINTS = (
    ("urgent", "urgent"),
    ("asap", "urgent"),
    ("critical", "urgent"),
    ("high priority", "high"),
    ("important", "high"),
    ("low priority", "low"),
    ("whenever", "low"),
)

_CATEGORY_HINTS = (
    (r"\bprefer\w*\b|\balways\b|\bnever\b|\blikes?\b", "preference"),
    (r"\bclient|business|invoice|studio|j&m|jm visuals|brand|shoot\b", "business"),
    (r"\bproject\b|\bdeadline\b|\bdeliverable\b", "project"),
)


def _extract_entities(text: str) -> Dict[str, Any]:
    lowered = text.lower()
    entities: Dict[str, Any] = {}
    for hint, priority in _PRIORITY_HINTS:
        if hint in lowered:
            entities["priority"] = priority
            break
    for pattern, category in _CATEGORY_HINTS:
        if re.search(pattern, lowered):
            entities["memory_category"] = category
            break
    # Quoted text is the payload a user most likely wants stored or sent.
    quoted = re.search(r"[\"“](.+?)[\"”]", text)
    if quoted:
        entities["quoted"] = quoted.group(1).strip()
    return entities


class AssistantRouter:
    """Classify a request and decide whether it needs approval."""

    def route(
        self, text: str, *, context: Optional[Dict[str, Any]] = None
    ) -> RouteDecision:
        text = (text or "").strip()
        if not text:
            return RouteDecision(
                intent="conversation",
                label="Conversation",
                confidence=0.0,
                handler="conversation",
                requires_approval=False,
                rationale="Empty request.",
            )

        scores: Dict[str, float] = {}
        counts: Dict[str, int] = {}
        labels: Dict[str, str] = {}
        matched: List[str] = []
        hits = 0
        for pattern, intent, label, weight in _COMPILED:
            match = pattern.search(text)
            if not match:
                continue
            hits += 1
            matched.append(match.group(0).strip())
            # The strongest single cue decides the intent; extra cues only add
            # a small bonus. Summing would let a generic rule ("remember")
            # outvote a more specific one ("recall").
            counts[intent] = counts.get(intent, 0) + 1
            scores[intent] = max(scores.get(intent, 0.0), weight) + (
                0.2 * (counts[intent] - 1)
            )
            labels.setdefault(intent, label)

        if not scores:
            return RouteDecision(
                intent="conversation",
                label="Conversation",
                confidence=0.35,
                handler="conversation",
                requires_approval=False,
                rationale="No workspace action detected — answering as a conversation.",
                entities=_extract_entities(text),
            )

        intent = max(scores, key=lambda key: scores[key])
        handler = intent
        # Total achievable weight per hit is ~3.0; cap and round for a readable
        # confidence instead of an unbounded sum.
        confidence = round(min(0.99, 0.45 + 0.15 * hits + 0.05 * scores[intent]), 2)
        decision = RouteDecision(
            intent=intent,
            label=labels[intent],
            confidence=confidence,
            handler=handler,
            requires_approval=intent in APPROVAL_REQUIRED,
            approval_reason=APPROVAL_REASONS.get(intent, ""),
            rationale=(f"Matched {hits} routing cue(s); highest score for '{intent}'."),
            matched=matched[:6],
            entities=_extract_entities(text),
        )
        if context:
            decision.entities.setdefault("context_workspace", context.get("workspace"))
        return decision


_ROUTER = AssistantRouter()


def route_request(
    text: str, *, context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Convenience wrapper used by the HTTP layer."""
    return _ROUTER.route(text, context=context).to_dict()


__all__ = [
    "APPROVAL_REASONS",
    "APPROVAL_REQUIRED",
    "AssistantRouter",
    "HANDLERS",
    "RouteDecision",
    "route_request",
]
