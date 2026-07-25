import { useStore } from '@nanostores/react'
import { useMemo, useState } from 'react'

import { CompactMarkdown } from '@/components/chat/compact-markdown'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import type { HermesGateway } from '@/hermes'
import {
  $learningLoading,
  $learningThread,
  activeLearningBranch,
  activeLearningSection,
  learningProgress,
  type LearningThread,
  setLearningLoading,
  setLearningThread
} from '@/store/learning'

interface LearningPanelProps {
  gateway: HermesGateway | null
  onPrompt: (text: string) => void
  sessionId: null | string
}

const readinessLabels = {
  understood: 'Understood',
  mostly_understood: 'Mostly understood',
  needs_clarification: 'Needs clarification'
} as const

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

export function LearningPanel({ gateway, onPrompt, sessionId }: LearningPanelProps) {
  const thread = useStore($learningThread)
  const loading = useStore($learningLoading)
  const [expanded, setExpanded] = useState(true)
  const section = thread ? activeLearningSection(thread) : null
  const branch = thread ? activeLearningBranch(thread) : null
  const progress = thread ? learningProgress(thread) : 0

  const branchAnswer = useMemo(
    () =>
      branch?.messages
        .filter(message => message.role === 'assistant')
        .map(message => message.content)
        .join('\n\n') || '',
    [branch]
  )

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
    } finally {
      setLearningLoading(false)
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
    <aside className="relative z-2 flex w-[19rem] shrink-0 flex-col border-l border-border/70 bg-card/85 backdrop-blur-xl">
      <header className="flex items-start gap-2 border-b border-border/60 px-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-mondwest text-xs text-display text-text-tertiary">Learning thread</div>
          <h2 className="mt-1 truncate text-sm font-semibold text-text-primary">{thread.topic}</h2>
        </div>
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

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-text-tertiary">
              <span>Lesson progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>

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

          {branch ? (
            <section className="mt-5 rounded-lg border border-warning/40 bg-warning/5 p-3">
              <div className="font-mondwest text-xs text-display text-warning">Side question</div>
              <h3 className="mt-1 text-sm font-medium text-text-primary">{branch.title}</h3>
              <blockquote className="mt-2 border-l-2 border-warning/50 pl-2 text-xs text-text-secondary">
                {branch.source_excerpt}
              </blockquote>
              {branchAnswer && <CompactMarkdown className="mt-3" text={branchAnswer} />}
              {branch.connection && (
                <p className="mt-3 text-xs leading-relaxed text-text-secondary">
                  <strong>Connection:</strong> {branch.connection}
                </p>
              )}
              <Button className="mt-3 w-full" disabled={loading} onClick={() => void returnToLesson()} size="sm">
                <Codicon name="arrow-left" /> Return to lesson
              </Button>
            </section>
          ) : (
            <section className="mt-5 rounded-lg border border-border/60 bg-background/50 p-3">
              <div className="font-mondwest text-xs text-display text-text-tertiary">Current section</div>
              <h3 className="mt-1 text-sm font-medium text-text-primary">{section?.title}</h3>
              {section?.readiness && (
                <div className="mt-2 text-xs text-text-secondary">{readinessLabels[section.readiness]}</div>
              )}
              <div className="mt-3 grid grid-cols-1 gap-2">
                <Button onClick={() => onPrompt('Continue the lesson with the next outlined section.')} size="sm">
                  Continue lesson <Codicon name="arrow-right" />
                </Button>
                <Button onClick={() => onPrompt('By the way, ')} size="sm" variant="outline">
                  <Codicon name="git-branch" /> Ask a side question
                </Button>
              </div>
            </section>
          )}

          {thread.branches.length > 0 && (
            <section className="mt-5">
              <div className="font-mondwest text-xs text-display text-text-tertiary">Question branches</div>
              <ul className="mt-2 space-y-1.5">
                {thread.branches.map(item => (
                  <li
                    className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-xs text-text-secondary"
                    key={item.id}
                  >
                    <Codicon name={item.status === 'resolved' ? 'pass-filled' : 'git-branch'} />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="text-text-tertiary">{item.status}</span>
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
