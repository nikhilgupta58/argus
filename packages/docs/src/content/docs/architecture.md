---
title: Architecture Overview
description: System design of the Argus runtime.
---

Argus is organized into four layers. Each layer depends only on layers below it.

## Layer 1 — Contract Layer (`@argus/core`)

Outcome Contracts are TOML documents validated with Zod. They are content-addressed by BLAKE3 and stored in a SQLite append-only store.

## Layer 2 — Lineage Ledger (`@argus/lineage`)

Every agent action is an Ed25519-signed, BLAKE3 content-addressed event. Events chain via `parent_id`. The verifier imports only `@noble/curves` and `@noble/hashes` — zero Argus dependencies.

## Layer 3 — Fleet Layer (`@argus/specialists`)

Specialists implement `{ name, version, contractKinds, execute(ctx) }`. The orchestrator selects by matching `contractKinds`. Budget enforcement is a hard pre/post check.

## Layer 4 — Marketplace + Trust

Publishers register an Ed25519 identity. Bundles are `.tar.gz` archives signed by the publisher. Install verifies the Ed25519 signature + checks the BLAKE3 bundle hash against a SQLite revocation list.

## Data Flow

```
User writes Contract (TOML)
  → Contract Layer validates + stores (BLAKE3 content-addressed)
    → Orchestrator selects Specialist (contractKinds match)
      → Specialist executes (budget enforced)
        → Lineage Ledger records Ed25519-signed event
          → Escalation fires if contract rules triggered
```

## Tech Stack

| Concern | Choice |
|---------|--------|
| Runtime | Bun ≥ 1.1 |
| Language | TypeScript |
| Storage | SQLite + WAL |
| Signing | Ed25519 via `@noble/curves` |
| Content addressing | BLAKE3 via `@noble/hashes` |
| Key encryption | XChaCha20-Poly1305 via `@noble/ciphers` |
| Tests | Vitest + fast-check |
| CLI | Commander |

## Packages

```
packages/
  core/         Contract DSL, BLAKE3 hashing, SQLite store
  lineage/      Event types, Ed25519 signing, chain verifier
  specialists/  Specialist interface, registry, orchestrator
  cli/          argus CLI (Commander)
  marketplace/  Static Astro discovery site
  docs/         Astro Starlight docs site
```

## Security Properties

- No custom crypto — all primitives from `@noble/*` (audited)
- Append-only SQLite stores — no UPDATE/DELETE on signed records
- Key encryption: PBKDF2-SHA256 at 600k iterations + XChaCha20-Poly1305
- Bundle install: Ed25519 signature + revocation check before any code runs
- Independent verifiability: chain verifier has zero Argus runtime dependencies
