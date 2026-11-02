# 03 · Git: Branches, Commits, Amends, Pushes

## Branches
- Default branch (`main`) is protected: **no direct commits, no pushes, no force operations.**
- Name: `<type>/<short-kebab-desc>` using the commit types below (`feat/login-form`, `fix/null-user-crash`). Optional issue id: `feat/123-login-form`.
- Start from up-to-date default: `git fetch origin && git switch -c feat/x origin/main`.
- Working tree must be clean (or changes understood) before branching. Never discard or stash the user's uncommitted work without asking.
- Short-lived: one task/slice per branch.

## Commit format — Conventional Commits 1.0.0
```
<type>[(scope)][!]: <imperative subject, ≤72 chars, no period>

[body: what and WHY, wrapped ~72; not a restatement of the diff]

[footers: Refs: #123 · BREAKING CHANGE: <desc> · Co-Authored-By: ...]
```
Types: `feat` (new behavior, SemVer minor) · `fix` (bug, patch) · `docs` · `style` (format only) · `refactor` · `perf` · `test` · `build` · `ci` · `chore` · `revert`.
Breaking change: `!` after type/scope **and/or** `BREAKING CHANGE:` footer (SemVer major).
Append any attribution/co-author lines the host tool requires.

## Atomic commits
- One logical change per commit; each commit builds and passes tests on its own.
- Separate: refactor vs. behavior, formatting vs. logic, deps vs. code, tests+code for the same behavior together.
- Don't commit WIP, debug prints, commented-out code, or unrelated files.

## Pre-commit routine (every time)
1. `git status` — anything unexpected? untracked secrets/artifacts?
2. Run the quality gate (test, lint, typecheck).
3. `git add -- <explicit paths>` (avoid `git add -A` / `.`; if you must use `-p`, review hunks).
4. `git diff --staged` — read it. Every line traces to the request. No secrets.
5. Commit with a conventional message. Never skip hooks.

## Amends
- `git commit --amend` allowed **only** for your own most recent commit that has **not been pushed** (fix typo, add forgotten file).
- After push: add a new commit (`fix:` / `chore:`) or `git revert`. Never rewrite pushed history on shared branches.
- Squash/rebase of your own unpushed feature commits to tidy history is OK; on pushed branches → ask first.

## Push
- Push only the current feature branch: `git push -u origin <branch>` (first time) / `git push`.
- Verify remote and branch before pushing (`git remote -v`, `git branch --show-current`).
- If push is rejected (non-fast-forward): `git fetch` then `git rebase origin/<branch>` or merge per project preference, re-run tests, push again. **Never force.** If history truly must be rewritten on a pushed branch, ask; use `--force-with-lease` only with explicit permission, on your own feature branch.
- Push after each verified commit or logical group; don't sit on large unpushed work.

## Pull requests
- Open PR from feature branch → `main` using `templates/PULL_REQUEST_TEMPLATE.md` (summary, why, test evidence, risks, rubric score).
- Keep PRs reviewable (<~400 changed lines). Split otherwise.
- Merge only with human approval + green CI. Prefer squash-merge with a conventional title (unless the project says otherwise).
- Never merge your own PR unless the user explicitly authorizes it.

## Never (hard rules; enforced by `hooks/guard-git.sh` and `githooks/`)
- `git push --force` / `-f` / `+refspec`, push to `main`/`master`/`release/*`
- `--no-verify`, `--no-gpg-sign`, editing `git config`, changing remotes
- `reset --hard`, `clean -f`, `checkout -- .`, `restore .`, `branch -D`, `stash drop/clear`, `filter-branch`, history rewrite on pushed commits
- Committing: `.env*`, keys, tokens, credentials, large binaries, `node_modules`, build output, `CLAUDE.local.md`
- Tags/releases without being asked

## Recovery
Mistake committed but unpushed → fix forward with a new commit or amend. Secret committed → **stop**, do not push, tell the user; rotating the secret is required even after removal from history.
