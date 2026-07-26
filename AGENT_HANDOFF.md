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
- Latest functional commit: `59acf7f4d`

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
- Follow-ups stay in the active branch. **Back to lesson** preserves the branch
  as resolved/unresolved, restores the canonical lesson, and restores the main
  Continue control.
- Side-panel stream, reasoning, and tool events never leak into the main
  transcript.

Load-bearing desktop files:

- `apps/desktop/src/app/chat/learning-panel.tsx`
- `apps/desktop/src/app/chat/index.tsx`
- `apps/desktop/src/app/session/hooks/use-prompt-actions.ts`
- `apps/desktop/src/app/session/hooks/use-message-stream.ts`
- `apps/desktop/src/store/learning.ts`

### Deterministic BTW routing

BTW persistence does not depend on the model completing two tool calls:

1. A recognized side-panel request records the question before inference.
2. The model returns a focused text answer without an inferred forced tool.
3. The gateway persists that answer into the active branch and emits
   `learning.updated`.
4. Side-panel completion is discarded from the main transcript because the
   durable branch is the rendering source.

The BTW branch fallback is evaluated before explicit lesson detection. This is
important because the control marker contains “Learning Thread” and “lesson” and
would otherwise be misclassified as a new structured lesson.

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

Earlier foundational commits remain in Git history.

## Verification

Automated checks after the final BTW fix:

- Focused Python Markdown/gateway checks: 10/10
- Desktop learning panel/store tests: 14/14
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
