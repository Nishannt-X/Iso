# Decisions (newest first)

## 2026-11-02 · Route coding and review by task complexity
- **Status:** accepted
- **Context:** The project owner specified Claude as the main builder, GPT Sol as reviewer, Haiku for low-context coding labor, and Opus only rarely at medium effort.
- **Options considered:** A) Keep the kit's existing no-code Haiku and routine Opus security review; B) allow bounded Haiku implementation under Sonnet and reserve Opus for unresolved hard work; C) avoid agent delegation.
- **Decision:** Use B. Sonnet owns and integrates all code; Haiku may edit only explicitly assigned files and cannot commit. SOL performs routine review, including security-sensitive changes. Opus is an exceptional escalation for hard bugs, major improvements, or unresolved high-severity security findings.
- **Consequences:** Sonnet must review Haiku output line by line. The copied project kit differs from the master kit; future installs need the same routing change if this is intended as a standing default.
- **Decided by:** Human project owner · **Related:** This bootstrap update.

