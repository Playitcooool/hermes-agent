# Learning Thread Desktop

This fork turns Hermes Desktop into a structured learning workspace while retaining Hermes' model,
tool, session, and authentication runtime.

## Run locally

```bash
npm install
cd apps/desktop
npm run dev
```

On first launch choose **OpenAI OAuth (ChatGPT)**. Authentication and token refresh stay in the
Hermes backend; the React renderer never reads OAuth credentials. Packaged builds use
`~/.learning-thread` (or `%LOCALAPPDATA%/learning-thread`) so they cannot overwrite a normal Hermes
installation. For isolated development, launch with an explicit profile directory:

```bash
HERMES_HOME=/tmp/learning-thread-dev npm run dev
```

## Starting a lesson

Learning mode activates only for explicit sustained-learning requests:

```text
I want to understand transformer attention from first principles.
Teach me why Earth has seasons.
Start a lesson on monetary policy.
```

Ordinary questions, formatting requests, and coding tasks remain ordinary Hermes conversations.

## Learning model

The `learning_thread` tool owns the durable state machine:

- A canonical 5–7 section outline advances one section at a time.
- Each generated section ends with a qualitative checkpoint.
- Side questions create branches anchored to the active section and source excerpt.
- Branch follow-ups cannot advance the canonical lesson.
- **Return to lesson** restores the exact section recorded by the branch.
- State is stored per Hermes session under `HERMES_HOME/learning_threads/`.
- Packaged first-launch bootstrap clones the `learning-thread-app` branch from this fork, so the GUI
  and Python learning runtime always use the same committed version.

The desktop receives `learning.updated` gateway events and displays a study panel with outline
progress, active checkpoint readiness, question branches, note export, and direct return controls.
Markdown, local/remote images, and LaTeX use Hermes Desktop's existing Streamdown and KaTeX pipeline.

## Verification

```bash
scripts/run_tests.sh tests/learning_thread
npm --workspace apps/desktop run type-check
npm --workspace apps/desktop run test:ui -- src/store/learning.test.ts
npm --workspace apps/desktop run build
```

## Upstream and license

This project is based on the MIT-licensed
[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent). Keep the upstream license
and attribution when distributing modified builds. OpenAI Codex/ChatGPT OAuth availability remains
subject to the user's account entitlement and OpenAI's terms.
