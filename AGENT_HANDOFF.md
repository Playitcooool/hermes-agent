# Learning Thread — Agent Handoff

Updated: 2026-07-26

## Objective

Maintain and finish the standalone **Learning Thread** desktop application forked
from Hermes Agent. It is an Electron/React learning workspace backed by Hermes
and the `openai-codex` ChatGPT OAuth flow. Canonical lessons persist per session,
while `BTW` questions run as anchored side branches in the right panel.

## Repository

- Checkout: `/Volumes/Samsung/Projects/LearningHermes`
- Fork: `https://github.com/Playitcooool/hermes-agent`
- Branch: `learning-thread-app`
- Upstream: `https://github.com/NousResearch/hermes-agent.git`
- Latest functional commit: `871e9fece`

Before changing distribution behavior, verify the remotes, worktree, and recent
history:

```bash
git remote -v
git status --short
git log --oneline -15
```

## Current product behavior

### Durable lesson runtime

- `learning_thread/state.py` persists lesson outlines, materialized sections,
  checkpoints, canonical position, source-anchored branches, and branch messages
  under the active `HERMES_HOME`.
- `tools/learning_thread_tool.py` exposes start, continue, checkpoint, branch,
  back, view, and reset actions.
- Explicit structured-teaching intent activates Learning Thread; ordinary
  one-off questions remain normal chat.
- `learning_thread/markdown_fallback.py` materializes durable state when a
  provider returns lesson Markdown instead of calling the tool. It supports both
  canonical `# Learning Thread`/`## Section` responses and numbered headings such
  as `## 1) What a generator is` with `Unanswered checkpoint`.

### Desktop layout

- The lesson itself and **Continue lesson** control reside in the main window.
- The right panel contains the lesson objective, outline, BTW conversation, BTW
  input, branch history, copy-note, and end controls.
- The redundant **Lesson progress** block and **Current section** card were
  removed.
- Entering a question in the BTW input immediately creates a durable branch.
  Its user and assistant messages render only in the panel.
- An open branch turns the rail into a dedicated chat view. The lesson outline,
  branch list, source anchor, metadata, and footer controls stay out of the
  conversation until the user returns to the lesson.
- The branch question is the panel title. User turns render as right-aligned
  bubbles and tutor turns as readable left-aligned Markdown bubbles.
- Follow-ups stay in the active branch. **Back to lesson** preserves the branch
  as resolved/unresolved, restores the canonical lesson, and restores the main
  Continue control.
- Historical branches are resumable: selecting one shows its chat and composer;
  sending the next message durably reopens that exact branch and continues with
  only its isolated message history.
- Side-panel stream, reasoning, and tool events never leak into the main
  transcript.

Load-bearing desktop files:

- `apps/desktop/src/app/chat/learning-panel.tsx`
- `apps/desktop/src/app/chat/index.tsx`
- `apps/desktop/src/app/session/hooks/use-prompt-actions.ts`
- `apps/desktop/src/app/session/hooks/use-message-stream.ts`
- `apps/desktop/src/store/learning.ts`

### Quarantined BTW requests

`learning.branch.submit` is a separate long-running RPC. It does not submit a
hidden prompt through the main chat agent:

1. The question is recorded in durable branch state before inference.
2. A fresh BTW agent receives only the canonical section context and prior
   messages from that branch.
3. The agent is non-persisting (`session_db=None`), skips memory and repository
   context, has one model iteration, and is forcibly stripped of all tools.
4. The gateway persists the focused answer into the active branch and emits
   `learning.updated`.
5. The main agent instance, main history, and main session database rows remain
   untouched.

Source anchors remain durable context but are not rendered. The former synthetic
`connection` field has been removed from new state and tool output.

## Distribution

- Product name: `Learning Thread`
- Executable: `LearningThread`
- Bundle ID: `works.earendil.learning-thread`
- macOS/Linux data: `~/.learning-thread`
- Windows data: `%LOCALAPPDATA%/learning-thread`
- `HERMES_HOME` remains an override.
- First-launch bootstrap installs the backend from the fork and exact package
  stamp SHA.

Clean unsigned macOS package:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm --workspace apps/desktop run pack
```

Expected artifact:

```text
apps/desktop/release/mac-arm64/LearningThread.app
```

Always confirm `install-stamp.json` matches `git rev-parse HEAD` and has
`"dirty": false`.

## Recent implementation commits

1. `cd2ad40a5` — dedicated BTW side thread panel
2. `46f122c8b` — required tool activation plumbing
3. `ff828f7b3` — gateway learning intent routing
4. `25c876be1` — required schema isolation
5. `54478579f` — core durable lesson inference
6. `61d4278d8` — first-class desktop `/btw`
7. `319521b26` — Markdown lesson materialization fallback
8. `b5183d9bb` — separate lesson and branch surfaces
9. `5c7f75f67` — numbered-heading lesson fallback
10. `59acf7f4d` — deterministic BTW replies and simplified right panel
11. `a7c46481c` — quarantined BTW request and chat-style branch panel
12. `871e9fece` — resumable historical BTW branches

Earlier foundational commits remain in Git history.

## Verification

Automated checks after the quarantined BTW change:

- Focused Python learning/gateway checks: 26/26
- Desktop learning panel/store tests: 12/12
- Desktop TypeScript type-check: passed
- Production Vite/Electron package build: passed
- `git diff --check`: passed

Live packaged verification passed on `59acf7f4d681adf52b8e4fe59e4b215a3556a6e8`
with the managed backend at the same SHA:

- Gateway ready with `openai-codex` ChatGPT OAuth.
- Right rail had no progress block or current-section card.
- A BTW question appeared immediately and its focused answer rendered.
- A follow-up and its answer rendered in the same panel branch.
- The main transcript contained no BTW messages.
- Durable state contained ordered user/assistant/user/assistant branch messages.
- Active lesson section and unanswered checkpoint were unchanged throughout.
- Back restored the main Continue control and retained the unresolved branch.

Evidence:

- `59acf7f-live-btw-branch-complete.png`
- `59acf7f-live-back-to-lesson.png`

Both are under:

```text
/Users/weiciruan/.codex/visualizations/2026/07/25/019f9913-dbc2-7c61-802c-d28cbaf3ba2c/
```

## Known unrelated baseline issues

- The full desktop suite has upstream staged `node-pty`/source-map warnings and
  unrelated pane-shell failures.
- Full lint contains pre-existing Electron lint errors.
- macOS notarization is skipped unless Apple notarization credentials are
  configured; ad-hoc signing is sufficient for local verification.
