---
name: context
description:
  Gather local repo context with git and gh so Codex can orient without human
  copy/paste. Use when asked for status, repo shape, or a quick sync.
---

# Context

## Goal

Summarize the current repository state from local tools only.

## Steps

1. Run `bash scripts/context.sh`.
2. Read `AGENTS.md` and `RULES.md` for repo conventions if the script output is
   not enough.
3. If more detail is needed, inspect the closest docs or package manifests for
   the area being worked on.

## Notes

- Prefer this skill over asking a human to paste branch, status, or PR
  metadata.
- If `gh` is unavailable or unauthenticated, still return the git context.
