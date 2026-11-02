# Decisions (newest first)

## 2026-11-02 · Equip the builder for visual design and browser checks
- **Status:** accepted
- **Context:** The project owner requested the Emil Kowalski, Impeccable Design, and Taste skills, plus Figma and Playwright, before product implementation.
- **Decision:** Install the three skills in `.claude/skills/` from pinned upstream revisions; configure project-local Figma and Playwright MCP servers in `.mcp.json`; give the builder a concise design and screenshot workflow.
- **Sources:** [Emil Design Engineering](https://github.com/emilkowalski/skills/tree/a81dbca07f2217b7103e510c0f13f8d5b017afc9/skills/emil-design-eng), [Impeccable](https://github.com/pbakaus/impeccable/tree/e89e3ada3e875a89ac2c5d33d11e65ebef6fe285/.claude/skills/impeccable), [Taste](https://github.com/senlindesign/taste-skill/tree/6dce223f2f5665d3636ca9a44ec3a7aa1322a9b8), [Figma MCP](https://help.figma.com/hc/en-us/articles/39216419318551-Get-started-with-the-Figma-MCP-server), [Playwright MCP](https://playwright.dev/docs/getting-started-mcp).
- **Consequences:** The skills are project-local and version-pinned by this commit. The Figma server requires each user's account authorization. Playwright MCP uses `@playwright/mcp@0.0.84`. Impeccable's launcher downloads a checksum-verified runtime on first use. Taste's demo assets and evals stay local but are excluded from git. The design workflow keeps extracted references out of `CLAUDE.md`, which points to `AGENTS.md` here.
- **Decided by:** Human project owner · **Related:** Design tooling setup.

## 2026-11-02 · Route coding and review by task complexity
- **Status:** accepted
- **Context:** The project owner specified Claude as the main builder, GPT Sol as reviewer, Haiku for low-context coding labor, and Opus only rarely at medium effort.
- **Options considered:** A) Keep the kit's existing no-code Haiku and routine Opus security review; B) allow bounded Haiku implementation under Sonnet and reserve Opus for unresolved hard work; C) avoid agent delegation.
- **Decision:** Use B. Sonnet owns and integrates all code; Haiku may edit only explicitly assigned files and cannot commit. SOL performs routine review, including security-sensitive changes. Opus is an exceptional escalation for hard bugs, major improvements, or unresolved high-severity security findings.
- **Consequences:** Sonnet must review Haiku output line by line. The copied project kit differs from the master kit; future installs need the same routing change if this is intended as a standing default.
- **Decided by:** Human project owner · **Related:** This bootstrap update.

