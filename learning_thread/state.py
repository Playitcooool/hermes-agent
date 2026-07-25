"""Durable state machine for canonical lessons and anchored side branches."""

from __future__ import annotations

import hashlib
import json
import os
import threading
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from hermes_constants import get_hermes_home


class LearningThreadError(ValueError):
    """Raised when a requested learning transition violates an invariant."""


_LOCKS: dict[str, threading.RLock] = {}
_LOCKS_GUARD = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _clean(value: Any, label: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise LearningThreadError(f"{label} is required")
    return text


def _lock_for(path: Path) -> threading.RLock:
    key = str(path)
    with _LOCKS_GUARD:
        return _LOCKS.setdefault(key, threading.RLock())


class LearningThreadStore:
    """JSON-backed per-Hermes-session learning state.

    The canonical section cursor and branch cursor are separate. Opening or
    answering a branch therefore cannot advance or rewrite the main lesson.
    """

    def __init__(self, session_id: str, root: Path | None = None):
        self.session_id = _clean(session_id, "session_id")
        digest = hashlib.sha256(self.session_id.encode("utf-8")).hexdigest()[:32]
        base = root or (get_hermes_home() / "learning_threads")
        self.path = Path(base) / f"{digest}.json"
        self._lock = _lock_for(self.path)

    def load(self) -> dict[str, Any] | None:
        with self._lock:
            if not self.path.exists():
                return None
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) and data.get("version") == 1 else None

    def _save(self, state: dict[str, Any]) -> dict[str, Any]:
        state["updated_at"] = _now()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, self.path)
        return deepcopy(state)

    def start(
        self,
        *,
        topic: str,
        objective: str,
        outline: list[dict[str, Any]],
        section_title: str,
        content: str,
        checkpoint: str,
    ) -> dict[str, Any]:
        with self._lock:
            if self.load() is not None:
                raise LearningThreadError("a learning thread already exists in this session")
            if not isinstance(outline, list) or not outline:
                raise LearningThreadError("outline must contain at least one section")
            normalized_outline = []
            for item in outline:
                if not isinstance(item, dict):
                    raise LearningThreadError("each outline item must be an object")
                normalized_outline.append(
                    {
                        "id": _id("outline"),
                        "title": _clean(item.get("title"), "outline title"),
                        "purpose": _clean(item.get("purpose"), "outline purpose"),
                    }
                )
            title = _clean(section_title, "section_title")
            if normalized_outline[0]["title"].casefold() != title.casefold():
                raise LearningThreadError("the first section must match the first outline title")
            now = _now()
            section_id = _id("section")
            state = {
                "version": 1,
                "id": _id("thread"),
                "session_id": self.session_id,
                "topic": _clean(topic, "topic"),
                "objective": _clean(objective, "objective"),
                "status": "checkpoint",
                "outline": normalized_outline,
                "sections": [
                    {
                        "id": section_id,
                        "outline_id": normalized_outline[0]["id"],
                        "title": title,
                        "content": _clean(content, "content"),
                        "checkpoint": _clean(checkpoint, "checkpoint"),
                        "checkpoint_answer": None,
                        "checkpoint_evaluation": None,
                        "readiness": None,
                        "status": "current",
                    }
                ],
                "active_section_id": section_id,
                "branches": [],
                "active_branch_id": None,
                "created_at": now,
                "updated_at": now,
            }
            return self._save(state)

    def continue_lesson(self, *, section_title: str, content: str, checkpoint: str) -> dict[str, Any]:
        with self._lock:
            state = self._require()
            if state.get("active_branch_id"):
                raise LearningThreadError("return from the active side branch before continuing")
            sections = state["sections"]
            current = sections[-1]
            if current.get("status") == "current":
                current["status"] = "completed"
            next_index = len(sections)
            if next_index >= len(state["outline"]):
                raise LearningThreadError("the lesson outline is already complete")
            expected = state["outline"][next_index]
            title = _clean(section_title, "section_title")
            if expected["title"].casefold() != title.casefold():
                raise LearningThreadError(f'next section must be "{expected["title"]}"')
            section_id = _id("section")
            sections.append(
                {
                    "id": section_id,
                    "outline_id": expected["id"],
                    "title": title,
                    "content": _clean(content, "content"),
                    "checkpoint": _clean(checkpoint, "checkpoint"),
                    "checkpoint_answer": None,
                    "checkpoint_evaluation": None,
                    "readiness": None,
                    "status": "current",
                }
            )
            state["active_section_id"] = section_id
            state["status"] = "checkpoint"
            return self._save(state)

    def evaluate_checkpoint(self, *, answer: str, evaluation: str, readiness: str) -> dict[str, Any]:
        with self._lock:
            state = self._require()
            if state.get("active_branch_id"):
                raise LearningThreadError("checkpoint evaluation is unavailable inside a side branch")
            if readiness not in {"understood", "mostly_understood", "needs_clarification"}:
                raise LearningThreadError("invalid readiness")
            section = self._active_section(state)
            section["checkpoint_answer"] = _clean(answer, "answer")
            section["checkpoint_evaluation"] = _clean(evaluation, "evaluation")
            section["readiness"] = readiness
            state["status"] = "teaching"
            return self._save(state)

    def open_branch(self, *, question: str, source_excerpt: str) -> dict[str, Any]:
        with self._lock:
            state = self._require()
            active = self._active_branch(state)
            if active:
                active["messages"].append({"role": "user", "content": _clean(question, "question"), "at": _now()})
                return self._save(state)
            section = self._active_section(state)
            branch_id = _id("branch")
            branch = {
                "id": branch_id,
                "title": _clean(question, "question")[:80],
                "question": _clean(question, "question"),
                "source_section_id": section["id"],
                "source_excerpt": _clean(source_excerpt, "source_excerpt"),
                "messages": [{"role": "user", "content": _clean(question, "question"), "at": _now()}],
                "connection": None,
                "misconception": None,
                "resolution": None,
                "status": "open",
            }
            state["branches"].append(branch)
            state["active_branch_id"] = branch_id
            state["status"] = "branch"
            return self._save(state)

    def answer_branch(self, *, content: str, connection: str, misconception: str | None = None) -> dict[str, Any]:
        with self._lock:
            state = self._require()
            branch = self._active_branch(state)
            if not branch:
                raise LearningThreadError("no side branch is active")
            branch["messages"].append({"role": "assistant", "content": _clean(content, "content"), "at": _now()})
            branch["connection"] = _clean(connection, "connection")
            branch["misconception"] = str(misconception).strip() if misconception else None
            return self._save(state)

    def back(self, *, resolution: str | None = None) -> dict[str, Any]:
        with self._lock:
            state = self._require()
            branch = self._active_branch(state)
            if not branch:
                raise LearningThreadError("no side branch is active")
            branch["status"] = "resolved" if resolution else "unresolved"
            branch["resolution"] = str(resolution).strip() if resolution else None
            state["active_branch_id"] = None
            section = self._active_section(state)
            state["status"] = "checkpoint" if not section.get("checkpoint_answer") else "teaching"
            return self._save(state)

    def reset(self) -> None:
        with self._lock:
            self.path.unlink(missing_ok=True)

    def _require(self) -> dict[str, Any]:
        state = self.load()
        if state is None:
            raise LearningThreadError("no learning thread exists in this session")
        return state

    @staticmethod
    def _active_section(state: dict[str, Any]) -> dict[str, Any]:
        active_id = state.get("active_section_id")
        for section in state.get("sections", []):
            if section.get("id") == active_id:
                return section
        raise LearningThreadError("the active lesson section is missing")

    @staticmethod
    def _active_branch(state: dict[str, Any]) -> dict[str, Any] | None:
        active_id = state.get("active_branch_id")
        if not active_id:
            return None
        return next((branch for branch in state.get("branches", []) if branch.get("id") == active_id), None)
