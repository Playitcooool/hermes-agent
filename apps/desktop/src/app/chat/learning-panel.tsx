import { useStore } from '@nanostores/react'
import { type FormEvent, type KeyboardEvent, useEffect, useState } from 'react'

import { CompactMarkdown } from '@/components/chat/compact-markdown'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Textarea } from '@/components/ui/textarea'
import type { HermesGateway } from '@/hermes'
import {
  $learningLoading,
  $learningThread,
  activeLearningBranch,
  activeLearningSection,
  buildLearningBranchPrompt,
  type LearningThread,
  setLearningLoading,
  setLearningThread
} from '@/store/learning'

interface LearningPanelProps {
  gateway: HermesGateway | null
  onPrompt: (text: string, displayText?: string, forceTool?: string) => Promise<boolean> | boolean
  sessionId: null | string
}

interface LearningMainControlsProps {
  onPrompt: (text: string, displayText?: string, forceTool?: string) => Promise<boolean> | boolean
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

export function LearningPanel({ gateway, onPrompt, sessionId }: LearningPanelProps) {
  const thread = useStore($learningThread)
  const loading = useStore($learningLoading)
  const [expanded, setExpanded] = useState(true)
  const [selectedBranchId, setSelectedBranchId] = useState<null | string>(null)
  const [branchDraft, setBranchDraft] = useState('')
  const [branchSubmitting, setBranchSubmitting] = useState(false)
  const activeBranch = thread ? activeLearningBranch(thread) : null
  const branch = thread?.branches.find(item => item.id === (activeBranch?.id ?? selectedBranchId)) ?? null

  useEffect(() => {
    setSelectedBranchId(thread?.active_branch_id ?? null)
  }, [thread?.active_branch_id, thread?.id])

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

    if (!question || branchSubmitting || loading || (branch && !activeBranch)) {
      return
    }

    const instruction = buildLearningBranchPrompt(thread, question)

    setBranchSubmitting(true)

    try {
      const submitted = await onPrompt(instruction, `BTW · ${question}`)

      if (submitted) {
        setBranchDraft('')
      }
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
            <div className="font-mondwest text-xs text-display text-text-tertiary">Learning thread</div>
            <h2 className="mt-1 truncate text-sm font-semibold text-text-primary">{thread.topic}</h2>
          </div>
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
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
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

          <section className="mt-5 rounded-lg border border-warning/40 bg-warning/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-mondwest text-xs text-display text-warning">BTW thread</div>
                  <h3 className="mt-1 text-sm font-medium text-text-primary">
                    {branch?.title ?? 'Ask without leaving the lesson'}
                  </h3>
                </div>
                {branch && !activeBranch && (
                  <Button
                    aria-label="Close BTW panel"
                    className="size-7 p-0"
                    onClick={() => {
                      setSelectedBranchId(null)
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <Codicon name="close" />
                  </Button>
                )}
              </div>

              {branch?.source_excerpt && (
                <blockquote className="mt-2 border-l-2 border-warning/50 pl-2 text-xs text-text-secondary">
                  {branch.source_excerpt}
                </blockquote>
              )}

              {branch && (
                <div aria-label="BTW conversation" className="mt-3 space-y-2">
                  {branch.messages.map((message, index) =>
                    message.role === 'assistant' ? (
                      <div className="rounded-md bg-background/70 p-2.5" key={`${message.at}-${index}`}>
                        <CompactMarkdown text={message.content} />
                      </div>
                    ) : (
                      <p
                        className="ml-5 rounded-md bg-warning/10 px-2.5 py-2 text-xs leading-relaxed text-text-primary"
                        key={`${message.at}-${index}`}
                      >
                        {message.content}
                      </p>
                    )
                  )}
                </div>
              )}

              {branch?.connection && (
                <p className="mt-3 text-xs leading-relaxed text-text-secondary">
                  <strong>Connection:</strong> {branch?.connection}
                </p>
              )}

              {(activeBranch || !branch) && (
                <form className="mt-3 space-y-2" onSubmit={event => void submitBranchQuestion(event)}>
                  <Textarea
                    aria-label={activeBranch ? 'Follow up in BTW thread' : 'Ask a BTW question'}
                    disabled={branchSubmitting || loading}
                    onChange={event => setBranchDraft(event.target.value)}
                    onKeyDown={handleBranchKeyDown}
                    placeholder={activeBranch ? 'Follow up here…' : 'Ask a side question…'}
                    rows={3}
                    value={branchDraft}
                  />
                  <Button
                    className="w-full"
                    disabled={!branchDraft.trim() || branchSubmitting || loading}
                    size="sm"
                    type="submit"
                  >
                    <Codicon name="send" /> {activeBranch ? 'Send follow-up' : 'Start BTW thread'}
                  </Button>
                </form>
              )}

              {activeBranch ? (
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

          {thread.branches.length > 0 && (
            <section className="mt-5">
              <div className="font-mondwest text-xs text-display text-text-tertiary">Question branches</div>
              <ul className="mt-2 space-y-1.5">
                {thread.branches.map(item => (
                  <li key={item.id}>
                    <button
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs ${
                        branch?.id === item.id ? 'bg-primary/10 text-text-primary' : 'bg-muted/40 text-text-secondary'
                      }`}
                      onClick={() => setSelectedBranchId(item.id)}
                      type="button"
                    >
                      <Codicon name={item.status === 'resolved' ? 'pass-filled' : 'git-branch'} />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <span className="text-text-tertiary">{item.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {expanded && (
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
