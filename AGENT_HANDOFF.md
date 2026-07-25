# Learning Thread — Agent Handoff

Updated: 2026-04-06

## Objective

Finish and verify the standalone **Learning Thread** desktop application forked from Hermes Agent. The app is a native Electron/React learning workspace backed by Hermes, uses OpenAI through Hermes's `openai-codex` ChatGPT OAuth flow (not API keys), and preserves canonical lesson state while allowing anchored `btw` side branches.

## Repository and branch

- Local checkout: `/Volumes/Samsung/Projects/LearningHermes`
- GitHub fork: `https://github.com/Playitcooool/hermes-agent`
- Working branch: `learning-thread-app`
- Upstream: `https://github.com/NousResearch/hermes-agent.git`
- `origin/learning-thread-app` is current through commit `cdf225b78`.

Verify remotes before doing anything destructive:

```bash
cd /Volumes/Samsung/Projects/LearningHermes
git remote -v
git status --short
git log --oneline -10
```

## Completed implementation

### Python learning runtime

- `learning_thread/state.py` implements persistent per-session learning state.
- Supports lesson sections, canonical position, checkpoints, side branches, exact source anchors, return-to-lesson, reset, and view operations.
- State is persisted under `HERMES_HOME/learning_threads/`.
- `tools/learning_thread_tool.py` exposes the state machine to the agent.
- `toolsets.py` includes `learning_thread` in default core tools.
- Activation guidance requires explicit sustained teaching intent; ordinary questions do not create lessons.

### Gateway integration

`tui_gateway/server.py` exposes:

- `learning.get`
- `learning.back`
- `learning.reset`
- `learning.updated` event

The renderer receives state through gateway RPC/events; it never reads OAuth credentials or backend files directly.

### Desktop UI

The desktop is branded **Learning Thread** and includes:

- Study panel and lesson outline
- Canonical progress display
- Checkpoint cards
- Side-branch history and return controls
- Notes/copy controls
- Session hydration and event-driven state synchronization
- Existing native Markdown renderer with KaTeX for lessons

Important files:

- `apps/desktop/src/app/chat/learning-panel.tsx`
- `apps/desktop/src/store/learning.ts`
- `apps/desktop/src/app/desktop-controller.tsx`
- `apps/desktop/src/app/session/hooks/use-message-stream.ts`
- `apps/desktop/src/components/assistant-ui/thread.tsx`
- `apps/desktop/src/components/assistant-ui/tool-fallback.tsx`

### Distribution behavior

A critical packaging problem was discovered and addressed: upstream Hermes Desktop is a thin shell whose first launch clones the backend. A package stamped with local-only commits would fail because upstream GitHub did not contain them.

The following is now in place:

- A real GitHub fork exists and all commits are pushed.
- `apps/desktop/electron/bootstrap-runner.cjs` fetches installer scripts from `Playitcooool/hermes-agent`.
- `scripts/install.sh`, `scripts/install.ps1`, and `scripts/install.cmd` clone/download from the fork.
- Packaged app data is isolated from ordinary Hermes:
  - macOS/Linux: `~/.learning-thread`
  - Windows: `%LOCALAPPDATA%/learning-thread`
  - `HERMES_HOME` still overrides this.
- This prevents an existing upstream `~/.hermes/hermes-agent` install from silently supplying a backend that lacks Learning Thread RPCs/tools.
- Package metadata now uses:
  - App name: `Learning Thread`
  - Executable: `LearningThread`
  - Bundle ID: `works.earendil.learning-thread`
- `apps/desktop/scripts/test-desktop.mjs` now derives package paths from `package.json` instead of hardcoding `Hermes.app`/`Hermes`.

## Commits

Each major part has a separate commit:

1. `182d4144b` — `feat(learning): add persistent lesson and branch state machine`
2. `d60074bba` — `feat(gateway): expose learning thread state to desktop clients`
3. `f62237998` — `feat(desktop): add Learning Thread study workspace`
4. `895a85fe8` — `feat(learning): render lessons with native Markdown and KaTeX`
5. `a0341f802` — `test(learning): verify default tooling and branch inspection`
6. `725e86f44` — `fix(desktop): complete Learning Thread application branding`
7. `c74728fa4` — `feat(distribution): bootstrap the standalone app from the fork`
8. `cdf225b78` — `test(desktop): resolve Learning Thread package paths`

## Verification already completed

The following passed before the final distribution commits:

- Learning tests: 7/7
- Learning plus Codex auth tests: 30/30
- Targeted desktop selector tests: 4/4
- TypeScript type-check
- Production desktop build
- macOS arm64 unpacked package generation

Packaging metadata was inspected successfully after the branding fix:

```text
CFBundleDisplayName = Learning Thread
CFBundleExecutable  = LearningThread
CFBundleIdentifier  = works.earendil.learning-thread
CFBundleName        = Learning Thread
```

The executable existed at:

```text
apps/desktop/release/mac-arm64/LearningThread.app/Contents/MacOS/LearningThread
```

Known unrelated upstream failures:

- Full desktop UI suite has pre-existing staged `node-pty` tests/source-map warnings and a pane-shell failure.
- Full lint has many pre-existing Electron lint errors.
- Do not treat those as regressions without comparing against upstream/baseline.

## Current unfinished verification

A clean final package has **not yet been produced after `cdf225b78`**.

