# Agent Roster & Model Routing

Applies to **every** agent regardless of vendor. Know your role; stay in your lane; hand off with a packet (`handoff-protocol.md`).
Roles are provider-neutral. Models are assigned in the **Model Registry** below — the only place to edit when a model changes.

## 1. Model Registry (edit here only)
IDs verified against the live T3 Code catalog on 2026-11-02. Effort = reasoning setting.

| Alias | Provider instance | Model ID | Default effort | Notes |
|-------|------------------|----------|----------------|-------|
| `SOL` | `codex` | `gpt-6-sol` | high | "GPT Sol". `gpt-5.6-sol` is the fallback if 6 is unavailable |
| `HAIKU` | `claudeAgent` | `claude-haiku-5-5` | low | Cheap labor. Never writes code |
| `SONNET` | `claudeAgent` | `claude-sonnet-5-5` | high | Default builder + orchestrator |
| `OPUS` | `claudeAgent` | `claude-opus-5-5` | high (xhigh for hard bugs) | Expensive; gated (see §4) |
| `FLASH` | `antigravity` | `gemini-3.8-flash-high` | (baked in) | Gemini: fast, wide-context scouting + second opinions |

Fallback rule: if an alias is unavailable, use the nearest same-tier model, record the substitution in the handoff packet. Never silently skip a role.
Principle: **author and judge come from different model families** (Claude builds → SOL/Gemini judge) to avoid shared blind spots.

## 2. Roster

| # | Role | Model | Purpose | May edit code? | May commit/push? |
|---|------|-------|---------|----------------|------------------|
| 1 | **Orchestrator** | SONNET | Reads brief, plans, routes work, enforces gates, writes final report, talks to the human | No (delegates) | No |
| 2 | **Scout** *(added)* | FLASH | Repo mapping, finding files/callers, log & CI triage, summarizing long docs/diffs | No | No |
| 3 | **Researcher** | SOL | External/domain research, library & API comparisons, prior art, feasibility; cites sources | No | No |
| 4 | **Architect** *(added)* | OPUS | Only for large/risky/cross-cutting design: module boundaries, data model, contracts. Else Orchestrator plans | No | No |
| 5 | **Plan Griller** | FLASH | Attacks the plan *before* code: missing requirements, wrong assumptions, simpler alternatives, scope creep | No | No |
| 6 | **Builder** | SONNET | Implements features, amends, additions, tests-with-code; owns the branch | **Yes** | **Yes** (feature branch only) |
| 7 | **Debugger / Fixer** | OPUS | Hard bugs only: root-cause analysis + fix when Builder is stuck or bug is subtle (see §4) | Yes | Yes (same rules) |
| 8 | **Test Runner** | HAIKU | Runs the given test/lint/typecheck/build scripts and reports results verbatim. Pure labor | **No** | **No** |
| 9 | **Break-it Griller** | FLASH | Adversarial QA: invents hostile inputs, edge cases, race/failure scenarios; writes them as test cases in `docs/reviews/` for Test Runner to run | No (cases only) | No |
| 10 | **Reviewer** | SOL | Line-by-line diff review vs. brief + rubric; correctness, simplicity, scope; issues P0–P3 + score | No | No |
| 11 | **Security Griller** | OPUS | Threat-model & exploit-minded review. **Only** when triggers hit (§4) | No | No |
| 12 | **Docs & Release Scribe** *(added)* | FLASH | README/docs updates, changelog, PR description from the diff; Builder/Reviewer verify | Docs only | No (Builder commits) |
| 13 | **Human Gatekeeper** | you | Approves plan if risky, approves merge, owns secrets/prod/deploy | — | Merges PRs |

Optional (add when the project needs them): **Dependency Auditor** (HAIKU runs `audit` scripts, SOL judges findings), **Perf Griller** (FLASH, measured benchmarks only), **Data/Migration Reviewer** (OPUS).

