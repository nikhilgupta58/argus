# Argus — 12-Week Build Plan

**Solo build, Claude Code + Claude Max, OSS v0.1 ship target.**
Author: Nikhil Kumar Gupta · Status: draft v0.1 · Last updated: May 2026

This is the operating doc — copy issues into GitHub Projects as-is, work top to bottom, stop at the two checkpoints. Everything assumes one engineer (you), ~30 focused hrs/week, Claude Code as the build partner.

---

## How to use this doc

- Each **Phase** = a GitHub milestone.
- Each **Week** = a sprint column on the project board.
- Each `[ ] ISSUE` block = a GitHub issue. Copy the title + body verbatim.
- Labels are at the bottom of each issue: copy them into GitHub.
- `superpowers:*` references are skills you invoke at the start of that issue's session.
- The two **CHECKPOINT** rows are hard stops. Don't blow past them.

---

## Project board setup (do this first, 30 min)

GitHub Projects v2 board with columns:

```
Backlog  →  Ready  →  In Progress  →  In Review  →  Blocked  →  Done
```

Labels:

| Label                | Use                                                        |
|----------------------|------------------------------------------------------------|
| `area:contract`      | Contract DSL, parser, validation                           |
| `area:lineage`       | Signed event log, crypto, verification                     |
| `area:fleet`         | Specialist agent runtime, composition                      |
| `area:marketplace`   | Skill bundles, signing, publisher identity                 |
| `area:cli`           | CLI surface, UX                                            |
| `area:docs`          | Docs site, READMEs, walkthroughs                           |
| `area:infra`         | CI, releases, supply chain, SBOM                           |
| `kind:feature`       | New capability                                             |
| `kind:test`          | Pure testing work                                          |
| `kind:security`      | Security-touching — needs extra review                     |
| `kind:chore`         | Plumbing                                                   |
| `priority:p0`        | MVP-blocking                                               |
| `priority:p1`        | Nice for v0.1                                              |
| `priority:p2`        | v0.2+                                                      |
| `claude-code:auto`   | Safe to dispatch to a Claude Code subagent w/ minimal review |
| `claude-code:review` | Human review required before merge                         |

Custom fields on issues:
- **Estimate**: XS (≤1h) / S (≤4h) / M (≤1d) / L (≤3d) / XL (≥1 week)
- **Sprint**: Week 1 … Week 12

---

## Tech stack (locked decisions)

| Concern               | Pick                                          | Why                                                                   |
|-----------------------|-----------------------------------------------|-----------------------------------------------------------------------|
| Language              | TypeScript (Bun runtime)                      | Plays well w/ MCP, fast iteration, single binary via `bun build`      |
| Storage               | SQLite + WAL                                  | Portable, fast, no infra                                              |
| Signing               | `libsodium` Ed25519 via `@noble/curves`       | Audited, JS-native, no rolling our own                                |
| Content addressing    | BLAKE3 hashes                                 | Faster than SHA-256, well-supported                                   |
| Skill bundles         | tar+zstd, content-addressed by BLAKE3         | Reproducible, signable                                                |
| Supply chain          | Sigstore (`cosign`) for releases              | Industry standard, free                                               |
| MCP integration       | `@modelcontextprotocol/sdk`                   | Day-1 MCP-native                                                      |
| Test framework        | Vitest                                        | Fast, TS-first                                                        |
| Property testing      | `fast-check`                                  | Critical for contract DSL + lineage invariants                        |
| License               | **Apache 2.0**                                | Max adoption; AGPL'd cloud version comes later                        |
| Models @ runtime      | BYO API key (Anthropic, OpenAI, Bedrock)      | Users pay their own inference                                         |

---

# PHASE 0 — Foundation (Week 0, ≤3 days)

**Goal:** Working repo, CI, the first commit feels professional.

