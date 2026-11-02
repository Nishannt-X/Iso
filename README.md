# Kochi Tours (Company A, Problem 2)

Package catalogue with seasonal pricing, versioned package content for staff, and AI-assisted enquiry triage with human-approved replies. Built in slices; see `docs/PROJECT_BRIEF.md` for scope, assumptions and status, and `docs/DECISIONS.md` for why.

**Status:** slices S0 to S4: catalogue, pricing engine, versioning, seed, the public site (home/list, package detail, sitemap, robots, 404) and the enquiry flow (form, mock acknowledgement, public status page). Staff area (/staff/login, /staff/inbox, enquiry workspace, internal notes, mock reply outbox, admin activity log) is complete. AI triage (S5) and package CMS (S6) are not built yet. No message is ever actually sent.

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
`/` home and package list · `/packages/:slug` package detail · `GET /enquire?package=<slug>` the enquiry form for a live package, `POST /enquire` to send it · `/enquiry/received/:token` acknowledgement and status (reached only by the unguessable link; noindex) · `/staff/login` staff sign-in · `/staff/inbox` triage queue · `/staff/enquiries/:id` enquiry workspace · `/staff/activity` admin audit log · `/sitemap.xml` · `/robots.txt` · `/healthz` · `/assets/*` photos and font. A trailing slash redirects (301) to the clean URL; unknown paths and unpublished packages return a 404 page.

## Environment variables (names only; set them in your own shell or a git-ignored `.env`)
| Name | Used | Purpose |
|---|---|---|
| `PORT` | now | HTTP port, default 3000 |
| `DB_PATH` | now | SQLite file, default `data/kochi-tours.db` |
| `SITE_URL` | now | Public origin for canonical links, `sitemap.xml` and `robots.txt`; default `http://localhost:$PORT` |
| `TRUST_PROXY` | now | Set to `1` only behind exactly one trusted reverse proxy; the enquiry rate limits then use the last `X-Forwarded-For` entry. Default off |
| `ANTHROPIC_API_KEY` | S5 | Live AI extraction. Set privately; never commit or paste it |
| `AI_PROVIDER` | S5 | `anthropic` (default when a key is set) or `rules` |
| `AI_MODEL` | S5 | Overrides the default extraction model |
| `SESSION_SECRET` | S4 | Signs staff sessions |

## Scripts
`dev`, `build`, `start`, `test`, `lint`, `typecheck`, `db:reset`.

## Data
The two sample packages come from the client brief (`docs/CLIENT_BRIEF.md`): PKG-KL-07 (published, Peak ₹32,500, Monsoon ₹24,900) and PKG-SI-12 (draft, All year ₹18,750). Season day boundaries, `nights`, itineraries and the five `SYN-*` packages are assumed or synthetic and labelled so in the data. No GST, child or single-supplement rate is assumed: quotes that need them are reported as `partial`. The seed also adds the brief's sample enquiry (synthetic contact, labelled `seed_sample`). The database schema is version 2: after pulling S3, run `npm run db:reset` (it deletes local data).
