# Kochi Tours (Company A, Problem 2)

Package catalogue with seasonal pricing, versioned package content for staff, and AI-assisted enquiry triage with human-approved replies. Built in slices; see `docs/PROJECT_BRIEF.md` for scope, assumptions and status, and `docs/DECISIONS.md` for why.

**Status:** slices S0 and S1 only (catalogue, pricing engine, versioning, seed, `GET /` and `GET /healthz`). The enquiry form, staff screens and AI triage are not built yet.

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
All data is synthetic. Only the PKG-KL-07 peak price is a fact from the client brief; every other price and all itinerary text are labelled placeholders. No GST, child or single-supplement rate is assumed: quotes that need them are reported as `partial`.
