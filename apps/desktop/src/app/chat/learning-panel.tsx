import { useStore } from '@nanostores/react'
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'

import { CompactMarkdown } from '@/components/chat/compact-markdown'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import type { HermesGateway } from '@/hermes'
import {
  $learningBranchStream,
  $learningLoading,
  $learningThread,
  activeLearningBranch,
  activeLearningSection,
  clearLearningBranchStream,
  type LearningThread,
  setLearningLoading,
  setLearningThread
} from '@/store/learning'

interface LearningPanelProps {
  gateway: HermesGateway | null
  sessionId: null | string
}

interface LearningMainControlsProps {
  onPrompt: (text: string, displayText?: string, forceTool?: string) => Promise<boolean> | boolean
}

const BRANCH_BOTTOM_THRESHOLD = 24

function useBranchScrollAnchor(branchId: null | string, contentVersion: string) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const stickyRef = useRef(true)
  const programmaticScrollRef = useRef(0)
  const frameRef = useRef<number | null>(null)
  const [scrolledUp, setScrolledUp] = useState(false)

  const pinToBottom = useCallback(() => {
    const viewport = viewportRef.current

    if (!viewport) {
      return
    }

    const target = Math.max(0, viewport.scrollHeight - viewport.clientHeight)

    if (Math.abs(viewport.scrollTop - target) > 1) {
      // A single pending credit is enough: assigning an unchanged scrollTop
      // does not emit a browser scroll event, so credits must never accumulate.
      programmaticScrollRef.current = 1
      viewport.scrollTop = target
    }
    setScrolledUp(false)
  }, [])

  const schedulePin = useCallback(() => {
    if (!stickyRef.current || frameRef.current !== null) {
      return
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null

      if (stickyRef.current) {
        pinToBottom()
      }
    })
  }, [pinToBottom])

  const jumpToBottom = useCallback(() => {
    stickyRef.current = true
    setScrolledUp(false)
    schedulePin()
  }, [schedulePin])

  useLayoutEffect(() => {
    if (!branchId) {
      return
    }

    stickyRef.current = true
    setScrolledUp(false)
    schedulePin()
  }, [branchId, schedulePin])

  useLayoutEffect(() => {
    if (branchId) {
      schedulePin()
    }
  }, [branchId, contentVersion, schedulePin])

  useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport || !branchId) {
      return undefined
    }

    const disarm = () => {
      stickyRef.current = false
      programmaticScrollRef.current = 0
    }
    const onScroll = () => {
      if (programmaticScrollRef.current > 0) {
        programmaticScrollRef.current -= 1

        return
      }

      const atBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= BRANCH_BOTTOM_THRESHOLD

      stickyRef.current = atBottom
      setScrolledUp(!atBottom)
    }
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        disarm()
      }
    }

    viewport.addEventListener('scroll', onScroll, { passive: true })
    viewport.addEventListener('wheel', onWheel, { passive: true })
    viewport.addEventListener('touchmove', disarm, { passive: true })

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => schedulePin())
    const content = contentRef.current

    if (content && observer) {
      observer.observe(content)
    }

    return () => {
      viewport.removeEventListener('scroll', onScroll)
      viewport.removeEventListener('wheel', onWheel)
      viewport.removeEventListener('touchmove', disarm)
      observer?.disconnect()
    }
  }, [branchId, schedulePin])

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    },
    []
  )

  return { contentRef, jumpToBottom, scrolledUp, viewportRef }
}

function noteMarkdown(thread: LearningThread): string {
  const sections = thread.sections
    .map(section => {
      const checkpoint = section.checkpoint
        ? `\n\n### Understanding check\n\n${section.checkpoint}\n\n**My answer:** ${section.checkpoint_answer || '_Unanswered_'}\n\n**Feedback:** ${section.checkpoint_evaluation || '_Pending_'}`
        : ''

      return `## ${section.title}\n\n${section.content}${checkpoint}`
    })
    .join('\n\n')

  const branches = thread.branches
    .map(branch => {
      const messages = branch.messages
        .map(message => `**${message.role === 'user' ? 'Question' : 'Tutor'}:** ${message.content}`)
        .join('\n\n')

      return `### ${branch.title}\n\n> ${branch.source_excerpt}\n\n${messages}`
    })
    .join('\n\n')

  return `# ${thread.topic}\n\n## Learning goal\n\n${thread.objective}\n\n${sections}\n\n## Side questions\n\n${branches || '_None_'}\n`
}

export function LearningMainControls({ onPrompt }: LearningMainControlsProps) {
  const thread = useStore($learningThread)
  const loading = useStore($learningLoading)

  if (!thread || activeLearningBranch(thread)) {
    return null
  }

  return (
    <div className="pointer-events-none absolute right-0 bottom-[calc(var(--composer-measured-height)+0.5rem)] left-0 z-20 flex justify-center px-4">
      <Button
        className="pointer-events-auto min-w-48 shadow-lg"
        disabled={loading}
        onClick={() =>
          void onPrompt(
            'Continue the durable Learning Thread with the next outlined section. You MUST use learning_thread(action="continue").',
            undefined,
            'learning_thread'
          )
        }
        size="sm"
      >
        Continue lesson <Codicon name="arrow-right" />
      </Button>
    </div>
  )
}

