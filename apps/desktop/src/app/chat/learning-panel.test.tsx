import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HermesGateway } from '@/hermes'
import { setLearningLoading, setLearningThread, type LearningThread } from '@/store/learning'

import { LearningMainControls, LearningPanel } from './learning-panel'

const baseThread: LearningThread = {
  active_branch_id: null,
  active_section_id: 'section-1',
  branches: [],
  created_at: '2026-07-25T00:00:00Z',
  id: 'thread-1',
  objective: 'Understand generators',
  outline: [
    { id: 'outline-1', purpose: 'Learn lazy iteration', title: 'Lazy iteration' },
    { id: 'outline-2', purpose: 'Compose generators', title: 'Composition' }
  ],
  sections: [
    {
      checkpoint: 'Why is laziness useful?',
      checkpoint_answer: null,
      checkpoint_evaluation: null,
      content: 'A generator yields one value at a time instead of materializing the whole sequence.',
      id: 'section-1',
      outline_id: 'outline-1',
      readiness: null,
      status: 'current',
      title: 'Lazy iteration'
    }
  ],
  session_id: 'session-1',
  status: 'checkpoint',
  topic: 'Python generators',
  updated_at: '2026-07-25T00:00:00Z',
  version: 1
}

afterEach(() => {
  cleanup()
  setLearningLoading(false)
  setLearningThread(null)
})

describe('LearningPanel BTW side thread', () => {
  it('automatically creates an anchored branch from the panel input', async () => {
    const request = vi.fn().mockResolvedValue({ thread: baseThread })
    setLearningThread(baseThread)

    render(<LearningPanel gateway={{ request } as unknown as HermesGateway} sessionId="session-1" />)

    expect(screen.queryByText('Lesson progress')).toBeNull()
    expect(screen.queryByText('Current section')).toBeNull()
    const composer = screen.getByRole('textbox', { name: 'Ask a BTW question' })
    fireEvent.change(composer, { target: { value: 'Why does this save memory?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start BTW thread' }))

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('learning.branch.submit', {
        session_id: 'session-1',
        question: 'Why does this save memory?'
      })
    )
    expect(screen.queryByRole('button', { name: /Continue lesson/ })).toBeNull()
  })

  it('renders lesson continuation in the main chat surface', () => {
    const onPrompt = vi.fn().mockResolvedValue(true)
    setLearningThread(baseThread)

    render(<LearningMainControls onPrompt={onPrompt} />)
    fireEvent.click(screen.getByRole('button', { name: /Continue lesson/ }))

    expect(onPrompt).toHaveBeenCalledOnce()
    expect(onPrompt.mock.calls[0][0]).toContain('learning_thread(action="continue")')
    expect(onPrompt.mock.calls[0][2]).toBe('learning_thread')
  })

  it('keeps follow-ups in the active BTW composer on Enter', async () => {
    const activeThread: LearningThread = {
      ...baseThread,
      active_branch_id: 'branch-1',
      branches: [
        {
          id: 'branch-1',
          messages: [
            { at: '2026-07-25T00:01:00Z', content: 'Why save memory?', role: 'user' },
            { at: '2026-07-25T00:02:00Z', content: 'Values are produced on demand.', role: 'assistant' }
          ],
          misconception: null,
          question: 'Why save memory?',
          resolution: null,
          source_excerpt: 'yields one value at a time',
          source_section_id: 'section-1',
          status: 'open',
          title: 'Why save memory?'
        }
      ],
      status: 'branch'
    }
    const request = vi.fn().mockResolvedValue({ thread: activeThread })
    setLearningThread(activeThread)

    render(<LearningPanel gateway={{ request } as unknown as HermesGateway} sessionId="session-1" />)

    expect(screen.queryByText('BTW thread')).toBeNull()
    expect(screen.queryByText('yields one value at a time')).toBeNull()
    expect(screen.queryByText(/Connection:/)).toBeNull()
    expect(screen.getByLabelText('BTW conversation').textContent).toContain('Values are produced on demand.')

    const composer = screen.getByRole('textbox', { name: 'Follow up in BTW thread' })
    fireEvent.change(composer, { target: { value: 'What about an infinite stream?' } })
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: false })

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('learning.branch.submit', {
        session_id: 'session-1',
        branch_id: 'branch-1',
        question: 'What about an infinite stream?'
      })
    )
  })

  it('continues a historical question branch after selecting it', async () => {
    const historicalThread: LearningThread = {
      ...baseThread,
      active_branch_id: null,
      branches: [
        {
          id: 'branch-old',
          messages: [
            { at: '2026-07-25T00:01:00Z', content: 'Why save memory?', role: 'user' },
            { at: '2026-07-25T00:02:00Z', content: 'Values are produced on demand.', role: 'assistant' }
          ],
          misconception: null,
          question: 'Why save memory?',
          resolution: null,
          source_excerpt: 'yields one value at a time',
          source_section_id: 'section-1',
          status: 'unresolved',
          title: 'Why save memory?'
        }
      ],
      status: 'checkpoint'
    }
    const request = vi.fn().mockResolvedValue({
      thread: {
        ...historicalThread,
        active_branch_id: 'branch-old',
        status: 'branch'
      }
    })
    setLearningThread(historicalThread)

    render(<LearningPanel gateway={{ request } as unknown as HermesGateway} sessionId="session-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Why save memory.*unresolved/ }))

    const composer = screen.getByRole('textbox', { name: 'Follow up in BTW thread' })
    fireEvent.change(composer, { target: { value: 'Can I keep asking here?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send follow-up' }))

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('learning.branch.submit', {
        session_id: 'session-1',
        branch_id: 'branch-old',
        question: 'Can I keep asking here?'
      })
    )
  })
})
