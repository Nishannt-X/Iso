# Project Brief

> Source of truth for scope. Agents read this first. Update when scope changes (note why in DECISIONS.md).

- **Name:** Client product build (problem statement pending)
- **One-line purpose:** Build a polished, working core slice of the selected client problem statement.
- **Users / who benefits:** To be identified from the selected problem statement.
- **Owner / approver of merges:** Human project owner.

## Goal & success criteria (verifiable)
1. The selected problem statement's CORE BUILD and main flows work end to end on realistic synthetic sample data.
2. The product has a frontend, backend, database, sign-in, and roles if the selected brief has multiple user kinds.
3. AI or automation works in practice, including wrong or uncertain outcomes; the UI supports phone layouts and loading, empty, and error states.
4. Important logic has tests, inputs are validated, access is controlled, and no secrets or real personal data are committed.
5. Submission is one ZIP of at most 25 MB containing exactly a TDD (PDF or Word) and `deployment.md`; the TDD begins with the public GitHub URL and includes a live app URL if deployed.

## In scope
- The selected statement's CORE BUILD and the flows needed to demonstrate it.
- A designed UI, realistic synthetic demo data, functional AI or automation, security basics, and reviewer-ready local setup.
- TDD: architecture and rationale, data model, flows, AI behavior, key screen decisions, cuts and next steps. Label every assumption.
- `deployment.md`: local run steps, deployment method, environment variable names only, and demo login details.

## Non-goals (explicitly out)
- Full breadth of an unselected problem statement; prioritize the core slice.
- Features not justified by the selected problem statement.

## Stack & constraints
- Language / framework / runtime: Pending the selected problem statement and design.
- Package manager: Pending stack choice.
- Hosting / environments: Pending deployment choice; app must be runnable locally.
- Performance, security, compliance constraints: Validate inputs, enforce access control, keep secrets and real personal data out of the repository, and keep the repository public through review.
- Budget / deadlines: Seven days from when the step opens; exact opening time has not been provided.

## Commands (keep identical to AGENTS.md §0)
setup: pending · run: pending · test: pending · lint: pending · typecheck: pending · build: pending

## Architecture sketch (short)
Pending the selected problem statement and stack.

## Milestones
| # | Milestone | Done when |
|---|-----------|-----------|
| 1 | Select the problem statement | CORE BUILD and assumptions are recorded. |
| 2 | Design and build the core slice | Main flows, AI or automation behavior, and important tests pass. |
| 3 | Package submission | TDD and `deployment.md` are verified inside one ZIP. |

## Risks & open questions
- The actual problem statement and its CORE BUILD have not yet been supplied; do not invent client requirements.
- GitHub URL, deployment target, and exact deadline start time remain to be confirmed.
- The assignment says “Work Alone” and also recommends AI tools. Assumption for workflow only: one human owns the submission and may use AI agents as tools; verify against any further assignment rules.

## Agent autonomy level for this project
- [ ] Ask before every commit  - [ ] Commit freely, ask before push  - [x] Commit + push feature branches, PR needs human approval  - [ ] Other:
