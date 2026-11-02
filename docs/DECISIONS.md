## 2026-11-02 · S4 staff area: authentication, sessions, CSRF, triage inbox, workspace, and audit trail
- **Status:** accepted
- **Context:** S4 requires a staff back-office for Company A: authentication, session handling, role checks, inbox triage, enquiry workspace, internal notes, mock replies, and audit logging with personal data protection.
- **Options considered:** A) Use third-party session/auth libraries; B) Leverage existing domain/db layer with Node stdlib crypto (scrypt, timingSafeEqual, sha256), server-rendered Hono JSX, hardened session cookies, and database-backed audit logging; C) Insecure plain-text authentication.
- **Decision:** Option B. Minimal dependencies and strict adherence to project principles:
  1. **Authentication & Passwords:** Node stdlib crypto scrypt with cost parameters, timing-safe equality checks, and generic error responses for non-existent accounts and bad passwords to prevent email enumeration. Failed attempts are rate-limited per client IP and per email.
  2. **Sessions & Cookies:** Session tokens stored as SHA-256 hashes in `staff_sessions`; cookie sent with `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` (with `__Host-` prefix on HTTPS). Sessions expire after 12 hours absolute or 2 hours idle.
  3. **CSRF & Origin Protection:** Every state-changing staff POST requires a session CSRF token and a verified same-site `Origin` header.
  4. **Roles & Permissions:** `admin` and `agent` (consultant). Admins can assign to anyone and view the activity log; consultants can only self-assign or unassign their own enquiries, with 403 on restricted actions.
  5. **Optimistic Concurrency:** `lock_version` checked on every workspace mutation to prevent concurrent consultant overwrite conflicts.
  6. **Data Protection:** The audit trail (`audit_log`) records IDs, statuses, and counts only—never traveller personal data, message bodies, or internal notes.
  7. **Mock Reply Outbox:** Replies are recorded in `outbox_messages` with status `mock_recorded`, clearly labelled with banners that no real message is sent.
- **Consequences:** All staff workflows are fully functional and verifiable without external mail/SMS/WhatsApp transports. Crawlers are excluded via `Disallow: /staff/` in `robots.txt` and `noindex` headers.
- **Decided by:** agent (Builder) · **Related:** S4 commits on `feat/kochi-tours-core`

# Decisions (newest first)

## 2026-11-02 · S3 enquiry flow: immutable record, mock outbox, opaque status link, spam and duplicate handling
- **Status:** accepted
- **Context:** S3 replaces the `/enquire` placeholder with a working public enquiry flow. The brief asks for an instant fixed-template acknowledgement, WhatsApp consent, DPDP-aware handling of traveller data and the original message beside AI output later. It gives no privacy wording, retention period, reply-time promise or rate limits.
- **Options considered:** A) one mutable `enquiries` row that later slices update; B) an immutable submission row, with workflow and AI output in later tables; C) store the status token hashed; D) store it plain; E) a client-side script for double-submit and validation; F) a server-issued idempotency key.
- **Decision:**
  1. **B.** `enquiries` rejects every UPDATE by trigger, so the traveller's words are always available to compare with AI extraction (S5). S4 workflow state (status, assignment, notes) and S5 extractions go in their own tables that reference `enquiries.id`. DELETE stays possible so a future DPDP erasure procedure is not blocked; none is built.
  2. **Mock outbox only.** `outbox_messages.delivery` has `CHECK (delivery = 'mock_recorded')`; no transport code exists. Channel: email if given, else WhatsApp only with consent, else SMS. The template (`ack-1`) holds only the package title and a random reference: no name, price, date or reply-time promise, so the public page can show it verbatim.
  3. **D, plain 192-bit random token** in `/enquiry/received/:token` (32 chars, `crypto.randomBytes`). It is stored plain because a repeated submission must be redirected back to the same link, and anyone with database read access already holds the personal data. The page selects no name, email, phone, message or party size, so a leaked link reveals only the package, reference and fixed text. Bad tokens and unknown tokens return the same 404. The page is noindex (meta and `X-Robots-Tag`), `no-store`, `Referrer-Policy: no-referrer`, and its metadata omits the tokenised URL. A separate random 8-character reference is shown for quoting on the phone; it is not an access key.
  4. **F + content check.** Each form render carries a random submission key; the same key returns the first enquiry. An identical resend from a fresh form inside 10 minutes (same package, same normalised fields) also returns the first enquiry. Both run inside the `BEGIN IMMEDIATE` transaction that writes the enquiry and its acknowledgement together.
  5. **Spam.** A hidden honeypot field (a filled one shows the normal thanks and stores nothing); per-client attempt limit (20 per 10 minutes, counting invalid posts); per-client (5 per hour) and global (300 per hour) limits on new enquiries; a 64 KB body cap. Accepted duplicates never count against or fail the limits. Counters are in memory and bounded (5,000 keys), per process. Client = socket peer, or the last `X-Forwarded-For` entry only when `TRUST_PROXY=1` (exactly one trusted proxy). These numbers are this build's choices, not the brief's.
  6. **Cross-site.** No cookies or sessions exist for travellers, so there is no login to ride. `POST /enquire` still requires `Origin` equal to `SITE_URL` or the `Host` in use; with no `Origin`, `Sec-Fetch-Site` must be `same-origin` or `none`; a client sending neither (not a browser) is left to the rate limits. The site-wide `Referrer-Policy` changes from Hono's `no-referrer` to `same-origin`, because under `no-referrer` Chromium sends `Origin: null` and every real submit was refused (found in a browser check; the `app.request` tests had set `Origin` by hand). The status page alone stays `no-referrer`.
  7. **No script (E rejected).** The CSP has no inline script, so validation is server-side with native `required` and input types as a first line, an error summary that takes focus, per-field messages tied by `aria-describedby`, and values put back in the form (escaped by JSX). A ticked WhatsApp box stays ticked after an error because the traveller chose it; it is never ticked by default.
  8. **Consent and privacy text** are constants in `src/domain/notices.ts`. The notice version and, when consent is given, the exact consent wording and time are stored with the enquiry. The notice is a **draft**: it states purpose and who sees the data, labels itself a draft, and invents no retention period, contact or legal conclusion. Company A must approve it before launch. When S5 sends message text to a live AI provider, the notice must disclose that.
  9. **Form fields (assumptions).** Required: name, adults, children, and an email or a phone. Optional: start date (India date, today to two years ahead; the month can go in the message), children's ages (must match the child count), destination (prefilled from the package), budget with a total/per-person basis, message (2,000 characters, kept verbatim, never truncated). Party and budget bounds (50 adults, 20 children, ₹1,000 to ₹99.9 crore) are abuse limits, not business rules. No GST, child fare or total is computed or shown on the form.
  10. **Seed.** The brief's sample enquiry is seeded verbatim against PKG-KL-07 as `origin = 'seed_sample'`, with a synthetic `.invalid` contact. Only the form-required fields (2 adults, 1 child) are structured; budget, destination and dates stay in the message so S5 has something to extract and none is invented.
