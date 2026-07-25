"""Intent detection for durable Learning Thread turns."""

from __future__ import annotations

import re
from typing import Any


_EXPLICIT_LESSON_RE = re.compile(
    r"(?:"
    r"\b(?:structured|multi[-\s]?step|step[-\s]?by[-\s]?step|ongoing)\s+"
    r"(?:lesson|course|tutorial)\b"
    r"|"
    r"\bteach\s+me\b(?=[\s\S]*\b(?:structured|lesson|course|over\s+time)\b)"
    r")",
    re.IGNORECASE,
)
_THREAD_NAME_RE = re.compile(r"\blearning\s+thread\b", re.IGNORECASE)
_TEACHING_TERM_RE = re.compile(
    r"\b(?:learn|lesson|teach(?:ing)?|tutorial|course)\b",
    re.IGNORECASE,
)


def is_explicit_learning_thread_lesson(text: Any) -> bool:
    """Return whether text explicitly requests a sustained structured lesson."""
    if not isinstance(text, str):
        return False
    normalized = text.strip()
    if not normalized:
        return False
    return bool(
        (
            _THREAD_NAME_RE.search(normalized)
            and _TEACHING_TERM_RE.search(normalized)
        )
        or _EXPLICIT_LESSON_RE.search(normalized)
    )


def should_force_learning_thread(text: Any) -> bool:
    """Return whether a user/control prompt requires the durable lesson tool."""
    if not isinstance(text, str):
        return False
    normalized = text.strip()
    return bool(
        normalized
        and (
            "[Learning Thread BTW side panel]" in normalized
            or "learning_thread(action=" in normalized
            or is_explicit_learning_thread_lesson(normalized)
        )
    )
