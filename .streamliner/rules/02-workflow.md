# 02 · Agent Workflow

## Phases (every task)
| # | Phase | Output | Gate to continue |
|---|-------|--------|------------------|
| 1 | Understand | Restated task, assumptions, open questions | No blocking ambiguity (else ask) |
| 2 | Plan | Steps each with `→ verify:` check; files to touch | Plan fits request; user OK if scope unclear |
| 3 | Branch | `git switch -c type/short-desc` from up-to-date default branch | Clean working tree before start |
| 4 | Implement | Small steps, one logical change at a time | Each step's verify check passes |
| 5 | Verify | Tests, lint, typecheck, build, manual run if UI/CLI | All green, evidence captured |
| 6 | Review own diff | `git diff` read line by line vs. request | Every line traces to request |
| 7 | Commit | Conventional commits (see 03-git) | Rubric: no hard fails |
| 8 | Push | Feature branch only | Commit + verify done |
| 9 | Report | Format in AGENTS.md §7 | — |

## Plan sizing
- **Trivial** (typo, one-line, obvious): skip written plan, still verify.
- **Normal** (a few files): short plan in chat.
- **Large / risky** (new dep, schema, public API, cross-module, >~300 lines): plan first, wait for approval, split into multiple PR-sized slices.

## Amends and additions to existing code
- "Amend" = change existing behavior; "addition" = new behavior. Both: read existing code and tests first, follow local patterns.
- Prefer extending existing modules over creating parallel ones.
- Changing a function's contract → grep all callers, update them in the same change, add/adjust tests.
- Add code → add its check. Remove code → remove its tests/docs/config references.
- Don't mix concerns: refactor commits are separate from behavior commits. Prefer "make the change easy, then make the easy change" as two commits.

## Handling uncertainty
- Ask one focused question with a recommended default, rather than many.
- If blocked >2 attempts on the same error: stop, summarize what was tried, ask. No thrashing, no random edits.
- Never "fix" a failing test by weakening/deleting it unless the test is wrong, and then say so.

## Multi-agent / parallel work
- Roles, models, pipeline, and permissions: `.streamliner/roles/ROSTER.md` (authoritative). Handoff formats: `roles/handoff-protocol.md`.
- One agent per branch/worktree. No two agents edit the same file concurrently.
- Hand-off note in PR or `docs/DECISIONS.md`: what's done, what's next, open risks.
- Sub-agents get a self-contained brief: goal, files in scope, verify command, what NOT to touch.
- Reviewer agent ≠ author agent where possible; review with `rubric/agent-rubric.md`.

## Long-running / resuming
- Start of session: read AGENTS.md, `docs/PROJECT_BRIEF.md`, latest entries of `docs/DECISIONS.md`, `git log --oneline -15`, `git status`.
- Keep a running checklist in the PR description for multi-step work.

## Decision log
Add an entry to `docs/DECISIONS.md` (template in `templates/DECISION_ENTRY.md`) when you: choose a dependency, pick between architectures, change a public contract, or deviate from these rules.
