# Streamliner AI Tools — Project Rules Kit

Drop this folder into any new project to make every AI agent operate the same structured way: structure, workflow, amends/additions, commits, pushes, safety, quality scoring.

## Use it
```bash
# new project
mkdir myapp && cd myapp && git init
/Users/nishantdahiya/Documents/Streamliner_ai_tools/install.sh .
```
Or manually: copy this folder to `<project>/.streamliner/`, copy `AGENTS.md` to the project root, `ln -s AGENTS.md CLAUDE.md`, and `git config core.hooksPath .streamliner/githooks`.

Then: fill `AGENTS.md` §0 (project facts/commands) and `docs/PROJECT_BRIEF.md`; on GitHub enable branch protection for `main` (PR + CI + approval).

## Map
| Path | Purpose |
|------|---------|
| `AGENTS.md` | Entry point, <200 lines, always loaded. Links to detail files |
| `rules/00-principles.md` | Karpathy + Ponytail principles merged |
| `rules/01-structure.md` | Standard repo layout and conventions |
| `rules/02-workflow.md` | Phases, plan sizing, amends/additions, multi-agent, decisions |
| `rules/03-git.md` | Branches, Conventional Commits, amends, pushes, PRs, never-list |
| `rules/04-safety.md` | Ask-first list, secrets, prompt injection, deps |
| `rules/05-quality.md` | Definition of Done, testing, review checklist |
| `roles/ROSTER.md` | **Roles, model registry (GPT Sol / Haiku / Sonnet / Opus / Gemini Flash), pipeline, escalation, permission matrix** |
| `roles/handoff-protocol.md` | Packet formats, finding severity schema, loop limits |
| `roles/CHARTERS.md` | Paste-able role prompts for any agent/tool |
| `templates/claude-agents/` | Claude Code subagents (test-runner/haiku, builder/sonnet, debugger/opus, security-griller/opus) → installed to `.claude/agents/` |
| `rubric/agent-rubric.md` | Hard fails + 40-point score + project health check |
| `templates/` | Project brief, task brief, decision entry, PR template, Claude settings |
| `hooks/guard-git.sh` | Claude Code PreToolUse guard (blocks force push, main push, `--no-verify`, …) |
| `githooks/` | `pre-commit`, `commit-msg`, `pre-push` — enforce for every agent/human |
| `research/SOURCES.md` | What the design is based on, with caveats |
| `karpathy-guidelines/`, `ponytail_rules.md` | Original source guidelines |

## Layers of enforcement
1. **Rules (markdown)** — requests; models can drift.
2. **Agent hooks/permissions** (`.claude/settings.json`) — deterministic for Claude Code.
3. **Git hooks** — deterministic for any tool that runs git.
4. **Remote branch protection + CI** — final gate, configured on GitHub.

## Customizing
Edit per-project facts in the project's root `AGENTS.md`, not in `.streamliner/`. Improve the kit here, then re-run `install.sh` in new projects (it never overwrites existing files). When an agent repeats a mistake, convert the rule into a hook or CI check.
