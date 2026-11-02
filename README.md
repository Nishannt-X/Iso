# Kochi Tours (Company A, Problem 2)

Package catalogue with seasonal pricing, versioned package content for staff, and AI-assisted enquiry triage with human-approved replies. Built in slices; see `docs/PROJECT_BRIEF.md` for scope, assumptions and status, and `docs/DECISIONS.md` for why.

**Status:** slices S0 to S2: catalogue, pricing engine, versioning, seed, and the public site (home/list, package detail, sitemap, robots, 404). The enquiry form, staff screens and AI triage are not built yet; the Enquire button points at a placeholder until S3.

## Quickstart
Requires Node `>=22.13` (see `.nvmrc`).

```bash
npm ci
npm run db:reset   # creates data/kochi-tours.db with synthetic demo data
npm run dev        # http://localhost:3000
npm test
```

`node:sqlite` is experimental in Node 22 and prints a one-line warning; that is expected.

## Environment variables (names only; set them in your own shell or a git-ignored `.env`)
| Name | Used | Purpose |
|---|---|---|
| `PORT` | now | HTTP port, default 3000 |
| `DB_PATH` | now | SQLite file, default `data/kochi-tours.db` |
| `ANTHROPIC_API_KEY` | S5 | Live AI extraction. Set privately; never commit or paste it |
| `AI_PROVIDER` | S5 | `anthropic` (default when a key is set) or `rules` |
| `AI_MODEL` | S5 | Overrides the default extraction model |
| `SESSION_SECRET` | S4 | Signs staff sessions |

## Scripts
`dev`, `build`, `start`, `test`, `lint`, `typecheck`, `db:reset`.

## Data
The two sample packages come from the client brief (`docs/CLIENT_BRIEF.md`): PKG-KL-07 (published, Peak ₹32,500, Monsoon ₹24,900) and PKG-SI-12 (draft, All year ₹18,750). Season day boundaries, `nights`, itineraries and the five `SYN-*` packages are assumed or synthetic and labelled so in the data. No GST, child or single-supplement rate is assumed: quotes that need them are reported as `partial`.
