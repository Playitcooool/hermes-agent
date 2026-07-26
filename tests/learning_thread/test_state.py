from __future__ import annotations

import pytest

from learning_thread import LearningThreadError, LearningThreadStore


@pytest.fixture
def store(tmp_path):
    return LearningThreadStore("session-1", root=tmp_path)


def start(store):
    return store.start(
        topic="Transformers",
        objective="Understand attention",
        outline=[
            {"title": "Big picture", "purpose": "Orient the learner"},
            {"title": "Attention", "purpose": "Explain the mechanism"},
        ],
        section_title="Big picture",
        content="Tokens exchange information.",
        checkpoint="Why is context useful?",
    )


def test_lesson_progresses_in_outline_order(store):
    state = start(store)
    first_id = state["active_section_id"]

    state = store.evaluate_checkpoint(
        answer="Context changes meaning.",
        evaluation="Correct causal connection.",
        readiness="understood",
    )
    assert state["sections"][0]["checkpoint_answer"] == "Context changes meaning."

    state = store.continue_lesson(
        section_title="Attention",
        content="Attention computes weighted relationships.",
        checkpoint="What controls a token's weighting?",
    )
    assert state["active_section_id"] != first_id
    assert state["sections"][0]["status"] == "completed"
    assert state["sections"][1]["title"] == "Attention"


def test_branch_returns_to_exact_canonical_section_without_advancing(store):
    state = start(store)
    section_id = state["active_section_id"]

    state = store.open_branch(question="Why divide by sqrt(d)?", source_excerpt="scaled dot-product attention")
    branch_id = state["active_branch_id"]
    state = store.answer_branch(
        content="It controls logit variance.",
    )

    with pytest.raises(LearningThreadError, match="return"):
        store.continue_lesson(section_title="Attention", content="No", checkpoint="No")

    state = store.back(resolution="Scaling avoids saturated attention weights.")
    assert state["active_branch_id"] is None
    assert state["active_section_id"] == section_id
    branch = next(item for item in state["branches"] if item["id"] == branch_id)
    assert branch["status"] == "resolved"
    assert branch["source_section_id"] == section_id


def test_invalid_transitions_do_not_rewrite_saved_state(store):
    original = start(store)
    with pytest.raises(LearningThreadError, match="next section"):
        store.continue_lesson(section_title="Wrong", content="Content", checkpoint="Question")
    assert store.load() == original


def test_state_persists_by_session(tmp_path):
    first = LearningThreadStore("same-session", root=tmp_path)
    state = start(first)
    second = LearningThreadStore("same-session", root=tmp_path)
    assert second.load()["id"] == state["id"]
    assert LearningThreadStore("other-session", root=tmp_path).load() is None