## 3. Pipeline (default)
```
Human brief
 → Orchestrator: restate, plan (verify check per step), size the task
 → [Scout (FLASH)]  map repo, callers, conventions                      (if unfamiliar code)
 → [Researcher (SOL)] facts, libs, prior art                           (if external knowledge needed)
 → [Architect (OPUS)] design                                           (only if large/risky)
 → Plan Griller (FLASH) → plan v2                                       (skip for trivial)
 → Builder (SONNET): branch, implement in small steps, commit atomically
 → Test Runner (HAIKU): run scripts → verbatim results
      ├─ fail → Builder fixes (2 failed attempts → Debugger/OPUS)
 → Break-it Griller (FLASH): hostile cases → Test Runner runs them → Builder fixes real failures
 → Reviewer (SOL): diff review + rubric score
 → [Security Griller (OPUS)]                                            (if triggers hit)
 → Builder applies P0/P1 fixes → Test Runner → Reviewer re-check (max 3 review rounds, then escalate to human)
 → Scribe (FLASH): docs/changelog/PR text → Builder commits
 → Builder pushes feature branch + opens PR
 → Orchestrator final report (AGENTS.md §7) → Human merges
```
Trivial task (typo, one-liner): Builder → Test Runner → Orchestrator report. Skip grillers/reviewer unless the diff touches a trigger in §4.
Normal task: Builder → Test Runner → Reviewer. Add Plan Griller if >3 files or unclear spec.

## 4. Routing rules

### Escalate Sonnet → Opus (all must be deliberate, state the reason in the packet)
- Same error/test failing after **2 distinct fix attempts**
- Root cause unclear after reading code (heisenbug, concurrency, race, memory, flaky test)
- Data-loss, migration, auth/permissions, payments, crypto, or other high-blast-radius logic
- Cross-cutting redesign touching many modules / public contracts
- Reviewer returns a P0 the Builder can't resolve
- Human says "this is important"
Do **not** use Opus for: routine features, CRUD, formatting, renames, test writing, docs, running scripts.

### Security Griller triggers (any)
Touches authN/authZ, sessions, secrets, crypto, payments, file upload, deserialization, shell/SQL/template construction, user-supplied URLs/paths, CORS/CSP, new network endpoints, dependency additions, CI/deploy config.

### Test Runner (HAIKU) contract
- Runs only commands handed to it (or those in AGENTS.md §0). **Never edits files, never fixes, never commits.**
- Output: command, exit code, pass/fail counts, first failing assertion + stack (trimmed), full log path. No speculation about causes beyond one line "suspected area".
- If a command isn't given or fails to start: report, don't improvise.

### Use cheap/fast first
Scout and Test Runner before expensive reads. Haiku/Flash for volume; SOL/Opus for judgment. Don't re-run the whole pipeline after trivial edits; re-run only affected gates.

### Independence rules
- Reviewer ≠ Builder's model family. Grillers ≠ the agent that produced the thing they grill.
- Reviewers/grillers are **read-only**: they report; the Builder fixes. This avoids silent edits and keeps one owner per branch.
- One Builder per branch/worktree. Parallel builders only on disjoint files and separate branches.

## 5. Permission matrix (hard)
| Action | Builder | Debugger | Orchestrator | Test Runner | Reviewer/Grillers/Researcher/Scout/Architect | Scribe |
|--------|:------:|:--------:|:------------:|:-----------:|:---------------------------------------------:|:------:|
| Edit source/tests | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit docs | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Run tests/lint/build | ✅ | ✅ | ✅ | ✅ | ✅ read-only runs | ❌ |
| git commit | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| git push (feature branch) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Open PR | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Merge / deploy | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ → **Human only** |
| Write findings files (`docs/reviews/*`, handoff packets) | ✅ | ✅ | ✅ | ✅ (results) | ✅ | ✅ |
A role violation is a **hard fail (H9)** in the rubric.

## 6. How to invoke (pick what your tool supports)
- **T3 Code:** `delegate_task` with `providerInstanceId` + `model` from the registry (cross-provider supported). Use a distinct `clientRequestId` per round; pass the handoff packet as the task prompt.
- **Claude Code native subagents:** `.claude/agents/*.md` (installed from `templates/claude-agents/`) — `test-runner` (haiku), `builder` (sonnet), `debugger` (opus), `security-griller` (opus).
- **Other tools (Codex, Gemini, Cursor…):** start a session with the role charter from `CHARTERS.md` pasted/attached as the first message plus the handoff packet; use the registry model.
- **Single-agent fallback:** if only one model is available, one agent plays roles *sequentially*, writing each role's output in a separate block and re-reading the diff "as the reviewer" in a fresh context where possible. State this in the report; it is weaker than independent review.
