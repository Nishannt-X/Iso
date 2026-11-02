# Project Brief

> Source of truth for scope. Agents read this first. Update when scope changes (note why in DECISIONS.md).
> The full client brief is transcribed verbatim in [`docs/CLIENT_BRIEF.md`](CLIENT_BRIEF.md). Check it before touching seed data, pricing, design or enquiry handling. Where this file goes beyond it, the text says so.

- **Name:** Company A Kochi tour operator (Problem 2)
- **One-line purpose:** Let travellers browse tour packages and send an enquiry, and let staff manage package content (versioned) and triage enquiries with AI-assisted, human-approved replies.
- **Users / who benefits:** The brief's CORE BUILD names two roles: traveller and staff admin. The build reads "traveller" as the public visitor (no login) and models staff as `admin` (publish content and manage work), `agent` (triage enquiries) and `editor` (prepare journal drafts). The staff split is this build's assumption, drawn from the brief's consultant and content staff roles.
- **Owner / approver of merges:** Human project owner.

## Goal & success criteria (verifiable)
1. The selected problem statement's CORE BUILD and main flows work end to end on realistic synthetic sample data.
2. The product has a frontend, backend, database, sign-in, and roles (staff only: `admin`, `agent`, `editor`).
3. AI or automation works in practice, including wrong or uncertain outcomes; the UI supports phone layouts and loading, empty, and error states.
4. Important logic has tests, inputs are validated, access is controlled, and no secrets or real personal data are committed.
5. Submission rule relayed by the owner (**not in the client brief**): one ZIP of at most 25 MB containing exactly a TDD (PDF or Word) and `deployment.md`; the TDD begins with the public GitHub URL and includes a live app URL if deployed.

## In scope
The owner expanded scope to the full selected brief after S4. Work remains on `feat/kochi-tours-core`; status is shown below.

| Slice | Content | Status |
|---|---|---|
| S0 | Scope docs, scaffold, `node:sqlite` spike, thin `GET /` | this branch |
| S1 | Schema, triggers, versioned catalogue, seasonal pricing, seed | this branch |
| S2 | Screens 1–2 (home/list, package detail), seasonal price display, photos with provenance, sitemap, robots, 404 | this branch |
| S3 | Screens 3–4 (enquiry form, acknowledgement), consent, honeypot, rate limit, mock outbox, seeded sample enquiry | this branch |
| S4 | Screens 5–6 (staff login, inbox), sessions, CSRF, role checks | this branch |
| S5 | AI extraction (live Google Gemini API, labelled rules fallback), ranking, drafting, price guard, screen 7 | this branch; live path awaits a private key for verification |
| S6 | Screen 8 (package editor, optimistic lock, publish, restore, history, preview) | this branch |
| S7 | Full MUST HAVE depth: destination/search/map, blog CMS, package scheduling/duplication, quote PDF/link, additional enquiry channels and editor role | search, duplication, scheduling, journal CMS, editor role, quote PDF/link and mocked staff intake on this branch; remainder planned |
| S8 | States, phone and accessibility pass, performance, screenshots | planned |
| S9 | TDD, `deployment.md`, DECISIONS, rubric, ZIP | planned |

The 8 screens: 1 Home/list · 2 Package detail · 3 Enquiry form · 4 Acknowledgement (public status link `/enquiry/received/:token`) · 5 Staff login · 6 Inbox · 7 Enquiry workspace · 8 Admin packages.

Deliverables of S0+S1: a running server with `GET /healthz` and `GET /` (a plain list of live packages), the full catalogue schema with database-level invariants, the pricing and season engine, a draft/publish/restore domain layer, and synthetic seed data.

## Non-goals (explicitly out)
- Full breadth of an unselected problem statement.
- Features not justified by the selected problem statement.
- Traveller accounts, CSV import, signed preview links, itinerary diff view. Hindi and German are described as later languages in the brief, so English remains the launch language.
- The 140 historical redirects cannot be populated without the client's old URL list. Build an importable redirect mapping and document this missing input rather than inventing URLs.
- Any mock or replayed LLM at runtime. This is a project decision, not a brief requirement: the brief only says to mock payments, messages and outside systems. The AI path is live or an honestly labelled rules fallback.
- Deploying (human only; the repo only ships a Dockerfile and `deployment.md` in a later slice).

