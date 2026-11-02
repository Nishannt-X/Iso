# Design workflow

Use this when the selected client's interface is built. The client brief remains the source for product claims, content, scope, and constraints.

1. Read the installed `emil-design-eng`, `impeccable`, and `taste` skills. Run Impeccable's session context and read its new-work and craft-floor guidance. Use its Persuade guidance for public pages and Operate guidance for staff screens.
2. Pick one or two real reference sites for visual structure and tone. Use Taste with Playwright to record concrete observations about layout, type, spacing, photography, and interaction. Record useful design decisions in `docs/` with source URLs. Select Taste's skip export option rather than writing to `CLAUDE.md`, which points to the project rules.
3. Define a small visual system before implementing screens: type scale, colors, spacing, image treatment, states, and responsive breakpoints. Use Emil's guidance for purposeful motion. Keep content and business facts within the chosen problem statement; label assumptions.
4. Build the core screens and their loading, empty, and error states. Capture Playwright screenshots at desktop and phone widths, inspect them, fix alignment and overflow, and check keyboard focus and main flows. Repeat until the screens work and look coherent. Use Figma MCP when a Figma design or asset is available.
5. Record what was tested and any remaining visual or functional limits in the final report.

The design skills guide judgment. They do not replace the brief, the project rules, accessibility checks, or working product flows.
