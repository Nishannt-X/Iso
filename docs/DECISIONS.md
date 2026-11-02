# Decisions (newest first)

## 2026-11-02 · Correct seed data to the brief's sample table; add CLIENT_BRIEF.md
- **Status:** accepted
- **Context:** Review of S0+S1 found the seed built without the brief's sample table. It invented a ₹24,000 PKG-KL-07 Monsoon price and a ₹41,000, 8-day, 4-star PKG-SI-12, and the docs claimed those brief facts were missing. A second finding: `validateSeasons` compared season names, so two overlapping seasons with the same name passed.
- **Options considered:** A) leave the placeholders and flag them; B) replace them with the brief facts and keep only the day boundaries and `nights` as labelled assumptions; C) do nothing.
- **Decision:** B. PKG-KL-07 is "Munnar, Thekkady and Alleppey houseboat", 6 days, 4-star, Peak ₹32,500 and Monsoon ₹24,900. PKG-SI-12 is "Madurai, Rameswaram and Kanyakumari", 5 days, 3-star, All year ₹18,750, draft. Peak and Monsoon day boundaries stay `rangeAssumed`; All year does not. `docs/CLIENT_BRIEF.md` records the exact facts. Overlap validation now tracks season position, not name, and numbers the pair in the message only when names are equal.
- **Consequences:** Supersedes item 4 of the S0 build-process entry below (its claim that other prices were missing is withdrawn). (The remaining brief prose has since been transcribed; see the S2 entry.) Publishing over HTTP in S6 must require `expectedLockVersion` (optimistic lock) at the request boundary; the domain API is unchanged for now.
- **Decided by:** agent (Builder) on reviewer findings · **Related:** `fix(seasons)` and `fix(seed)` commits on `feat/kochi-tours-core`

## 2026-11-02 · Build-process deviations from the architect plan (S0)
- **Status:** accepted
- **Context:** Problems met while starting the Builder packet.
- **Decision:**
  1. **Isolated worktree.** An unidentified writer kept adding files to the shared checkout (a stale, over-scoped draft using a mock AI provider and invented 75% child and 500 bp GST defaults). Its files were moved untouched to `/tmp/iso-stale-builder-draft-133242/` and this slice is built in the worktree `.claude/worktrees/kochi-core` on `feat/kochi-tours-core`. The draft is non-authoritative.
  2. **`.env.example` not created.** The project's `Read(./.env.*)` deny rule also matches that filename, so the Write tool refused it, and the deny rule was not bypassed. Variable names are documented in `README.md`. A human can add `.env.example` or allow that one path.
  3. **Deferred installs.** `@anthropic-ai/sdk` and `@playwright/test` are approved and version-checked but installed in the slice that first uses them (S5 and S7), to keep the S0 supply-chain surface minimal.
  4. **Seed data provenance.** *(Superseded by the entry above: the brief does give the sample prices, and the seed now uses them.)* Itinerary text and the `SYN-*` packages remain synthetic, recorded in `packages.data_origin` and the version `change_note`.
- **Consequences:** The owner should create `.env.example`. Merge from the worktree branch is unaffected.
- **Decided by:** agent (Builder) · **Related:** `feat/kochi-tours-core`

