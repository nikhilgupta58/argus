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
| 3 | Fleet layer — specialist runtime, 3 reference specialists, initiative engine | 🔨 In progress |
| 4 | Marketplace — publisher identity, content-addressed packages | 📋 Planned |
| 5 | Cloud-optional relay, multi-tenant isolation | 📋 Planned |

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
