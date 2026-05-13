# Phase 1 — Contract Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full Argus Contract Layer — TOML DSL, Zod schema, parser, BLAKE3 content-addressing, semantic diff, SQLite append-only store, CLI surface, and example contracts.

**Architecture:** Contracts are parsed from TOML strings into validated `Contract` objects, content-addressed via BLAKE3 hash of canonical JSON, and stored append-only in SQLite. A semantic diff engine compares versions. The `@argus/cli` package exposes all operations via `argus contract <subcommand>`.

**Tech Stack:** TypeScript + Bun, `smol-toml`, `zod`, `@noble/hashes` (blake3), `bun:sqlite`, `fast-check`, `commander`, `picocolors`

---

## File Map

```
packages/core/src/
  contract/
    types.ts                       CREATE — TypeScript interfaces, Result<T,E> type
    schema.ts                      CREATE — Zod schemas for all contract fields
    parser.ts                      CREATE — parseContract(toml): Result<Contract>
    hash.ts                        CREATE — contractHash(contract): string (BLAKE3 hex)
    diff.ts                        CREATE — diffContracts(a, b): SemanticDiff
    store.ts                       CREATE — ContractStore class (bun:sqlite, append-only)
    index.ts                       CREATE — barrel re-export
  index.ts                         MODIFY — add contract/* exports

packages/core/src/__tests__/contract/
  parser.test.ts                   CREATE — happy-path + error cases for parseContract
  parser.property.test.ts          CREATE — fast-check round-trip + mutation invariants
  diff.test.ts                     CREATE — unit tests for each SemanticDiff category
  store.test.ts                    CREATE — ContractStore create/load/version tests
  integration.test.ts              CREATE — e2e: create→edit→validate→diff→persist→load

packages/cli/src/
  commands/contract.ts             CREATE — commander subcommands create/edit/validate/show/diff
  main.ts                          MODIFY — register contract command

examples/contracts/
  outbound-3-demos.toml            CREATE
  weekly-rev-report.toml           CREATE
  pr-review-sla.toml               CREATE
```

---

## Task 1: Add dependencies

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Add core dependencies**

Edit `packages/core/package.json` — add `dependencies` and `devDependencies`:

