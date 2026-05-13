# Contract DSL Design

**Date:** 2026-05-13  
**Status:** Approved (autonomous — user delegated all design decisions)  
**Phase:** 1 — Contract Layer

---

## Context

Argus Outcome Contracts are the foundational primitive. Every specialist reads from a contract; every lineage event references one. The DSL must be human-writable, git-diffable, round-trip parseable, and semantically versionable.

---

## Alternatives Evaluated

### Alternative 1: Flat TOML with nested tables
```toml
id = "outbound-q2-2026"
owner = "nikhil@example.com"
outcome = "Land 3 qualified demo calls"
deadline = "2026-06-30T23:59:59Z"

[success_criteria]
metric = "qualified_demo_calls"
target = 3

[escalation]
trigger = "budget_80pct"
channel = "slack"
```
**Trade-off:** Simple, but only one success criterion and one escalation rule. Too limiting for real contracts.

### Alternative 2: TOML arrays of tables (chosen)
Uses `[[success_criteria]]` and `[[escalation]]` for multiple entries per contract. Standard TOML idiom, excellent git diff, supports compound success criteria and tiered escalation.

### Alternative 3: Kind-typed with inline tables
Adds a `kind` field and uses TOML inline tables (`{}`). More compact but harder to read and diff for non-trivial values.

**Decision:** Alternative 2 with `kind` from Alternative 3. Arrays for expressiveness; `kind` for specialist routing.

---

## Schema

### Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (slug) | Yes | URL-safe identifier, e.g. `outbound-q2-2026` |
| `version` | string | Yes | Semver, starts at `"1.0.0"` |
| `kind` | string | Yes | Specialist routing key: `outbound`, `report`, `pr-review`, `custom` |
| `owner` | string (email) | Yes | Accountable human |
| `outcome` | string | Yes | One-sentence plain-English goal |
| `deadline` | string (ISO 8601) | Yes | Hard deadline for the contract |

### `[[success_criteria]]` (one or more)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Identifier for this criterion |
| `metric` | string | Yes | Machine-readable metric key |
| `target` | number | Yes | Goal value |
| `operator` | enum | Yes | `gte`, `lte`, `eq` |
| `measurement` | enum | No | `automatic` (default) or `manual` |

### `[budget]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tokens` | number | No | Max LLM tokens |
| `usd` | number | No | Max spend in USD |
| `hard_cap` | boolean | Yes | If true, abort on budget hit; false = escalate |

### `[[escalation]]` (one or more)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `trigger` | string | Yes | e.g. `budget_80pct`, `deadline_48h`, `criterion_missed` |
| `channel` | enum | Yes | `slack`, `email`, `github` |
| `contact` | string | Yes | Slack @mention, email address, or GitHub @username |

### Optional: `[metadata]`
Free-form key-value for user annotations. Not validated, not used by Argus engine.

---

## Example Contract

```toml
id = "outbound-q2-2026"
version = "1.0.0"
kind = "outbound"
owner = "nikhil@example.com"
outcome = "Land 3 qualified demo calls from cold outbound in Q2 2026"
deadline = "2026-06-30T23:59:59Z"

[[success_criteria]]
name = "demo_calls_landed"
metric = "qualified_demo_calls"
target = 3
operator = "gte"

[[success_criteria]]
name = "reply_rate"
metric = "reply_rate_pct"
target = 5
operator = "gte"
measurement = "automatic"

[budget]
tokens = 500_000
usd = 50.00
hard_cap = true

[[escalation]]
trigger = "budget_80pct"
channel = "slack"
contact = "@nikhil"

[[escalation]]
trigger = "deadline_48h"
channel = "email"
contact = "nikhilkumargupta58@gmail.com"
```

---

## Validation Rules (Zod)

1. `id`: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/` — lowercase slug, 3–64 chars
2. `version`: valid semver string
3. `kind`: one of `["outbound", "report", "pr-review", "custom"]`
4. `owner`: valid email
5. `outcome`: non-empty string, max 500 chars
6. `deadline`: valid ISO 8601 datetime
7. `success_criteria`: array of 1–10 items; each `name` unique within contract
8. `budget`: at least one of `tokens` or `usd` must be present
9. `escalation`: array of 1–5 items; `trigger` values unique within contract

---

## Content Addressing

- Contract body serialized to canonical JSON before hashing (field order normalized)
- BLAKE3 hash of canonical JSON = `body_blake3`
- `body_blake3` stored alongside the contract in SQLite

---

## Semantic Diff Categories

| Category | Trigger |
|----------|---------|
| `outcome_changed` | `outcome` field differs |
| `deadline_shifted` | `deadline` differs |
| `budget_changed` | any `budget` field differs |
| `criteria_added` | new `[[success_criteria]]` entry |
| `criteria_removed` | `[[success_criteria]]` entry removed |
| `criteria_modified` | existing criterion fields changed |
| `escalation_changed` | any `[[escalation]]` change |
| `kind_changed` | `kind` field differs |
| `metadata_only` | only `[metadata]` differs |

---

## File: `docs/contract-spec.md`

The public-facing spec (language-agnostic, for third-party implementors) will be generated from this design document after Phase 1 is implemented.

---

## Out of Scope (Phase 1)

- Contract templates / inheritance
- Multi-owner contracts
- Contract expiry / archival
- Encrypted contract bodies