### `[ ]` Initialize repo and brand
- Create `argus-agent/argus` GitHub repo, Apache 2.0 license
- Set up branch protection on `main`: require PR, require CI green
- Add `README.md` with the one-paragraph pitch (lift from PRD §01)
- Add `CODE_OF_CONDUCT.md`, `SECURITY.md` (with disclosure email), `CONTRIBUTING.md`
- Add `ARCHITECTURE.md` skeleton (lift the four layers from PRD §06)
- Labels: `area:docs`, `kind:chore`, `priority:p0`, `claude-code:auto`
- **Done when:** Fresh clone passes `bun install && bun test`, README is shareable.

### `[ ]` Set up the build system
- Bun monorepo: `packages/core`, `packages/cli`, `packages/specialists`, `packages/lineage`
- Shared `tsconfig.base.json`, `biome.json` for lint+format
- `package.json` workspace setup
- Labels: `area:infra`, `kind:chore`, `priority:p0`, `claude-code:auto`

### `[ ]` CI pipeline (GitHub Actions)
- Test on PR (Bun + Node 20)
- Lint on PR (Biome)
- Type-check on PR (`tsc --noEmit`)
- SBOM generation on release (Syft)
- Vuln scan on every PR (Trivy)
- Secret scan (GitHub native + Gitleaks)
- Labels: `area:infra`, `kind:security`, `priority:p0`, `claude-code:auto`

### `[ ]` Threat model v0.1
- Write `docs/threat-model.md` — at least 3 named adversaries (malicious skill author, compromised dev machine, supply-chain attacker)
- Map STRIDE for each
- Tie each adversary to a planned mitigation (links forward to phases below)
- Labels: `area:docs`, `kind:security`, `priority:p0`, `claude-code:review`
- **Done when:** You can point at the doc and say "if you exploit X, we catch you via Y."

---

# PHASE 1 — Contract Layer (Weeks 1–3)

**Goal:** A user can write an Outcome Contract, validate it, and persist it.
**This is the foundation — the rest of Argus reads from contracts.**

## Week 1: Contract DSL + parser

### `[ ]` Design the Contract DSL
- TOML-based (humans can read it, diff well in git)
- Required fields: `id`, `owner`, `outcome`, `success_criteria`, `deadline`, `budget`, `escalation`
- Spec lives at `docs/contract-spec.md`
- **Invoke:** `superpowers:brainstorming` before writing any code — explore 3 alternatives before committing
- Labels: `area:contract`, `kind:feature`, `priority:p0`, `claude-code:review`
- Estimate: M

### `[ ]` Implement parser + validator
- Schema in Zod
- `parseContract(toml: string): Result<Contract, ContractError>`
- Property tests via `fast-check` — round-trip, malformed input, edge cases
- **Invoke:** `superpowers:test-driven-development` — write tests first
- Labels: `area:contract`, `kind:feature`, `priority:p0`
- Estimate: M

### `[ ]` Contract examples (3 of them)
- `examples/contracts/outbound-3-demos.toml`
- `examples/contracts/weekly-rev-report.toml`
- `examples/contracts/pr-review-sla.toml`
- Each one must parse + validate
- Labels: `area:contract`, `area:docs`, `kind:feature`, `priority:p0`, `claude-code:auto`
- Estimate: S

## Week 2: Contract storage + versioning

### `[ ]` SQLite-backed contract store
- Schema: `contracts(id, version, parent_version, body_blake3, created_at, owner)`
- All contracts content-addressed
- Append-only — old versions never mutate
- Labels: `area:contract`, `kind:feature`, `priority:p0`
- Estimate: M

### `[ ]` Semantic diff between contract versions
- `diffContracts(a: Contract, b: Contract): SemanticDiff`
- Categorizes changes: success-criteria change, deadline shift, budget change, etc.
- Used by the CLI to render upgrade prompts
- Labels: `area:contract`, `kind:feature`, `priority:p1`
- Estimate: M

## Week 3: CLI surface for contracts

