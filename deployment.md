# Deployment & Local Operations Guide

This document details how to run, configure, and deploy the **Company A Kochi Tour Operator** application.

---

## 1. Quick Start: Running Locally Step-by-Step

### Prerequisites
- **Node.js**: version `22.13.0` or higher (required for built-in `node:sqlite`).
- **npm**: version `10.0.0` or higher.
- **Git**

Verify your Node version:
```bash
node -v  # Must print v22.13.0 or higher
```

### Step 1: Clone and Install Dependencies
```bash
git clone https://github.com/Nishannt-X/Iso.git
cd Iso
npm ci
```

### Step 2: Initialize Database and Seed Sample Data
Initialize the SQLite database schema and seed the baseline catalogue (including sample packages PKG-KL-07, PKG-SI-12, theme categories, and synthetic staff demo accounts):
```bash
DEMO_STAFF_PASSWORD=demo-staff-password npm run db:reset
```
*Note: Supplying `DEMO_STAFF_PASSWORD` activates the seeded demo staff accounts with that password. Without it, accounts remain inactive (`LOGIN-DISABLED`) for security.*

### Step 3: Run the Development Server
```bash
DEMO_STAFF_PASSWORD=demo-staff-password npm run dev
```
The server will start listening at:
```
http://localhost:3000
```

### Step 4: Run the Automated Verification Suite
To execute the automated test suites, typecheck, and linter:
```bash
npm run typecheck    # Verifies TypeScript types without emitting
npm run lint         # Runs ESLint across all source and test files
npm test             # Runs all 366 unit, domain, security, and integration tests
```

---

## 2. Reviewer Demo Credentials

The seeded database contains three staff accounts mapped to the operational roles defined in the brief:

| Role | Email Address | Password | Primary Workflow / Access |
|---|---|---|---|
| **Admin** | `admin@staff.example.invalid` | `demo-staff-password` | Enquiry triage, assignment, full Package CMS (versioning, publishing, restoring), Journal CMS, audit activity log |
| **Consultant** | `consultant1@staff.example.invalid` | `demo-staff-password` | Enquiry triage inbox, claim enquiries, internal notes, AI draft review & mock reply |
| **Content Editor** | `editor@staff.example.invalid` | `demo-staff-password` | Journal editorial workspace, draft articles, SEO metadata |

### Direct URLs for Review:
- **Public Website (Traveller View):** `http://localhost:3000/`
- **Package Detail (Interactive Fare Calculator, Route Map, Drawer):** `http://localhost:3000/packages/munnar-thekkady-and-alleppey-houseboat-6-days`
- **Staff Sign-in Portal:** `http://localhost:3000/staff/login`
- **Staff Enquiry Inbox (requires sign-in):** `http://localhost:3000/staff/inbox`
- **Staff Package CMS (requires Admin):** `http://localhost:3000/staff/packages`
- **Health Check & Diagnostics:** `http://localhost:3000/healthz`

---

## 3. Production Deployment & Configuration

### Deployment Architecture
The application runs as a lightweight, zero-dependency Node.js server using Hono and `node:sqlite`. It requires no external database service (like PostgreSQL or Redis) or caching layer; all state lives in a single, ACID-compliant SQLite database file.

### Persistent Storage Requirement
Because SQLite stores all relational data in a file (`kochi-tours.db`), any deployment container (Docker, Fly.io, Railway, AWS ECS) **must mount a persistent volume** at the directory path specified by `DATA_DIR` (default: `./data`).

### Container Deployment with Docker
A production-ready, multi-stage `Dockerfile` is provided in the repository.

1. **Build the container image:**
   ```bash
   docker build -t kochi-tours:latest .
   ```

2. **Run the container with a persistent volume:**
   ```bash
   docker run -d \
     --name kochi-tours-app \
     -p 3000:3000 \
     -v kochi_tours_data:/app/data \
     -e PORT=3000 \
     -e SITE_URL=https://your-domain.example.com \
     -e DATA_DIR=/app/data \
     -e TRUST_PROXY=1 \
     kochi-tours:latest
   ```

---

## 4. Environment Variables Reference

*(Per assessment guidelines, only environment variable names and their purposes are listed; no secrets or tokens are included).*

| Variable Name | Required / Optional | Default Value | Description / Purpose |
|---|---|---|---|
| `PORT` | Optional | `3000` | The TCP port number the HTTP server listens on. |
| `DATA_DIR` | Optional | `./data` | File system path where the SQLite database (`kochi-tours.db`) resides. Must be on persistent storage. |
| `SITE_URL` | Optional | `http://localhost:$PORT` | Canonical public base URL used to generate sitemaps, canonical tags, OpenGraph URLs, and CORS/Origin validation. |
| `TRUST_PROXY` | Optional | `0` (off) | Set to `1` when running behind a reverse proxy (e.g., Cloudflare, NGINX, AWS ALB) to trust the immediate upstream client IP for rate limiting. |
| `DEMO_STAFF_PASSWORD` | Optional | *(None)* | Sets the initial password for seeded demo accounts during database reset. Forbidden on public/production domains unless intended for reviewers. |
| `GEMINI_API_KEY` | Optional | *(None)* | Google Gemini API key used by the AI extraction and triage service. When omitted, the app operates gracefully via its deterministic local rules engine. |

