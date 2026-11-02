# 05 · Quality Gate & Definition of Done

## Definition of Done (all must be true)
- [ ] Success check from the plan passes, with evidence (command + output summary)
- [ ] New/changed logic has a runnable check (test or assert-demo); bug fixes have a regression test that failed before
- [ ] Full test suite passes (not just new tests)
- [ ] Lint + format + typecheck clean (no new warnings, no disabled rules to get green)
- [ ] Build succeeds (if the project builds)
- [ ] UI/CLI/API change was actually exercised (run it; report what you observed)
- [ ] Diff reviewed: no debug code, no commented-out blocks, no unrelated edits, no stray files
- [ ] Docs/README/`.env.example`/DECISIONS updated if behavior or config changed
- [ ] No secrets; no new dependency without approval
- [ ] Commits are atomic + conventional; branch pushed; PR description filled
- [ ] Report written in the AGENTS.md §7 format, including unverified items

## Testing guidance
- Test behavior, not implementation. Small, deterministic, independent tests. No network/time/random without control.
- Pyramid: many unit, some integration, few end-to-end.
- Don't mock what you own unless needed; mock at boundaries.
- A flaky test is a bug: fix or quarantine with a ticket, never retry-until-green.
- Never delete/skip/weaken a test just to pass.

## Code review checklist (self or reviewer agent)
Correctness · edge cases · error handling · security · naming/readability · simplicity (could it be 50 lines instead of 200?) · consistency with codebase · test quality · performance only where measured · docs.

## Metrics worth watching (project-level)
CI pass rate · time-to-green · PR size · revert rate · escaped defects · rubric score trend. If agents repeat a mistake, fix the rule or hook, not just the instance.

## Keeping rules effective
Every ~month or after a repeated agent mistake: prune stale rules, resolve contradictions, move enforceable rules into hooks/CI, keep AGENTS.md < ~200 lines.