### `[ ]` `argus contract create/edit/validate/show/diff`
- Bun-bundled CLI in `packages/cli`
- Pretty output with `picocolors`, errors w/ source spans
- Labels: `area:cli`, `area:contract`, `kind:feature`, `priority:p0`
- Estimate: L

### `[ ]` End-to-end contract workflow test
- Vitest integration test: create → edit → validate → diff → persist → load
- Runs in CI on every PR
- Labels: `area:contract`, `kind:test`, `priority:p0`
- Estimate: S

### `[ ]` Phase 1 demo recording
- 2-min Loom of the contract workflow
- Pinned in README
- Labels: `area:docs`, `kind:chore`, `priority:p1`, `claude-code:review`
- Estimate: XS

**Phase 1 exit criteria:** A new user can `argus contract create outbound-3-demos.toml`, edit it, validate it, and persist a versioned record. All in &lt; 60 seconds.

---

# PHASE 2 — Lineage Ledger (Weeks 4–6)

**Goal:** Every action Argus takes is signed, content-addressed, replayable, revertable.
**This is the security-critical phase. Slow down here.**

## Week 4: Event log + signing

### `[ ]` Event schema
- `Event { id, contract_id, action_kind, payload_blake3, parent_id, timestamp, signature }`
- `parent_id` chains events → tamper-evident
- Stored in SQLite, append-only
- Property test: chain integrity is monotonic — `fast-check` generates 1000-event chains, mutation always detected
- Labels: `area:lineage`, `kind:feature`, `kind:security`, `priority:p0`, `claude-code:review`
- Estimate: L

### `[ ]` Ed25519 signing via `@noble/curves`
- Per-tenant signing key, stored encrypted at rest (libsodium secretbox)
- `signEvent(event, key): Signature`
- `verifyEvent(event, pubkey): boolean`
- DO NOT roll our own crypto — use audited primitives only
- Labels: `area:lineage`, `kind:feature`, `kind:security`, `priority:p0`, `claude-code:review`
- Estimate: L

### `[ ]` Key generation + rotation CLI
- `argus keys generate`, `argus keys rotate`, `argus keys export`
- Backup flow + scary warnings
- Labels: `area:cli`, `area:lineage`, `kind:feature`, `kind:security`, `priority:p0`
- Estimate: M

## Week 5: Replay, diff, revert

### `[ ]` Replay engine
- `argus lineage replay <contract-id>` → reconstructs final state from event chain
- Deterministic — given same chain, same output every time
- Labels: `area:lineage`, `kind:feature`, `priority:p0`
- Estimate: M

### `[ ]` Lineage diff
- `argus lineage diff <event-a> <event-b>` → human-readable state diff
- Labels: `area:lineage`, `kind:feature`, `priority:p1`
- Estimate: S

### `[ ]` Revert + counter-event
- `argus lineage revert <event-id>` writes a signed inverse event; never deletes
- Tests: revert is itself replayable
- Labels: `area:lineage`, `kind:feature`, `kind:security`, `priority:p0`, `claude-code:review`
- Estimate: M

## Week 6: Verification CLI + lineage spec doc

### `[ ]` `argus lineage verify` — third-party verifiable
- Given a lineage export + a public key, verifies signature chain
- No Argus dependency — anyone can run it
- Labels: `area:lineage`, `kind:feature`, `kind:security`, `priority:p0`
- Estimate: M

### `[ ]` Publish lineage format as open spec
- `docs/lineage-spec.md` — versioned, language-agnostic
- Reference implementation pointer to argus codebase
- This is the standards play — make it the "OpenTelemetry of agent actions"
- Labels: `area:docs`, `area:lineage`, `kind:feature`, `priority:p1`, `claude-code:review`
- Estimate: M

### `[ ]` Property + fuzz tests for the whole layer
- 10k random event chains, all invariants hold
- Fuzz the verifier with malformed inputs
- Labels: `area:lineage`, `kind:test`, `kind:security`, `priority:p0`
- Estimate: M

