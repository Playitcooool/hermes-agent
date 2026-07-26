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
_NUMBERED_SECTION_RE = re.compile(
    r"^#{1,4}\s*(\d+)\s*[.)]\s*(.+?)\s*$",
    re.IGNORECASE,
)
_CHECKPOINT_RE = re.compile(
    r"^#{1,4}\s*(?:(?:Unanswered|Pending)\s+)?"
    r"(?:Checkpoint|Understanding\s+check)\b.*$",
    re.IGNORECASE,
)


def _plain_heading(text: str) -> str:
    value = text.strip()
    value = re.sub(r"^\*{1,2}|\*{1,2}$", "", value)
    value = re.sub(r"^`|`$", "", value)
    return value.strip()


def _topic_from_section(section_title: str) -> str:
    """Derive a useful topic when the provider omitted a lesson title."""
    match = re.match(
        r"^What\s+(.+?)\s+(?:is|are)\??$",
        section_title,
        re.IGNORECASE,
    )
    return _plain_heading(match.group(1)) if match else section_title


def parse_structured_lesson_markdown(
    user_prompt: str,
    response_markdown: str,
) -> dict[str, Any] | None:
    """Extract the durable first-section state from a structured lesson reply."""
    markdown = str(response_markdown or "").strip()
    if not markdown:
        return None

    topic_match = _TOPIC_RE.search(markdown)
    lines = markdown.splitlines()

    outline: list[dict[str, str]] = []
    section_index = None
    section_title = ""
    checkpoint_index = None
    numbered_sections: list[tuple[int, int, str]] = []

    for index, line in enumerate(lines):
        numbered_match = _NUMBERED_SECTION_RE.match(line.strip())
        if numbered_match:
            numbered_sections.append(
                (
                    index,
                    int(numbered_match.group(1)),
                    _plain_heading(numbered_match.group(2)),
                )
            )
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

    if section_index is None and numbered_sections:
        section_index, _, section_title = numbered_sections[0]
        outline = [
            {
                "title": title,
                "purpose": f"Understand {title}",
            }
            for _, _, title in sorted(numbered_sections, key=lambda item: item[1])
            if title
        ]

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
    checkpoint_end = len(lines)
    for index in range(checkpoint_index + 1, len(lines)):
        if _NUMBERED_SECTION_RE.match(lines[index].strip()):
            checkpoint_end = index
            break
    checkpoint = "\n".join(lines[checkpoint_index + 1 : checkpoint_end]).strip()
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

    topic = (
        _plain_heading(topic_match.group(1))
        if topic_match
        else _topic_from_section(section_title)
    )

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


def materialize_lesson_continuation_fallback(
    session_id: str,
    response_markdown: str,
    previous_section_count: int | None = None,
) -> dict[str, Any] | None:
    """Append the next outlined section when a provider returned only Markdown."""
    store = LearningThreadStore(session_id)
    state = store.load()
    if state is None:
        return None
    next_index = len(state.get("sections", []))
    if previous_section_count is not None and next_index > previous_section_count:
        return state
    outline = state.get("outline", [])
    if next_index >= len(outline):
        return state

    markdown = str(response_markdown or "").strip()
    lines = markdown.splitlines()
    section_index = None
    checkpoint_index = None
    for index, line in enumerate(lines):
        if _SECTION_RE.match(line.strip()) or _NUMBERED_SECTION_RE.match(
            line.strip()
        ):
            section_index = index
            break
    if section_index is None:
        section_index = -1
    for index in range(section_index + 1, len(lines)):
        if _CHECKPOINT_RE.match(lines[index].strip()):
            checkpoint_index = index
            break
    if checkpoint_index is None:
        return None

    content = "\n".join(lines[section_index + 1 : checkpoint_index]).strip()
    checkpoint_end = len(lines)
    for index in range(checkpoint_index + 1, len(lines)):
        if _NUMBERED_SECTION_RE.match(lines[index].strip()):
            checkpoint_end = index
            break
    checkpoint = "\n".join(lines[checkpoint_index + 1 : checkpoint_end]).strip()
    if not content or not checkpoint:
        return None
    try:
        return store.continue_lesson(
            section_title=outline[next_index]["title"],
            content=content,
            checkpoint=checkpoint,
        )
    except LearningThreadError:
        return store.load()


def _panel_question(control_prompt: str) -> str:
    chunks = [chunk.strip() for chunk in str(control_prompt or "").split("\n\n")]
    return next((chunk for chunk in reversed(chunks) if chunk), "")


def materialize_learning_branch_question(
    session_id: str,
    control_prompt: str,
) -> dict[str, Any] | None:
    """Record a panel question before inference so its branch is deterministic."""
    store = LearningThreadStore(session_id)
    state = store.load()
    question = _panel_question(control_prompt)
    if state is None or not question:
        return None

    active_id = state.get("active_branch_id")
    active = next(
        (item for item in state.get("branches", []) if item.get("id") == active_id),
        None,
    )
    if active:
        messages = active.get("messages", [])
        if (
            messages
            and messages[-1].get("role") == "user"
            and messages[-1].get("content") == question
        ):
            return state
        if (
            len(messages) >= 2
            and messages[-2].get("role") == "user"
            and messages[-2].get("content") == question
            and messages[-1].get("role") == "assistant"
        ):
            return state
        source_excerpt = "active branch"
    else:
        section = next(
            (
                item
                for item in state.get("sections", [])
                if item.get("id") == state.get("active_section_id")
            ),
            None,
        )
        if section is None:
            return None
        source = str(section.get("content") or "").strip()
        source_excerpt = source.split("\n\n", 1)[0][:500].strip()
        if not source_excerpt:
            return None

    try:
        return store.open_branch(
            question=question,
            source_excerpt=source_excerpt,
        )
    except LearningThreadError:
        return store.load()


def materialize_learning_branch_fallback(
    session_id: str,
    control_prompt: str,
    response_markdown: str,
) -> dict[str, Any] | None:
    """Record a panel question and answer when branch tool calls were omitted."""
    store = LearningThreadStore(session_id)
    state = materialize_learning_branch_question(session_id, control_prompt)
    question = _panel_question(control_prompt)
    answer = str(response_markdown or "").strip()
    if state is None or not question or not answer:
        return None

    active_id = state.get("active_branch_id")
    active = next(
        (item for item in state.get("branches", []) if item.get("id") == active_id),
        None,
    )
    question_recorded = False
    if active:
        messages = active.get("messages", [])
        question_recorded = bool(
            messages
            and messages[-1].get("role") == "user"
            and messages[-1].get("content") == question
        )
        if (
            len(messages) >= 2
            and messages[-2].get("role") == "user"
            and messages[-2].get("content") == question
            and messages[-1].get("role") == "assistant"
        ):
            return state
    try:
        if active and not question_recorded:
            state = store.open_branch(question=question, source_excerpt="active branch")
        section_title = next(
            (
                item.get("title")
                for item in state.get("sections", [])
                if item.get("id") == state.get("active_section_id")
            ),
            "the current lesson",
        )
        return store.answer_branch(
            content=answer,
            connection=f"This clarifies {section_title}.",
        )
    except LearningThreadError:
        return store.load()
