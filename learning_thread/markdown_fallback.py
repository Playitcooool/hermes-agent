"""Fallback materialization for providers that ignore required tool choices."""

from __future__ import annotations

import re
from typing import Any

from learning_thread.state import LearningThreadError, LearningThreadStore


_TOPIC_RE = re.compile(
    r"^#{1,3}\s*Learning\s+Thread\s*[:—-]\s*(.+?)\s*$",
    re.IGNORECASE | re.MULTILINE,
)
_OUTLINE_RE = re.compile(r"^\s*\d+[.)]\s+(.+?)\s*$")
_SECTION_RE = re.compile(
    r"^#{1,4}\s*Section\s+\d+\s*(?:[:—-]\s*)?(.+?)\s*$",
    re.IGNORECASE,
)
_CHECKPOINT_RE = re.compile(
    r"^#{1,4}\s*(?:Checkpoint|Understanding\s+check)\b.*$",
    re.IGNORECASE,
)


def _plain_heading(text: str) -> str:
    value = text.strip()
    value = re.sub(r"^\*{1,2}|\*{1,2}$", "", value)
    value = re.sub(r"^`|`$", "", value)
    return value.strip()


def parse_structured_lesson_markdown(
    user_prompt: str,
    response_markdown: str,
) -> dict[str, Any] | None:
    """Extract the durable first-section state from a structured lesson reply."""
    markdown = str(response_markdown or "").strip()
    if not markdown:
        return None

    topic_match = _TOPIC_RE.search(markdown)
    topic = _plain_heading(topic_match.group(1)) if topic_match else "Structured lesson"
    lines = markdown.splitlines()

    outline: list[dict[str, str]] = []
    section_index = None
    section_title = ""
    checkpoint_index = None

    for index, line in enumerate(lines):
        section_match = _SECTION_RE.match(line.strip())
        if section_match:
            section_index = index
            section_title = _plain_heading(section_match.group(1))
            break
        outline_match = _OUTLINE_RE.match(line)
        if outline_match:
            title = _plain_heading(outline_match.group(1))
            if title:
                outline.append(
                    {
                        "title": title,
                        "purpose": f"Understand {title}",
                    }
                )

    if section_index is None or not section_title:
        return None

    for index in range(section_index + 1, len(lines)):
        if _CHECKPOINT_RE.match(lines[index].strip()):
            checkpoint_index = index
            break
    if checkpoint_index is None:
        return None

    content = "\n".join(lines[section_index + 1 : checkpoint_index]).strip()
    content = re.sub(r"\n+---\s*$", "", content).strip()
    checkpoint = "\n".join(lines[checkpoint_index + 1 :]).strip()
    if not content or not checkpoint:
        return None

    if not outline:
        outline = [
            {
                "title": section_title,
                "purpose": f"Understand {section_title}",
            }
        ]
    else:
        outline[0]["title"] = section_title

    return {
        "topic": topic,
        "objective": f"Learn {topic} through a structured, checkpoint-based lesson.",
        "outline": outline,
        "section_title": section_title,
        "content": content,
        "checkpoint": checkpoint,
        "source_prompt": str(user_prompt or "").strip(),
    }


def materialize_structured_lesson_fallback(
    session_id: str,
    user_prompt: str,
    response_markdown: str,
) -> dict[str, Any] | None:
    """Create missing state from Markdown; never replace an existing thread."""
    store = LearningThreadStore(session_id)
    existing = store.load()
    if existing is not None:
        return existing
    parsed = parse_structured_lesson_markdown(user_prompt, response_markdown)
    if parsed is None:
        return None
    parsed.pop("source_prompt", None)
    try:
        return store.start(**parsed)
    except LearningThreadError:
        return store.load()