---

## 🛑 CHECKPOINT 1 — End of Week 6

**Before Phase 3 starts, do all of this:**

- [ ] Self-review of every `kind:security` PR (use `superpowers:requesting-code-review`)
- [ ] Run `npm audit`, `bun audit`, Trivy, Snyk against the repo — zero high/critical
- [ ] Pay for **one external security review** of the lineage + signing layer. Options:
   - Trail of Bits / NCC / Doyensec: $30–80K, 3–6 weeks turnaround. Right call if you want enterprise credibility.
   - Bug bounty on HackerOne for the lineage spec: ~$5K seed, 4-week window. Right call if you're cash-constrained.
   - Community review: post on r/cryptography + Hacker News with a $2K bounty for the first verified vuln.
- [ ] **Do not move to Phase 3 until the review is at least scheduled.**
- [ ] **Decision:** is the foundation strong enough to keep going solo, or do you need to recruit a co-founder/security advisor?

---

# PHASE 3 — Fleet Layer (Weeks 7–9)

**Goal:** Specialist agents that read contracts, execute, and emit signed lineage events.

## Week 7: Specialist runtime

### `[ ]` Specialist interface + base class
- `interface Specialist { name, version, contractKinds, execute(ctx): Promise<Result> }`
- Each specialist is a content-addressed bundle (manifest + code + signature)
- Runs in a Bun subprocess sandbox by default
- **Invoke:** `superpowers:brainstorming` — explore 3 isolation models before picking
- Labels: `area:fleet`, `kind:feature`, `kind:security`, `priority:p0`, `claude-code:review`
- Estimate: L

### `[ ]` Specialist registry + loader
- `argus fleet list`, `argus fleet install`, `argus fleet remove`
- Content-addressed only — no string-name lookups (kills the OpenClaw malware vector)
- Labels: `area:fleet`, `area:cli`, `kind:feature`, `priority:p0`
- Estimate: M

### `[ ]` Orchestrator: contract → specialist selection → execution
- Reads contract, picks the right specialist(s), runs them, emits lineage events
- Labels: `area:fleet`, `kind:feature`, `priority:p0`
- Estimate: L

## Week 8: Three reference specialists

### `[ ]` `argus-specialist-outbound`
- Cold outreach: prospect research, draft, send via Gmail/SES, track replies
- Uses Anthropic API by default, BYO key
- Owns the outcome "land N qualified replies"
- Labels: `area:fleet`, `kind:feature`, `priority:p0`
- Estimate: L

### `[ ]` `argus-specialist-weekly-report`
- Pulls from configured data sources (Stripe, Notion, HubSpot via MCP)
- Produces a Markdown report + summary email every week
- Labels: `area:fleet`, `kind:feature`, `priority:p1`
- Estimate: M

### `[ ]` `argus-specialist-pr-review`
- Watches a GitHub repo, reviews PRs against `superpowers:requesting-code-review` rubric
- Posts review as a bot comment
- Labels: `area:fleet`, `kind:feature`, `priority:p1`
- Estimate: M

## Week 9: Initiative engine

### `[ ]` Event sources: cron, webhook, MCP
- `argus daemon` runs in background, listens for triggers
- Per-contract policies: "run every Monday 9am", "on PR open", "when Stripe event X"
- Labels: `area:fleet`, `kind:feature`, `priority:p0`
- Estimate: L

### `[ ]` Human-in-the-loop escalation
- Contract field `escalation` defines when to ping the user
- Default channels: Slack (via MCP), email
- Labels: `area:fleet`, `kind:feature`, `priority:p0`
- Estimate: M

### `[ ]` Budget enforcement
- Token/dollar budget per contract, hard cap
- Specialist aborts and emits an `over_budget` event when hit
- Labels: `area:fleet`, `kind:feature`, `kind:security`, `priority:p0`
- Estimate: M

