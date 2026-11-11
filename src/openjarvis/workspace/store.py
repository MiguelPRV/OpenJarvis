"""SQLite-backed store for tasks, categorised memory, events and activity.

One database file under the OpenJarvis home directory (``workspace.db``) keeps
this small, dependency-free domain separate from the agent/runtime databases
while still surviving restarts. Every table is created idempotently so an
existing install upgrades in place.
"""

from __future__ import annotations

import sqlite3
import threading
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from openjarvis.core.paths import get_config_dir

# Public vocabularies — the API validates against these and the UI reuses them.
MEMORY_CATEGORIES = ("personal", "business", "project", "preference")
PRIORITIES = ("low", "medium", "high", "urgent")
TASK_STATUSES = ("open", "done")
WORKSPACES = ("personal", "business", "project")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    notes        TEXT NOT NULL DEFAULT '',
    priority     TEXT NOT NULL DEFAULT 'medium',
    status       TEXT NOT NULL DEFAULT 'open',
    due_at       TEXT,
    project      TEXT NOT NULL DEFAULT '',
    workspace    TEXT NOT NULL DEFAULT 'personal',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS memory_entries (
    id         TEXT PRIMARY KEY,
    category   TEXT NOT NULL,
    content    TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT 'manual',
    project    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    starts_at  TEXT NOT NULL,
    location   TEXT NOT NULL DEFAULT '',
    workspace  TEXT NOT NULL DEFAULT 'personal',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
    id         TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""

_PRIORITY_ORDER = {"urgent": 0, "high": 1, "medium": 2, "low": 3}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid() -> str:
    return uuid.uuid4().hex[:12]


def _validate(value: str, allowed: tuple[str, ...], field: str) -> str:
    if value not in allowed:
        raise ValueError(f"{field} must be one of {', '.join(allowed)}")
    return value


class WorkspaceStore:
    """Tasks, categorised memory, events and a recent-activity feed."""

    def __init__(self, db_path: str = "") -> None:
        if not db_path:
            db_path = str(get_config_dir() / "workspace.db")
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db_path = db_path
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    # -- helpers ---------------------------------------------------------

    def _rows(self, sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
        return [dict(row) for row in self._conn.execute(sql, params).fetchall()]

    def _row(self, sql: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        row = self._conn.execute(sql, params).fetchone()
        return dict(row) if row else None

    def log_activity(self, kind: str, message: str) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO activity (id, kind, message, created_at) "
                "VALUES (?, ?, ?, ?)",
                (_uid(), kind, message, _now()),
            )
            self._conn.commit()

    # -- tasks -----------------------------------------------------------

    def create_task(
        self,
        title: str,
        *,
        notes: str = "",
        priority: str = "medium",
        due_at: Optional[str] = None,
        project: str = "",
        workspace: str = "personal",
    ) -> Dict[str, Any]:
        title = title.strip()
        if not title:
            raise ValueError("title is required")
        _validate(priority, PRIORITIES, "priority")
        _validate(workspace, WORKSPACES, "workspace")
        now = _now()
        task_id = _uid()
        with self._lock:
            self._conn.execute(
                "INSERT INTO tasks (id, title, notes, priority, status, due_at, "
                "project, workspace, created_at, updated_at, completed_at) "
                "VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, NULL)",
                (task_id, title, notes, priority, due_at, project, workspace, now, now),
            )
            self._conn.commit()
        self.log_activity("task", f"Task added: {title}")
        return self.get_task(task_id)  # type: ignore[return-value]

    def list_tasks(
        self,
        *,
        status: Optional[str] = None,
        workspace: Optional[str] = None,
        project: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        clauses: List[str] = []
        params: List[Any] = []
        if status:
            clauses.append("status = ?")
            params.append(_validate(status, TASK_STATUSES, "status"))
        if workspace:
            clauses.append("workspace = ?")
            params.append(_validate(workspace, WORKSPACES, "workspace"))
        if project:
            clauses.append("project = ?")
            params.append(project)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        tasks = self._rows(f"SELECT * FROM tasks{where}", tuple(params))
        # Open work first, then by priority, then earliest deadline.
        tasks.sort(
            key=lambda t: (
                t["status"] == "done",
                _PRIORITY_ORDER.get(t["priority"], 9),
                t["due_at"] or "9999",
                t["created_at"],
            )
        )
        return tasks

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        return self._row("SELECT * FROM tasks WHERE id = ?", (task_id,))

    def update_task(
        self, task_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        task = self.get_task(task_id)
        if task is None:
            return None
        allowed = {
            "title",
            "notes",
            "priority",
            "status",
            "due_at",
            "project",
            "workspace",
        }
        fields = {k: v for k, v in updates.items() if k in allowed and v is not None}
        if "priority" in fields:
            _validate(fields["priority"], PRIORITIES, "priority")
        if "status" in fields:
            _validate(fields["status"], TASK_STATUSES, "status")
        if "workspace" in fields:
            _validate(fields["workspace"], WORKSPACES, "workspace")
        if "title" in fields:
            fields["title"] = str(fields["title"]).strip()
            if not fields["title"]:
                raise ValueError("title cannot be empty")
        if fields.get("status") == "done" and task["status"] != "done":
            fields["completed_at"] = _now()
        if fields.get("status") == "open" and task["status"] == "done":
            fields["completed_at"] = None
        if not fields:
            return task

        fields["updated_at"] = _now()
        assignments = ", ".join(f"{key} = ?" for key in fields)
        values = list(fields.values()) + [task_id]
        with self._lock:
            self._conn.execute(
                f"UPDATE tasks SET {assignments} WHERE id = ?", tuple(values)
            )
            self._conn.commit()
        if fields.get("status") == "done":
            self.log_activity(
                "task", f"Task completed: {fields.get('title', task['title'])}"
            )
        return self.get_task(task_id)

    def delete_task(self, task_id: str) -> bool:
        task = self.get_task(task_id)
        if task is None:
            return False
        with self._lock:
            self._conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            self._conn.commit()
        self.log_activity("task", f"Task deleted: {task['title']}")
        return True

    # -- categorised memory ---------------------------------------------

    def create_memory(
        self,
        category: str,
        content: str,
        *,
        source: str = "manual",
        project: str = "",
    ) -> Dict[str, Any]:
        _validate(category, MEMORY_CATEGORIES, "category")
        content = content.strip()
        if not content:
            raise ValueError("content is required")
        now = _now()
        memory_id = _uid()
        with self._lock:
            self._conn.execute(
                "INSERT INTO memory_entries (id, category, content, source, project, "
                "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (memory_id, category, content, source, project, now, now),
            )
            self._conn.commit()
        self.log_activity("memory", f"{category.capitalize()} memory saved")
        return self.get_memory(memory_id)  # type: ignore[return-value]

    def list_memory(self, category: Optional[str] = None) -> List[Dict[str, Any]]:
        params: tuple = ()
        sql = "SELECT * FROM memory_entries"
        if category:
            sql += " WHERE category = ?"
            params = (_validate(category, MEMORY_CATEGORIES, "category"),)
        sql += " ORDER BY created_at DESC"
        return self._rows(sql, params)

    def get_memory(self, memory_id: str) -> Optional[Dict[str, Any]]:
        return self._row("SELECT * FROM memory_entries WHERE id = ?", (memory_id,))

    def update_memory(
        self, memory_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        if self.get_memory(memory_id) is None:
            return None
        fields = {
            k: v
            for k, v in updates.items()
            if k in {"category", "content", "project"} and v is not None
        }
        if "category" in fields:
            _validate(fields["category"], MEMORY_CATEGORIES, "category")
        if "content" in fields:
            fields["content"] = str(fields["content"]).strip()
            if not fields["content"]:
                raise ValueError("content cannot be empty")
        if not fields:
            return self.get_memory(memory_id)
        fields["updated_at"] = _now()
        assignments = ", ".join(f"{key} = ?" for key in fields)
        with self._lock:
            self._conn.execute(
                f"UPDATE memory_entries SET {assignments} WHERE id = ?",
                tuple(list(fields.values()) + [memory_id]),
            )
            self._conn.commit()
        return self.get_memory(memory_id)

    def delete_memory(self, memory_id: str) -> bool:
        entry = self.get_memory(memory_id)
        if entry is None:
            return False
        with self._lock:
            self._conn.execute("DELETE FROM memory_entries WHERE id = ?", (memory_id,))
            self._conn.commit()
        self.log_activity("memory", f"Memory forgotten ({entry['category']})")
        return True

    # -- events ----------------------------------------------------------

    def create_event(
        self,
        title: str,
        starts_at: str,
        *,
        location: str = "",
        workspace: str = "business",
    ) -> Dict[str, Any]:
        title = title.strip()
        if not title:
            raise ValueError("title is required")
        _validate(workspace, WORKSPACES, "workspace")
        try:
            datetime.fromisoformat(starts_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("starts_at must be an ISO 8601 timestamp") from exc
        event_id = _uid()
        with self._lock:
            self._conn.execute(
                "INSERT INTO events (id, title, starts_at, location, workspace, "
                "created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (event_id, title, starts_at, location, workspace, _now()),
            )
            self._conn.commit()
        self.log_activity("event", f"Event added: {title}")
        return self.get_event(event_id)  # type: ignore[return-value]

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        return self._row("SELECT * FROM events WHERE id = ?", (event_id,))

    def list_events(
        self, *, upcoming_only: bool = False, days: int = 14
    ) -> List[Dict[str, Any]]:
        events = self._rows("SELECT * FROM events ORDER BY starts_at")
        if not upcoming_only:
            return events
        now = datetime.now(timezone.utc)
        horizon = now + timedelta(days=days)
        upcoming = []
        for event in events:
            try:
                start = datetime.fromisoformat(
                    event["starts_at"].replace("Z", "+00:00")
                )
            except ValueError:
                continue
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            if now - timedelta(hours=12) <= start <= horizon:
                upcoming.append(event)
        return upcoming

    def delete_event(self, event_id: str) -> bool:
        event = self.get_event(event_id)
        if event is None:
            return False
        with self._lock:
            self._conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
            self._conn.commit()
        self.log_activity("event", f"Event deleted: {event['title']}")
        return True

    # -- overview --------------------------------------------------------

    def today_tasks(self) -> Dict[str, List[Dict[str, Any]]]:
        today = date.today()
        open_tasks = self.list_tasks(status="open")
        due_today: List[Dict[str, Any]] = []
        overdue: List[Dict[str, Any]] = []
        for task in open_tasks:
            due_at = task.get("due_at")
            if not due_at:
                continue
            try:
                due = datetime.fromisoformat(due_at.replace("Z", "+00:00")).date()
            except ValueError:
                continue
            if due == today:
                due_today.append(task)
            elif due < today:
                overdue.append(task)
        return {"due_today": due_today, "overdue": overdue}

    def overview(self, *, workspace: Optional[str] = None) -> Dict[str, Any]:
        tasks = self.list_tasks(workspace=workspace)
        open_tasks = [t for t in tasks if t["status"] == "open"]
        done_tasks = [t for t in tasks if t["status"] == "done"]
        today = self.today_tasks()
        memory_counts = {category: 0 for category in MEMORY_CATEGORIES}
        for entry in self.list_memory():
            memory_counts[entry["category"]] = (
                memory_counts.get(entry["category"], 0) + 1
            )
        projects: Dict[str, int] = {}
        for task in open_tasks:
            if task["project"]:
                projects[task["project"]] = projects.get(task["project"], 0) + 1
        updates = self._rows("SELECT * FROM activity ORDER BY created_at DESC LIMIT 8")
        upcoming_events = self.list_events(upcoming_only=True, days=14)
        return {
            "tasks": {
                "open": len(open_tasks),
                "completed": len(done_tasks),
                "due_today": len(today["due_today"]),
                "overdue": len(today["overdue"]),
                "today": today["due_today"],
                "overdue_list": today["overdue"],
                "priority_breakdown": {
                    p: len([t for t in open_tasks if t["priority"] == p])
                    for p in PRIORITIES
                },
            },
            "projects": [
                {"name": name, "open_tasks": count}
                for name, count in sorted(
                    projects.items(), key=lambda kv: (-kv[1], kv[0])
                )
            ],
            "memory": {
                "categories": [
                    {"category": c, "count": memory_counts[c]}
                    for c in MEMORY_CATEGORIES
                ],
                "total": sum(memory_counts.values()),
            },
            "events": upcoming_events,
            "updates": updates,
        }


__all__ = [
    "MEMORY_CATEGORIES",
    "PRIORITIES",
    "TASK_STATUSES",
    "WORKSPACES",
    "WorkspaceStore",
]
