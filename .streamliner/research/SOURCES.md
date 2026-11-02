# Research Notes & Sources (as of 2026-11-02)

## Findings that shaped the kit
1. **AGENTS.md is the cross-tool "README for agents"** — no required fields; recommended sections: overview, build/test commands, code style, testing, security, commit/PR guidelines. Nested files allowed; nearest wins; explicit user prompt overrides all. Supported by Codex, Cursor, Copilot agent, Jules, Windsurf, Amp, Zed, Gemini CLI (config), others. → kit's entry file is `AGENTS.md`; `CLAUDE.md` is a symlink. (https://agents.md)
2. **Claude Code loads CLAUDE.md (and can read AGENTS.md); target <200 lines**; longer files reduce adherence; contradictory rules get picked arbitrarily; use `.claude/rules/` or nested files for scoped detail; `@path` imports don't reduce context cost; `CLAUDE.local.md` for personal, gitignored prefs. → AGENTS.md kept short, details in `rules/*` read on demand. (https://code.claude.com/docs/en/memory)
3. **CLAUDE.md is context, not enforcement.** Anything that must never happen should be a **PreToolUse hook** (exit 2 blocks) and permission `deny` rules. → `hooks/guard-git.sh`, `templates/claude-settings.json`, and git-level `githooks/` (work for every agent, not just Claude). (https://code.claude.com/docs/en/hooks-guide)
4. **Conventional Commits 1.0.0**: `<type>[(scope)][!]: <description>`, body, footers; `feat`=minor, `fix`=patch, `!`/`BREAKING CHANGE`=major; other types free but common set used. → `rules/03-git.md`, `githooks/commit-msg`. (https://www.conventionalcommits.org/en/v1.0.0/)
5. **Agent git safety conventions (community skills)**: protect main/master, no force-push, no `--no-verify`, no auto git-config changes, no destructive resets without explicit request, stop and ask when unsure, explicit paths after `--`. These are community practice, not a spec. → hard rules + hooks.
6. **Community AGENTS.md guidance**: be imperative and concrete, favor commands/examples over prose, avoid generic advice and README duplication, keep it current (a stale file is worse than none), review auto-generated content.
7. **Karpathy guidelines** (think first, simplicity, surgical changes, goal-driven) and **Ponytail ladder** (YAGNI → reuse → stdlib → platform → dep → one line → minimal code) already in this folder → merged into `rules/00-principles.md`.

## Caveats
- Many sources are blogs/community skills, not official specs; official Claude Code docs were consulted for memory + hooks. Hook event names and settings paths can change — re-check docs when upgrading.
- Markdown rules can be ignored by a model; hooks + branch protection on the remote (set in GitHub settings) are the real enforcement. The kit cannot set remote branch protection for you.

## Links
- https://agents.md
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/hooks-guide
- https://www.conventionalcommits.org/en/v1.0.0/
- https://github.com/multica-ai/andrej-karpathy-skills
- Community: https://github.com/devskale/skale-skills/blob/main/docs/agents-md-best-practices.md · https://blog.buildbetter.ai/agents-md-complete-guide-for-engineering-teams-in-2026/
