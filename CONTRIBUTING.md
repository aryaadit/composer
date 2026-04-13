# Contributing to Composer

## Branch naming
- `adit/feature-name` — Adit's work
- `reid/feature-name` — Reid's work

## Workflow
1. Pull latest main before starting: `git pull origin main`
2. Create a branch: `git checkout -b yourname/what-youre-building`
3. Work and commit locally
4. Push branch: `git push origin yourname/feature-name`
5. Open a PR on GitHub
6. Other person reviews and approves
7. Merge to main — auto-deploys to composer.onpalate.com

## Rules
- Never commit or push directly to main
- Always pull before starting a new session
- One PR per feature — keep them focused
- PR description must fill out the template

## Claude Code sessions
At the end of every Claude Code session, ask it to:
"Write a PR description summarizing what changed this session"
Use that as your PR description when opening the PR on GitHub.