## 2026-11-02 · Company A Kochi tour operator: architecture and policy decisions
- **Status:** accepted
- **Context:** The project owner chose Problem 2 (Company A, Kochi tour operator) and approved architect plan v2.
- **Decision:**
  1. **Stack.** Node 22, Hono JSX server rendering, SQLite through the built-in `node:sqlite`, `node:test`, zod for validation. Ladder: stdlib first (`node:sqlite`, `node:test`, `node:crypto` for password hashing later); Hono/zod are the small well-known deps that remain. The `node:sqlite` spike passed on Node 22.14 (foreign keys, partial unique indexes, SQLite 3.47.2). If it breaks, `better-sqlite3` is swapped in behind `src/db/db.ts`.
  2. **AI.** A live Anthropic call is the primary configured mode. A rules parser is the fallback and is labelled as such everywhere. No mock LLM and no fixture replay exist at runtime. Tests may inject a fake HTTP client into the adapter, never selectable from config.
  3. **API key.** The human sets `ANTHROPIC_API_KEY` privately in their own environment. The agent never requests, reads or writes it. The live path is therefore unverified until the human runs the check script (S5).
  4. **No invented rates.** The brief gives no GST, child or single-supplement rule, so none is seeded: `child_pct`, `single_supp_inr` and `gst_rate_bp` start unset. Test fixtures may use 75% and 500 bp to prove arithmetic only.
  5. **Partial quotes.** A quote is `complete`, `partial` (lower bound with listed unpriced items) or `unavailable` (no season for the date). Partial quotes are never presented as final.
  6. **Slug lock instead of redirects.** A package slug is editable until the first publish, then locked by a trigger. No redirect engine.
  7. **One `lock_version`.** It covers the draft row and its replaced child rows, which are saved in one transaction (optimistic locking, stale save returns a conflict).
  8. **Staff-only users.** Roles are `admin` and `agent`. Travellers have no login and use an unguessable status link.
  9. **Git.** One feature branch with slice commit groups, pushed after each slice, one PR for human merge.
- **Consequences:** Sample quotes are `partial` until staff set a child rule and publish. SQLite needs a persistent volume wherever this is deployed. `node:sqlite` prints an experimental warning.
- **Decided by:** Human project owner (scope), architect plan v2 · **Related:** `docs/PROJECT_BRIEF.md`

## 2026-11-02 · Dependencies for the Kochi tour operator build
- **Status:** accepted
- **Context:** The owner authorised routine, well-maintained dependencies. Versions were taken from `npm view` on 2026-11-02 and pinned exactly in `package.json` plus the lockfile. Licences are as reported by the registry. Maintenance was judged by current release version only; no deeper audit was done.
- **Decision:**

| Package | Version | Licence | Why | Alternative |
|---|---|---|---|---|
| `hono` | 4.13.16 | MIT | Small web framework with JSX server rendering and `app.request()` for tests | Express (heavier, no JSX) |
| `@hono/node-server` | 2.1.5 | MIT | Node adapter for Hono | Node `http` by hand |
| `zod` | 4.6.7 | MIT | Input and `PublishableVersion` validation; later the AI tool schema | Hand-written validators |
| `typescript` | 6.0.3 | Apache-2.0 | Type checking. Pinned below 7 because `typescript-eslint@8.72.1` declares `typescript <6.1.0` | TS 7.0.2 (unsupported by linter) |
| `tsx` | 4.23.15 | MIT | Run TypeScript directly in dev and tests | Compile before every run |
| `@types/node` | 22.20.5 | MIT | Node 22 typings, matching the runtime | Latest 26.x (wrong runtime) |
| `eslint` | 10.14.0 | MIT | Linting | Biome |
| `@eslint/js` | 10.0.1 | MIT | ESLint recommended rules (not in the plan's list, needed by the flat config) | Skip core rules |
| `typescript-eslint` | 8.72.1 | MIT | TypeScript lint rules | None |
| `@anthropic-ai/sdk` | 1.3.0 | Apache-2.0 | Typed tool-use, timeouts, retries for the live extractor. Installed in S5. Plan said MIT; registry says Apache-2.0 | Hand-rolled HTTP |
| `@playwright/test` | 1.64.1 | Apache-2.0 | Screenshots and end-to-end checks. Installed in S7 | Manual screenshots |

- **Consequences:** `eslint@10` needs Node `^20.19 || ^22.13 || >=24`, which is why `engines.node` is `>=22.13`. The last two rows are approved but not yet installed.
- **Decided by:** agent (Builder) under owner authorisation · **Related:** `package.json`, `package-lock.json`

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