```json
{
  "name": "@argus/core",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "smol-toml": "^1.3.1",
    "zod": "^3.23.8",
    "@noble/hashes": "^1.4.0"
  },
  "devDependencies": {
    "fast-check": "^3.21.0",
    "vitest": "^2.0.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Add CLI dependencies**

Edit `packages/cli/package.json`:

```json
{
  "name": "@argus/cli",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/main.js",
  "bin": {
    "argus": "./dist/main.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@argus/core": "workspace:*",
    "commander": "^12.1.0",
    "picocolors": "^1.1.1"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 3: Install**

```bash
cd /path/to/argus && bun install
```

Expected: packages installed, bun.lock updated.

---

## Task 2: Contract types

**Files:**
- Create: `packages/core/src/contract/types.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/__tests__/contract/parser.test.ts` with an import that will fail until types exist:

```typescript
import { describe, it, expect } from "vitest";
import { parseContract } from "../../contract/parser.js";

describe("parseContract", () => {
  it("is importable", () => {
    expect(typeof parseContract).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd packages/core && bun test src/__tests__/contract/parser.test.ts
```

Expected: FAIL — `Cannot find module '../../contract/parser.js'`

- [ ] **Step 3: Create types.ts**

Create `packages/core/src/contract/types.ts`:

```typescript
export type ContractOperator = "gte" | "lte" | "eq";
export type ContractMeasurement = "automatic" | "manual";
export type ContractKind = "outbound" | "report" | "pr-review" | "custom";
export type EscalationChannel = "slack" | "email" | "github";

export interface SuccessCriterion {
  name: string;
  metric: string;
  target: number;
  operator: ContractOperator;
  measurement: ContractMeasurement;
}

export interface ContractBudget {
  tokens?: number;
  usd?: number;
  hard_cap: boolean;
}

export interface EscalationRule {
  trigger: string;
  channel: EscalationChannel;
  contact: string;
}

export interface Contract {
  id: string;
  version: string;
  kind: ContractKind;
  owner: string;
  outcome: string;
  deadline: string;
  success_criteria: SuccessCriterion[];
  budget: ContractBudget;
  escalation: EscalationRule[];
  metadata?: Record<string, string | number | boolean>;
}

export interface ContractError {
  code: "PARSE_ERROR" | "SCHEMA_ERROR";
  message: string;
  details?: unknown;
}

export type Result<T, E = ContractError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

---

## Task 3: Zod schema

**Files:**
- Create: `packages/core/src/contract/schema.ts`

- [ ] **Step 1: Create schema.ts**

Create `packages/core/src/contract/schema.ts`:

```typescript
import { z } from "zod";

const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const semverRegex = /^\d+\.\d+\.\d+$/;

export const SuccessCriterionSchema = z.object({
  name: z.string().min(1).max(64),
  metric: z.string().min(1).max(128),
  target: z.number(),
  operator: z.enum(["gte", "lte", "eq"]),
  measurement: z.enum(["automatic", "manual"]).default("automatic"),
});

export const ContractBudgetSchema = z
  .object({
    tokens: z.number().positive().optional(),
    usd: z.number().positive().optional(),
    hard_cap: z.boolean(),
  })
  .refine((b) => b.tokens !== undefined || b.usd !== undefined, {
    message: "At least one of tokens or usd must be specified",
  });

export const EscalationRuleSchema = z.object({
  trigger: z.string().min(1).max(64),
  channel: z.enum(["slack", "email", "github"]),
  contact: z.string().min(1).max(256),
});

export const ContractSchema = z
  .object({
    id: z
      .string()
      .min(3)
      .max(64)
      .regex(slugRegex, "id must be a lowercase slug (a-z, 0-9, hyphens)"),
    version: z
      .string()
      .regex(semverRegex, "version must be semver (e.g. 1.0.0)"),
    kind: z.enum(["outbound", "report", "pr-review", "custom"]),
    owner: z.string().email(),
    outcome: z.string().min(1).max(500),
    deadline: z.string().datetime({ message: "deadline must be ISO 8601 UTC datetime" }),
    success_criteria: z.array(SuccessCriterionSchema).min(1).max(10),
    budget: ContractBudgetSchema,
    escalation: z.array(EscalationRuleSchema).min(1).max(5),
    metadata: z
      .record(z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
  })
  .refine(
    (c) =>
      new Set(c.success_criteria.map((s) => s.name)).size ===
      c.success_criteria.length,
    { message: "success_criteria names must be unique within a contract" },
  )
  .refine(
    (c) =>
      new Set(c.escalation.map((e) => e.trigger)).size ===
      c.escalation.length,
    { message: "escalation triggers must be unique within a contract" },
  );

export type ContractInput = z.input<typeof ContractSchema>;
export type ContractOutput = z.output<typeof ContractSchema>;
```

---

## Task 4: Parser + unit tests

**Files:**
- Create: `packages/core/src/contract/parser.ts`
- Modify: `packages/core/src/__tests__/contract/parser.test.ts`

- [ ] **Step 1: Expand parser test with real cases**

Overwrite `packages/core/src/__tests__/contract/parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseContract } from "../../contract/parser.js";

const VALID_TOML = `
id = "outbound-q2-2026"
version = "1.0.0"
kind = "outbound"
owner = "nikhil@example.com"
outcome = "Land 3 qualified demo calls from cold outbound"
deadline = "2026-06-30T23:59:59Z"

[[success_criteria]]
name = "demo_calls"
metric = "qualified_demo_calls"
target = 3
operator = "gte"

[budget]
tokens = 500000
usd = 50.0
hard_cap = true

[[escalation]]
trigger = "budget_80pct"
channel = "slack"
contact = "@nikhil"
`;

describe("parseContract", () => {
  it("parses a valid contract", () => {
    const result = parseContract(VALID_TOML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("outbound-q2-2026");
    expect(result.value.kind).toBe("outbound");
    expect(result.value.success_criteria).toHaveLength(1);
    expect(result.value.success_criteria[0]!.measurement).toBe("automatic");
  });

  it("returns PARSE_ERROR on invalid TOML syntax", () => {
    const result = parseContract("id = [broken toml");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
  });

  it("returns SCHEMA_ERROR when id is not a slug", () => {
    const bad = VALID_TOML.replace('id = "outbound-q2-2026"', 'id = "UPPER CASE"');
    const result = parseContract(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_ERROR");
    expect(result.error.message).toContain("id");
  });

  it("returns SCHEMA_ERROR when budget has no tokens or usd", () => {
    const bad = VALID_TOML.replace(
      "[budget]\ntokens = 500000\nusd = 50.0\nhard_cap = true",
      "[budget]\nhard_cap = true",
    );
    const result = parseContract(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_ERROR");
  });

  it("returns SCHEMA_ERROR when success_criteria names are duplicated", () => {
    const dup = VALID_TOML + `
[[success_criteria]]
name = "demo_calls"
metric = "other_metric"
target = 1
operator = "gte"
`;
    const result = parseContract(dup);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_ERROR");
  });

  it("returns SCHEMA_ERROR on invalid email owner", () => {
    const bad = VALID_TOML.replace('owner = "nikhil@example.com"', 'owner = "not-an-email"');
    const result = parseContract(bad);
    expect(result.ok).toBe(false);
  });

  it("returns SCHEMA_ERROR on invalid deadline format", () => {
    const bad = VALID_TOML.replace(
      'deadline = "2026-06-30T23:59:59Z"',
      'deadline = "June 30, 2026"',
    );
    const result = parseContract(bad);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd packages/core && bun test src/__tests__/contract/parser.test.ts
```

Expected: FAIL — `Cannot find module '../../contract/parser.js'`

- [ ] **Step 3: Create parser.ts**

Create `packages/core/src/contract/parser.ts`:

```typescript
import { parse as parseTOML } from "smol-toml";
import { ContractSchema } from "./schema.js";
import type { Contract, ContractError, Result } from "./types.js";

export function parseContract(toml: string): Result<Contract, ContractError> {
  let raw: unknown;
  try {
    raw = parseTOML(toml);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "PARSE_ERROR",
        message: `TOML parse error: ${err instanceof Error ? err.message : String(err)}`,
        details: err,
      },
    };
  }

  const result = ContractSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: "SCHEMA_ERROR",
        message: result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        details: result.error.issues,
      },
    };
  }

  return { ok: true, value: result.data as Contract };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd packages/core && bun test src/__tests__/contract/parser.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/contract/types.ts packages/core/src/contract/schema.ts packages/core/src/contract/parser.ts packages/core/src/__tests__/contract/parser.test.ts packages/core/package.json packages/cli/package.json bun.lock
git commit -m "feat(core): Contract DSL types, Zod schema, and TOML parser"
```

---

## Task 5: Content hash (BLAKE3)

**Files:**
- Create: `packages/core/src/contract/hash.ts`

- [ ] **Step 1: Create hash.ts**

Create `packages/core/src/contract/hash.ts`:

```typescript
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import type { Contract } from "./types.js";

function canonicalJson(contract: Contract): string {
  const sorted = sortObjectKeys(contract as unknown as Record<string, unknown>);
  return JSON.stringify(sorted);
}

function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

export function contractHash(contract: Contract): string {
  const json = canonicalJson(contract);
  const bytes = new TextEncoder().encode(json);
  return bytesToHex(blake3(bytes));
}
```

- [ ] **Step 2: Add hash test**

Create `packages/core/src/__tests__/contract/hash.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { contractHash } from "../../contract/hash.js";
import { parseContract } from "../../contract/parser.js";

const VALID_TOML = `
id = "hash-test"
version = "1.0.0"
kind = "custom"
owner = "test@example.com"
outcome = "Test hash stability"
deadline = "2026-12-31T23:59:59Z"

[[success_criteria]]
name = "done"
metric = "tasks_completed"
target = 1
operator = "gte"

[budget]
usd = 10.0
hard_cap = true

[[escalation]]
trigger = "budget_80pct"
channel = "email"
contact = "test@example.com"
`;

describe("contractHash", () => {
  it("returns a 64-char hex string", () => {
    const result = parseContract(VALID_TOML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hash = contractHash(result.value);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same contract yields same hash", () => {
    const result = parseContract(VALID_TOML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const h1 = contractHash(result.value);
    const h2 = contractHash(result.value);
    expect(h1).toBe(h2);
  });

  it("differs when outcome changes", () => {
    const r1 = parseContract(VALID_TOML);
    const r2 = parseContract(VALID_TOML.replace("Test hash stability", "Different outcome"));
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(contractHash(r1.value)).not.toBe(contractHash(r2.value));
  });
});
```

- [ ] **Step 3: Run hash tests**

```bash
cd packages/core && bun test src/__tests__/contract/hash.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/contract/hash.ts packages/core/src/__tests__/contract/hash.test.ts
git commit -m "feat(core): BLAKE3 content hash for contracts"
```

---

## Task 6: Semantic diff engine

**Files:**
- Create: `packages/core/src/contract/diff.ts`
- Create: `packages/core/src/__tests__/contract/diff.test.ts`

- [ ] **Step 1: Write failing diff tests**

Create `packages/core/src/__tests__/contract/diff.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { diffContracts } from "../../contract/diff.js";
import { parseContract } from "../../contract/parser.js";
import type { Contract } from "../../contract/types.js";

function makeContract(overrides: Partial<Record<string, unknown>> = {}): Contract {
  const base = `
id = "diff-test"
version = "1.0.0"
kind = "custom"
owner = "test@example.com"
outcome = "Base outcome"
deadline = "2026-12-31T23:59:59Z"

[[success_criteria]]
name = "done"
metric = "tasks_completed"
target = 1
operator = "gte"

[budget]
usd = 10.0
hard_cap = true

[[escalation]]
trigger = "budget_80pct"
channel = "email"
contact = "test@example.com"
`;
  const result = parseContract(base);
  if (!result.ok) throw new Error("invalid base: " + result.error.message);
  return { ...result.value, ...overrides } as Contract;
}

describe("diffContracts", () => {
  it("returns empty diff for identical contracts", () => {
    const c = makeContract();
    expect(diffContracts(c, c)).toEqual([]);
  });

  it("detects outcome_changed", () => {
    const a = makeContract();
    const b = makeContract({ outcome: "Different outcome" });
    expect(diffContracts(a, b)).toContain("outcome_changed");
  });

  it("detects deadline_shifted", () => {
    const a = makeContract();
    const b = makeContract({ deadline: "2027-01-01T00:00:00Z" });
    expect(diffContracts(a, b)).toContain("deadline_shifted");
  });

  it("detects budget_changed", () => {
    const a = makeContract();
    const b = makeContract({ budget: { usd: 99.0, hard_cap: true } });
    expect(diffContracts(a, b)).toContain("budget_changed");
  });

  it("detects criteria_modified", () => {
    const a = makeContract();
    const b = makeContract({
      success_criteria: [{ name: "done", metric: "tasks_completed", target: 5, operator: "gte", measurement: "automatic" }],
    });
    expect(diffContracts(a, b)).toContain("criteria_modified");
  });

  it("detects kind_changed", () => {
    const a = makeContract();
    const b = makeContract({ kind: "outbound" });
    expect(diffContracts(a, b)).toContain("kind_changed");
  });

  it("detects metadata_only when only metadata differs", () => {
    const a = makeContract();
    const b = makeContract({ metadata: { tag: "v2" } });
    const diff = diffContracts(a, b);
    expect(diff).toContain("metadata_only");
    expect(diff).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd packages/core && bun test src/__tests__/contract/diff.test.ts
```

Expected: FAIL — `Cannot find module '../../contract/diff.js'`

- [ ] **Step 3: Create diff.ts**

Create `packages/core/src/contract/diff.ts`:

```typescript
import type { Contract } from "./types.js";

export type DiffCategory =
  | "outcome_changed"
  | "deadline_shifted"
  | "budget_changed"
  | "criteria_added"
  | "criteria_removed"
  | "criteria_modified"
  | "escalation_changed"
  | "kind_changed"
  | "metadata_only";

export function diffContracts(a: Contract, b: Contract): DiffCategory[] {
  const changes: DiffCategory[] = [];

  if (a.kind !== b.kind) changes.push("kind_changed");
  if (a.outcome !== b.outcome) changes.push("outcome_changed");
  if (a.deadline !== b.deadline) changes.push("deadline_shifted");

  if (JSON.stringify(a.budget) !== JSON.stringify(b.budget)) {
    changes.push("budget_changed");
  }

  const aNames = new Set(a.success_criteria.map((s) => s.name));
  const bNames = new Set(b.success_criteria.map((s) => s.name));

  const added = [...bNames].filter((n) => !aNames.has(n));
  const removed = [...aNames].filter((n) => !bNames.has(n));
  if (added.length > 0) changes.push("criteria_added");
  if (removed.length > 0) changes.push("criteria_removed");

  const sharedNames = [...aNames].filter((n) => bNames.has(n));
  const aMap = new Map(a.success_criteria.map((s) => [s.name, s]));
  const bMap = new Map(b.success_criteria.map((s) => [s.name, s]));
  const criteriaModified = sharedNames.some(
    (n) => JSON.stringify(aMap.get(n)) !== JSON.stringify(bMap.get(n)),
  );
  if (criteriaModified) changes.push("criteria_modified");

  if (JSON.stringify(a.escalation) !== JSON.stringify(b.escalation)) {
    changes.push("escalation_changed");
  }

  const coreChanged = changes.length > 0;
  const metaA = JSON.stringify(a.metadata ?? {});
  const metaB = JSON.stringify(b.metadata ?? {});
  if (!coreChanged && metaA !== metaB) {
    changes.push("metadata_only");
  }

  return changes;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd packages/core && bun test src/__tests__/contract/diff.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/contract/diff.ts packages/core/src/__tests__/contract/diff.test.ts
git commit -m "feat(core): semantic diff engine for contract versions"
```

---

## Task 7: SQLite contract store

**Files:**
- Create: `packages/core/src/contract/store.ts`
- Create: `packages/core/src/__tests__/contract/store.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `packages/core/src/__tests__/contract/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ContractStore } from "../../contract/store.js";
import { parseContract } from "../../contract/parser.js";
import { rmSync } from "node:fs";

const DB_PATH = "/tmp/argus-test-store.db";

const TOML_V1 = `
id = "store-test"
version = "1.0.0"
kind = "custom"
owner = "test@example.com"
outcome = "Store test v1"
deadline = "2026-12-31T23:59:59Z"

[[success_criteria]]
name = "done"
metric = "tasks_completed"
target = 1
operator = "gte"

[budget]
usd = 10.0
hard_cap = true

[[escalation]]
trigger = "budget_80pct"
channel = "email"
contact = "test@example.com"
`;

const TOML_V2 = TOML_V1
  .replace('version = "1.0.0"', 'version = "2.0.0"')
  .replace('outcome = "Store test v1"', 'outcome = "Store test v2"');

describe("ContractStore", () => {
  let store: ContractStore;

  beforeEach(() => {
    store = new ContractStore(DB_PATH);
  });

  afterEach(() => {
    store.close();
    try { rmSync(DB_PATH); } catch {}
  });

  it("saves and loads a contract by id+version", () => {
    const r = parseContract(TOML_V1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    store.save(r.value);
    const loaded = store.load("store-test", "1.0.0");
    expect(loaded).not.toBeNull();
    expect(loaded?.outcome).toBe("Store test v1");
  });

  it("returns null for unknown contract", () => {
    expect(store.load("nonexistent", "1.0.0")).toBeNull();
  });

  it("saves multiple versions and lists them", () => {
    const r1 = parseContract(TOML_V1);
    const r2 = parseContract(TOML_V2);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    store.save(r1.value);
    store.save(r2.value);
    const versions = store.listVersions("store-test");
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.version)).toContain("1.0.0");
    expect(versions.map((v) => v.version)).toContain("2.0.0");
  });

  it("throws when saving duplicate id+version", () => {
    const r = parseContract(TOML_V1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    store.save(r.value);
    expect(() => store.save(r.value)).toThrow();
  });

  it("loadLatest returns the most recently saved version", () => {
    const r1 = parseContract(TOML_V1);
    const r2 = parseContract(TOML_V2);
    if (!r1.ok || !r2.ok) return;
    store.save(r1.value);
    store.save(r2.value);
    const latest = store.loadLatest("store-test");
    expect(latest?.version).toBe("2.0.0");
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd packages/core && bun test src/__tests__/contract/store.test.ts
```

Expected: FAIL — `Cannot find module '../../contract/store.js'`

- [ ] **Step 3: Create store.ts**

Create `packages/core/src/contract/store.ts`:

```typescript
import { Database } from "bun:sqlite";
import { contractHash } from "./hash.js";
import type { Contract } from "./types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  parent_version TEXT,
  body_blake3 TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  owner TEXT NOT NULL,
  PRIMARY KEY (id, version)
) STRICT;
`;

export interface ContractRecord {
  id: string;
  version: string;
  parent_version: string | null;
  body_blake3: string;
  created_at: number;
  owner: string;
}

export class ContractStore {
  private db: Database;

  constructor(path: string = ":memory:") {
    this.db = new Database(path, { create: true });
    this.db.run("PRAGMA journal_mode=WAL;");
    this.db.run(SCHEMA);
  }

  save(contract: Contract, parentVersion?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO contracts (id, version, parent_version, body_blake3, body, created_at, owner)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      contract.id,
      contract.version,
      parentVersion ?? null,
      contractHash(contract),
      JSON.stringify(contract),
      Date.now(),
      contract.owner,
    );
  }

  load(id: string, version: string): Contract | null {
    const row = this.db
      .prepare("SELECT body FROM contracts WHERE id = ? AND version = ?")
      .get(id, version) as { body: string } | null;
    return row ? (JSON.parse(row.body) as Contract) : null;
  }

  loadLatest(id: string): Contract | null {
    const row = this.db
      .prepare("SELECT body FROM contracts WHERE id = ? ORDER BY created_at DESC LIMIT 1")
      .get(id) as { body: string } | null;
    return row ? (JSON.parse(row.body) as Contract) : null;
  }

  listVersions(id: string): ContractRecord[] {
    return this.db
      .prepare(
        "SELECT id, version, parent_version, body_blake3, created_at, owner FROM contracts WHERE id = ? ORDER BY created_at ASC",
      )
      .all(id) as ContractRecord[];
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd packages/core && bun test src/__tests__/contract/store.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/contract/store.ts packages/core/src/__tests__/contract/store.test.ts
git commit -m "feat(core): SQLite contract store — append-only, content-addressed"
```

---

## Task 8: Property tests (fast-check)

**Files:**
- Create: `packages/core/src/__tests__/contract/parser.property.test.ts`

- [ ] **Step 1: Create property tests**

Create `packages/core/src/__tests__/contract/parser.property.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { parseContract } from "../../contract/parser.js";
import { contractHash } from "../../contract/hash.js";

const validSlug = fc.stringMatching(/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/);
const validEmail = fc.emailAddress();
const validOperator = fc.constantFrom("gte", "lte", "eq" as const);
const validChannel = fc.constantFrom("slack", "email", "github" as const);

function buildTOML(overrides: Record<string, string> = {}): string {
  return `
id = "${overrides.id ?? "prop-test"}"
version = "1.0.0"
kind = "custom"
owner = "${overrides.owner ?? "test@example.com"}"
outcome = "${overrides.outcome ?? "Property test outcome"}"
deadline = "2026-12-31T23:59:59Z"

[[success_criteria]]
name = "done"
metric = "tasks_completed"
target = ${overrides.target ?? "1"}
operator = "gte"

[budget]
usd = 10.0
hard_cap = true

[[escalation]]
trigger = "budget_80pct"
channel = "email"
contact = "test@example.com"
`;
}

describe("parseContract — property tests", () => {
  it("valid slugs always parse successfully", () => {
    fc.assert(
      fc.property(validSlug, (id) => {
        const result = parseContract(buildTOML({ id }));
        return result.ok === true;
      }),
      { numRuns: 100 },
    );
  });

  it("round-trip: parse → serialize canonical JSON → hash is stable", () => {
    fc.assert(
      fc.property(
        fc.record({
          outcome: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => !s.includes('"')),
        }),
        ({ outcome }) => {
          const r = parseContract(buildTOML({ outcome }));
          if (!r.ok) return true;
          const h1 = contractHash(r.value);
          const h2 = contractHash(r.value);
          return h1 === h2;
        },
      ),
      { numRuns: 200 },
    );
  });

  it("any mutation to outcome changes the hash", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => !s.includes('"')),
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => !s.includes('"')),
        ),
        ([o1, o2]) => {
          if (o1 === o2) return true;
          const r1 = parseContract(buildTOML({ outcome: o1 }));
          const r2 = parseContract(buildTOML({ outcome: o2 }));
          if (!r1.ok || !r2.ok) return true;
          return contractHash(r1.value) !== contractHash(r2.value);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("malformed TOML always returns ok:false", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => {
          try { JSON.parse(s); return false; } catch { return true; }
        }),
        (garbage) => {
          const result = parseContract("[[[[" + garbage);
          return result.ok === false;
        },
      ),
      { numRuns: 50 },
    );
  });
});
```

- [ ] **Step 2: Run property tests**

```bash
cd packages/core && bun test src/__tests__/contract/parser.property.test.ts
```

Expected: All 4 property tests PASS (each runs 50–200 examples).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/__tests__/contract/parser.property.test.ts
git commit -m "test(core): fast-check property tests for Contract parser + hash"
```

---

## Task 9: Example contracts

**Files:**
- Create: `examples/contracts/outbound-3-demos.toml`
- Create: `examples/contracts/weekly-rev-report.toml`
- Create: `examples/contracts/pr-review-sla.toml`

- [ ] **Step 1: Create outbound-3-demos.toml**

Create `examples/contracts/outbound-3-demos.toml`:

```toml
id = "outbound-3-demos"
version = "1.0.0"
kind = "outbound"
owner = "nikhilkumargupta58@gmail.com"
outcome = "Land 3 qualified demo calls from cold outbound within 30 days"
deadline = "2026-06-12T23:59:59Z"

[[success_criteria]]
name = "demo_calls_landed"
metric = "qualified_demo_calls"
target = 3
operator = "gte"
measurement = "manual"

[[success_criteria]]
name = "reply_rate"
metric = "reply_rate_pct"
target = 5
operator = "gte"
measurement = "automatic"

[budget]
tokens = 500_000
usd = 50.00
hard_cap = true

[[escalation]]
trigger = "budget_80pct"
channel = "slack"
contact = "@nikhil"

[[escalation]]
trigger = "deadline_48h"
channel = "email"
contact = "nikhilkumargupta58@gmail.com"

[metadata]
campaign = "year1-launch"
target_segment = "b2b-saas-founders"
```

- [ ] **Step 2: Create weekly-rev-report.toml**

Create `examples/contracts/weekly-rev-report.toml`:

```toml
id = "weekly-rev-report"
version = "1.0.0"
kind = "report"
owner = "nikhilkumargupta58@gmail.com"
outcome = "Produce a weekly revenue report pulling from Stripe, delivered every Monday by 9am"
deadline = "2026-12-31T23:59:59Z"

[[success_criteria]]
name = "report_delivered"
metric = "reports_delivered_on_time"
target = 52
operator = "gte"
measurement = "automatic"

[[success_criteria]]
name = "data_freshness"
metric = "data_lag_hours"
target = 1
operator = "lte"
measurement = "automatic"

[budget]
tokens = 100_000
usd = 10.00
hard_cap = false

[[escalation]]
trigger = "criterion_missed"
channel = "slack"
contact = "@nikhil"

[[escalation]]
trigger = "budget_80pct"
channel = "email"
contact = "nikhilkumargupta58@gmail.com"

[metadata]
cadence = "weekly"
sources = "stripe,notion"
```

- [ ] **Step 3: Create pr-review-sla.toml**

Create `examples/contracts/pr-review-sla.toml`:

```toml
id = "pr-review-sla"
version = "1.0.0"
kind = "pr-review"
owner = "nikhilkumargupta58@gmail.com"
outcome = "Review every open PR within 4 hours of opening, posting a structured review comment"
deadline = "2026-12-31T23:59:59Z"

[[success_criteria]]
name = "review_latency"
metric = "p95_review_latency_hours"
target = 4
operator = "lte"
measurement = "automatic"

[[success_criteria]]
name = "coverage"
metric = "prs_reviewed_pct"
target = 100
operator = "gte"
measurement = "automatic"

[budget]
tokens = 2_000_000
usd = 200.00
hard_cap = false

[[escalation]]
trigger = "criterion_missed"
channel = "github"
contact = "@nikhilgupta58"

[[escalation]]
trigger = "budget_80pct"
channel = "email"
contact = "nikhilkumargupta58@gmail.com"

[metadata]
repo = "nikhilgupta58/argus"
```

- [ ] **Step 4: Verify all examples parse cleanly**

Add a quick validation test in `packages/core/src/__tests__/contract/examples.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseContract } from "../../contract/parser.js";

const EXAMPLES_DIR = join(import.meta.dir, "../../../../../examples/contracts");

const EXAMPLES = [
  "outbound-3-demos.toml",
  "weekly-rev-report.toml",
  "pr-review-sla.toml",
];

describe("example contracts", () => {
  for (const file of EXAMPLES) {
    it(`${file} parses and validates`, () => {
      const toml = readFileSync(join(EXAMPLES_DIR, file), "utf-8");
      const result = parseContract(toml);
      expect(result.ok, result.ok ? "" : (result as { ok: false; error: { message: string } }).error.message).toBe(true);
    });
  }
});
```

- [ ] **Step 5: Run example tests**

```bash
cd packages/core && bun test src/__tests__/contract/examples.test.ts
```

Expected: 3 tests PASS (one per example file).

- [ ] **Step 6: Commit**

```bash
git add examples/contracts/ packages/core/src/__tests__/contract/examples.test.ts
git commit -m "feat(examples): three reference Outcome Contracts (outbound, report, pr-review)"
```

---

## Task 10: Barrel export

**Files:**
- Create: `packages/core/src/contract/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create contract/index.ts**

Create `packages/core/src/contract/index.ts`:

```typescript
export { parseContract } from "./parser.js";
export { contractHash } from "./hash.js";
export { diffContracts } from "./diff.js";
export type { DiffCategory } from "./diff.js";
export { ContractStore } from "./store.js";
export type { ContractRecord } from "./store.js";
export type {
  Contract,
  ContractError,
  Result,
  ContractKind,
  ContractOperator,
  ContractMeasurement,
  EscalationChannel,
  SuccessCriterion,
  ContractBudget,
  EscalationRule,
} from "./types.js";
```

- [ ] **Step 2: Update core/src/index.ts**

Replace `packages/core/src/index.ts` contents:

```typescript
export const ARGUS_VERSION = "0.0.1";
export * from "./contract/index.js";
```

- [ ] **Step 3: Run full core test suite**

```bash
cd packages/core && bun test
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/contract/index.ts packages/core/src/index.ts
git commit -m "feat(core): barrel exports for contract layer"
```

---

## Task 11: CLI contract commands

**Files:**
- Create: `packages/cli/src/commands/contract.ts`
- Modify: `packages/cli/src/main.ts`

- [ ] **Step 1: Write CLI command stubs test**

Create `packages/cli/src/__tests__/contract.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { contractCommand } from "../commands/contract.js";

describe("contractCommand", () => {
  it("is a commander Command", () => {
    expect(contractCommand.name()).toBe("contract");
  });

  it("has create, edit, validate, show, diff subcommands", () => {
    const names = contractCommand.commands.map((c) => c.name());
    expect(names).toContain("create");
    expect(names).toContain("edit");
    expect(names).toContain("validate");
    expect(names).toContain("show");
    expect(names).toContain("diff");
  });
});
```

- [ ] **Step 2: Run test — confirm fail**

```bash
cd packages/cli && bun test src/__tests__/contract.test.ts
```

Expected: FAIL — `Cannot find module '../commands/contract.js'`

- [ ] **Step 3: Create contract.ts**

Create `packages/cli/src/commands/contract.ts`:

```typescript
import { Command } from "commander";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import pc from "picocolors";
import { parseContract, contractHash, diffContracts, ContractStore } from "@argus/core";

const DB_PATH = process.env["ARGUS_DB"] ?? `${process.env["HOME"]}/.argus/argus.db`;

function getStore(): ContractStore {
  const dir = DB_PATH.replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return new ContractStore(DB_PATH);
}

export const contractCommand = new Command("contract")
  .description("Manage Outcome Contracts");

contractCommand
  .command("validate <file>")
  .description("Validate a contract TOML file")
  .action((file: string) => {
    let toml: string;
    try {
      toml = readFileSync(file, "utf-8");
    } catch {
      console.error(pc.red(`Error: cannot read file ${file}`));
      process.exit(1);
    }
    const result = parseContract(toml);
    if (result.ok) {
      console.log(pc.green("✓ Valid contract"));
      console.log(`  id:      ${result.value.id}`);
      console.log(`  version: ${result.value.version}`);
      console.log(`  kind:    ${result.value.kind}`);
      console.log(`  hash:    ${contractHash(result.value)}`);
    } else {
      console.error(pc.red(`✗ Invalid contract: ${result.error.message}`));
      process.exit(1);
    }
  });

contractCommand
  .command("show <id> [version]")
  .description("Show a contract from the store")
  .action((id: string, version?: string) => {
    const store = getStore();
    const contract = version ? store.load(id, version) : store.loadLatest(id);
    store.close();
    if (!contract) {
      console.error(pc.red(`Contract not found: ${id}${version ? `@${version}` : ""}`));
      process.exit(1);
    }
    console.log(pc.bold(`Contract: ${contract.id} v${contract.version}`));
    console.log(`  kind:     ${contract.kind}`);
    console.log(`  owner:    ${contract.owner}`);
    console.log(`  outcome:  ${contract.outcome}`);
    console.log(`  deadline: ${contract.deadline}`);
    console.log(pc.bold("\nSuccess Criteria:"));
    for (const sc of contract.success_criteria) {
      console.log(`  [${sc.name}] ${sc.metric} ${sc.operator} ${sc.target}`);
    }
    console.log(pc.bold("\nBudget:"));
    if (contract.budget.tokens) console.log(`  tokens: ${contract.budget.tokens}`);
    if (contract.budget.usd) console.log(`  usd: $${contract.budget.usd}`);
    console.log(`  hard_cap: ${contract.budget.hard_cap}`);
  });

contractCommand
  .command("create <file>")
  .description("Parse, validate, and persist a contract from a TOML file")
  .action((file: string) => {
    let toml: string;
    try {
      toml = readFileSync(file, "utf-8");
    } catch {
      console.error(pc.red(`Error: cannot read file ${file}`));
      process.exit(1);
    }
    const result = parseContract(toml);
    if (!result.ok) {
      console.error(pc.red(`✗ Validation failed: ${result.error.message}`));
      process.exit(1);
    }
    const store = getStore();
    store.save(result.value);
    store.close();
    console.log(pc.green(`✓ Contract saved: ${result.value.id} v${result.value.version}`));
    console.log(`  hash: ${contractHash(result.value)}`);
  });

contractCommand
  .command("edit <file>")
  .description("Save a new version of an existing contract (file must have bumped version)")
  .action((file: string) => {
    let toml: string;
    try {
      toml = readFileSync(file, "utf-8");
    } catch {
      console.error(pc.red(`Error: cannot read file ${file}`));
      process.exit(1);
    }
    const result = parseContract(toml);
    if (!result.ok) {
      console.error(pc.red(`✗ Validation failed: ${result.error.message}`));
      process.exit(1);
    }
    const store = getStore();
    const latest = store.loadLatest(result.value.id);
    if (!latest) {
      console.error(pc.red(`Contract ${result.value.id} not found. Use 'create' to add it first.`));
      store.close();
      process.exit(1);
    }
    if (latest.version === result.value.version) {
      console.error(pc.red(`Version ${result.value.version} already exists. Bump the version field.`));
      store.close();
      process.exit(1);
    }
    store.save(result.value, latest.version);
    store.close();
    console.log(pc.green(`✓ Contract updated: ${result.value.id} v${latest.version} → v${result.value.version}`));
    console.log(`  hash: ${contractHash(result.value)}`);
  });

contractCommand
  .command("diff <id> <versionA> <versionB>")
  .description("Show semantic diff between two versions of a contract")
  .action((id: string, versionA: string, versionB: string) => {
    const store = getStore();
    const a = store.load(id, versionA);
    const b = store.load(id, versionB);
    store.close();
    if (!a) { console.error(pc.red(`Version ${versionA} not found`)); process.exit(1); }
    if (!b) { console.error(pc.red(`Version ${versionB} not found`)); process.exit(1); }
    const changes = diffContracts(a, b);
    if (changes.length === 0) {
      console.log(pc.green("No semantic changes between versions"));
    } else {
      console.log(pc.bold(`Changes from ${versionA} → ${versionB}:`));
      for (const change of changes) {
        console.log(`  ${pc.yellow("~")} ${change}`);
      }
    }
  });
```

- [ ] **Step 4: Update main.ts**

Overwrite `packages/cli/src/main.ts`:

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { ARGUS_VERSION } from "@argus/core";
import { contractCommand } from "./commands/contract.js";

const program = new Command();

program
  .name("argus")
  .description("Outcome-owning agents with signed lineage")
  .version(ARGUS_VERSION);

program.addCommand(contractCommand);

program.parse(process.argv);
```

- [ ] **Step 5: Run CLI tests**

```bash
cd packages/cli && bun test src/__tests__/contract.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 6: Smoke-test the CLI manually**

```bash
cd /path/to/argus && bun packages/cli/src/main.ts contract validate examples/contracts/outbound-3-demos.toml
```

Expected output:
```
✓ Valid contract
  id:      outbound-3-demos
  version: 1.0.0
  kind:    outbound
  hash:    <64-char hex>
```

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/contract.ts packages/cli/src/main.ts packages/cli/src/__tests__/contract.test.ts
git commit -m "feat(cli): argus contract create/validate/show/diff commands"
```

---

## Task 12: End-to-end integration test

**Files:**
- Create: `packages/core/src/__tests__/contract/integration.test.ts`

- [ ] **Step 1: Write integration test**

Create `packages/core/src/__tests__/contract/integration.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { parseContract, contractHash, diffContracts, ContractStore } from "../../contract/index.js";

const DB_PATH = "/tmp/argus-integration-test.db";
const EXAMPLES = join(import.meta.dir, "../../../../../examples/contracts");

afterEach(() => {
  try { rmSync(DB_PATH); } catch {}
});

describe("Contract Layer — end-to-end", () => {
  it("full lifecycle: create → save → load → edit → diff → save → load latest", () => {
    const store = new ContractStore(DB_PATH);

    // 1. Parse example contract
    const toml = readFileSync(join(EXAMPLES, "outbound-3-demos.toml"), "utf-8");
    const r1 = parseContract(toml);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // 2. Save v1
    store.save(r1.value);
    const loaded1 = store.load("outbound-3-demos", "1.0.0");
    expect(loaded1?.outcome).toContain("3 qualified demo calls");

    // 3. Simulate edit: bump version + change outcome
    const v2 = {
      ...r1.value,
      version: "2.0.0",
      outcome: "Land 5 qualified demo calls from cold outbound within 30 days",
    };

    // 4. Save v2 with parent reference
    store.save(v2, "1.0.0");

    // 5. Diff v1 → v2
    const changes = diffContracts(r1.value, v2);
    expect(changes).toContain("outcome_changed");
    expect(changes).not.toContain("budget_changed");
    expect(changes).not.toContain("deadline_shifted");

    // 6. Load latest resolves to v2
    const latest = store.loadLatest("outbound-3-demos");
    expect(latest?.version).toBe("2.0.0");
    expect(latest?.outcome).toContain("5 qualified demo calls");

    // 7. Hash of v1 and v2 differ
    const h1 = contractHash(r1.value);
    const h2 = contractHash(v2);
    expect(h1).not.toBe(h2);

    // 8. List versions returns both
    const versions = store.listVersions("outbound-3-demos");
    expect(versions).toHaveLength(2);

    store.close();
  });

  it("all three example contracts parse, validate, persist, and reload cleanly", () => {
    const store = new ContractStore(DB_PATH);
    const files = ["outbound-3-demos.toml", "weekly-rev-report.toml", "pr-review-sla.toml"];

    for (const file of files) {
      const toml = readFileSync(join(EXAMPLES, file), "utf-8");
      const r = parseContract(toml);
      expect(r.ok, `${file}: ${r.ok ? "" : (r as { ok: false; error: { message: string } }).error.message}`).toBe(true);
      if (!r.ok) continue;

      store.save(r.value);
      const loaded = store.loadLatest(r.value.id);
      expect(loaded?.id).toBe(r.value.id);
      expect(contractHash(loaded!)).toBe(contractHash(r.value));
    }

    store.close();
  });

  it("completing the full workflow in under 100ms", () => {
    const start = performance.now();
    const store = new ContractStore(DB_PATH);
    const toml = readFileSync(join(EXAMPLES, "outbound-3-demos.toml"), "utf-8");
    const r = parseContract(toml);
    if (!r.ok) throw new Error(r.error.message);
    store.save(r.value);
    store.loadLatest("outbound-3-demos");
    store.close();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
```

- [ ] **Step 2: Run integration test**

```bash
cd packages/core && bun test src/__tests__/contract/integration.test.ts
```

Expected: All 3 integration tests PASS (including the <100ms perf check).

- [ ] **Step 3: Run full test suite**

```bash
cd /path/to/argus && bun test
```

Expected: All tests across all packages PASS.

- [ ] **Step 4: Final commit**

```bash
git add packages/core/src/__tests__/contract/integration.test.ts
git commit -m "test(core): end-to-end integration tests for Contract Layer

Full lifecycle: parse → hash → store → load → diff → reload.
All three example contracts verified. Performance gate: <100ms.

Phase 1 (Contract Layer) complete."
```

---

## Phase 1 exit criteria checklist

- [ ] `argus contract validate examples/contracts/outbound-3-demos.toml` exits 0 in under 1s
- [ ] All unit, property, and integration tests pass: `bun test`
- [ ] Three example contracts exist and parse cleanly
- [ ] SQLite store persists across process restarts (test manually by running create, then show in a new process)
- [ ] Semantic diff correctly categorizes all 8 diff categories
- [ ] BLAKE3 hash is deterministic and changes with any content mutation
