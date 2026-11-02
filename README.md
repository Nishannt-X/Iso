# Kochi Tours (Company A, Problem 2)

Package catalogue with seasonal pricing, versioned package content for staff, and AI-assisted enquiry triage with human-approved replies. Built in slices; see `docs/PROJECT_BRIEF.md` for scope, assumptions and status, and `docs/DECISIONS.md` for why.

**Status:** the public catalogue, enquiry flow, staff inbox, package CMS, journal CMS, quote builder, mock external-channel intake, and AI-assisted analysis are implemented. Package and article edits stay private until an admin publishes them; a ready package draft can be scheduled for automatic publication. The staff workspace can analyse an enquiry with Google Gemini API when configured, or visibly use local extraction rules, then a consultant corrects and accepts the proposal before editing and approving a mock reply. A quote saves the package price version, needs staff approval, and then offers a shareable link and PDF. No message is actually sent.

## Quickstart
Requires Node `>=22.13` (see `.nvmrc`).

```bash
npm ci
npm run db:reset   # creates data/kochi-tours.db with synthetic demo data
npm run dev        # http://localhost:3000
npm test
```

`node:sqlite` is experimental in Node 22 and prints a one-line warning; that is expected.

## Routes
`/` home · `/packages` published-package search · `/packages/:slug` package detail · `/journal` and `/journal/:slug` published articles · `GET /enquire?package=<slug>` the enquiry form for a live package, `POST /enquire` to send it · `/enquiry/received/:token` acknowledgement and status (reached only by the unguessable link; noindex) · `/quote/:token` approved shareable quote and `/quote/:token/download` PDF · `/staff/login` staff sign-in · `/staff/inbox` shared triage queue · `/staff/intake/new` manually log mocked email, chat, WhatsApp or phone enquiries · `/staff/enquiries/:id` enquiry workspace with Analysis and quote entry · `/staff/quotes/:id` approval and mock delivery · `/staff/packages` admin package CMS, including private duplication · `/staff/blogs` editor/admin article drafts, preview and publication · `/staff/activity` admin audit log · `/sitemap.xml` · `/robots.txt` · `/healthz` · `/assets/*` photos and font. A trailing slash redirects (301) to the clean URL; unknown paths and unpublished packages return a 404 page.

## Staff accounts
The four demo staff accounts (one admin, two consultants, one content editor) use synthetic identities on the reserved `.invalid` domain:
- `admin@staff.example.invalid` (Role: Admin)
- `consultant1@staff.example.invalid` (Role: Consultant)
- `consultant2@staff.example.invalid` (Role: Consultant)
- `editor@staff.example.invalid` (Role: Content editor)

By default, `npm run db:reset` seeds these accounts with login disabled (`active = 0`, `password_hash = 'LOGIN-DISABLED'`) so that fresh or public instances never expose enquiry data through a known default credential. To enable staff login in development or review, set `DEMO_STAFF_PASSWORD` (12–256 characters) in `.env` or your environment before running `npm run db:reset`:
```bash
DEMO_STAFF_PASSWORD="your-strong-password" npm run db:reset
```
On public site URLs (non-localhost), the known demo password (`demo-staff-password`) is explicitly forbidden; a non-default password is required.

## Environment variables (names only; set them in your own shell or a git-ignored `.env`)
| Name | Used | Purpose |
|---|---|---|
| `PORT` | now | HTTP port, default 3000 |
| `DB_PATH` | now | SQLite file, default `data/kochi-tours.db` |
| `SITE_URL` | now | Public origin for canonical links, `sitemap.xml` and `robots.txt`; default `http://localhost:$PORT` |
| `TRUST_PROXY` | now | Set to `1` only behind exactly one trusted reverse proxy; the enquiry rate limits then use the last `X-Forwarded-For` entry. Default off |
| `GEMINI_API_KEY` | now | Live Google Gemini API extraction. Set privately; never commit or paste it. Without it, the UI labels the local rules fallback |
| `DEMO_STAFF_PASSWORD` | now | Password for the four synthetic demo staff accounts. When unset during `npm run db:reset`, accounts are created inactive with login disabled, eliminating default credentials. Required before public use (must be non-default) |

## Scripts
`dev`, `build`, `start`, `test`, `lint`, `typecheck`, `db:reset`.

## Data
The two sample packages come from the client brief (`docs/CLIENT_BRIEF.md`): PKG-KL-07 (published, Peak ₹32,500, Monsoon ₹24,900) and PKG-SI-12 (draft, All year ₹18,750). Season day boundaries, `nights`, itineraries and the five `SYN-*` packages are assumed or synthetic and labelled so in the data. No GST, child or single-supplement rate is assumed: quotes that need them are reported as `partial`. The seed also adds the brief's sample enquiry (synthetic contact, labelled `seed_sample`) and one synthetic editorial article. The database schema is version 8; starting the server migrates a version 3–7 database without deleting it.
