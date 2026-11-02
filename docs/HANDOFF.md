# HANDOFF: continue the Kochi Tours (iso) project in a new chat

Written 2026-11-03. Read this first, then the files in section 4. Everything here was checked against the repo on that date; anything not verified is marked.

## 1. The assignment (why this exists)
A client brief (`docs/CLIENT_BRIEF.md`, Company A, a Kochi tour operator, Problem 2) must be built end to end with a great UI and UX, then submitted as **one ZIP (max 25 MB) holding exactly two files**:
1. **Technical Design Document** (PDF or Word): GitHub URL at the top (plus live URL if deployed), architecture and why, data model, main flows, how the AI part works, UI/design decisions and key screens, what was cut and what is next. Label every assumption.
2. **`deployment.md`**: how to run locally step by step, how it is deployed plus env var NAMES only, and demo login details for the reviewer.

Rules: use only the brief's information; keep the commit history; no secrets or real personal data in the repo; keep the repo public until review ends; work alone (AI tools allowed, the human owns the judgement). Deadline: 7 days from when the step opened (opening time not known). Scoring: quality of work 50%, problem solving 30%, communication 20%. Must have: working main flows on realistic seed data with no dead buttons, frontend + backend + database + sign-in with roles, AI that works and handles being wrong or unsure, polished UI that works on a phone with loading/empty/error states, tests for important logic, basic security.

## 2. Where things are (verified 2026-11-03)
- Folder: `/Users/nishantdahiya/Documents/iso` (this is now the only working copy; the old `.claude/worktrees/*` folders are gone).
- Branch: `feat/kochi-tours-core`, tracked on origin `https://github.com/Nishannt-X/Iso.git` (public repo URL for the TDD: `https://github.com/Nishannt-X/Iso`; confirm it is public).
- `main` is protected by our rules: never commit to it, merge only by PR with the human's approval.
- Uncommitted edit that is NOT ours to touch without asking: `src/db/seed.ts` (3 lines). Find out whether the human made it on purpose before committing or discarding it.
- Commands (AGENTS.md section 0): setup `npm ci` · run `npm run dev` · test `npm test` · lint `npm run lint` · typecheck `npm run typecheck` · build `npm run build` · reset DB `npm run db:reset`. Node >= 22.13.
- Last full gate I ran (on commit `743fa0d`): typecheck clean, lint clean, 348/348 tests pass. Since then the human merged the editorial landing page (`269415f`) and a gitignore change (`e81b274`); the gate has NOT been re-run on those. Re-run it first.
- Local demo servers may be running on ports 3000, 3102, 3103. Staff demo login: `admin@staff.example.invalid` (also `consultant1@`, `consultant2@`, `editor@` at the same domain); password is whatever `DEMO_STAFF_PASSWORD` was set to when `npm run db:reset` ran (`demo-staff-password` is allowed only on localhost). A fresh DB for a clean demo: `DB_PATH=/tmp/x.db DEMO_STAFF_PASSWORD=demo-staff-password npm run db:reset`, then start with the same `DB_PATH`.

## 3. What the product is, and what is built
Stack: TypeScript, Hono with JSX server rendering, SQLite via `node:sqlite`, zod, `node:test`. No client framework, no new npm dependency without the human's approval.

