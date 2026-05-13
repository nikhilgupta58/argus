# LinkedIn Post — Argus v0.1

---

I'm open-sourcing Argus — a runtime for outcome-owning AI agents with cryptographic accountability.

**The problem:**
AI agents today are black boxes. You kick one off, hope it does the right thing, and find out at the end whether it did. There's no paper trail, no budget guardrails, no escalation when things go wrong.

**What Argus ships:**

- **Outcome Contracts** — TOML documents with measurable success criteria, hard token/USD budget caps, and escalation rules. Content-addressed by BLAKE3 so contracts can't be silently modified.
- **Signed lineage** — every agent action is an Ed25519-signed, chained event. Tamper with any entry, verification fails. Any third party can audit without trusting the Argus runtime.
- **Specialist bundles** — worker agents are signed `.tar.gz` packages. Install verifies the Ed25519 signature + a revocation list before any code runs.
- **Full CLI** — `argus contract create`, `argus fleet install`, `argus daemon start`, `argus lineage replay` — everything in one binary.

**v0.1 ships today:** macOS arm64 + Linux x64 binaries, 165 passing tests, Astro docs site, and three reference specialists (outbound, weekly-report, PR review).

GitHub: https://github.com/nikhilgupta58/argus

#OpenSource #AI #Agents #TypeScript #Bun
