---
title: Contract DSL Specification
description: Full reference for the Argus Outcome Contract TOML format.
---

## Overview

An Outcome Contract is a TOML document that defines what an agent must accomplish, how much budget it has, and when it must escalate to a human. Contracts are validated with Zod, content-addressed by BLAKE3, and stored in a SQLite append-only store.

## Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique contract identifier (slug, e.g. `outbound-3-demos`) |
| `version` | string | Yes | Semantic version (e.g. `1.0.0`) |
| `kind` | string | Yes | Contract kind: `outbound`, `research`, `report`, or custom |
| `owner` | string | Yes | Email or identifier of the contract owner |
| `outcome` | string | Yes | Human-readable description of the desired outcome |
| `deadline` | string (ISO 8601) | Yes | UTC deadline for the outcome |

## `[[success_criteria]]`

Array of measurable success criteria. At least one is required.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Identifier for this criterion |
| `metric` | string | Yes | The metric being measured |
| `target` | number | Yes | Target value |
| `operator` | `gte` \| `lte` \| `eq` | Yes | Comparison operator |
| `measurement` | `automatic` \| `manual` | Yes | How the metric is measured |

## `[budget]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tokens` | integer | Yes | Maximum LLM tokens to consume |
| `usd` | number | Yes | Maximum USD to spend |
| `hard_cap` | boolean | Yes | If true, halt when either limit is hit |

## `[[escalation]]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `trigger` | string | Yes | Condition expression, e.g. `budget > 80%` |
| `channel` | `slack` \| `email` | Yes | Notification channel |
| `contact` | string | Yes | Slack channel or email address |

## Example

```toml
id = "outbound-3-demos"
version = "1.0.0"
kind = "outbound"
owner = "nikhil@example.com"
outcome = "Land 3 qualified demo calls with Series-A SaaS founders"
deadline = "2024-06-30T00:00:00Z"

[[success_criteria]]
name = "demo_calls_booked"
metric = "qualified_demo_calls"
target = 3
operator = "gte"
measurement = "automatic"

[budget]
tokens = 500000
usd = 10.00
hard_cap = true

[[escalation]]
trigger = "budget > 80%"
channel = "slack"
contact = "#outbound-alerts"
```

## CLI Commands

```bash
argus contract create ./my-contract.toml
argus contract show my-contract
argus contract validate ./my-contract.toml
argus contract diff my-contract 1.0.0 1.1.0
```
