from __future__ import annotations

import json

from tools.learning_thread_tool import handle_learning_thread
from tools.registry import registry
from toolsets import _HERMES_CORE_TOOLS


def test_learning_tool_is_available_to_the_default_agent():
    assert "learning_thread" in _HERMES_CORE_TOOLS
    assert registry.get_entry("learning_thread") is not None


def test_tool_roundtrip_preserves_branch_anchor(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    started = json.loads(
        handle_learning_thread(
            {
                "action": "start",
                "topic": "Transformers",
                "objective": "Understand attention",
                "outline": [
                    {"title": "Overview", "purpose": "Orient"},
                    {"title": "Attention", "purpose": "Explain"},
                ],
                "section_title": "Overview",
                "content": "Tokens exchange information.",
                "checkpoint": "Why should tokens exchange information?",
            },
            task_id="session-1",
        )
    )
    section_id = started["learning_thread"]["active_section_id"]
    assert started["success"] is True
    assert "Understanding check" in started["display_markdown"]

    opened = json.loads(
        handle_learning_thread(
            {
                "action": "branch_open",
                "question": "Why scale attention?",
                "source_excerpt": "scaled dot products",
            },
            task_id="session-1",
        )
    )
    assert opened["learning_thread"]["active_branch_id"]

    returned = json.loads(
        handle_learning_thread(
            {"action": "back", "resolution": "Scaling stabilizes logits."},
            task_id="session-1",
        )
    )
    assert returned["learning_thread"]["active_branch_id"] is None
    assert returned["learning_thread"]["active_section_id"] == section_id


def test_tool_rejects_implicit_or_incomplete_start(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    result = json.loads(handle_learning_thread({"action": "start", "topic": "Markdown"}, task_id="session-2"))
    assert result["success"] is False
    assert "objective" in result["error"] or "outline" in result["error"]
