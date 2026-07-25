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
    const onPrompt = vi.fn().mockResolvedValue(true)
    setLearningThread(baseThread)

    render(
      <LearningPanel
        gateway={{ request: vi.fn() } as unknown as HermesGateway}
        onPrompt={onPrompt}
        sessionId="session-1"
      />
    )

    const composer = screen.getByRole('textbox', { name: 'Ask a BTW question' })
    fireEvent.change(composer, { target: { value: 'Why does this save memory?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start BTW thread' }))

    await waitFor(() => expect(onPrompt).toHaveBeenCalledOnce())
    expect(onPrompt.mock.calls[0][0]).toContain(baseThread.sections[0].content)
    expect(onPrompt.mock.calls[0][1]).toBe('BTW · Why does this save memory?')
    expect(onPrompt.mock.calls[0][2]).toBe('learning_thread')
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
    const onPrompt = vi.fn().mockResolvedValue(true)
    setLearningThread({
      ...baseThread,
      active_branch_id: 'branch-1',
      branches: [
        {
          connection: 'Both concern lazy evaluation.',
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
    })

    render(
      <LearningPanel
        gateway={{ request: vi.fn() } as unknown as HermesGateway}
        onPrompt={onPrompt}
        sessionId="session-1"
      />
    )

    const composer = screen.getByRole('textbox', { name: 'Follow up in BTW thread' })
    fireEvent.change(composer, { target: { value: 'What about an infinite stream?' } })
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: false })

    await waitFor(() => expect(onPrompt).toHaveBeenCalledOnce())
    expect(onPrompt.mock.calls[0][0]).toContain('active side branch')
    expect(onPrompt.mock.calls[0][1]).toBe('BTW · What about an infinite stream?')
    expect(onPrompt.mock.calls[0][2]).toBe('learning_thread')
  })
})
