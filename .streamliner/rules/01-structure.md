# 01 · Project Structure

Adapt names to the stack, but keep the **roles**. Do not add top-level directories without asking.

```
<project>/
├── AGENTS.md                 # entry rules (copied from kit); CLAUDE.md is a symlink to it
├── CLAUDE.md -> AGENTS.md
├── README.md                 # for humans: what, why, quickstart
├── .streamliner/             # this kit (rules, rubric, templates, hooks). Do not edit per-project; fork the kit instead
├── .claude/settings.json     # Claude Code permissions + hooks (enforcement)
├── .github/
│   ├── pull_request_template.md
│   └── workflows/ci.yml      # lint + typecheck + test on every PR
├── docs/
│   ├── PROJECT_BRIEF.md      # goal, scope, non-goals, success criteria (source of truth)
│   ├── DECISIONS.md          # lightweight ADR log, newest first
│   └── ARCHITECTURE.md       # only when >1 module; keep short + diagram
├── src/                      # production code
├── tests/                    # mirrors src/ layout
├── scripts/                  # dev/ops scripts, documented, idempotent
├── .env.example              # variable names only, no values
└── .gitignore                # .env*, CLAUDE.local.md, build output, OS junk
```

## Rules
- **One source of truth per fact.** README = humans; AGENTS.md = agent behavior; PROJECT_BRIEF = scope. Link, don't duplicate.
- **Nested AGENTS.md** only for a subproject with genuinely different commands/conventions (monorepo packages). Closest file wins. Keep each short.
- **Tests mirror source.** `src/a/b.py` → `tests/a/test_b.py` (adapt to stack idiom).
- **No generated/vendor/build artifacts** in git unless the project already does.
- **Naming:** follow the language's convention; files `kebab-case` or `snake_case` per stack; be consistent with neighbors.
- **Config in one place.** Env vars read in a single module, documented in `.env.example`.
- **Docs move with code.** Behavior change → same commit updates docs.
- **New project bootstrap order:** brief → README → structure → CI → first failing test → first feature.
