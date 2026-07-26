import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HermesGateway } from '@/hermes'
import {
  appendLearningBranchStream,
  clearLearningBranchStream,
  setLearningLoading,
  setLearningThread,
  startLearningBranchStream,
  type LearningThread
} from '@/store/learning'

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
  vi.restoreAllMocks()
  clearLearningBranchStream()
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
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Question branches (1)' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse'
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: /Why save memory.*unresolved/ }))

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

  it('follows streamed tokens until the user scrolls away, then resumes at bottom', async () => {
    const activeThread: LearningThread = {
      ...baseThread,
      active_branch_id: 'branch-stream',
      branches: [
        {
          id: 'branch-stream',
          messages: [
            { at: '2026-07-25T00:01:00Z', content: 'Explain streams.', role: 'user' },
            { at: '2026-07-25T00:02:00Z', content: 'A prior answer.', role: 'assistant' }
          ],
          misconception: null,
          question: 'Explain streams.',
          resolution: null,
          source_excerpt: 'one value at a time',
          source_section_id: 'section-1',
          status: 'open',
          title: 'Explain streams'
        }
      ],
      status: 'branch'
    }
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      return window.setTimeout(() => callback(0), 0)
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(handle => window.clearTimeout(handle))
    setLearningThread(activeThread)

    render(
      <LearningPanel
        gateway={{ request: vi.fn().mockResolvedValue({ thread: activeThread }) } as unknown as HermesGateway}
        sessionId="session-1"
      />
    )

    const viewport = screen.getByLabelText('BTW messages')
    let scrollHeight = 1_000
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, get: () => scrollHeight })
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, get: () => 200 })

    await waitFor(() => expect(viewport.scrollTop).toBe(800))
    fireEvent.scroll(viewport)
    viewport.scrollTop = 400
    fireEvent.scroll(viewport)

    startLearningBranchStream('branch-stream')
    appendLearningBranchStream('branch-stream', 'Streaming answer')
    await waitFor(() => expect(screen.getByText('Streaming answer')).not.toBeNull())
    expect(viewport.scrollTop).toBe(400)
    expect(screen.getByRole('button', { name: 'Jump to latest BTW message' })).not.toBeNull()

    viewport.scrollTop = 800
    fireEvent.scroll(viewport)
    scrollHeight = 1_200
    appendLearningBranchStream('branch-stream', ' continues')
    await waitFor(() => expect(viewport.scrollTop).toBe(1_000))
  })
})
