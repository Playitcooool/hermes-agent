"""Structured lesson tool for the Learning Thread desktop experience."""

from __future__ import annotations

import json
from typing import Any

from learning_thread import LearningThreadError, LearningThreadStore
from tools.registry import registry


_SCHEMA = {
    "name": "learning_thread",
    "description": (
        "Maintain a persistent structured lesson. Call action=start only when the user explicitly asks "
        "for sustained teaching (for example 'teach me' or 'I want to understand'). Ordinary questions "
        "and tasks must receive ordinary answers. Side questions use branch_open/branch_answer and never "
        "advance the canonical lesson. Action requirements: start needs topic, objective, a 5–7 item outline, "
        "the first section's Markdown content, and one checkpoint; continue teaches exactly the next outline "
        "section; checkpoint records and evaluates the learner's answer; branch_open anchors a side question "
        "to source_excerpt; branch_answer gives a focused answer and connection; back restores the source "
        "section. After a successful state-changing call, do not repeat display_markdown in ordinary prose."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["start", "continue", "checkpoint", "branch_open", "branch_answer", "back", "view", "reset"],
            },
            "topic": {"type": "string"},
            "objective": {"type": "string"},
            "outline": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"title": {"type": "string"}, "purpose": {"type": "string"}},
                    "required": ["title", "purpose"],
                    "additionalProperties": False,
                },
            },
            "section_title": {"type": "string"},
            "content": {
                "type": "string",
                "description": "Complete teaching or branch answer as Markdown with LaTeX where useful.",
            },
            "checkpoint": {"type": "string"},
            "answer": {"type": "string"},
            "evaluation": {"type": "string"},
            "readiness": {
                "type": "string",
                "enum": ["understood", "mostly_understood", "needs_clarification"],
            },
            "question": {"type": "string"},
            "source_excerpt": {"type": "string"},
            "connection": {"type": "string"},
            "misconception": {"type": "string"},
            "resolution": {"type": "string"},
        },
        "required": ["action"],
        "additionalProperties": False,
    },
}


def _section_markdown(state: dict[str, Any]) -> str:
    section = next(
        (item for item in state.get("sections", []) if item.get("id") == state.get("active_section_id")),
        None,
    )
    if not section:
        return ""
    chunks = [f'# {section["title"]}', section.get("content", "")]
    if section.get("checkpoint"):
        chunks.extend([f'## Understanding check', section["checkpoint"]])
    if section.get("checkpoint_evaluation"):
        chunks.extend(["### Feedback", section["checkpoint_evaluation"]])
    return "\n\n".join(chunk for chunk in chunks if chunk)


def _branch_markdown(state: dict[str, Any]) -> str:
    branch = next(
        (item for item in state.get("branches", []) if item.get("id") == state.get("active_branch_id")),
        None,
    )
    if not branch:
        return ""
    messages = "\n\n".join(message.get("content", "") for message in branch.get("messages", []))
    connection = f'\n\n> **Connection to the lesson:** {branch["connection"]}' if branch.get("connection") else ""
    return f'## Side question · {branch["title"]}\n\n{messages}{connection}'


def _result(state: dict[str, Any] | None, action: str) -> str:
    display = _branch_markdown(state) if state and state.get("active_branch_id") else _section_markdown(state or {})
    return json.dumps(
        {
            "success": True,
            "action": action,
            "learning_thread": state,
            "display_markdown": display,
        },
        ensure_ascii=False,
    )


def handle_learning_thread(args: dict[str, Any], task_id: str | None = None, **_kwargs: Any) -> str:
    session_id = str(task_id or "default")
    store = LearningThreadStore(session_id)
    action = str(args.get("action") or "").strip()
    try:
        if action == "start":
            state = store.start(
                topic=args.get("topic", ""),
                objective=args.get("objective", ""),
                outline=args.get("outline") or [],
                section_title=args.get("section_title", ""),
                content=args.get("content", ""),
                checkpoint=args.get("checkpoint", ""),
            )
        elif action == "continue":
            state = store.continue_lesson(
                section_title=args.get("section_title", ""),
                content=args.get("content", ""),
                checkpoint=args.get("checkpoint", ""),
            )
        elif action == "checkpoint":
            state = store.evaluate_checkpoint(
                answer=args.get("answer", ""),
                evaluation=args.get("evaluation", ""),
                readiness=args.get("readiness", ""),
            )
        elif action == "branch_open":
            state = store.open_branch(
                question=args.get("question", ""),
                source_excerpt=args.get("source_excerpt", ""),
            )
        elif action == "branch_answer":
            state = store.answer_branch(
                content=args.get("content", ""),
                connection=args.get("connection", ""),
                misconception=args.get("misconception"),
            )
        elif action == "back":
            state = store.back(resolution=args.get("resolution"))
        elif action == "view":
            state = store.load()
            if state is None:
                raise LearningThreadError("no learning thread exists in this session")
        elif action == "reset":
            store.reset()
            state = None
        else:
            raise LearningThreadError("unknown learning_thread action")
        return _result(state, action)
    except LearningThreadError as exc:
        return json.dumps({"success": False, "action": action, "error": str(exc)}, ensure_ascii=False)


registry.register(
    name="learning_thread",
    toolset="learning",
    schema=_SCHEMA,
    handler=handle_learning_thread,
    description="Persistent canonical lessons with anchored side-question branches.",
    emoji="📚",
)
