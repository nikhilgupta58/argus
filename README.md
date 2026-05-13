# Argus

**Outcome-owning agents with signed lineage**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/nikhilgupta58/argus/ci.yml?branch=main&label=CI)](https://github.com/nikhilgupta58/argus/actions)

Argus is an open-source runtime for outcome-owning AI agents. Each agent operates under a signed **Outcome Contract** that defines success criteria, budget, and escalation rules. Every action is recorded in a tamper-evident **lineage ledger** — Ed25519-signed, BLAKE3 content-addressed, and independently replayable. Argus agents compose into specialist fleets and run without any cloud dependency.

---

## What's Built

### Phase 1 — Contract Layer ✅
TOML-based Outcome Contracts with Zod schema validation, BLAKE3 content-addressing, and a SQLite append-only store.

```bash
# Create and manage outcome contracts
argus contract create ./contracts/outbound-3-demos.toml
argus contract show outbound-3-demos
argus contract validate ./contracts/outbound-3-demos.toml
argus contract diff outbound-3-demos 1.0.0 1.1.0
```

Contract format:
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

### Phase 2 — Lineage Ledger ✅
Ed25519-signed event chain with XChaCha20-Poly1305 key encryption, PBKDF2-SHA256 at 600k iterations, and a standalone chain verifier with zero Argus runtime dependencies.

### Phase 3 — Fleet Layer ✅
Content-addressed specialist runtime, cron/webhook initiative engine, budget enforcement, and human-in-the-loop escalation.

### Phase 4 — Marketplace + Trust ✅
Publisher identity (Ed25519 keypair, local registry), signed specialist bundles (`.tar.gz` + Ed25519 over BLAKE3 manifest), revocation list (SQLite), and a minimal static Astro discovery site.

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

Publisher key format: same XChaCha20-Poly1305 + PBKDF2-SHA256 (600k iterations) as lineage keys. Bundle manifests carry an Ed25519 signature over `BLAKE3(canonical JSON of manifest without signature field)`. Every `install-bundle` call verifies the signature and checks the BLAKE3 bundle hash against the revocation list before any code runs.

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

Key storage format (v2): `version(4) + PBKDF2_salt(32) + XChaCha20_nonce(24) + encrypted_privkey(48)` = 108 bytes.

---

## Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Repo scaffold, CI, threat model | ✅ Complete |
| 1 | Contract DSL + SQLite store | ✅ Complete |
| 2 | Lineage ledger + Ed25519 signing | ✅ Complete |
| 3 | Fleet layer — specialist runtime, 3 reference specialists, initiative engine | ✅ Complete |
| 4 | Marketplace — publisher identity, signed bundles, revocation | ✅ Complete |
| 5 | Polish + Launch — docs site, release engineering, v0.1 ship | 📋 Planned |

See [ARGUS_ROADMAP.md](./ARGUS_ROADMAP.md) for the full 12-week plan.

---

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
bun test
```

---

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
