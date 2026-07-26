from learning_thread.markdown_fallback import (
    materialize_learning_branch_fallback,
    materialize_lesson_continuation_fallback,
    materialize_structured_lesson_fallback,
    parse_structured_lesson_markdown,
)
from learning_thread.state import LearningThreadStore


LESSON = """# Learning Thread: Python Generators

We’ll learn generators in five sections:

1. **The core idea: producing values lazily**
2. **Writing generator functions with `yield`**
3. **Generator expressions and comprehensions**
4. **Advanced control**
5. **Practical patterns**

## Section 1 — The Core Idea: Lazy Value Production

A generator produces values one at a time.

```python
values = (x for x in range(3))
```

## Checkpoint 1

What does `next(values)` return?
"""

NUMBERED_HEADING_LESSON = """## 1) What Python generators are

Generators produce values lazily instead of constructing a full collection.

### Unanswered checkpoint

Why can lazy evaluation reduce memory usage?

## 2) Generator functions and yield

## 3) Generator expressions

## 4) Pipelines and composition

## 5) Review and practice
"""


def test_parses_a_plain_markdown_lesson_response():
    parsed = parse_structured_lesson_markdown("Teach me generators", LESSON)

    assert parsed is not None
    assert parsed["topic"] == "Python Generators"
    assert len(parsed["outline"]) == 5
    assert parsed["outline"][0]["title"] == parsed["section_title"]
    assert "produces values one at a time" in parsed["content"]
    assert "next(values)" in parsed["checkpoint"]


def test_materializes_missing_state_without_overwriting_it(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))

    first = materialize_structured_lesson_fallback(
        "session-1",
        "Teach me generators",
        LESSON,
    )
    second = materialize_structured_lesson_fallback(
        "session-1",
        "Teach me something else",
        "# not a lesson",
    )

    assert first is not None
    assert second == first
    assert first["active_branch_id"] is None
    assert len(first["outline"]) == 5


def test_materializes_numbered_heading_lesson_without_wrapper(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))

    state = materialize_structured_lesson_fallback(
        "numbered-headings",
        "Teach me Python generators as a structured lesson",
        NUMBERED_HEADING_LESSON,
    )

    assert state is not None
    assert state["topic"] == "Python generators"
    assert state["sections"][0]["status"] == "current"
    assert state["sections"][0]["checkpoint_answer"] is None
    assert state["sections"][0]["readiness"] is None
    assert [item["title"] for item in state["outline"]] == [
        "What Python generators are",
        "Generator functions and yield",
        "Generator expressions",
        "Pipelines and composition",
        "Review and practice",
    ]
    assert state["sections"][0]["title"] == "What Python generators are"
    assert state["sections"][0]["checkpoint"] == (
        "Why can lazy evaluation reduce memory usage?"
    )


def test_materializes_continuation_and_branch_fallbacks(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    first = materialize_structured_lesson_fallback(
        "session-2",
        "Teach me generators",
        LESSON,
    )
    assert first is not None

    continued = materialize_lesson_continuation_fallback(
        "session-2",
        """## Section 2 — Generator functions

Functions pause when they yield.

## Checkpoint 2

What resumes a paused generator?
""",
    )
    assert continued is not None
    assert len(continued["sections"]) == 2
    assert continued["sections"][0]["status"] == "completed"

    branched = materialize_learning_branch_fallback(
        "session-2",
        """[Learning Thread BTW side panel]

<current_lesson_section>
Functions pause when they yield.
</current_lesson_section>

Why is pausing useful?""",
        "It lets the function retain state between values.",
    )
    assert branched is not None
    assert branched["active_branch_id"]
    branch = branched["branches"][-1]
    assert branch["messages"][-2]["content"] == "Why is pausing useful?"
    assert branch["messages"][-1]["role"] == "assistant"


def test_continuation_fallback_does_not_advance_after_tool_success(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    first = materialize_structured_lesson_fallback(
        "session-3",
        "Teach me generators",
        LESSON,
    )
    assert first is not None

    response = """## Section 2 — Generator functions

Functions pause when they yield.

## Checkpoint 2

What resumes a paused generator?
"""
    tool_state = materialize_lesson_continuation_fallback(
        "session-3",
        response,
        previous_section_count=1,
    )
    fallback_state = materialize_lesson_continuation_fallback(
        "session-3",
        response,
        previous_section_count=1,
    )

    assert tool_state is not None
    assert fallback_state is not None
    assert len(fallback_state["sections"]) == 2


def test_branch_fallback_does_not_duplicate_a_tool_recorded_question(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    first = materialize_structured_lesson_fallback(
        "session-4",
        "Teach me generators",
        LESSON,
    )
    assert first is not None
    store = LearningThreadStore("session-4")
    store.open_branch(
        question="Why is pausing useful?",
        source_excerpt="A generator produces values one at a time.",
    )

    state = materialize_learning_branch_fallback(
        "session-4",
        "[Learning Thread BTW side panel]\n\nWhy is pausing useful?",
        "It retains local state between values.",
    )

    assert state is not None
    messages = state["branches"][-1]["messages"]
    assert [message["role"] for message in messages] == ["user", "assistant"]
