import { describe, expect, it } from 'vitest'

import { activeLearningBranch, activeLearningSection, learningProgress, type LearningThread } from './learning'

function thread(): LearningThread {
  return {
    active_branch_id: 'branch-1',
    active_section_id: 'section-1',
    branches: [
      {
        connection: 'It keeps attention logits stable.',
        id: 'branch-1',
        messages: [],
        misconception: null,
        question: 'Why square root?',
        resolution: null,
        source_excerpt: 'divide by sqrt(d_k)',
        source_section_id: 'section-1',
        status: 'open',
        title: 'Why square root?'
      }
    ],
    created_at: '2026-01-01T00:00:00Z',
    id: 'thread-1',
    objective: 'Understand attention',
    outline: [
      { id: 'outline-1', purpose: 'Orient', title: 'Overview' },
      { id: 'outline-2', purpose: 'Explain', title: 'Attention' }
    ],
    sections: [
      {
        checkpoint: 'Why context?',
        checkpoint_answer: null,
        checkpoint_evaluation: null,
        content: 'Tokens exchange information.',
        id: 'section-1',
        outline_id: 'outline-1',
        readiness: null,
        status: 'current',
        title: 'Overview'
      }
    ],
    session_id: 'session-1',
    status: 'branch',
    topic: 'Transformers',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1
  }
}

describe('learning thread selectors', () => {
  it('keeps canonical and branch cursors separate', () => {
    const value = thread()
    expect(activeLearningSection(value)?.id).toBe('section-1')
    expect(activeLearningBranch(value)?.source_section_id).toBe('section-1')
  })

  it('calculates materialized outline progress', () => {
    expect(learningProgress(thread())).toBe(50)
  })
})