- **Consequences:** Schema version is 2: an older database must be rebuilt with `npm run db:reset` (the server refuses to start on one). The rate limiter does not survive restarts or several instances. A package unpublished between form load and submit gives a 404 and keeps nothing. The enquiry records the version live at submit time, not at page load. Staff erasure/correction, the inbox (S4) and AI (S5) are not started.
- **Decided by:** agent (Builder), within the owner's S3 brief · **Related:** S3 commits on `feat/kochi-tours-core`

## 2026-11-02 · S2 public site: placeholder photos, self-hosted font, SITE_URL, enquiry placeholder
- **Status:** accepted
- **Context:** S2 needs a polished public list and package page with full-width photography, seasonal prices and an Enquire button, before the enquiry form (S3) exists. The brief gives no photographs, hotel names, GST rate or map data.
- **Options considered:** A) stock photos by URL; B) Creative Commons photos from Wikimedia Commons, resized and committed with provenance; C) grey placeholders; D) a CSS-only or npm font package.
- **Decision:** B for photos (`src/public/images`, provenance in `src/domain/photos.ts`, credit shown beside each use). Hanken Grotesk woff2 files are committed as assets, not an npm dependency (OFL). The font and photos are served by a small allow-listed route, not a static-file middleware. No new npm dependency was added: `hono/compress`, `hono/secure-headers` and `hono/trailing-slash` ship with the installed Hono. A `SITE_URL` env var (default `http://localhost:$PORT`) feeds canonical links, `sitemap.xml` and `robots.txt`; it is not derived from the Host header. The Enquire button targets `GET /enquire?package=<slug>`, a noindex placeholder that says the form is not live; S3 replaces it. GST is shown as "pending" everywhere; the public site never computes or implies a rate. Hotels are shown as a star category only because no hotel names exist. The map, search, blog and redirects from 140 old URLs are deferred (see `PROJECT_BRIEF.md`).
- **Consequences:** Company A must supply licensed photos before launch. The photo-to-package mapping lives in code until the package editor (S6). The build script now also copies `src/public` to `dist/public`. Seed summaries keep their `[Synthetic demo content]` marker; pages strip it and show a visible label instead. The 500 test no longer matches the word "select" because the page now carries a stylesheet; it checks for specific internal markers instead.
- **Decided by:** agent (Builder) · **Related:** S2 commits on `feat/kochi-tours-core`, `docs/DESIGN_DECISIONS.md`

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

