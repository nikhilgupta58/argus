<p align="center">
  <strong>Argus</strong>
</p>

<p align="center">
  AI agents that answer for what they did.
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge" alt="License" /></a>
  <a href="https://github.com/nikhilgupta58/argus/actions"><img src="https://img.shields.io/github/actions/workflow/status/nikhilgupta58/argus/ci.yml?branch=main&style=for-the-badge&label=CI" alt="CI" /></a>
  <a href="https://github.com/nikhilgupta58/argus/releases/latest"><img src="https://img.shields.io/github/v/release/nikhilgupta58/argus?style=for-the-badge&label=release" alt="Release" /></a>
</p>

<p align="center">
  <a href="./docs/quickstart.md">Get started</a> · <a href="https://docs.argus.dev">Docs</a> · <a href="https://github.com/nikhilgupta58/argus/issues">Issues</a>
</p>

---

**If you've ever asked "what did my AI agent actually do?" and had no good answer — this is for you.**

Argus is a free, open-source runtime that makes AI agents accountable. Tell it what your agent should accomplish, set a budget, and define when it should alert you. Argus runs the agent, enforces the budget, pings you when something needs your attention, and keeps a signed record of every action — so you can always see exactly what happened and prove it wasn't tampered with.

No cloud required. Runs on your machine. Your data stays yours.

> **New here? Run `argus init` — it walks you through your first agent in under 5 minutes.**

---

## Quick start

```bash
# Install from source (see Install section below for binaries)
git clone https://github.com/nikhilgupta58/argus.git
cd argus && bun install
cd packages/cli && bun link && cd ../..   # makes `argus` available globally

# Create your first outcome contract (interactive)
argus init

# Run your agent against the contract
argus daemon start --key ~/.argus/myagent.key

# See everything it did, signed and verified
argus lineage verify my-first-contract
```

What that last command prints:

```
✓ Chain verified — 12 events, 0 errors
  seq 0  task_started      2024-06-01T09:00:01Z  sig: a3f9b2…
  seq 1  tool_called       2024-06-01T09:00:03Z  sig: 7e12d4…
  seq 2  tool_called       2024-06-01T09:00:05Z  sig: 88ccf1…
  ...
  seq 11 task_completed    2024-06-01T09:04:22Z  sig: f02ab7…

Budget used: $1.42 of $10.00 · 142,000 of 500,000 tokens
All signatures valid · No gaps in chain
```

---

## What's built

### Outcome contracts — tell your agent exactly what to achieve

Write down the goal, the deadline, and the budget. Argus enforces all three automatically.

```bash
argus contract create ./contracts/my-goal.toml
argus contract show my-goal
argus contract diff my-goal 1.0.0 1.1.0   # see exactly what changed
```

A contract looks like this:

```toml
id = "outbound-3-demos"
version = "1.0.0"
owner = "you@example.com"
outcome = "Land 3 qualified demo calls with Series-A founders"
deadline = "2024-06-30T00:00:00Z"

[[success_criteria]]
name = "demo_calls_booked"
metric = "qualified_demo_calls"
target = 3
operator = "gte"

[budget]
usd = 10.00
tokens = 500000
hard_cap = true          # agent stops the moment it hits the cap

[[escalation]]
trigger = "budget > 80%"
channel = "slack"
contact = "#outbound-alerts"
```

### Signed action log — proof of what happened

Every action your agent takes is logged with a cryptographic signature. Tamper with one record and Argus catches it. Any third party can verify the log without trusting Argus.

```bash
argus lineage replay my-goal        # replay events in order
argus lineage verify my-goal        # verify every signature in the chain
argus lineage diff my-goal 3 7      # see what changed between events 3 and 7
argus lineage revert my-goal ev_9   # add a counter-event (log never deletes)
```

### Specialist agents + daemon — runs your contracts automatically

Specialist agents carry out your contracts on schedule. The daemon fires them, enforces budgets, and pings you via Slack or email when something needs your attention.

```bash
# Key management (Ed25519, encrypted at rest)
argus keys generate myagent
argus keys rotate myagent

# Start the daemon (runs all active contracts on schedule)
argus daemon start --key ~/.argus/myagent.key
argus daemon stop
```

Three reference specialists are included:

| Specialist | What it does |
|---|---|
| `outbound` | Drafts cold outreach via Anthropic API, tracks replies |
| `weekly-report` | Pulls data from your sources, produces a Markdown digest |
| `pr-review` | Watches GitHub PRs, reviews against a rubric, posts a bot comment |

### Marketplace — install and publish verified agents

Every specialist bundle is signed by its publisher. Argus verifies the signature and checks a revocation list before any code runs.

```bash
# Register as a publisher
argus publisher register --name "My Org"

# Pack, sign, and publish a specialist
argus specialist publish ./my-specialist --publisher pub-<id>

# Install a verified bundle
argus fleet install-bundle outbound-1.0.0.tar.gz

# Revoke a bundle if a security issue is found
argus marketplace revoke <bundleHash> --reason "security issue"
```

---

## Roadmap

| Phase | What it builds | Status |
|---|---|---|
| 0 | Repo scaffold, CI, threat model | ✅ Complete |
| 1 | Outcome contracts + SQLite store | ✅ Complete |
| 2 | Signed action log + Ed25519 keys | ✅ Complete |
| 3 | Specialist agents + initiative daemon | ✅ Complete |
| 4 | Marketplace + signed bundles + revocation | ✅ Complete |
| 5 | Docs site, release engineering, v0.1 ship | ✅ Complete |

See [ARGUS_ROADMAP.md](./ARGUS_ROADMAP.md) for the full 12-week plan.

---

## Install

**Pre-built binary (recommended):**

Download from the [releases page](https://github.com/nikhilgupta58/argus/releases/latest) and put it on your PATH:

- `argus-macos-arm64` — macOS Apple Silicon
- `argus-linux-x64` — Linux x86-64

```bash
# macOS example
curl -L https://github.com/nikhilgupta58/argus/releases/latest/download/argus-macos-arm64 -o /usr/local/bin/argus
chmod +x /usr/local/bin/argus
argus --version
```

**From source** (requires [Bun](https://bun.sh) ≥ 1.1):

```bash
git clone https://github.com/nikhilgupta58/argus.git
cd argus && bun install
cd packages/cli && bun link    # registers the `argus` bin in ~/.bun/bin/

# Make sure ~/.bun/bin is on your PATH (add to ~/.zshrc or ~/.bashrc if needed)
export PATH="$HOME/.bun/bin:$PATH"

argus --help
```

Run the test suite:

```bash
bun run --filter='*' test
```

---

## Architecture

```
packages/
  core/         Outcome contracts — DSL, BLAKE3 hashing, SQLite store
  lineage/      Signed event log — Ed25519 signing, chain verification
  specialists/  Specialist interface, registry, sandbox, orchestrator
  cli/          argus CLI (Commander) + daemon + marketplace commands
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full design walkthrough.

---

## Security

Cryptography: `@noble/curves` (Ed25519), `@noble/hashes` (BLAKE3, PBKDF2), `@noble/ciphers` (XChaCha20-Poly1305). No custom crypto.

- Threat model: [docs/threat-model.md](./docs/threat-model.md)
- Reporting vulnerabilities: [SECURITY.md](./SECURITY.md) — email `support@argus.dev`, 90-day coordinated disclosure

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). All PRs that touch signing or key storage require a `kind:security` label and independent review before merge.

---

## License

Apache 2.0 — see [LICENSE](./LICENSE).
