# Argus

**Outcome-owning agents with signed lineage**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/nikhilgupta58/argus/ci.yml?branch=main&label=CI)](https://github.com/nikhilgupta58/argus/actions)
[![npm](https://img.shields.io/npm/v/argus?label=npm)](https://www.npmjs.com/package/argus)

Argus is an open-source runtime for outcome-owning AI agents. Each agent operates under a signed Outcome Contract that defines success criteria, budget, and escalation rules. Every action is recorded in a tamper-evident lineage ledger — signed, content-addressed, and replayable. Argus agents can be composed into specialist fleets, published to a marketplace with cryptographic publisher identity, and run without any Argus cloud dependency.

---

## Quick Start

```bash
bun install -g argus
argus init
```

---

## Documentation

Full documentation lives at [docs.argus.dev](https://docs.argus.dev) (coming soon).

- [Architecture overview](./ARCHITECTURE.md)
- [Roadmap](./ARGUS_ROADMAP.md)
- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)

---

## License

Apache 2.0 — see [LICENSE](./LICENSE).
