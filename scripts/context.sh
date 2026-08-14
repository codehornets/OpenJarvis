#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
branch="$(git branch --show-current)"
head_sha="$(git rev-parse --short HEAD)"

printf 'repo: %s\n' "$repo_root"
printf 'branch: %s\n' "$branch"
printf 'head: %s\n' "$head_sha"
printf '\nstatus:\n'
git status --short

printf '\nupstream:\n'
git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || printf '(none)\n'

printf '\nrecent commits:\n'
git log --oneline -5

printf '\npr:\n'
if command -v gh >/dev/null 2>&1; then
  gh pr view --json number,title,state,url,headRefName,baseRefName 2>/dev/null || printf '(no open pr or gh auth unavailable)\n'
else
  printf '(gh unavailable)\n'
fi
