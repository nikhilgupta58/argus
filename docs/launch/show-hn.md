# Show HN: Argus – outcome-owning agents with signed lineage (OSS)

**Title:** Show HN: Argus – outcome-owning agents with signed lineage (OSS)

---

Most agent frameworks tell you *how* to build agents. Argus tells the agent *what it must achieve* — and holds it accountable with a cryptographic paper trail.

Every Argus agent runs under a signed **Outcome Contract**: a TOML document specifying the desired outcome, success criteria (measurable targets with operators), a hard budget cap (tokens + USD), and escalation rules that fire to Slack or email when thresholds are crossed. The contract is content-addressed by BLAKE3 and immutable once stored.

Every action the agent takes is recorded as an Ed25519-signed, BLAKE3 content-addressed **lineage event** that chains to the previous one. Break any link in the chain, alter any payload, and verification fails. The chain verifier imports only `@noble/curves` and `@noble/hashes` — no Argus runtime dependencies — so any third party can audit without trusting us. Specialists (the worker agents) are signed `.tar.gz` bundles; the install path checks the Ed25519 signature and a SQLite revocation list before any code runs.

What you can do with it today: generate a key (`argus keys generate`), write a contract in TOML, register it (`argus contract create`), install a specialist (`argus fleet install`), run the daemon, and replay the full signed event history (`argus lineage replay`). Three reference specialists are included (outbound cold-email, weekly report, PR review). 165 tests pass across the five packages. Binary downloads for macOS arm64 and Linux x64 available on the release page.

Repo: https://github.com/nikhilgupta58/argus

What I'd love feedback on: (1) the lineage format spec — is the canonical JSON / BLAKE3 / Ed25519 combination robust enough for your threat model? (2) the contract DSL — what fields are missing for your use case?