**Phase 3 exit criteria:** Argus is running on your own machine, owning at least one real outcome from your actual work (e.g., your Year1 outbound flow), and producing weekly results without you intervening.

---

# PHASE 4 — Marketplace + Trust (Weeks 10–11)

**Goal:** Anyone can publish a specialist; nobody can ship malware.

## Week 10: Publisher identity + signing

### `[ ]` Publisher registration
- Sigstore-backed identity (OIDC via GitHub) — no anonymous publishers
- `argus publisher register`
- Labels: `area:marketplace`, `kind:feature`, `kind:security`, `priority:p0`, `claude-code:review`
- Estimate: L

### `[ ]` Signed specialist bundles
- `argus specialist publish <path>` produces a tar+zstd bundle, signed by the publisher's key
- Verifies signature on install — fails closed
- Labels: `area:marketplace`, `kind:feature`, `kind:security`, `priority:p0`, `claude-code:review`
- Estimate: L

### `[ ]` Revocation list
- Publisher can revoke a bundle by hash
- `argus fleet install` checks revocation list before installing
- Labels: `area:marketplace`, `kind:feature`, `kind:security`, `priority:p0`
- Estimate: M

## Week 11: Marketplace site (minimal)

### `[ ]` Static site (Astro)
- Lists published specialists, links to GitHub source, displays publisher identity badge
- No accounts, no payments — just discovery
- Labels: `area:marketplace`, `area:docs`, `kind:feature`, `priority:p1`, `claude-code:auto`
- Estimate: M

### `[ ]` Threat model review v0.2
- Update `docs/threat-model.md` for the marketplace surface
- Re-run STRIDE; confirm each named adversary is mitigated
- Labels: `area:docs`, `kind:security`, `priority:p0`, `claude-code:review`
- Estimate: S

---

## 🛑 CHECKPOINT 2 — End of Week 11

**Strategic decision: solo to v1, or recruit?**

Ask yourself, honestly:

1. Did you ship Phases 1–4 on schedule? Slipped &gt; 2 weeks total = your scope is too big alone.
2. Did Argus produce a real outcome you wouldn't have produced yourself? If no, the thesis is wrong; reconsider.
3. Is anyone outside your network using it? If you have ≥ 10 unaffiliated installs by now, your wedge is real.
4. Are you energized or burned out? Honest answer only.

**If yes to 1–4:** ship v0.1 (Week 12), launch publicly, see if it catches.

**If no on 2 or 4:** stop. Don't ship. Write the post-mortem, keep what you learned.

**If yes on 1–3 but you want to push toward SaaS / Federation:** recruit a co-founder or first engineer before Phase 5. The cloud and federation pieces are not a solo build.

---

# PHASE 5 — Polish + Launch (Week 12)

**Goal:** v0.1 OSS release that you'd be proud to put your name on.

### `[ ]` Docs site (Astro Starlight)
- Quickstart (5-min path from `npm install` to first owned outcome)
- Contract spec, lineage spec, specialist SDK
- Walkthrough video (5 min)
- Labels: `area:docs`, `kind:chore`, `priority:p0`, `claude-code:auto`
- Estimate: L

### `[ ]` Release engineering
- `goreleaser`-equivalent for Bun: single-binary builds for macOS (arm64+x64), Linux (x64), Windows
- Cosign signatures on every release artifact
- SBOM attached to every release
- Reproducible: same source → same binary hash
- Labels: `area:infra`, `kind:security`, `priority:p0`, `claude-code:review`
- Estimate: L

### `[ ]` Launch posts
- Show HN: "Argus — outcome-owning agents with signed lineage"
- LinkedIn carousel (use `linkedin-dominance:carousel` skill)
- Twitter thread (use `linkedin-dominance:cross-post`)
- Two paragraphs on Year1 Design blog
- Labels: `area:docs`, `kind:chore`, `priority:p0`, `claude-code:review`
- Estimate: M

