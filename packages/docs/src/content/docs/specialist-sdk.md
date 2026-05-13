---
title: Specialist SDK
description: How to write, register, and publish an Argus specialist.
---

A **Specialist** is a TypeScript module that reads an Outcome Contract, performs work, and emits lineage events. Specialists are content-addressed by a BLAKE3 manifest hash.

## Interface

Every specialist must export a default object satisfying the `Specialist` interface from `@argus/specialists`:

```typescript
import type { Specialist, SpecialistContext, SpecialistOutput, SpecialistError } from "@argus/specialists";

const mySpecialist: Specialist = {
  name: "my-specialist",
  version: "1.0.0",
  contractKinds: ["outbound"],
  async execute(ctx: SpecialistContext) {
    // ctx.contract  — the active Outcome Contract
    // ctx.budgetRemaining — remaining token/USD budget
    const result = await doWork(ctx.contract);
    return { ok: true, value: { summary: "done", tokensUsed: 100 } };
  },
};

export default mySpecialist;
```

## Installing a specialist

```bash
# From source
argus fleet install ./src/specialists/my-specialist/index.ts

# From a signed bundle
argus fleet install-bundle my-specialist-1.0.0.tar.gz

# List installed specialists
argus fleet list
```

## Publishing

```bash
# Register a publisher identity
argus publisher register --name "My Org"

# Pack and sign
argus specialist publish ./src/specialists/my-specialist \
  --publisher pub-<id>
# Created: my-specialist-1.0.0.tar.gz
```

## Revocation

```bash
argus marketplace revoke <bundleHash> --reason "security issue"
```

## Reference Specialists

Three reference specialists are in `packages/specialists/src/specialists/`:

| Name | Description |
|------|-------------|
| `outbound` | Drafts cold outreach via Anthropic API |
| `weekly-report` | Generates a Markdown weekly report |
| `pr-review` | Reviews GitHub PRs via gh CLI + Anthropic API |
