import { describe, expect, it } from 'vitest'

import {
  activeLearningBranch,
  activeLearningSection,
  buildLearningBranchPrompt,
  learningProgress,
  prepareLearningBtwSubmission,
  shouldStartLearningThread,
  type LearningThread
} from './learning'

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

  it('counts understood or completed sections instead of merely rendered sections', () => {
    const value = thread()
    expect(learningProgress(value)).toBe(0)

    value.sections[0].checkpoint_answer = 'Because context matters.'
    value.sections[0].readiness = 'understood'
    expect(learningProgress(value)).toBe(50)

    value.sections[0].checkpoint_answer = null
    value.sections[0].readiness = null
    value.sections[0].status = 'completed'
    expect(learningProgress(value)).toBe(50)
  })
})

describe('learning thread activation intent', () => {
  it.each([
    'Start a structured lesson teaching me Python generators.',
    'Teach me linear algebra as a multi-step course.',
    'Use Learning Thread mode for this lesson.'
  ])('recognizes explicit sustained teaching: %s', text => {
    expect(shouldStartLearningThread(text)).toBe(true)
  })

  it.each(['Why is the sky blue?', 'Teach me why the sky is blue.', 'Write a tutorial file for this repo.'])(
    'leaves ordinary one-off requests alone: %s',
    text => {
      expect(shouldStartLearningThread(text)).toBe(false)
    }
  )
})

describe('learning BTW prompts', () => {
  it('anchors a new /btw branch to the current lesson section', () => {
    const value = thread()
    value.active_branch_id = null
    value.branches = []

    const prompt = buildLearningBranchPrompt(value, '  Why does this save memory?  ')

    expect(prompt).toContain('[Learning Thread BTW side panel]')
    expect(prompt).toContain(value.sections[0].content)
    expect(prompt).toContain('Return only the focused answer')
    expect(prompt).not.toContain('learning_thread(action=')
    expect(prompt).toContain('Why does this save memory?')
  })

  it('routes later questions into the active branch', () => {
    const prompt = buildLearningBranchPrompt(thread(), 'And infinite streams?')

    expect(prompt).toContain('active side branch')
    expect(prompt).not.toContain('<current_lesson_section>')
  })

  it('prepares the exact /btw submission payload and guards invalid entry', () => {
    const value = thread()
    value.active_branch_id = null
    value.branches = []

    expect(prepareLearningBtwSubmission(null, 'Why?')).toBe(
      '/btw requires an active Learning Thread lesson'
    )
    expect(prepareLearningBtwSubmission(value, '   ')).toBe(
      'usage: /btw <question>'
    )
    expect(prepareLearningBtwSubmission(value, '  Why does this save memory? ')).toMatchObject({
      displayText: 'BTW · Why does this save memory?'
    })
  })
})
