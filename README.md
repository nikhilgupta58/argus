# Argus

**Outcome-owning agents with signed lineage**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/nikhilgupta58/argus/ci.yml?branch=main&label=CI)](https://github.com/nikhilgupta58/argus/actions)
[![Release](https://img.shields.io/github/v/release/nikhilgupta58/argus?label=release)](https://github.com/nikhilgupta58/argus/releases/latest)

Argus is an open-source runtime that makes AI agents **accountable**.

You tell Argus what your agent needs to accomplish, set a budget, and define when it should alert you. Argus does the rest: it runs your agent, enforces the budget automatically, pings you if anything needs your attention, and keeps a complete signed record of every action — so you can always see what happened and prove it wasn't tampered with.

No cloud required. Runs on your machine. Your data stays yours.

---

## What's Built

### Phase 1 — Outcome Contracts ✅
Write down what your agent must achieve, when it must do it, and how much it can spend. Argus validates the contract and stores it safely.

```bash
# Create and manage outcome contracts
argus contract create ./contracts/outbound-3-demos.toml
argus contract show outbound-3-demos
argus contract validate ./contracts/outbound-3-demos.toml
argus contract diff outbound-3-demos 1.0.0 1.1.0
```

Here's what a contract looks like — fill in your goal, deadline, and budget:
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

### Phase 2 — Signed Action Log ✅
Every action your agent takes is recorded in a tamper-proof log. If someone alters the record, Argus detects it. Any third party can verify the log without trusting Argus.

### Phase 3 — Specialist Agents + Daemon ✅
Specialist agents carry out your contracts automatically. The Argus daemon runs in the background, fires agents on schedule or on events, enforces budget caps, and pings you when contracts need your attention.

### Phase 4 — Marketplace + Bundle Signing ✅
Publish and discover specialist agents. Every bundle is signed by its publisher — Argus verifies the signature and checks a revocation list before installing, so you know exactly what code you're running.

```bash
# Register a publisher identity
argus publisher register --name "My Org"

# Pack and sign a specialist directory
argus specialist publish ./packages/specialists/src/specialists/outbound \
  --publisher pub-<id>

# Install a verified bundle (signature + revocation check)
argus fleet install-bundle outbound-1.0.0.tar.gz

# Revoke a bundle by hash
argus marketplace revoke <bundleHash> --reason "security issue"
```

Every bundle is verified for authenticity before any code runs. Argus checks the publisher's signature and cross-references a revocation list — if a bundle has been flagged, it won't install.

```bash
# Manage specialists (content-addressed by BLAKE3 manifest hash)
argus fleet list
argus fleet install ./packages/specialists/src/specialists/outbound/index.ts
argus fleet remove <manifestHash>

# Start the initiative engine
argus daemon start --key ~/.argus/myagent.key
```

Reference specialists:
- **outbound** — drafts cold outreach via Anthropic API (claude-haiku-4-5-20251001)
- **weekly-report** — generates Markdown weekly report from configured data sources
- **pr-review** — reviews GitHub PRs via gh CLI + Anthropic API, posts bot comment

```bash
# Key management
argus keys generate myagent
argus keys rotate myagent
argus keys export myagent

# Lineage operations
argus lineage replay <contractId>
argus lineage verify <contractId>
argus lineage revert <contractId> <eventId>
argus lineage diff <contractId> <fromSeq> <toSeq>
```

Every event is:
- **Content-addressed** — `id = BLAKE3(canonical JSON of all event fields except id)`
- **Signed** — Ed25519 signature over the canonical event JSON (including id)
- **Chained** — each event's `parent_id` points to the previous event's id
- **Independently verifiable** — `verifyChain()` only imports `@noble/*`, no Argus deps

---

## Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Repo scaffold, CI, threat model | ✅ Complete |
| 1 | Contract DSL + SQLite store | ✅ Complete |
| 2 | Lineage ledger + Ed25519 signing | ✅ Complete |
| 3 | Fleet layer — specialist runtime, 3 reference specialists, initiative engine | ✅ Complete |
| 4 | Marketplace — publisher identity, signed bundles, revocation | ✅ Complete |
| 5 | Polish + Launch — docs site, release engineering, v0.1 ship | ✅ Complete |

See [ARGUS_ROADMAP.md](./ARGUS_ROADMAP.md) for the full 12-week plan.

---

## Install

**First time?** Start with `argus init` — it walks you through setting up your first agent in under 5 minutes.

**Binary (recommended):**

```bash
bun add -g argus
```

Or download a pre-built binary from the [releases page](https://github.com/nikhilgupta58/argus/releases/latest):
- `argus-macos-arm64` — macOS Apple Silicon
- `argus-linux-x64` — Linux x86-64

## Install from Source

Requires [Bun](https://bun.sh) ≥ 1.1.

```bash
git clone https://github.com/nikhilgupta58/argus.git
cd argus
bun install
bun run build
bun link packages/cli  # makes `argus` available globally
```

Run the test suite:
```bash
bun run --filter='*' test
```

## Architecture

```
packages/
  core/         Contract DSL, BLAKE3 hashing, SQLite store
  lineage/      Event types, Ed25519 signing, chain verification
  specialists/  Specialist interface, registry, orchestrator (Phase 3)
  cli/          argus CLI (Commander)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed design walkthrough.

---

## Security

- Cryptography: `@noble/curves` (Ed25519), `@noble/hashes` (BLAKE3, PBKDF2), `@noble/ciphers` (XChaCha20-Poly1305). No custom crypto.
- Threat model: [docs/threat-model.md](./docs/threat-model.md)
- Reporting vulnerabilities: [SECURITY.md](./SECURITY.md)

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). All PRs touching signing or key storage require a `kind:security` label and independent review before merge.

---

## License

Apache 2.0 — see [LICENSE](./LICENSE).
