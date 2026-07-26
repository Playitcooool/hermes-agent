import { atom } from 'nanostores'

export type LearningReadiness = 'mostly_understood' | 'needs_clarification' | 'understood'

export interface LearningOutlineItem {
  id: string
  purpose: string
  title: string
}

export interface LearningSection {
  checkpoint: string
  checkpoint_answer: null | string
  checkpoint_evaluation: null | string
  content: string
  id: string
  outline_id: string
  readiness: LearningReadiness | null
  status: 'completed' | 'current'
  title: string
}

export interface LearningBranchMessage {
  at: string
  content: string
  role: 'assistant' | 'user'
}

export interface LearningBranch {
  connection: null | string
  id: string
  messages: LearningBranchMessage[]
  misconception: null | string
  question: string
  resolution: null | string
  source_excerpt: string
  source_section_id: string
  status: 'open' | 'resolved' | 'unresolved'
  title: string
}

export interface LearningThread {
  active_branch_id: null | string
  active_section_id: string
  branches: LearningBranch[]
  created_at: string
  id: string
  objective: string
  outline: LearningOutlineItem[]
  sections: LearningSection[]
  session_id: string
  status: 'branch' | 'checkpoint' | 'teaching'
  topic: string
  updated_at: string
  version: 1
}

export const $learningThread = atom<LearningThread | null>(null)
export const $learningLoading = atom(false)

export function setLearningThread(thread: LearningThread | null) {
  $learningThread.set(thread)
}

export function setLearningLoading(loading: boolean) {
  $learningLoading.set(loading)
}

export function activeLearningSection(thread: LearningThread): LearningSection | null {
  return thread.sections.find(section => section.id === thread.active_section_id) ?? null
}

export function activeLearningBranch(thread: LearningThread): LearningBranch | null {
  if (!thread.active_branch_id) {
    return null
  }

  return thread.branches.find(branch => branch.id === thread.active_branch_id) ?? null
}

export function learningProgress(thread: LearningThread): number {
  if (!thread.outline.length) {
    return 0
  }

  const completedSections = thread.sections.filter(
    section => section.status === 'completed' || Boolean(section.checkpoint_answer && section.readiness)
  ).length

  return Math.min(100, Math.round((completedSections / thread.outline.length) * 100))
}

export function buildLearningBranchPrompt(thread: LearningThread, rawQuestion: string): string {
  const question = rawQuestion.trim()
  const activeBranch = activeLearningBranch(thread)

  if (activeBranch) {
    return [
      '[Learning Thread BTW side panel]',
      'Answer the following follow-up in the active side branch.',
      'Do not advance or rewrite the canonical lesson. Return only the focused answer.',
      '',
      question
    ].join('\n')
  }

  const section = activeLearningSection(thread)
  const sourceContent = section?.content.trim() || section?.title || ''

  return [
    '[Learning Thread BTW side panel]',
    'Answer the following side question using the supplied current lesson section.',
    'Do not advance or rewrite the canonical lesson. Return only the focused answer.',
    '',
    '<current_lesson_section>',
    sourceContent,
    '</current_lesson_section>',
    '',
    question
  ].join('\n')
}

export interface LearningBtwSubmission {
  displayText: string
  prompt: string
}

export function prepareLearningBtwSubmission(
  thread: LearningThread | null,
  rawQuestion: string
): LearningBtwSubmission | string {
  const question = rawQuestion.trim()

  if (!question) {
    return 'usage: /btw <question>'
  }
  if (!thread) {
    return '/btw requires an active Learning Thread lesson'
  }

  return {
    displayText: `BTW · ${question}`,
    prompt: buildLearningBranchPrompt(thread, question)
  }
}

export function shouldStartLearningThread(text: string): boolean {
  const normalized = text.trim()

  if (!normalized) {
    return false
  }

  return (
    (/\blearning thread\b/i.test(normalized) && /\b(learn|lesson|teach|tutorial|course)\b/i.test(normalized)) ||
    /\b(structured|multi[-\s]?step|step[-\s]?by[-\s]?step|ongoing)\s+(lesson|course|tutorial)\b/i.test(normalized) ||
    /\bteach me\b[\s\S]*\b(structured|lesson|course|over time)\b/i.test(normalized)
  )
}