### `[ ]` Issue templates + first-time contributor doc
- `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `security.yml` (private)
- `good-first-issue` label seeded with ~10 actual issues
- Labels: `area:infra`, `kind:chore`, `priority:p1`, `claude-code:auto`
- Estimate: S

### `[ ]` Set up `support@argus.dev` + security disclosure flow
- Email, PGP key in SECURITY.md, 90-day disclosure window
- Labels: `area:infra`, `kind:security`, `priority:p0`
- Estimate: XS

**v0.1 ship criteria:**
- All Phase 0–4 issues closed
- External security review at minimum *scheduled* (preferably *complete*)
- CI green, SBOM published, releases signed
- Two real users besides you (friends count)
- README has a working `bun install argus && argus init` path in under 90 seconds

---

# Effort budget

| Phase | Weeks | Cumulative hours | Cumulative API spend (est.) |
|-------|-------|------------------|------------------------------|
| 0     | 0.5   | 15               | $20                          |
| 1     | 3     | 105              | $150                         |
| 2     | 3     | 195              | $350                         |
| 3     | 3     | 285              | $700                         |
| 4     | 2     | 345              | $900                         |
| 5     | 1     | 375              | $1,000                       |

Add ~$30K–80K for external security review if you go the paid route. $5K if bug bounty. $0 if community review.

Claude Max alone covers your dev. Use Haiku for cheap subagent dispatches, Sonnet for the meaty work, Opus only when stuck.

---

# Claude Code playbook (use these religiously)

| When                                             | Skill                                                     |
|--------------------------------------------------|-----------------------------------------------------------|
| Before starting any new feature                  | `superpowers:brainstorming`                               |
| Before writing implementation                    | `superpowers:test-driven-development`                     |
| Before claiming a task is done                   | `superpowers:verification-before-completion`              |
| Before merging a PR                              | `superpowers:requesting-code-review` → `code-reviewer`    |
| When stuck on a bug                              | `superpowers:systematic-debugging`                        |
| When you have 2+ independent issues open         | `superpowers:dispatching-parallel-agents`                 |
| Before any multi-step feature                    | `superpowers:writing-plans` → `execute-plan`              |
| Editing security code                            | Insist on `claude-code:review` label, never auto-merge    |

---

# Anti-goals (things explicitly NOT in v0.1)

- Multi-tenant SaaS / Argus Cloud
- Federation Layer (saved for v0.2 after community exists to federate across)
- SOC 2 / HIPAA / SSO — enterprise tier, not OSS
- Web UI (CLI only for v0.1; the dashboard is a fast-follow)
- Payments / outcome-SLA billing infra (manual invoicing for design partners)
- Mobile / desktop apps

Cut anything that drifts into these. Discipline is the moat.

---

# Open questions to resolve in Week 1

1. **Repo name.** `argus`, `argus-agent`, `argusctl`? Check namesquatting on npm + GitHub.
2. **Trademark check.** Is "Argus" clean for software? (Argus Cyber Security exists in automotive — different category, probably fine, but check.)
3. **Hosting for `argus.dev`.** Cloudflare Pages + Workers is the cheap path.
4. **Discord vs. Slack vs. GitHub Discussions for community.** Start with Discussions, graduate to Discord if &gt; 50 active users.
5. **Should the Marketplace site live in-repo or in a separate `argus-marketplace` repo?** Separate, so the core repo stays lean.

---

# Definition of v1.0 (the version after v0.1)

For when v0.1 lands and you're planning forward:

- 100+ GitHub stars
- 10+ third-party specialists published to the marketplace
- 3 paying design-partner customers using Argus for real work
- One landed enterprise pilot (the wedge into regulated verticals)
- External security audit complete and posted
- Federation Layer alpha (opt-in, single-region)

That's the line where "Hermes killer" stops being a thesis and starts being a market position.

---

*"Argus stays awake."*