Built and tested:
- Public site: home, package search, package detail (itinerary, seasonal per-person prices, photos, map links), destination pages, journal, sitemap, robots, 404.
- Enquiry flow: `/enquire?package=<slug>` form, immutable stored enquiry, instant fixed-template acknowledgement (mock outbox, nothing is sent), unguessable status link, honeypot, rate limits, WhatsApp consent text (draft).
- Staff area (`/staff`): login with roles (admin, consultant/agent, editor), sessions, CSRF, shared inbox, enquiry workspace (assign, status, notes, reply drafts), audit log, manual intake for mocked email/chat/WhatsApp/phone enquiries.
- Package CMS: drafts, preview, version history, duplication, scheduled publishing, photo and hotel fields. Journal CMS with related packages.
- AI step: Gemini extraction of enquiry fields plus 3 package suggestions, with a visible local-rules fallback when `GEMINI_API_KEY` is unset; a human corrects and accepts before anything is used; no model-produced prices. The live Gemini path has NOT been verified (needs the human's key).
- Quotes: approved price snapshot, shareable link, PDF.
- Legacy redirects: `REDIRECTS_FILE` (JSON old path to new path), validated at startup, 301 for GET/HEAD; example file `docs/legacy-redirects.example.json`; checker `npx tsx scripts/check-redirects.ts <file>`. The client's real 140 URLs were not supplied, so only a synthetic example exists.

## 4. NOT done (the real remaining work), in suggested order
1. **The enquiry page does not look the way the human wants.** They said it looks unchanged and plain and asked for it to be rebuilt after analysing a reference website and building the components that site has. **They have not yet sent the reference site (link or screenshot). Ask for it before designing.** Rebuild only that page (`src/web/enquiry-pages.tsx`, `src/web/enquiry-routes.tsx`, styles); keep the validation, consent, anti-spam and server-side behaviour and their tests intact.
2. **S8 polish:** states, phone and accessibility pass, performance (target under 2.5 s on 4G, not yet measured on 4G), screenshots. Show the human screenshots as you go; they were frustrated by long stretches with nothing visible.
3. **S9 submission:** TDD (PDF or Word, GitHub URL first), `deployment.md` (do not put the reviewer password for a public deploy in the repo; the human supplies it), Dockerfile. **The human said "not deployment yet": do not write deployment artifacts or deploy until they say so.** Deploying is human-only anyway.
4. Update `docs/PROJECT_BRIEF.md` slice status and `docs/DECISIONS.md` as you go.

## 5. Files to read (in this order)
Project truth:
1. `AGENTS.md` (same as `CLAUDE.md`): the operating rules that bind every agent.
2. `docs/PROJECT_BRIEF.md`: scope, assumptions A1..A20, milestones, risks.
3. `docs/CLIENT_BRIEF.md`: the client's brief, verbatim.
4. `docs/DECISIONS.md`: why things are the way they are.
5. `PRODUCT.md`: users, positioning and constraints (written for the design skills).
6. `docs/DESIGN_DECISIONS.md`, `docs/DESIGN_WORKFLOW.md`, `.impeccable/surfaces/src-web-pages-tsx.md`: design system and past design checks.
7. `README.md`: routes, env var names, staff accounts, data.

Agent process (the "Streamliner" kit, copied into `.streamliner/`):
- `.streamliner/rules/00-principles.md` through `05-quality.md`: principles, repo structure, workflow, git, safety, quality gate.
- `.streamliner/roles/ROSTER.md` (model routing), `CHARTERS.md` (what each role may do), `handoff-protocol.md` (packet formats).
- `.streamliner/rubric/agent-rubric.md`: self-score before commit/push; any hard fail blocks.
- `.streamliner/templates/` (task brief, decision entry, PR template), `.streamliner/ponytail_rules.md`, `.streamliner/research/SOURCES.md`.
- `.github/pull_request_template.md`.

## 6. Skills and sub-agents in use
Skills (project-level, in `.claude/skills/`):
- **impeccable**: UX/UI design, critique, polish, hardening, responsive behaviour, UX copy. Use for the enquiry page rebuild and the S8 pass. It reads `PRODUCT.md`.
- **emil-design-eng**: UI polish, component details, animation decisions.
- **taste**: reverse-engineers a reference website's design (colours, type, spacing, components) from a URL. **Use this on the reference site the human provides**, then build from its output.
- **karpathy-guidelines** (`.streamliner/karpathy-guidelines/SKILL.md`): think before coding, simplicity, surgical changes, goal-driven.
Harness skills worth using: `code-review` (diff review), `simplify`, `run` (launch the app and check a change in the real app), `security-review`.
Project sub-agents (`.claude/agents/`): `builder`, `haiku-implementer`, `debugger`, `test-runner`, `security-griller`.

## 7. Model routing the human wants (matches `ROSTER.md`; follow it)
- **Builder and orchestrator: Claude Sonnet 5.5** (`claude-sonnet-5-5`). It owns the branch and commits.
- **Haiku** (`claude-haiku-5-5`): bounded labour that needs no context or judgement (running tests, scripted checks, mechanical edits in assigned files). Never commits.
- **Opus** (`claude-opus-5-5`, medium effort): very rarely, only for a hard bug or a big improvement Sonnet cannot solve (ROSTER section 4).
- **GPT Sol** (`gpt-6-sol`, provider `codex`): **reviewer only**, never the builder. Judges must not share a model family with the author.
- **Gemini Flash High**: scouting, plan/break-it grilling, docs scribe.
- Reality so far: GPT Sol built about 44 of the 46 early commits (runs 2 to 43), Gemini Flash did the redirect module, Claude took over from run 44. That is the opposite of the plan above; correct course. Use T3 `delegate_task` (call `orchestrator_capabilities` first for live model IDs) for cross-provider roles.

## 8. Hard rules that matter in practice
- Never commit to `main`; branches named `type/short-desc`; Conventional Commits; stage explicit paths only (`git add -- path`); never `git add -A`, force-push, `--no-verify`, `reset --hard`, or edit git config. The guard hook checks the branch before the command runs, so switch branches in a separate call before committing.
- Ask first for: new dependencies, schema changes, deploying or publishing, anything touching credentials. Never read, print or commit `.env*` or keys; the Gemini key is set privately by the human.
- Honest reporting in the AGENTS.md section 7 format. Say what was not verified.
- Do not invent facts the brief does not give (GST rate, child fares, hotel names, ratings). Mark assumptions.

## 9. Lessons from the last session
- The human judges by what they can see in the browser. Prefer visible progress, show screenshots, and explain in plain language.
- Do not claim work that other models did. Attribute honestly.
- Commits do not record which model wrote them; the T3 run log does.
