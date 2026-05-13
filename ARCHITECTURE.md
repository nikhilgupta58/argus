# Argus Architecture

## Overview

Argus is organized into four layers. Each layer depends only on layers below it.

## Layer 1: Contract Layer

Outcome Contracts are TOML documents that define what an agent must accomplish.

**Key components:**
- Contract DSL: TOML-based schema validated with Zod
- Contract store: SQLite, append-only, content-addressed (BLAKE3)
- Versioning: each edit creates a new version; old versions are never mutated
- Diff engine: semantic diff between versions (deadline shift, budget change, etc.)

**Package:** `@argus/core`

## Layer 2: Lineage Ledger

Every action an agent takes is recorded as a signed, content-addressed event.

**Key components:**
- Event schema: `{ id, contract_id, action_kind, payload_blake3, parent_id, timestamp, signature }`
- Signing: Ed25519 via `@noble/curves`, per-tenant key encrypted at rest with libsodium secretbox
- Content addressing: BLAKE3 hashes on all payloads
- Tamper evidence: `parent_id` chains events; breaking the chain is detectable
- Replay: deterministic state reconstruction from event chain
- Revert: inverse events (never delete)

**Package:** `@argus/lineage`

## Layer 3: Fleet Layer

Specialist agents read contracts, execute work, and emit lineage events.

**Key components:**
- Specialist interface: `{ name, version, contractKinds, execute(ctx) }`
- Bundles: content-addressed tar+zstd archives with Ed25519 signature
- Orchestrator: contract → specialist selection → execution → lineage emission
- Triggers: cron, webhook, MCP events
- Escalation: human-in-the-loop via Slack/email when contract rules require it
- Budget enforcement: hard token/dollar cap per contract

**Package:** `@argus/specialists`

## Layer 4: Marketplace & Trust

Specialists can be published and discovered with cryptographic identity.

**Key components:**
- Publisher identity: Sigstore OIDC (GitHub), no anonymous publishers
- Signed bundles: publisher signs with Ed25519 key; verified on install
- Revocation: publishers can revoke bundles by BLAKE3 hash
- Discovery: static site listing published specialists with publisher identity badges

## Data flow

```
User writes Contract (TOML)
  → Contract Layer validates + persists
    → Orchestrator selects Specialist
      → Specialist executes
        → Lineage Ledger records signed event
          → Escalation triggers if contract rules fire
```

## Tech stack

| Concern | Choice |
|---------|--------|
| Runtime | Bun |
| Language | TypeScript |
| Storage | SQLite + WAL |
| Signing | Ed25519 via @noble/curves |
| Content addressing | BLAKE3 |
| Skill bundles | tar+zstd |
| Supply chain | Sigstore / cosign |
| MCP | @modelcontextprotocol/sdk |
| Tests | Vitest + fast-check |