## Assumptions (all labelled in the UI and docs; none are claims from the brief)
The brief is in [`docs/CLIENT_BRIEF.md`](CLIENT_BRIEF.md). Everything in this table is an assumption of the build unless row A1 or the row itself says it comes from the brief.

| ID | Assumption |
|---|---|
| A1 | **Brief facts used (see `CLIENT_BRIEF.md`):** PKG-KL-07 "Munnar, Thekkady and Alleppey houseboat", 6 days, 4-star, published, Peak Oct–Mar ₹32,500 and Monsoon Jun–Sep ₹24,900 per person. PKG-SI-12 "Madurai, Rameswaram and Kanyakumari", 5 days, 3-star, All year ₹18,750 per person, DRAFT. Sample enquiry: "Hi, 2 adults and 1 kid, Kerala 5-6 nights in December, budget around 1.2 lakh total, houseboat a must". |
| A2 | The brief lists prices "per person" and its CONSTRAINTS require prices to state the per-person basis, twin sharing and GST. The build therefore labels every price "per person, twin sharing" (twin sharing as the basis is the brief's requirement; the sample table itself says only "per person"). Prices are whole rupees. The adult fare is the listed rate. |
| A3 | **No GST rate is configured**, because the brief requires GST to be stated but gives no rate and does not say whether the sample prices include it. Public prices read "GST: pending, to be confirmed by Company A". The quote engine applies a rate only if staff set `gst_rate_bp`; GST is rounded half up on the GST line only. |
| A4 | **No child rule is invented** (the brief gives none). With no `child_pct`, the child fare is unpriced and the quote is `partial`. Child ages are recorded, but no age band is applied. |
| A5 | **No single supplement is invented** (the brief gives none). With an odd adult count and no `single_supp_inr`, the quote is `partial` and the figure is a lower bound. |
| A6 | The brief gives the season **months** (Peak Oct–Mar, Monsoon Jun–Sep). The exact day boundaries (Oct 1, Mar 31, Jun 1, Sep 30) are **ASSUMED** and flagged `rangeAssumed`. The brief has no Apr–May price, so those dates return `unavailable`. No shoulder season is invented. |
| A7 | PKG-SI-12's brief season "All year" is stored as 01-01..12-31 with `rangeAssumed` false, since "all year" has no boundary to guess. |
| A8 | Season is decided by start date, or by month when only a month is known. A stay or month spanning seasons is priced at the cheapest covered season as a lower bound, with a reason code. |
| A9 | Travellers do not log in (assumption: the brief's "traveller" role is the public visitor). They follow an unguessable status link. The staff table has no traveller role. |
| A10 | The sample table (A1) is from the brief. `nights` (= days − 1), region labels, all itinerary, summary, inclusion and tag text, and the five `SYN-*` packages are **assumed or synthetic**. Seed rows record this in `packages.data_origin` and `change_note`. |
| A11 | The slug is editable until a package's first publish, then locked. Historical redirects use a separate mapping once the client provides its old URLs. |
| A12 | All sample data is synthetic. No real personal data is stored or committed. |
| A13 | **Enquiry form fields (S3).** The brief names dates, travellers, destination, budget, a message and contact, but not which are required. Required here: name, adults, children, and an email or a phone. Everything else is optional. Limits (50 adults, 20 children, ₹1,000 to ₹99.9 crore, 2,000 characters, a start date within two years) are abuse bounds. The form is reached only from a live package's Enquire button; there is no general enquiry page. |
| A14 | **Acknowledgement.** The brief says a fixed template. This build's text has no name, price, date or reply-time promise (the brief gives no working hours). The channel is email if given, else WhatsApp only with consent, else SMS. Nothing is sent; messages are recorded in a mock outbox and the status page says so. |
| A15 | **Privacy and consent text is a draft** written by this build. The brief says traveller data is personal data under the DPDP Act 2023 and WhatsApp follow-ups need consent, and gives no wording, retention period or contact. Company A must supply or approve them. |
| A16 | **Sample enquiry.** The brief's message is seeded verbatim against PKG-KL-07. The name and `.invalid` email are synthetic. Only adults (2) and children (1), which the form requires, are structured; its budget, destination and "December" are not turned into fields. |
| A17 | **Spam limits** (20 attempts per 10 minutes, 5 enquiries per hour per client, 300 per hour overall) and the 10-minute duplicate window are this build's choices, not the brief's. |
| A18 | **Quote approval and sharing.** The brief asks for a PDF and link but gives no expiry or workflow rule. This build uses a 192-bit bearer link with no expiry and requires a staff review checkbox before sharing. The public quote omits traveller identity. Partial estimates may be approved only with their missing rules conspicuously disclosed; a mock-send action records intent but sends no message. |
| A19 | **External enquiries.** The brief names web, chat, WhatsApp, email and phone, but provides no partner APIs or credentials. Staff manually log synthetic external messages with their source channel. The fixed acknowledgement is recorded in the same mock outbox used by web enquiries; it is never sent. A WhatsApp source does not imply consent to follow up on WhatsApp. |

## Stack & constraints
- Language / framework / runtime: TypeScript on Node 22 (`>=22.13`), Hono with JSX server rendering, SQLite via the built-in `node:sqlite` (experimental in Node 22), `node:test`.
- Package manager: npm; exact versions pinned in `package.json` and `package-lock.json`.
- Hosting / environments: runs locally first; Dockerfile and `deployment.md` in a later slice. Deploying is human-only.
- Performance, security, compliance constraints: Validate inputs, enforce access control, keep secrets and real personal data out of the repository, and keep the repository public through review. The Google Gemini API key is set privately by the human in their own environment; it is never requested in chat, written to a file or committed.
- Budget / deadlines: the client brief says ₹8.5 lakh and 7 weeks. Separately, the owner's assignment allows seven days from when the step opens (relayed, not in the client brief; opening time not provided).

## Commands (keep identical to AGENTS.md §0)
setup: `npm ci` · run: `npm run dev` · test: `npm test` · lint: `npm run lint` · typecheck: `npm run typecheck` · build: `npm run build` · reset local DB: `npm run db:reset`

## Architecture sketch (short)
`src/db` (schema, connection, seed) → `src/domain` (seasons, pricing, package versions, enquiries, notices, rate limiter) → `src/app.tsx` and `src/web/enquiry-routes.tsx` (Hono routes, server-rendered). An enquiry is an immutable row; S4 workflow state and S5 AI output will live in their own tables. The database enforces the version invariants with partial unique indexes and triggers; the domain layer adds validation (`PublishableVersion`), optimistic locking (`lock_version`) and transactions. Pricing is computed server-side only.

## Milestones
| # | Milestone | Done when |
|---|-----------|-----------|
| 1 | Select the problem statement | CORE BUILD and assumptions are recorded (this document). |
| 2 | Design and build the selected brief | Slices S0–S8: main flows, AI behavior, optional depth requested by the owner, and important tests pass. |
| 3 | Package submission | TDD and `deployment.md` are verified inside one ZIP (S9). |

## Risks & open questions
- The privacy and WhatsApp consent text is a draft (A15). The public site must not launch with it unreviewed. When S5 sends enquiry text to a live AI provider, the notice must say so.
- Rate-limit counters are in memory, per process, and reset on restart; behind a reverse proxy set `TRUST_PROXY=1`, otherwise every visitor shares the proxy's address.
- Not verified in S3: other browsers, a screen reader, real 4G timing, tablet widths.
- Photographs are Creative Commons images from Wikimedia Commons used as placeholders (credited on each page). Company A must supply licensed photography before launch.
- The live Gemini path cannot be verified until the human sets `GEMINI_API_KEY` privately. The local fallback and staff approval path have a focused test.
- `node:sqlite` is experimental; `better-sqlite3` is the fallback behind `src/db/db.ts`.
- SQLite needs a persistent volume on any deploy target.
- GitHub URL, deployment target, and exact deadline start time remain to be confirmed.
- The assignment says “Work Alone” and also recommends AI tools. Assumption for workflow only: one human owns the submission and may use AI agents as tools; verify against any further assignment rules.

## Agent autonomy level for this project
- [ ] Ask before every commit  - [ ] Commit freely, ask before push  - [x] Commit + push feature branches, PR needs human approval  - [ ] Other:
