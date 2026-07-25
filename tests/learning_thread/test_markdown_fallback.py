from learning_thread.markdown_fallback import (
    materialize_structured_lesson_fallback,
    parse_structured_lesson_markdown,
)


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
