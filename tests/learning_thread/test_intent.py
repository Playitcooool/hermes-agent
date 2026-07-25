from learning_thread.intent import should_force_learning_thread


def test_explicit_lesson_intent_is_detected_in_either_word_order():
    assert should_force_learning_thread(
        "Start a structured multi-step Learning Thread lesson teaching me "
        "Python generators."
    )
    assert should_force_learning_thread(
        "Teach me Python generators using Learning Thread."
    )


def test_panel_control_prompts_are_detected():
    assert should_force_learning_thread(
        "[Learning Thread BTW side panel]\n"
        'Use learning_thread(action="branch_open") for this follow-up.'
    )
    assert should_force_learning_thread(
        'Continue with learning_thread(action="continue").'
    )


def test_one_off_question_is_not_detected():
    assert not should_force_learning_thread("Why is the daytime sky blue?")
