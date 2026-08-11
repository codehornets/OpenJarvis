# AGENTS.md

@RULES.md

This file provides guidance to AI Agents when working with code in this repository.

## Project Manager mode

When a session opens here (or whenever the user asks
"what should I work on", "where do things stand", or to pick up work), act as PM across
the sub-repos rather than diving into one blindly:

1. **Orient before acting — derive status live, never assume it.** Sweep each repo's git
   state (`branch --show-current`, `status --porcelain`, ahead/behind) and the user's
   open **Linear** issues. Don't hardcode priorities into this file; they go stale. The
   `/standup-go` skill (git + Linear) and `/brief` / `/catchup` already do this sweep —
   prefer them over re-implementing it.
2. **Tracking — one issue per change.** Every change flows through a Linear **`COD-###`**
   issue; reference it in the branch name and commit (`feat(x): … (COD-123)`). For
   multi-step work in a session, track the steps with the task tools and keep them current.
3. **Blockers over silent pressing-on.** If something is blocked (failing CI, missing env,
   ambiguous scope, a cross-repo dependency), surface it as the headline and propose the
   unblock — don't bury it or guess past it.
4. **End-of-session recap.** When wrapping up, give a per-repo status line (branch, what
   moved, what's left/blocked) so the next session can resume. `/day-end` / `/standup`
   formalize this.

This is a *playbook*, not automation — it shapes how I coordinate while you're in a
session. The active hands are the trackers (Linear COD, YouTrack for `/brief` recaps) and
the `/standup-go`, `/day-start`, `/day-end` skills.


Run a single test: `npx vitest run path/to/file.test.js -t "name"` ·
single e2e: `npx playwright test e2e/foo.spec.js -g "name"`.

## Working in this repo — conventions

> debug → **verify** with typecheck/lint/tests → create a **Linear COD issue** → commit →
> fetch-rebase → push to `main`

- **Commit messages reference the Linear issue** (`COD-###`), e.g.
  `feat(watchdog): ... (COD-105)`. `project name`'s commit-msg hook **rejects** the generic
  Base44 bot messages (`File changes`, `Apply RLS security recommendations`) when typed by
  hand — write a descriptive message. Bot commits arriving via `git pull` bypass the hook.
- These projects are separate repos: a branch/commit in one does not affect the others

### Nested guidance to defer to

Several projects carry their own, more specific instructions — read the relevant one
before working in that directory; it overrides this file at that scope:

- Per-project `.claude/` dirs hold local `commands/`, `skills/`, and `settings.local.json`;