export function LearningPanel({ gateway, sessionId }: LearningPanelProps) {
  const thread = useStore($learningThread)
  const loading = useStore($learningLoading)
  const branchStream = useStore($learningBranchStream)
  const [expanded, setExpanded] = useState(true)
  const [selectedBranchId, setSelectedBranchId] = useState<null | string>(null)
  const [branchDraft, setBranchDraft] = useState('')
  const [branchError, setBranchError] = useState('')
  const [branchSubmitting, setBranchSubmitting] = useState(false)
  const activeBranch = thread ? activeLearningBranch(thread) : null
  const branch = thread?.branches.find(item => item.id === (selectedBranchId ?? activeBranch?.id)) ?? null
  const viewingActiveBranch = Boolean(branch && activeBranch?.id === branch.id)
  const visibleBranchStream = branchStream?.branchId === branch?.id ? branchStream : null
  const branchContentVersion = `${branch?.messages.length ?? 0}:${visibleBranchStream?.text.length ?? 0}:${branchSubmitting}`
  const { contentRef, jumpToBottom, scrolledUp, viewportRef } = useBranchScrollAnchor(
    branch?.id ?? null,
    branchContentVersion
  )

  useEffect(() => {
    setSelectedBranchId(thread?.active_branch_id ?? null)
  }, [thread?.active_branch_id, thread?.id])

  const selectBranch = (branchId: string) => {
    setBranchError('')
    setSelectedBranchId(branchId)
    window.requestAnimationFrame(jumpToBottom)
  }

  if (!thread) {
    return null
  }

  const returnToLesson = async () => {
    if (!gateway || !sessionId || loading) {
      return
    }

    setLearningLoading(true)

    try {
      const result = await gateway.request<{ thread: LearningThread }>('learning.back', { session_id: sessionId })
      setLearningThread(result.thread)
      setBranchDraft('')
    } finally {
      setLearningLoading(false)
    }
  }

  const submitBranchQuestion = async (event?: FormEvent) => {
    event?.preventDefault()
    const question = branchDraft.trim()

    if (!gateway || !sessionId || !question || branchSubmitting || loading) {
      return
    }

    setBranchError('')
    setBranchSubmitting(true)

    try {
      const result = await gateway.request<{ thread: LearningThread }>('learning.branch.submit', {
        session_id: sessionId,
        question,
        ...(branch && { branch_id: branch.id })
      })
      setLearningThread(result.thread)
      setBranchDraft('')
    } catch (error) {
      clearLearningBranchStream(branch?.id)
      setBranchError(error instanceof Error ? error.message : 'Could not answer the BTW question')
    } finally {
      setBranchSubmitting(false)
    }
  }

  const handleBranchKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submitBranchQuestion()
    }
  }

  const reset = async () => {
    if (!gateway || !sessionId || loading || !window.confirm('End this learning thread? The chat history is kept.')) {
      return
    }

    setLearningLoading(true)

    try {
      await gateway.request('learning.reset', { session_id: sessionId })
      setLearningThread(null)
    } finally {
      setLearningLoading(false)
    }
  }

  const copyNote = async () => {
    await navigator.clipboard.writeText(noteMarkdown(thread))
  }

  return (
    <aside
      className={`relative z-2 flex shrink-0 flex-col border-l border-border/70 bg-card/85 backdrop-blur-xl transition-[width] ${
        expanded ? (branch ? 'w-[24rem]' : 'w-[19rem]') : 'w-12'
      }`}
    >
      <header className="flex items-start gap-2 border-b border-border/60 px-2.5 py-3">
        {expanded && (
          <div className="min-w-0 flex-1">
            <div className="font-mondwest text-xs text-display text-text-tertiary">
              {branch ? 'BTW' : 'Learning thread'}
            </div>
            <h2 className="mt-1 truncate text-sm font-semibold text-text-primary">
              {branch?.title ?? thread.topic}
            </h2>
          </div>
        )}
        {expanded && thread.branches.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`Question branches (${thread.branches.length})`}
                className="relative size-7 p-0"
                size="icon"
                variant="ghost"
              >
                <Codicon name="git-branch" />
                <span className="absolute -top-1 -right-1 min-w-3.5 rounded-full bg-primary px-1 text-[0.5625rem] leading-3.5 text-primary-foreground">
                  {thread.branches.length}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72" sideOffset={8}>
              <DropdownMenuLabel>Question branches</DropdownMenuLabel>
              {thread.branches.map(item => (
                <DropdownMenuItem key={item.id} onSelect={() => selectBranch(item.id)}>
                  <Codicon name={branch?.id === item.id ? 'check' : 'git-branch'} />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="text-[0.625rem] text-text-tertiary">{item.status}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          aria-label={expanded ? 'Collapse learning panel' : 'Expand learning panel'}
          className="size-7 p-0"
          onClick={() => setExpanded(value => !value)}
          size="icon"
          variant="ghost"
        >
          <Codicon name={expanded ? 'chevron-down' : 'chevron-left'} />
        </Button>
      </header>

      {expanded && (
        <div
          aria-label={branch ? 'BTW messages' : 'Learning thread panel'}
          className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
          ref={viewportRef}
        >
          <div ref={contentRef}>
          {!branch && (
            <>
              <p className="text-xs leading-relaxed text-text-secondary">{thread.objective}</p>

              <ol aria-label="Lesson outline" className="mt-4 space-y-1">
                {thread.outline.map((item, index) => {
                  const materialized = thread.sections[index]
                  const active = materialized?.id === thread.active_section_id

                  return (
                    <li
                      className={`rounded-md border px-2.5 py-2 text-xs ${
                        active
                          ? 'border-primary/40 bg-primary/10 text-text-primary'
                          : materialized
                            ? 'border-transparent text-text-secondary'
                            : 'border-transparent text-text-disabled'
                      }`}
                      key={item.id}
                    >
                      <div className="flex items-center gap-2">
                        <Codicon name={materialized && !active ? 'check' : active ? 'circle-filled' : 'circle-outline'} />
                        <span className="min-w-0 truncate">
                          {index + 1}. {item.title}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </>
          )}

          <section className={branch ? 'pt-1' : 'mt-5 rounded-lg border border-warning/40 bg-warning/5 p-3'}>
              {!branch && <h3 className="text-sm font-semibold text-text-primary">BTW</h3>}

              {branch && (
                <div aria-label="BTW conversation" className="mt-4 space-y-3">
                  {branch.messages.map((message, index) =>
                    message.role === 'assistant' ? (
                      <div className="flex justify-start" key={`${message.at}-${index}`}>
                        <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-border/60 bg-background/80 px-3 py-2.5 shadow-sm">
                          <CompactMarkdown className="text-[0.8125rem] text-text-primary" text={message.content} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end" key={`${message.at}-${index}`}>
                        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-[0.8125rem] leading-relaxed text-primary-foreground shadow-sm">
                          {message.content}
                        </p>
                      </div>
                    )
                  )}
                  {visibleBranchStream && (
                    <div className="flex justify-start">
                      <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-border/60 bg-background/80 px-3 py-2.5 shadow-sm">
                        {visibleBranchStream.text ? (
                          <CompactMarkdown
                            className="text-[0.8125rem] text-text-primary"
                            text={visibleBranchStream.text}
                          />
                        ) : (
                          <span className="animate-pulse text-xs text-text-tertiary">Thinking…</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <form className="mt-3 space-y-2" onSubmit={event => void submitBranchQuestion(event)}>
                  <Textarea
                    aria-label={branch ? 'Follow up in BTW thread' : 'Ask a BTW question'}
                    disabled={branchSubmitting || loading}
                    onChange={event => setBranchDraft(event.target.value)}
                    onKeyDown={handleBranchKeyDown}
                    placeholder={branch ? 'Continue this branch…' : 'Ask a side question…'}
                    rows={3}
                    value={branchDraft}
                  />
                  <Button
                    className="w-full"
                    disabled={!branchDraft.trim() || branchSubmitting || loading}
                    size="sm"
                    type="submit"
                  >
                    <Codicon name="send" /> {branch ? 'Send follow-up' : 'Start BTW thread'}
                  </Button>
              </form>

              {branchError && <p className="mt-2 text-xs text-destructive">{branchError}</p>}

              {viewingActiveBranch ? (
                <Button
                  className="mt-2 w-full"
                  disabled={loading || branchSubmitting}
                  onClick={() => void returnToLesson()}
                  size="sm"
                  variant="outline"
                >
                  <Codicon name="arrow-left" /> Back to lesson
                </Button>
              ) : branch ? (
                <Button className="mt-3 w-full" onClick={() => setSelectedBranchId(null)} size="sm" variant="outline">
                  <Codicon name="close" /> Close branch
                </Button>
              ) : null}
            </section>

          </div>
        </div>
      )}

      {expanded && branch && scrolledUp && (
        <Button
          aria-label="Jump to latest BTW message"
          className="absolute right-4 bottom-4 z-10 size-8 rounded-full p-0 shadow-lg"
          onClick={jumpToBottom}
          size="icon"
          variant="secondary"
        >
          <Codicon name="arrow-down" />
        </Button>
      )}

      {expanded && !branch && (
        <footer className="grid grid-cols-2 gap-2 border-t border-border/60 p-3">
          <Button onClick={() => void copyNote()} size="sm" variant="outline">
            <Codicon name="copy" /> Copy note
          </Button>
          <Button disabled={loading} onClick={() => void reset()} size="sm" variant="ghost">
            <Codicon name="close" /> End
          </Button>
        </footer>
      )}
    </aside>
  )
}