What happened:

1. A clean package at `c74728fa4` built successfully.
2. `test:desktop:fresh` failed immediately because its test script still looked for `Hermes.app`; commit `cdf225b78` fixes this.
3. `test:desktop:existing` rebuilt while that test-script change was uncommitted, so the stamp was marked dirty and still pointed at `c74728fa4`.
4. That command timed out after five minutes during/after the macOS signing step. It did not reach meaningful app validation.

Therefore, the next agent should perform a clean package build now that the tree includes `cdf225b78` and that commit is on GitHub.

## Exact next steps

### 1. Ensure a clean tree

```bash
cd /Volumes/Samsung/Projects/LearningHermes
git status --short
```

Only this handoff document may be uncommitted. Commit it separately if desired before packaging so the install stamp references a fully clean, pushed commit.

### 2. Push the handoff commit before building

The build stamp's commit must exist on the fork because first-launch bootstrap downloads the installer and clones that exact SHA.

```bash
git add AGENT_HANDOFF.md
git commit -m "docs: add Learning Thread continuation handoff"
git push origin learning-thread-app
```

### 3. Build a clean unsigned package first

Disabling identity discovery avoids local signing/keychain hangs while validating functionality:

```bash
cd /Volumes/Samsung/Projects/LearningHermes
CSC_IDENTITY_AUTO_DISCOVERY=false npm --workspace apps/desktop run pack
```

Confirm the build log says the current commit and does **not** say `[DIRTY]`.

Inspect:

```bash
APP=apps/desktop/release/mac-arm64/LearningThread.app
plutil -p "$APP/Contents/Info.plist" | rg 'CFBundleDisplayName|CFBundleExecutable|CFBundleIdentifier|CFBundleName' -A1
test -x "$APP/Contents/MacOS/LearningThread"
cat "$APP/Contents/Resources/install-stamp.json"
git rev-parse HEAD
```

The stamp SHA must equal `git rev-parse HEAD`, have branch `learning-thread-app`, and `dirty: false`.

### 4. Run bundle validation

The npm test scripts invoke `pack` again. Pass the signing override:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm --workspace apps/desktop run test:desktop:fresh
```

Note: `test:desktop:fresh` validates the package and launches a detached sandbox, but it does not wait for bootstrap completion. Record the printed sandbox path.

### 5. Verify actual first-launch bootstrap

This is the most important remaining check. In the printed sandbox:

- Wait for clone/install to complete.
- Inspect Electron/backend logs.
- Confirm `<sandbox>/hermes-home/hermes-agent/.git` exists.
- Confirm its origin is the fork and HEAD is the package stamp SHA:

```bash
git -C <sandbox>/hermes-home/hermes-agent remote -v
git -C <sandbox>/hermes-home/hermes-agent rev-parse HEAD
git -C <sandbox>/hermes-home/hermes-agent branch --show-current
```

Expected origin:

```text
https://github.com/Playitcooool/hermes-agent.git
```

Expected branch:

```text
learning-thread-app
```

Also verify the installed checkout contains:

```text
learning_thread/state.py
tools/learning_thread_tool.py
```

If bootstrap fails, inspect `apps/desktop/electron/bootstrap-runner.cjs` and installer logs first. The installer scripts try SSH before HTTPS on POSIX; HTTPS fallback should work for this public fork.

### 6. Functional smoke test

Launch with an isolated profile or use the sandbox install. Confirm:

1. The app opens as **Learning Thread**.
2. OpenAI login offers/uses `openai-codex` ChatGPT OAuth.
3. A normal one-off question does not start a lesson.
4. An explicit request such as “Teach me linear algebra as a structured lesson” starts Learning Thread.
5. Outline and current lesson render in the right study panel.
6. Markdown and equations render through native KaTeX.
7. Advancing a checkpoint changes canonical progress.
8. Asking a `btw` side question creates a branch without changing canonical section/checkpoint.
9. “Back to lesson” restores the exact source block and anchor.
10. Restarting the app/session restores lesson and branch state.

### 7. Re-run targeted automated tests after any changes

Use the existing test commands/history in the repository. At minimum rerun:

```bash
python -m pytest tests/learning_thread tests/hermes_cli/test_auth_codex_provider.py tests/test_tui_gateway_server.py
npm --workspace apps/desktop exec vitest run src/store/learning.test.ts
npm --workspace apps/desktop exec tsc -b
```

Adjust Python invocation to the repository venv if needed.

## Architecture invariants — do not break

1. A side branch must never advance canonical lesson state.
2. Returning from a branch must restore the exact source block, not merely the section.
3. Learning mode activates only for explicit teaching intent.
4. Learning state is independent from visible transcript tabs/UI navigation.
5. OAuth tokens stay in the Hermes backend; React must not read auth files or call OpenAI directly.
6. GUI math uses native KaTeX, not terminal PNG rendering.
7. The packaged app must bootstrap from this fork at a pushed commit, not from upstream NousResearch.
8. The packaged Learning Thread profile remains isolated from `~/.hermes` unless the user explicitly sets `HERMES_HOME`.

## Documentation

Primary product documentation is in `LEARNING_THREAD.md`.

The original LearningAgent/Pi prototype remains at `/Volumes/Samsung/Projects/LearningAgent` and commit `750cff7`, but the product implementation is now the Hermes fork described here.
