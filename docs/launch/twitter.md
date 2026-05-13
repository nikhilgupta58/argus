# Twitter/X Thread — Argus v0.1

---

**Tweet 1 (hook)**
Shipping Argus v0.1 today — an open-source runtime for outcome-owning AI agents with signed lineage.

Every agent action is cryptographically signed + chained. Tamper with any record, verification fails. Thread:

---

**Tweet 2 (the problem)**
Current agent frameworks have no accountability layer.

- No hard budget caps
- No escalation when things go wrong
- No way to prove what the agent actually did

If the agent burns $500 on LLM calls and misses the goal, you find out after the fact.

---

**Tweet 3 (Outcome Contracts)**
Argus fixes this with Outcome Contracts — TOML documents that define:

- What the agent must achieve (measurable success criteria)
- Hard budget limits (tokens + USD, hard_cap = true)
- Escalation rules (fire to Slack/email at 80% budget)

BLAKE3 content-addressed. Immutable once stored.

---

**Tweet 4 (lineage)**
Every action writes a signed lineage event:

```
id        = BLAKE3(canonical JSON of all other fields)
signature = Ed25519(canonical event JSON)
parent_id = id of previous event
```

Break any link in the chain → verification fails.
The verifier has zero Argus dependencies — anyone can audit.

---

**Tweet 5 (code snippet)**
Five-minute quickstart:

```bash
argus keys generate myagent
argus contract create ./my-contract.toml
argus fleet install ./specialists/outbound/index.ts
argus daemon start --key ~/.argus/myagent.key
argus lineage replay my-first-contract
# seq=0 action=contract_created  signature=OK
# Chain intact.
```

---

**Tweet 6 (supply chain)**
Specialist bundles are signed .tar.gz archives.

Install verifies:
1. Ed25519 signature over BLAKE3(manifest)
2. BLAKE3 bundle hash against a SQLite revocation list

No code runs until both checks pass.

---

**Tweet 7 (what's shipped)**
v0.1 ships today:

- macOS arm64 + Linux x64 binaries
- 165 passing tests (Vitest + fast-check)
- 3 reference specialists: outbound, weekly-report, PR review
- Apache 2.0

---

**Tweet 8 (CTA)**
Repo: https://github.com/nikhilgupta58/argus

If you're building agents where auditability matters — give it a try and tell me what's missing.

#OpenSource #AI #Agents
