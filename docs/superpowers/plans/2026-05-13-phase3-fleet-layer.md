# Phase 3 — Fleet Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the specialist runtime (Bun subprocess sandbox, content-addressed registry, orchestrator), three reference specialists (outbound, weekly-report, pr-review), and an initiative engine (cron/webhook daemon, budget enforcement, human-in-the-loop escalation).

**Architecture:** Each specialist is a TypeScript module with a default export implementing the `Specialist` interface; its file is BLAKE3-hashed at install time and verified at load time. The orchestrator reads a contract from ContractStore, picks the matching specialist by `contractKind`, runs it in a Bun subprocess sandbox, and emits signed lineage events (specialist_started → specialist_completed / specialist_failed / budget_exceeded) using the Phase 2 signing layer. The initiative engine wraps the orchestrator with cron scheduling, webhook triggers, budget tracking, and escalation dispatch.

**Tech Stack:** TypeScript + Bun, `@argus/core` (ContractStore, Contract types), `@argus/lineage` (EventStore, signEvent, eventId, ActionKind), `@noble/hashes` (BLAKE3 for content-addressing), `@anthropic-ai/sdk` (claude-haiku-4-5-20251001 for outbound + pr-review), `croner` (cron scheduling), Commander + picocolors (CLI). All specialists in `packages/specialists/`. Daemon in `packages/cli/`.

---

## File Structure

**Create:**
- `packages/specialists/src/types.ts` — SpecialistContext, SpecialistOutput, SpecialistError, Specialist interface, SpecialistManifest
- `packages/specialists/src/sandbox-worker.ts` — Bun subprocess worker (stdin → execute → stdout)
- `packages/specialists/src/sandbox.ts` — BunSandbox class
- `packages/specialists/src/registry.ts` — SpecialistRegistry (JSON-file-backed, keyed by manifestHash)
- `packages/specialists/src/loader.ts` — loadSpecialist() with codeHash verification
- `packages/specialists/src/orchestrator.ts` — Orchestrator class
- `packages/specialists/src/__mocks__/bun-sqlite.ts` — vitest SQLite stub (copy of lineage mock)
- `packages/specialists/src/specialists/outbound/index.ts` — OutboundSpecialist
- `packages/specialists/src/specialists/weekly-report/index.ts` — WeeklyReportSpecialist
- `packages/specialists/src/specialists/pr-review/index.ts` — PrReviewSpecialist
- `packages/specialists/src/__tests__/sandbox.test.ts`
- `packages/specialists/src/__tests__/registry.test.ts`
- `packages/specialists/src/__tests__/orchestrator.test.ts`
- `packages/specialists/src/specialists/outbound/__tests__/outbound.test.ts`
- `packages/specialists/src/specialists/weekly-report/__tests__/weekly-report.test.ts`
- `packages/specialists/src/specialists/pr-review/__tests__/pr-review.test.ts`
- `packages/cli/src/commands/fleet.ts` — argus fleet list/install/remove
- `packages/cli/src/commands/daemon.ts` — argus daemon start/stop/status
- `packages/cli/src/daemon/budget.ts` — BudgetTracker
- `packages/cli/src/daemon/escalation.ts` — EscalationDispatcher
- `packages/cli/src/daemon/cron.ts` — CronEngine
- `packages/cli/src/daemon/runner.ts` — DaemonRunner

**Modify:**
- `packages/specialists/src/index.ts` — replace stub with barrel exports
- `packages/specialists/vitest.config.ts` — add @argus/core, @argus/lineage, bun:sqlite aliases
- `packages/specialists/package.json` — add deps
- `packages/cli/src/main.ts` — register fleet + daemon commands
- `packages/cli/package.json` — add @argus/specialists, croner
- `README.md` — add Phase 3 to the "What's Built" section

---

## Task 1: Specialist types + package setup

**Files:**
- Create: `packages/specialists/src/types.ts`
- Modify: `packages/specialists/package.json`
- Modify: `packages/specialists/vitest.config.ts`
- Create: `packages/specialists/src/__mocks__/bun-sqlite.ts`

- [ ] **Step 1: Write failing import test**

Create `packages/specialists/src/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type {
  Specialist,
  SpecialistContext,
  SpecialistOutput,
  SpecialistError,
  SpecialistManifest,
} from "../types.js";

describe("Specialist types", () => {
  it("SpecialistContext has required fields", () => {
    const ctx: SpecialistContext = {
      contractId: "test-contract",
      contractKind: "outbound",
      contract: {} as never,
      invocationId: "inv-001",
      budgetRemaining: { tokens: 500000, usd: 10 },
    };
    expect(ctx.contractId).toBe("test-contract");
    expect(ctx.budgetRemaining.tokens).toBe(500000);
  });

  it("SpecialistManifest has all content-addressing fields", () => {
    const m: SpecialistManifest = {
      name: "outbound",
      version: "1.0.0",
      contractKinds: ["outbound"],
      entrypoint: "/abs/path/outbound/index.js",
      codeHash: "abc123",
      manifestHash: "def456",
    };
    expect(m.manifestHash).toBe("def456");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test
```
Expected: FAIL — `Cannot find module '../types.js'`

- [ ] **Step 3: Create `packages/specialists/src/types.ts`**

```typescript
import type { Contract, ContractKind, Result } from "@argus/core";

export type { Result };

export interface SpecialistContext {
  contractId: string;
  contractKind: ContractKind;
  contract: Contract;
  invocationId: string;
  budgetRemaining: { tokens?: number; usd?: number };
  metadata?: Record<string, unknown>;
}

export interface SpecialistOutput {
  summary: string;
  artifacts?: Record<string, unknown>;
  tokensUsed?: number;
  usdUsed?: number;
}

export type SpecialistErrorCode =
  | "EXECUTION_ERROR"
  | "BUDGET_EXCEEDED"
  | "SANDBOX_ERROR"
  | "INVALID_CONTRACT";

export interface SpecialistError {
  code: SpecialistErrorCode;
  message: string;
  details?: unknown;
}

export interface Specialist {
  name: string;
  version: string;
  contractKinds: string[];
  execute(ctx: SpecialistContext): Promise<Result<SpecialistOutput, SpecialistError>>;
}

export interface SpecialistManifest {
  name: string;
  version: string;
  contractKinds: string[];
  entrypoint: string;    // absolute resolved path
  codeHash: string;      // BLAKE3 hex of entrypoint file bytes
  manifestHash: string;  // BLAKE3 hex of canonical JSON of all fields except manifestHash
}
```

- [ ] **Step 4: Update `packages/specialists/package.json`**

```json
{
  "name": "@argus/specialists",
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
    "@argus/core": "workspace:*",
    "@argus/lineage": "workspace:*",
    "@noble/hashes": "^1.4.0",
    "@anthropic-ai/sdk": "^0.27.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 5: Copy bun:sqlite mock to `packages/specialists/src/__mocks__/bun-sqlite.ts`**

Copy the full content from `packages/lineage/src/__mocks__/bun-sqlite.ts` verbatim (the stateful SQLite simulator with DDL parsing, INSERT/SELECT/WHERE/ORDER BY/LIMIT support).

- [ ] **Step 6: Update `packages/specialists/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@argus/core": resolve(__dirname, "../core/src/index.ts"),
      "@argus/lineage": resolve(__dirname, "../lineage/src/index.ts"),
      "bun:sqlite": resolve(__dirname, "src/__mocks__/bun-sqlite.ts"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 7: Install deps and run test**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus && bun install && cd packages/specialists && bun run test
```
Expected: PASS — 2 type tests passing

- [ ] **Step 8: Commit**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus
git add packages/specialists/src/types.ts packages/specialists/src/__mocks__/bun-sqlite.ts packages/specialists/vitest.config.ts packages/specialists/package.json bun.lockb
git commit -m "feat(specialists): add Specialist types and package setup"
```

---

## Task 2: BunSandbox — subprocess worker and sandbox class

**Files:**
- Create: `packages/specialists/src/sandbox-worker.ts`
- Create: `packages/specialists/src/sandbox.ts`
- Create: `packages/specialists/src/__tests__/sandbox.test.ts`

- [ ] **Step 1: Write failing sandbox tests**

Create `packages/specialists/src/__tests__/sandbox.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BunSandbox } from "../sandbox.js";
import type { SpecialistContext, SpecialistOutput } from "../types.js";

const makeCtx = (): SpecialistContext => ({
  contractId: "c1",
  contractKind: "outbound",
  contract: {} as never,
  invocationId: "inv-1",
  budgetRemaining: { tokens: 100 },
});

describe("BunSandbox", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed result from subprocess stdout", async () => {
    const output: SpecialistOutput = { summary: "done", tokensUsed: 10 };
    const result = { ok: true, value: output };
    const encoder = new TextEncoder();

    vi.stubGlobal("Bun", {
      spawn: vi.fn().mockReturnValue({
        exited: Promise.resolve(0),
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(JSON.stringify(result)));
            controller.close();
          },
        }),
        stderr: new ReadableStream({ start(c) { c.close(); } }),
      }),
    });

    const sandbox = new BunSandbox();
    const r = await sandbox.run("/fake/specialist.js", makeCtx());
    expect(r).toEqual(result);
  });

  it("returns SANDBOX_ERROR when process exits non-zero", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal("Bun", {
      spawn: vi.fn().mockReturnValue({
        exited: Promise.resolve(1),
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: new ReadableStream({ start(c) { c.close(); } }),
        stderr: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode("ReferenceError: x is not defined"));
            controller.close();
          },
        }),
      }),
    });

    const sandbox = new BunSandbox();
    const r = await sandbox.run("/fake/specialist.js", makeCtx());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("SANDBOX_ERROR");
      expect(r.error.message).toContain("code 1");
    }
  });

  it("returns SANDBOX_ERROR on spawn exception", async () => {
    vi.stubGlobal("Bun", {
      spawn: vi.fn().mockImplementation(() => { throw new Error("spawn failed"); }),
    });

    const sandbox = new BunSandbox();
    const r = await sandbox.run("/fake/specialist.js", makeCtx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SANDBOX_ERROR");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- sandbox
```
Expected: FAIL — `Cannot find module '../sandbox.js'`

- [ ] **Step 3: Create `packages/specialists/src/sandbox-worker.ts`**

```typescript
// Bun subprocess worker: reads SpecialistContext from stdin, writes Result to stdout.
// Invoked as: bun run sandbox-worker.ts <absoluteSpecialistPath>
const [, , entrypoint] = process.argv;

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const ctx = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

  const mod = await import(entrypoint);
  if (!mod.default || typeof mod.default.execute !== "function") {
    process.stdout.write(
      JSON.stringify({ ok: false, error: { code: "SANDBOX_ERROR", message: "Specialist has no default export with execute()" } })
    );
    process.exit(1);
  }

  const result = await mod.default.execute(ctx);
  process.stdout.write(JSON.stringify(result));
}

main().catch((err: unknown) => {
  process.stdout.write(
    JSON.stringify({ ok: false, error: { code: "SANDBOX_ERROR", message: String(err) } })
  );
  process.exit(1);
});
```

- [ ] **Step 4: Create `packages/specialists/src/sandbox.ts`**

```typescript
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SpecialistContext, SpecialistOutput, SpecialistError } from "./types.js";
import type { Result } from "@argus/core";

const SANDBOX_TIMEOUT_MS = 30_000;

const workerPath = resolve(fileURLToPath(import.meta.url), "../sandbox-worker.ts");

export class BunSandbox {
  async run(
    entrypoint: string,
    ctx: SpecialistContext,
    timeoutMs = SANDBOX_TIMEOUT_MS
  ): Promise<Result<SpecialistOutput, SpecialistError>> {
    let proc: ReturnType<typeof Bun.spawn> | null = null;
    const timeoutHandle = setTimeout(() => proc?.kill(), timeoutMs);

    try {
      proc = Bun.spawn(["bun", "run", workerPath, entrypoint], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });

      proc.stdin.write(JSON.stringify(ctx));
      proc.stdin.end();

      const exitCode = await proc.exited;
      clearTimeout(timeoutHandle);

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        return {
          ok: false,
          error: { code: "SANDBOX_ERROR", message: `Process exited with code ${exitCode}: ${stderr}` },
        };
      }

      const stdout = await new Response(proc.stdout).text();
      return JSON.parse(stdout) as Result<SpecialistOutput, SpecialistError>;
    } catch (err: unknown) {
      clearTimeout(timeoutHandle);
      return { ok: false, error: { code: "SANDBOX_ERROR", message: String(err) } };
    }
  }
}
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- sandbox
```
Expected: PASS — 3 sandbox tests passing

- [ ] **Step 6: Commit**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus
git add packages/specialists/src/sandbox-worker.ts packages/specialists/src/sandbox.ts packages/specialists/src/__tests__/sandbox.test.ts
git commit -m "feat(specialists): add BunSandbox subprocess worker"
```

---

## Task 3: SpecialistRegistry — content-addressed, JSON-file-backed

**Files:**
- Create: `packages/specialists/src/registry.ts`
- Create: `packages/specialists/src/__tests__/registry.test.ts`

- [ ] **Step 1: Write failing registry tests**

Create `packages/specialists/src/__tests__/registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, existsSync } from "node:fs";
import { SpecialistRegistry, computeManifestHash, computeCodeHash } from "../registry.js";
import type { SpecialistManifest } from "../types.js";

const tmpRegistryPath = () =>
  join(tmpdir(), `argus-registry-test-${Date.now()}.json`);

const makeManifest = (overrides: Partial<SpecialistManifest> = {}): SpecialistManifest => {
  const base = {
    name: "outbound",
    version: "1.0.0",
    contractKinds: ["outbound"],
    entrypoint: "/abs/outbound/index.js",
    codeHash: "deadbeef",
  };
  const manifestHash = computeManifestHash(base);
  return { ...base, manifestHash, ...overrides };
};

describe("computeManifestHash", () => {
  it("is deterministic", () => {
    const base = { name: "a", version: "1.0.0", contractKinds: ["x"], entrypoint: "/e", codeHash: "h" };
    expect(computeManifestHash(base)).toBe(computeManifestHash(base));
  });

  it("changes when any field changes", () => {
    const base = { name: "a", version: "1.0.0", contractKinds: ["x"], entrypoint: "/e", codeHash: "h" };
    const changed = { ...base, codeHash: "h2" };
    expect(computeManifestHash(base)).not.toBe(computeManifestHash(changed));
  });
});

describe("computeCodeHash", () => {
  it("is deterministic for same bytes", () => {
    const bytes = new TextEncoder().encode("hello world");
    expect(computeCodeHash(bytes)).toBe(computeCodeHash(bytes));
  });
});

describe("SpecialistRegistry", () => {
  let registryPath: string;

  beforeEach(() => {
    registryPath = tmpRegistryPath();
  });

  it("starts empty", () => {
    const reg = new SpecialistRegistry(registryPath);
    expect(reg.list()).toHaveLength(0);
  });

  it("add() stores and list() returns manifest", () => {
    const reg = new SpecialistRegistry(registryPath);
    const m = makeManifest();
    reg.add(m);
    expect(reg.list()).toHaveLength(1);
    expect(reg.list()[0].name).toBe("outbound");
  });

  it("get() retrieves by manifestHash", () => {
    const reg = new SpecialistRegistry(registryPath);
    const m = makeManifest();
    reg.add(m);
    expect(reg.get(m.manifestHash)?.name).toBe("outbound");
  });

  it("remove() deletes by manifestHash", () => {
    const reg = new SpecialistRegistry(registryPath);
    const m = makeManifest();
    reg.add(m);
    reg.remove(m.manifestHash);
    expect(reg.list()).toHaveLength(0);
  });

  it("findByKind() filters by contractKind", () => {
    const reg = new SpecialistRegistry(registryPath);
    reg.add(makeManifest({ contractKinds: ["outbound"] }));
    reg.add(makeManifest({
      name: "pr-review",
      contractKinds: ["pr-review"],
      manifestHash: computeManifestHash({ name: "pr-review", version: "1.0.0", contractKinds: ["pr-review"], entrypoint: "/e2", codeHash: "hh" }),
    }));
    expect(reg.findByKind("outbound")).toHaveLength(1);
    expect(reg.findByKind("outbound")[0].name).toBe("outbound");
    expect(reg.findByKind("pr-review")).toHaveLength(1);
    expect(reg.findByKind("unknown")).toHaveLength(0);
  });

  it("persists to disk and reloads", () => {
    const reg1 = new SpecialistRegistry(registryPath);
    reg1.add(makeManifest());
    const reg2 = new SpecialistRegistry(registryPath);
    expect(reg2.list()).toHaveLength(1);
    expect(reg2.list()[0].name).toBe("outbound");
    rmSync(registryPath, { force: true });
  });

  it("add() throws if manifestHash does not match content", () => {
    const reg = new SpecialistRegistry(registryPath);
    const m = makeManifest({ manifestHash: "wrong-hash" });
    expect(() => reg.add(m)).toThrow("manifestHash mismatch");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- registry
```
Expected: FAIL — `Cannot find module '../registry.js'`

- [ ] **Step 3: Create `packages/specialists/src/registry.ts`**

```typescript
import { resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import type { SpecialistManifest } from "./types.js";

const encoder = new TextEncoder();

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.keys(obj as object)
        .sort()
        .map((k) => [k, sortKeys((obj as Record<string, unknown>)[k])])
    );
  }
  return obj;
}

export function computeManifestHash(
  manifest: Omit<SpecialistManifest, "manifestHash">
): string {
  return bytesToHex(blake3(encoder.encode(JSON.stringify(sortKeys(manifest)))));
}

export function computeCodeHash(fileBytes: Uint8Array): string {
  return bytesToHex(blake3(fileBytes));
}

export class SpecialistRegistry {
  private entries: Map<string, SpecialistManifest> = new Map();
  private readonly registryPath: string;

  constructor(registryPath: string) {
    this.registryPath = resolve(registryPath);
    this.load();
  }

  private load(): void {
    if (!existsSync(this.registryPath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.registryPath, "utf-8")) as SpecialistManifest[];
      for (const m of raw) this.entries.set(m.manifestHash, m);
    } catch {
      // corrupt registry — start fresh
    }
  }

  private save(): void {
    writeFileSync(this.registryPath, JSON.stringify([...this.entries.values()], null, 2), "utf-8");
  }

  add(manifest: SpecialistManifest): void {
    const expected = computeManifestHash({
      name: manifest.name,
      version: manifest.version,
      contractKinds: manifest.contractKinds,
      entrypoint: manifest.entrypoint,
      codeHash: manifest.codeHash,
    });
    if (expected !== manifest.manifestHash) {
      throw new Error(
        `manifestHash mismatch: expected ${expected}, got ${manifest.manifestHash}`
      );
    }
    this.entries.set(manifest.manifestHash, manifest);
    this.save();
  }

  remove(manifestHash: string): void {
    this.entries.delete(manifestHash);
    this.save();
  }

  list(): SpecialistManifest[] {
    return [...this.entries.values()];
  }

  get(manifestHash: string): SpecialistManifest | undefined {
    return this.entries.get(manifestHash);
  }

  findByKind(contractKind: string): SpecialistManifest[] {
    return [...this.entries.values()].filter((m) =>
      m.contractKinds.includes(contractKind)
    );
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- registry
```
Expected: PASS — 9 registry tests passing

- [ ] **Step 5: Commit**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus
git add packages/specialists/src/registry.ts packages/specialists/src/__tests__/registry.test.ts
git commit -m "feat(specialists): add SpecialistRegistry with content-addressed manifests"
```

---

## Task 4: Specialist loader — dynamic import with codeHash verification

**Files:**
- Create: `packages/specialists/src/loader.ts`
- Create: `packages/specialists/src/__tests__/loader.test.ts`

- [ ] **Step 1: Write failing loader tests**

Create `packages/specialists/src/__tests__/loader.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { loadSpecialist } from "../loader.js";
import { computeCodeHash } from "../registry.js";
import type { SpecialistManifest, Specialist, SpecialistContext, SpecialistOutput, SpecialistError } from "../types.js";

const mockSpecialist: Specialist = {
  name: "mock",
  version: "1.0.0",
  contractKinds: ["custom"],
  execute: async (_ctx: SpecialistContext) => ({ ok: true, value: { summary: "ok" } as SpecialistOutput }),
};

describe("loadSpecialist", () => {
  it("throws when codeHash does not match file content", async () => {
    const bytes = new TextEncoder().encode("export default {};");
    const realHash = computeCodeHash(bytes);

    vi.mock("node:fs", () => ({
      readFileSync: (_p: string) => Buffer.from("export default {};"),
    }));

    const manifest: SpecialistManifest = {
      name: "bad",
      version: "1.0.0",
      contractKinds: ["custom"],
      entrypoint: "/tmp/bad.js",
      codeHash: "wrong-hash",
      manifestHash: "any",
    };

    await expect(loadSpecialist(manifest)).rejects.toThrow("codeHash mismatch");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- loader
```
Expected: FAIL — `Cannot find module '../loader.js'`

- [ ] **Step 3: Create `packages/specialists/src/loader.ts`**

```typescript
import { readFileSync } from "node:fs";
import { computeCodeHash } from "./registry.js";
import type { Specialist, SpecialistManifest } from "./types.js";

export async function loadSpecialist(manifest: SpecialistManifest): Promise<Specialist> {
  const fileBytes = readFileSync(manifest.entrypoint);
  const actualHash = computeCodeHash(new Uint8Array(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength));
  if (actualHash !== manifest.codeHash) {
    throw new Error(
      `codeHash mismatch for ${manifest.name}@${manifest.version}: expected ${manifest.codeHash}, got ${actualHash}`
    );
  }
  const mod = await import(manifest.entrypoint);
  if (!mod.default || typeof mod.default.execute !== "function") {
    throw new Error(`Specialist ${manifest.name} has no default export with execute()`);
  }
  return mod.default as Specialist;
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- loader
```
Expected: PASS — 1 loader test passing

- [ ] **Step 5: Commit**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus
git add packages/specialists/src/loader.ts packages/specialists/src/__tests__/loader.test.ts
git commit -m "feat(specialists): add loadSpecialist with codeHash verification"
```

---

## Task 5: Orchestrator — contract → specialist → signed lineage events

**Files:**
- Create: `packages/specialists/src/orchestrator.ts`
- Create: `packages/specialists/src/__tests__/orchestrator.test.ts`

The orchestrator:
1. Gets the contract from ContractStore by id
2. If no lineage events exist for the contract, creates a genesis `contract_created` event
3. Finds matching specialists in SpecialistRegistry by `contract.kind`
4. Emits `specialist_started` event
5. Runs specialist via BunSandbox
6. On success: emits `specialist_completed` event, returns result
7. On `BUDGET_EXCEEDED` error: emits `budget_exceeded` event, returns error
8. On other error: emits `specialist_failed` event, returns error

- [ ] **Step 1: Write failing orchestrator tests**

Create `packages/specialists/src/__tests__/orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Orchestrator } from "../orchestrator.js";
import { ContractStore } from "@argus/core";
import { EventStore, generateKeyPair } from "@argus/lineage";
import { SpecialistRegistry, computeManifestHash } from "../registry.js";
import { BunSandbox } from "../sandbox.js";
import type { SpecialistManifest, SpecialistOutput } from "../types.js";

function makeRegistry(): SpecialistRegistry {
  const reg = new SpecialistRegistry(":memory-not-used:");
  // Bypass file persistence for tests by directly setting entries
  const manifest: SpecialistManifest = {
    name: "outbound",
    version: "1.0.0",
    contractKinds: ["outbound"],
    entrypoint: "/fake/outbound.js",
    codeHash: "abc",
    manifestHash: computeManifestHash({
      name: "outbound",
      version: "1.0.0",
      contractKinds: ["outbound"],
      entrypoint: "/fake/outbound.js",
      codeHash: "abc",
    }),
  };
  // Use internal add() — but it validates manifestHash, so compute correctly
  reg.add(manifest);
  return reg;
}

function makeContract() {
  return {
    id: "test-contract",
    version: "1.0.0",
    kind: "outbound" as const,
    owner: "owner@example.com",
    outcome: "Land 3 demos",
    deadline: "2026-12-31T00:00:00Z",
    success_criteria: [],
    budget: { tokens: 500000, usd: 10, hard_cap: true },
    escalation: [],
  };
}

describe("Orchestrator", () => {
  let contractStore: ContractStore;
  let eventStore: EventStore;
  let registry: SpecialistRegistry;
  let sandbox: BunSandbox;
  let privateKey: Uint8Array;

  beforeEach(() => {
    contractStore = new ContractStore();
    eventStore = new EventStore();
    const { privateKey: pk } = generateKeyPair();
    privateKey = pk;
    registry = makeRegistry();
    sandbox = new BunSandbox();
  });

  it("returns INVALID_CONTRACT when contract not found", async () => {
    const orch = new Orchestrator(contractStore, eventStore, registry, sandbox, privateKey);
    const r = await orch.run("nonexistent", "inv-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_CONTRACT");
  });

  it("emits genesis + started + completed events on success", async () => {
    contractStore.save(makeContract());
    const output: SpecialistOutput = { summary: "done", tokensUsed: 100 };
    vi.spyOn(sandbox, "run").mockResolvedValue({ ok: true, value: output });

    const orch = new Orchestrator(contractStore, eventStore, registry, sandbox, privateKey);
    const r = await orch.run("test-contract", "inv-1");

    expect(r.ok).toBe(true);
    const chain = eventStore.getChain("test-contract");
    const kinds = chain.map((e) => e.action_kind);
    expect(kinds).toContain("contract_created");
    expect(kinds).toContain("specialist_started");
    expect(kinds).toContain("specialist_completed");
  });

  it("emits specialist_failed on EXECUTION_ERROR", async () => {
    contractStore.save(makeContract());
    vi.spyOn(sandbox, "run").mockResolvedValue({
      ok: false,
      error: { code: "EXECUTION_ERROR", message: "boom" },
    });

    const orch = new Orchestrator(contractStore, eventStore, registry, sandbox, privateKey);
    await orch.run("test-contract", "inv-1");

    const kinds = eventStore.getChain("test-contract").map((e) => e.action_kind);
    expect(kinds).toContain("specialist_failed");
  });

  it("emits budget_exceeded on BUDGET_EXCEEDED error", async () => {
    contractStore.save(makeContract());
    vi.spyOn(sandbox, "run").mockResolvedValue({
      ok: false,
      error: { code: "BUDGET_EXCEEDED", message: "token cap hit" },
    });

    const orch = new Orchestrator(contractStore, eventStore, registry, sandbox, privateKey);
    await orch.run("test-contract", "inv-1");

    const kinds = eventStore.getChain("test-contract").map((e) => e.action_kind);
    expect(kinds).toContain("budget_exceeded");
  });

  it("returns INVALID_CONTRACT when no specialist matches kind", async () => {
    const contract = { ...makeContract(), kind: "custom" as const };
    contractStore.save(contract);

    const orch = new Orchestrator(contractStore, eventStore, registry, sandbox, privateKey);
    const r = await orch.run("test-contract", "inv-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("INVALID_CONTRACT");
      expect(r.error.message).toContain("No specialist");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- orchestrator
```
Expected: FAIL — `Cannot find module '../orchestrator.js'`

- [ ] **Step 3: Create `packages/specialists/src/orchestrator.ts`**

```typescript
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import { ContractStore } from "@argus/core";
import { EventStore, signEvent, eventId } from "@argus/lineage";
import type { Event } from "@argus/lineage";
import { SpecialistRegistry } from "./registry.js";
import { BunSandbox } from "./sandbox.js";
import type { SpecialistContext, SpecialistOutput, SpecialistError } from "./types.js";
import type { Result } from "@argus/core";

const encoder = new TextEncoder();

function payloadHash(payload: unknown): string {
  return bytesToHex(blake3(encoder.encode(JSON.stringify(payload))));
}

function nextEventBase(
  contractId: string,
  actionKind: Event["action_kind"],
  payload: unknown,
  parentId: string | null,
  sequence: number
): Omit<Event, "id"> {
  return {
    contract_id: contractId,
    action_kind: actionKind,
    payload_blake3: payloadHash(payload),
    parent_id: parentId,
    timestamp: Date.now(),
    sequence,
  };
}

export class Orchestrator {
  constructor(
    private contractStore: ContractStore,
    private eventStore: EventStore,
    private registry: SpecialistRegistry,
    private sandbox: BunSandbox,
    private privateKey: Uint8Array
  ) {}

  async run(
    contractId: string,
    invocationId: string
  ): Promise<Result<SpecialistOutput, SpecialistError>> {
    // Load contract
    const record = this.contractStore.load(contractId, this.contractStore.latestVersion(contractId) ?? "");
    if (!record) {
      return { ok: false, error: { code: "INVALID_CONTRACT", message: `Contract not found: ${contractId}` } };
    }

    // Find matching specialist
    const manifests = this.registry.findByKind(record.kind);
    if (manifests.length === 0) {
      return { ok: false, error: { code: "INVALID_CONTRACT", message: `No specialist registered for kind: ${record.kind}` } };
    }
    const manifest = manifests[0];

    // Ensure genesis event exists
    let latest = this.eventStore.getLatest(contractId);
    if (!latest) {
      const genesisBase = nextEventBase(contractId, "contract_created", { contractId, version: record.version }, null, 0);
      const genesis = signEvent({ ...genesisBase, id: eventId(genesisBase) }, this.privateKey);
      this.eventStore.append(genesis);
      latest = genesis;
    }

    // Emit specialist_started
    const startedPayload = { invocationId, specialistName: manifest.name, specialistVersion: manifest.version, manifestHash: manifest.manifestHash };
    const startedBase = nextEventBase(contractId, "specialist_started", startedPayload, latest.id, latest.sequence + 1);
    const startedEvent = signEvent({ ...startedBase, id: eventId(startedBase) }, this.privateKey);
    this.eventStore.append(startedEvent);

    // Run specialist
    const ctx: SpecialistContext = {
      contractId,
      contractKind: record.kind,
      contract: record,
      invocationId,
      budgetRemaining: { tokens: record.budget?.tokens, usd: record.budget?.usd },
    };

    const result = await this.sandbox.run(manifest.entrypoint, ctx);
    const postLatest = this.eventStore.getLatest(contractId)!;

    if (result.ok) {
      const completedPayload = { invocationId, summary: result.value.summary, tokensUsed: result.value.tokensUsed, usdUsed: result.value.usdUsed };
      const completedBase = nextEventBase(contractId, "specialist_completed", completedPayload, postLatest.id, postLatest.sequence + 1);
      const completedEvent = signEvent({ ...completedBase, id: eventId(completedBase) }, this.privateKey);
      this.eventStore.append(completedEvent);
    } else if (result.error.code === "BUDGET_EXCEEDED") {
      const exceededPayload = { invocationId, message: result.error.message };
      const exceededBase = nextEventBase(contractId, "budget_exceeded", exceededPayload, postLatest.id, postLatest.sequence + 1);
      const exceededEvent = signEvent({ ...exceededBase, id: eventId(exceededBase) }, this.privateKey);
      this.eventStore.append(exceededEvent);
    } else {
      const failedPayload = { invocationId, errorCode: result.error.code, message: result.error.message };
      const failedBase = nextEventBase(contractId, "specialist_failed", failedPayload, postLatest.id, postLatest.sequence + 1);
      const failedEvent = signEvent({ ...failedBase, id: eventId(failedBase) }, this.privateKey);
      this.eventStore.append(failedEvent);
    }

    return result;
  }
}
```

**Note:** The above calls `this.contractStore.latestVersion(contractId)` — but `ContractStore` doesn't have that method. Use `load(contractId, version)` requires knowing the version. Instead, query via `listVersions()` or add a `getLatest(id)` method. Check the ContractStore API by reading `packages/core/src/contract/store.ts` before implementing — adjust the load call to use whatever method is available for getting the latest contract record. If only `load(id, version)` exists, use a workaround like keeping track of latest version or query the DB directly.

- [ ] **Step 4: Check ContractStore API and fix the load call**

Read `packages/core/src/contract/store.ts` to see available methods, then fix the `load` call in `orchestrator.ts` so it fetches the latest version of the contract.

- [ ] **Step 5: Run tests**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- orchestrator
```
Expected: PASS — 5 orchestrator tests passing

- [ ] **Step 6: Commit**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus
git add packages/specialists/src/orchestrator.ts packages/specialists/src/__tests__/orchestrator.test.ts
git commit -m "feat(specialists): add Orchestrator with signed lineage event emission"
```

---

## Task 6: Barrel exports + Fleet CLI

**Files:**
- Modify: `packages/specialists/src/index.ts`
- Create: `packages/cli/src/commands/fleet.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Replace stub `packages/specialists/src/index.ts`**

```typescript
export * from "./types.js";
export * from "./registry.js";
export * from "./loader.js";
export * from "./sandbox.js";
export * from "./orchestrator.js";
```

- [ ] **Step 2: Update `packages/cli/package.json`**

Add to dependencies:
```json
"@argus/specialists": "workspace:*",
"croner": "^9.0.0"
```

Run `bun install` from repo root.

- [ ] **Step 3: Write failing fleet CLI tests**

Create `packages/cli/src/__tests__/fleet.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fleetCommand } from "../commands/fleet.js";

describe("fleet command", () => {
  it("fleetCommand is a Commander Command", () => {
    expect(fleetCommand).toBeDefined();
    expect(fleetCommand.name()).toBe("fleet");
  });

  it("has list, install, remove subcommands", () => {
    const names = fleetCommand.commands.map((c: { name(): string }) => c.name());
    expect(names).toContain("list");
    expect(names).toContain("install");
    expect(names).toContain("remove");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/cli && bun run test -- fleet
```
Expected: FAIL — `Cannot find module '../commands/fleet.js'`

- [ ] **Step 5: Create `packages/cli/src/commands/fleet.ts`**

```typescript
import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import { SpecialistRegistry, computeManifestHash, computeCodeHash } from "@argus/specialists";
import type { SpecialistManifest } from "@argus/specialists";

const DEFAULT_REGISTRY = resolve(process.env["HOME"] ?? "~", ".argus", "registry.json");

function getRegistry(): SpecialistRegistry {
  return new SpecialistRegistry(DEFAULT_REGISTRY);
}

const listCmd = new Command("list")
  .description("List all installed specialists")
  .action(() => {
    const reg = getRegistry();
    const specialists = reg.list();
    if (specialists.length === 0) {
      console.log(pc.dim("No specialists installed."));
      return;
    }
    for (const s of specialists) {
      console.log(
        `${pc.green(s.name)}@${pc.cyan(s.version)}  ${pc.dim(s.manifestHash.slice(0, 12))}  kinds: ${s.contractKinds.join(", ")}`
      );
    }
  });

const installCmd = new Command("install")
  .description("Install a specialist from a file path (content-addressed)")
  .argument("<path>", "Path to the specialist module")
  .action(async (specPath: string) => {
    const absPath = resolve(specPath);
    if (!existsSync(absPath)) {
      console.error(pc.red(`File not found: ${absPath}`));
      process.exit(1);
    }

    const fileBytes = readFileSync(absPath);
    const codeHash = computeCodeHash(new Uint8Array(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength));

    // Dynamic import to get manifest metadata
    const mod = await import(absPath).catch(() => null);
    if (!mod?.default) {
      console.error(pc.red("Specialist module has no default export"));
      process.exit(1);
    }

    const s = mod.default;
    if (typeof s.name !== "string" || typeof s.version !== "string" || !Array.isArray(s.contractKinds)) {
      console.error(pc.red("Specialist default export must have name, version, and contractKinds"));
      process.exit(1);
    }

    const base = { name: s.name as string, version: s.version as string, contractKinds: s.contractKinds as string[], entrypoint: absPath, codeHash };
    const manifestHash = computeManifestHash(base);
    const manifest: SpecialistManifest = { ...base, manifestHash };

    const reg = getRegistry();
    reg.add(manifest);
    console.log(pc.green(`Installed ${s.name}@${s.version} (${manifestHash.slice(0, 12)})`));
  });

const removeCmd = new Command("remove")
  .description("Remove a specialist by manifest hash")
  .argument("<hash>", "Manifest hash (or prefix) of the specialist to remove")
  .action((hash: string) => {
    const reg = getRegistry();
    const match = reg.list().find((m) => m.manifestHash.startsWith(hash));
    if (!match) {
      console.error(pc.red(`No specialist found matching hash: ${hash}`));
      process.exit(1);
    }
    reg.remove(match.manifestHash);
    console.log(pc.green(`Removed ${match.name}@${match.version}`));
  });

export const fleetCommand = new Command("fleet")
  .description("Manage installed specialists")
  .addCommand(listCmd)
  .addCommand(installCmd)
  .addCommand(removeCmd);
```

- [ ] **Step 6: Wire fleet into `packages/cli/src/main.ts`**

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { ARGUS_VERSION } from "@argus/core";
import { contractCommand } from "./commands/contract.js";
import { keysCommand } from "./commands/keys.js";
import { lineageCommand } from "./commands/lineage.js";
import { fleetCommand } from "./commands/fleet.js";

const program = new Command();

program
  .name("argus")
  .description("Outcome-owning agents with signed lineage")
  .version(ARGUS_VERSION);

program.addCommand(contractCommand);
program.addCommand(keysCommand);
program.addCommand(lineageCommand);
program.addCommand(fleetCommand);

program.parse(process.argv);
```

- [ ] **Step 7: Run tests**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/cli && bun run test -- fleet
```
Expected: PASS — 2 fleet command tests passing

- [ ] **Step 8: Commit**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus
git add packages/specialists/src/index.ts packages/cli/src/commands/fleet.ts packages/cli/src/main.ts packages/cli/package.json bun.lockb
git commit -m "feat(cli): add argus fleet list/install/remove"
```

---

## Task 7: Outbound specialist

**Files:**
- Create: `packages/specialists/src/specialists/outbound/index.ts`
- Create: `packages/specialists/src/specialists/outbound/__tests__/outbound.test.ts`

The outbound specialist drafts a cold outreach email using the Anthropic API (claude-haiku-4-5-20251001). The contract's `outcome` field drives the goal. Input payload (from `contract.metadata`): `{ prospect: { name, email, company, role }, rubric: string }`. Output: `{ summary, artifacts: { drafted: string, sent: false } }`.

- [ ] **Step 1: Write failing outbound tests**

Create `packages/specialists/src/specialists/outbound/__tests__/outbound.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { outboundSpecialist } from "../index.js";
import type { SpecialistContext } from "../../../types.js";

const makeCtx = (): SpecialistContext => ({
  contractId: "c1",
  contractKind: "outbound",
  invocationId: "inv-1",
  contract: {
    id: "c1",
    version: "1.0.0",
    kind: "outbound",
    owner: "owner@example.com",
    outcome: "Land 3 qualified demo calls with Series-A SaaS founders",
    deadline: "2026-12-31T00:00:00Z",
    success_criteria: [],
    budget: { tokens: 500000, usd: 10, hard_cap: true },
    escalation: [],
    metadata: {
      prospect_name: "Jane Smith",
      prospect_email: "jane@example.com",
      prospect_company: "Acme SaaS",
      prospect_role: "CEO",
      rubric: "Focus on ROI and time-to-value",
    },
  },
  budgetRemaining: { tokens: 500000, usd: 10 },
});

describe("OutboundSpecialist", () => {
  it("has correct name, version, and contractKinds", () => {
    expect(outboundSpecialist.name).toBe("outbound");
    expect(outboundSpecialist.version).toBe("1.0.0");
    expect(outboundSpecialist.contractKinds).toContain("outbound");
  });

  it("returns drafted email on success (mocked Anthropic)", async () => {
    vi.mock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "Subject: Quick note\n\nHi Jane, ..." }],
            usage: { input_tokens: 300, output_tokens: 150 },
          }),
        };
      },
    }));

    const result = await outboundSpecialist.execute(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary).toContain("drafted");
      expect(result.value.artifacts?.["drafted"]).toContain("Jane");
      expect(result.value.tokensUsed).toBe(450);
    }
  });

  it("returns EXECUTION_ERROR when Anthropic call fails", async () => {
    vi.mock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          create: vi.fn().mockRejectedValue(new Error("API rate limit")),
        };
      },
    }));

    const result = await outboundSpecialist.execute(makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("EXECUTION_ERROR");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- outbound
```
Expected: FAIL — `Cannot find module '../index.js'`

- [ ] **Step 3: Create `packages/specialists/src/specialists/outbound/index.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { Specialist, SpecialistContext, SpecialistOutput, SpecialistError } from "../../types.js";
import type { Result } from "@argus/core";

const anthropic = new Anthropic();

export const outboundSpecialist: Specialist = {
  name: "outbound",
  version: "1.0.0",
  contractKinds: ["outbound"],

  async execute(ctx: SpecialistContext): Promise<Result<SpecialistOutput, SpecialistError>> {
    const meta = ctx.contract.metadata ?? {};
    const prospectName = String(meta["prospect_name"] ?? "");
    const prospectEmail = String(meta["prospect_email"] ?? "");
    const prospectCompany = String(meta["prospect_company"] ?? "");
    const prospectRole = String(meta["prospect_role"] ?? "");
    const rubric = String(meta["rubric"] ?? "Be concise and value-focused");

    if (!prospectName || !prospectEmail) {
      return { ok: false, error: { code: "EXECUTION_ERROR", message: "Missing prospect_name or prospect_email in contract metadata" } };
    }

    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `You are an expert at cold outreach. Write a personalized cold email for the following prospect.

Outcome goal: ${ctx.contract.outcome}
Rubric: ${rubric}

Prospect:
- Name: ${prospectName}
- Email: ${prospectEmail}
- Company: ${prospectCompany}
- Role: ${prospectRole}

Write a concise, high-conversion cold email. Include Subject line. Do not send — just draft the text.`,
          },
        ],
      });

      const drafted = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

      return {
        ok: true,
        value: {
          summary: `Drafted cold email for ${prospectName} at ${prospectCompany} (not yet sent)`,
          artifacts: { drafted, prospectEmail, sent: false },
          tokensUsed,
        },
      };
    } catch (err: unknown) {
      return { ok: false, error: { code: "EXECUTION_ERROR", message: String(err) } };
    }
  },
};

export default outboundSpecialist;
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- outbound
```
Expected: PASS — 3 outbound tests passing

- [ ] **Step 5: Commit**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus
git add packages/specialists/src/specialists/outbound/
git commit -m "feat(specialists): add outbound specialist with Anthropic API drafting"
```

---

## Task 8: Weekly-report specialist

**Files:**
- Create: `packages/specialists/src/specialists/weekly-report/index.ts`
- Create: `packages/specialists/src/specialists/weekly-report/__tests__/weekly-report.test.ts`

Produces a Markdown weekly report. Data sources are read from `contract.metadata.data_sources` (comma-separated list). In the stub, each source returns mocked data. A real implementation would call external APIs — those are left as TODOs in comments.

- [ ] **Step 1: Write failing weekly-report tests**

Create `packages/specialists/src/specialists/weekly-report/__tests__/weekly-report.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { weeklyReportSpecialist } from "../index.js";
import type { SpecialistContext } from "../../../types.js";

const makeCtx = (): SpecialistContext => ({
  contractId: "c2",
  contractKind: "report",
  invocationId: "inv-2",
  contract: {
    id: "c2",
    version: "1.0.0",
    kind: "report",
    owner: "owner@example.com",
    outcome: "Produce weekly revenue report",
    deadline: "2026-12-31T00:00:00Z",
    success_criteria: [],
    budget: { tokens: 100000, usd: 2, hard_cap: false },
    escalation: [],
    metadata: {
      data_sources: "revenue,signups,churn",
      report_title: "Weekly Business Review",
    },
  },
  budgetRemaining: { tokens: 100000, usd: 2 },
});

describe("WeeklyReportSpecialist", () => {
  it("has correct name, version, and contractKinds", () => {
    expect(weeklyReportSpecialist.name).toBe("weekly-report");
    expect(weeklyReportSpecialist.version).toBe("1.0.0");
    expect(weeklyReportSpecialist.contractKinds).toContain("report");
  });

  it("returns Markdown report with all data source sections", async () => {
    const result = await weeklyReportSpecialist.execute(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary).toContain("report");
      const report = result.value.artifacts?.["report"] as string;
      expect(report).toContain("# Weekly Business Review");
      expect(report).toContain("## Revenue");
      expect(report).toContain("## Signups");
      expect(report).toContain("## Churn");
    }
  });

  it("returns EXECUTION_ERROR when no data sources configured", async () => {
    const ctx: SpecialistContext = {
      ...makeCtx(),
      contract: {
        ...makeCtx().contract,
        metadata: {},
      },
    };
    const result = await weeklyReportSpecialist.execute(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("EXECUTION_ERROR");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- weekly-report
```
Expected: FAIL — `Cannot find module '../index.js'`

- [ ] **Step 3: Create `packages/specialists/src/specialists/weekly-report/index.ts`**

```typescript
import type { Specialist, SpecialistContext, SpecialistOutput, SpecialistError } from "../../types.js";
import type { Result } from "@argus/core";

// Stub data fetchers — replace with real API calls in production
function fetchDataSource(source: string): Record<string, unknown> {
  const stubs: Record<string, Record<string, unknown>> = {
    revenue: { current_week: 48200, prev_week: 43100, change_pct: 11.8 },
    signups: { current_week: 312, prev_week: 289, change_pct: 8.0 },
    churn: { current_week: 14, prev_week: 18, change_pct: -22.2 },
    default: { note: "stub data — configure real data source integration" },
  };
  return stubs[source] ?? stubs["default"]!;
}

function renderSection(source: string, data: Record<string, unknown>): string {
  const title = source.charAt(0).toUpperCase() + source.slice(1);
  const rows = Object.entries(data)
    .map(([k, v]) => `- **${k}**: ${v}`)
    .join("\n");
  return `## ${title}\n\n${rows}`;
}

export const weeklyReportSpecialist: Specialist = {
  name: "weekly-report",
  version: "1.0.0",
  contractKinds: ["report"],

  async execute(ctx: SpecialistContext): Promise<Result<SpecialistOutput, SpecialistError>> {
    const meta = ctx.contract.metadata ?? {};
    const rawSources = String(meta["data_sources"] ?? "").trim();
    if (!rawSources) {
      return { ok: false, error: { code: "EXECUTION_ERROR", message: "No data_sources configured in contract metadata" } };
    }

    const title = String(meta["report_title"] ?? "Weekly Report");
    const sources = rawSources.split(",").map((s) => s.trim()).filter(Boolean);
    const date = new Date().toISOString().slice(0, 10);

    const sections = sources.map((src) => {
      const data = fetchDataSource(src);
      return renderSection(src, data);
    });

    const report = [`# ${title}`, `*Generated: ${date}*`, "", ...sections].join("\n\n");
    const summary = `${title} generated for ${sources.length} data source(s): ${sources.join(", ")}`;

    return {
      ok: true,
      value: {
        summary,
        artifacts: { report, dataSourceCount: sources.length },
        tokensUsed: 0,
      },
    };
  },
};

export default weeklyReportSpecialist;
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- weekly-report
```
Expected: PASS — 3 weekly-report tests passing

- [ ] **Step 5: Commit**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus
git add packages/specialists/src/specialists/weekly-report/
git commit -m "feat(specialists): add weekly-report specialist with stubbed data sources"
```

---

## Task 9: PR-review specialist

**Files:**
- Create: `packages/specialists/src/specialists/pr-review/index.ts`
- Create: `packages/specialists/src/specialists/pr-review/__tests__/pr-review.test.ts`

Uses `gh pr view` to get PR body/diff and Anthropic API to review against a rubric, then posts a bot comment via `gh pr comment`. Input from `contract.metadata`: `{ repo, pr_number, rubric }`.

- [ ] **Step 1: Write failing PR-review tests**

Create `packages/specialists/src/specialists/pr-review/__tests__/pr-review.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { prReviewSpecialist } from "../index.js";
import type { SpecialistContext } from "../../../types.js";

const makeCtx = (): SpecialistContext => ({
  contractId: "c3",
  contractKind: "pr-review",
  invocationId: "inv-3",
  contract: {
    id: "c3",
    version: "1.0.0",
    kind: "pr-review",
    owner: "owner@example.com",
    outcome: "Review PRs against security and code quality rubric",
    deadline: "2026-12-31T00:00:00Z",
    success_criteria: [],
    budget: { tokens: 200000, usd: 5, hard_cap: true },
    escalation: [],
    metadata: {
      repo: "nikhilgupta58/argus",
      pr_number: "42",
      rubric: "Check for security vulnerabilities, test coverage, and code quality",
    },
  },
  budgetRemaining: { tokens: 200000, usd: 5 },
});

describe("PrReviewSpecialist", () => {
  it("has correct name, version, and contractKinds", () => {
    expect(prReviewSpecialist.name).toBe("pr-review");
    expect(prReviewSpecialist.version).toBe("1.0.0");
    expect(prReviewSpecialist.contractKinds).toContain("pr-review");
  });

  it("returns review on success (mocked gh + Anthropic)", async () => {
    vi.mock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "## Review\n\nLGTM. No security issues found." }],
            usage: { input_tokens: 400, output_tokens: 200 },
          }),
        };
      },
    }));

    // Mock Bun.spawn for gh CLI calls
    const encoder = new TextEncoder();
    vi.stubGlobal("Bun", {
      spawn: vi.fn().mockReturnValue({
        exited: Promise.resolve(0),
        stdout: new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode(JSON.stringify({ title: "Add feature X", body: "Implements feature X", additions: 50, deletions: 10 })));
            c.close();
          },
        }),
        stderr: new ReadableStream({ start(c) { c.close(); } }),
      }),
    });

    const result = await prReviewSpecialist.execute(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary).toContain("PR #42");
      expect(result.value.artifacts?.["review"]).toContain("Review");
      expect(result.value.tokensUsed).toBe(600);
    }
  });

  it("returns EXECUTION_ERROR when gh CLI fails", async () => {
    vi.stubGlobal("Bun", {
      spawn: vi.fn().mockReturnValue({
        exited: Promise.resolve(1),
        stdout: new ReadableStream({ start(c) { c.close(); } }),
        stderr: new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode("gh: repository not found"));
            c.close();
          },
        }),
      }),
    });

    const result = await prReviewSpecialist.execute(makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("EXECUTION_ERROR");
  });

  it("returns EXECUTION_ERROR when required metadata is missing", async () => {
    const ctx: SpecialistContext = {
      ...makeCtx(),
      contract: { ...makeCtx().contract, metadata: {} },
    };
    const result = await prReviewSpecialist.execute(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("EXECUTION_ERROR");
      expect(result.error.message).toContain("repo");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- pr-review
```
Expected: FAIL — `Cannot find module '../index.js'`

- [ ] **Step 3: Create `packages/specialists/src/specialists/pr-review/index.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { Specialist, SpecialistContext, SpecialistOutput, SpecialistError } from "../../types.js";
import type { Result } from "@argus/core";

const anthropic = new Anthropic();

async function ghSpawn(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["gh", ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { ok: exitCode === 0, stdout, stderr };
}

export const prReviewSpecialist: Specialist = {
  name: "pr-review",
  version: "1.0.0",
  contractKinds: ["pr-review"],

  async execute(ctx: SpecialistContext): Promise<Result<SpecialistOutput, SpecialistError>> {
    const meta = ctx.contract.metadata ?? {};
    const repo = String(meta["repo"] ?? "").trim();
    const prNumberStr = String(meta["pr_number"] ?? "").trim();
    const rubric = String(meta["rubric"] ?? "Review for code quality, security, and test coverage").trim();

    if (!repo || !prNumberStr) {
      return { ok: false, error: { code: "EXECUTION_ERROR", message: "Missing repo or pr_number in contract metadata" } };
    }

    const prNumber = parseInt(prNumberStr, 10);
    if (isNaN(prNumber)) {
      return { ok: false, error: { code: "EXECUTION_ERROR", message: `Invalid pr_number: ${prNumberStr}` } };
    }

    // Fetch PR details via gh CLI
    const prResult = await ghSpawn(["pr", "view", String(prNumber), "--repo", repo, "--json", "title,body,additions,deletions,files"]);
    if (!prResult.ok) {
      return { ok: false, error: { code: "EXECUTION_ERROR", message: `gh pr view failed: ${prResult.stderr}` } };
    }

    let prData: Record<string, unknown>;
    try {
      prData = JSON.parse(prResult.stdout);
    } catch {
      return { ok: false, error: { code: "EXECUTION_ERROR", message: "Failed to parse gh pr view output" } };
    }

    // Review via Anthropic API
    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `You are a code reviewer. Review this GitHub PR against the provided rubric.

Repo: ${repo}
PR #${prNumber}
Title: ${prData["title"]}
Description: ${prData["body"]}
Additions: ${prData["additions"]} lines, Deletions: ${prData["deletions"]} lines

Rubric:
${rubric}

Provide a structured review with: summary, issues found (if any), and a LGTM/NEEDS_CHANGES verdict.`,
          },
        ],
      });

      const review = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

      // Post comment via gh CLI (ignore failure — comment posting is best-effort)
      const commentBody = `<!-- argus-pr-review -->\n${review}`;
      await ghSpawn(["pr", "comment", String(prNumber), "--repo", repo, "--body", commentBody]);

      return {
        ok: true,
        value: {
          summary: `Reviewed PR #${prNumber} in ${repo}`,
          artifacts: { review, prNumber, repo, posted: true },
          tokensUsed,
        },
      };
    } catch (err: unknown) {
      return { ok: false, error: { code: "EXECUTION_ERROR", message: String(err) } };
    }
  },
};

export default prReviewSpecialist;
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test -- pr-review
```
Expected: PASS — 3 pr-review tests passing

- [ ] **Step 5: Run all specialists tests**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/specialists && bun run test
```
Expected: All tests passing (types, sandbox, registry, loader, orchestrator, outbound, weekly-report, pr-review)

- [ ] **Step 6: Commit**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus
git add packages/specialists/src/specialists/pr-review/
git commit -m "feat(specialists): add pr-review specialist with gh CLI + Anthropic review"
```

---

## Task 10: Budget enforcer

**Files:**
- Create: `packages/cli/src/daemon/budget.ts`
- Create: `packages/cli/src/daemon/__tests__/budget.test.ts`

The BudgetTracker is in-memory per daemon process. It records tokens/USD spent per contract invocation and returns whether the hard cap has been reached.

- [ ] **Step 1: Write failing budget tests**

Create `packages/cli/src/daemon/__tests__/budget.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { BudgetTracker } from "../budget.js";

const makeContractBudget = (tokens: number, usd: number, hard_cap = true) => ({
  tokens,
  usd,
  hard_cap,
});

describe("BudgetTracker", () => {
  it("allows first invocation when budget is full", () => {
    const tracker = new BudgetTracker();
    const budget = makeContractBudget(1000, 5);
    expect(tracker.check("c1", budget)).toEqual({ allowed: true, tokensRemaining: 1000, usdRemaining: 5 });
  });

  it("records spend and reduces remaining budget", () => {
    const tracker = new BudgetTracker();
    const budget = makeContractBudget(1000, 5);
    tracker.record("c1", { tokensUsed: 300, usdUsed: 1.5 });
    const remaining = tracker.check("c1", budget);
    expect(remaining.tokensRemaining).toBe(700);
    expect(remaining.usdRemaining).toBeCloseTo(3.5);
  });

  it("blocks when hard_cap tokens exceeded", () => {
    const tracker = new BudgetTracker();
    tracker.record("c1", { tokensUsed: 1001 });
    const result = tracker.check("c1", makeContractBudget(1000, 5, true));
    expect(result.allowed).toBe(false);
  });

  it("blocks when hard_cap usd exceeded", () => {
    const tracker = new BudgetTracker();
    tracker.record("c1", { usdUsed: 5.01 });
    const result = tracker.check("c1", makeContractBudget(1000, 5, true));
    expect(result.allowed).toBe(false);
  });

  it("allows (with warning) when hard_cap is false even if over budget", () => {
    const tracker = new BudgetTracker();
    tracker.record("c1", { tokensUsed: 2000 });
    const result = tracker.check("c1", makeContractBudget(1000, 5, false));
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(true);
  });

  it("accumulates spend across multiple records", () => {
    const tracker = new BudgetTracker();
    tracker.record("c1", { tokensUsed: 200, usdUsed: 1 });
    tracker.record("c1", { tokensUsed: 300, usdUsed: 1.5 });
    const result = tracker.check("c1", makeContractBudget(1000, 5));
    expect(result.tokensRemaining).toBe(500);
    expect(result.usdRemaining).toBeCloseTo(2.5);
  });

  it("tracks separate contracts independently", () => {
    const tracker = new BudgetTracker();
    tracker.record("c1", { tokensUsed: 900 });
    tracker.record("c2", { tokensUsed: 100 });
    const budget = makeContractBudget(1000, 5);
    expect(tracker.check("c1", budget).tokensRemaining).toBe(100);
    expect(tracker.check("c2", budget).tokensRemaining).toBe(900);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/cli && bun run test -- budget
```
Expected: FAIL — `Cannot find module '../budget.js'`

- [ ] **Step 3: Create `packages/cli/src/daemon/budget.ts`**

```typescript
import type { ContractBudget } from "@argus/core";

interface SpendRecord {
  tokensUsed: number;
  usdUsed: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  tokensRemaining: number;
  usdRemaining: number;
  warning?: boolean;
}

export class BudgetTracker {
  private spent: Map<string, SpendRecord> = new Map();

  record(contractId: string, spend: { tokensUsed?: number; usdUsed?: number }): void {
    const existing = this.spent.get(contractId) ?? { tokensUsed: 0, usdUsed: 0 };
    this.spent.set(contractId, {
      tokensUsed: existing.tokensUsed + (spend.tokensUsed ?? 0),
      usdUsed: existing.usdUsed + (spend.usdUsed ?? 0),
    });
  }

  check(contractId: string, budget: ContractBudget): BudgetCheckResult {
    const used = this.spent.get(contractId) ?? { tokensUsed: 0, usdUsed: 0 };
    const tokensLimit = budget.tokens ?? Infinity;
    const usdLimit = budget.usd ?? Infinity;
    const tokensRemaining = Math.max(0, tokensLimit - used.tokensUsed);
    const usdRemaining = Math.max(0, usdLimit - used.usdUsed);
    const over = used.tokensUsed > tokensLimit || used.usdUsed > usdLimit;

    if (over && budget.hard_cap) {
      return { allowed: false, tokensRemaining, usdRemaining };
    }
    if (over) {
      return { allowed: true, tokensRemaining, usdRemaining, warning: true };
    }
    return { allowed: true, tokensRemaining, usdRemaining };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/cli && bun run test -- budget
```
Expected: PASS — 7 budget tests passing

- [ ] **Step 5: Commit**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus
git add packages/cli/src/daemon/budget.ts packages/cli/src/daemon/__tests__/budget.test.ts
git commit -m "feat(cli/daemon): add BudgetTracker with hard/soft cap enforcement"
```

---

## Task 11: Escalation dispatcher

**Files:**
- Create: `packages/cli/src/daemon/escalation.ts`
- Create: `packages/cli/src/daemon/__tests__/escalation.test.ts`

Reads `contract.escalation` rules and dispatches via:
- `slack`: HTTP POST to Slack webhook URL (stored in `contact` field)
- `email`: logs to console (stub — full SMTP left as future work)
- `github`: runs `gh issue create` via Bun.spawn

- [ ] **Step 1: Write failing escalation tests**

Create `packages/cli/src/daemon/__tests__/escalation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EscalationDispatcher } from "../escalation.js";
import type { EscalationRule } from "@argus/core";

describe("EscalationDispatcher", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches slack channel via fetch POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const rule: EscalationRule = {
      trigger: "budget > 80%",
      channel: "slack",
      contact: "https://hooks.slack.com/services/FAKE/WEBHOOK",
    };

    const dispatcher = new EscalationDispatcher();
    await dispatcher.dispatch(rule, { contractId: "c1", trigger: "budget > 80%", message: "Budget at 85%" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/services/FAKE/WEBHOOK");
    expect(JSON.parse(opts.body).text).toContain("Budget at 85%");
  });

  it("dispatches github channel via gh issue create", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal("Bun", {
      spawn: vi.fn().mockReturnValue({
        exited: Promise.resolve(0),
        stdout: new ReadableStream({
          start(c) { c.enqueue(encoder.encode("https://github.com/org/repo/issues/99")); c.close(); }
        }),
        stderr: new ReadableStream({ start(c) { c.close(); } }),
      }),
    });

    const rule: EscalationRule = {
      trigger: "specialist_failed",
      channel: "github",
      contact: "org/repo",
    };

    const dispatcher = new EscalationDispatcher();
    await dispatcher.dispatch(rule, { contractId: "c1", trigger: "specialist_failed", message: "Specialist crashed" });

    expect((Bun.spawn as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    const [cmd] = (Bun.spawn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(cmd).toContain("gh");
    expect(cmd).toContain("issue");
    expect(cmd).toContain("create");
  });

  it("email channel logs to console (no external call)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const rule: EscalationRule = {
      trigger: "budget > 80%",
      channel: "email",
      contact: "admin@example.com",
    };

    const dispatcher = new EscalationDispatcher();
    await dispatcher.dispatch(rule, { contractId: "c1", trigger: "budget > 80%", message: "Budget near limit" });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/cli && bun run test -- escalation
```
Expected: FAIL — `Cannot find module '../escalation.js'`

- [ ] **Step 3: Create `packages/cli/src/daemon/escalation.ts`**

```typescript
import type { EscalationRule } from "@argus/core";

export interface EscalationEvent {
  contractId: string;
  trigger: string;
  message: string;
}

export class EscalationDispatcher {
  async dispatch(rule: EscalationRule, event: EscalationEvent): Promise<void> {
    switch (rule.channel) {
      case "slack":
        await this.dispatchSlack(rule.contact, event);
        break;
      case "email":
        this.dispatchEmail(rule.contact, event);
        break;
      case "github":
        await this.dispatchGitHub(rule.contact, event);
        break;
    }
  }

  private async dispatchSlack(webhookUrl: string, event: EscalationEvent): Promise<void> {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `*Argus escalation* — contract \`${event.contractId}\`\nTrigger: ${event.trigger}\n${event.message}`,
      }),
    });
  }

  private dispatchEmail(contact: string, event: EscalationEvent): void {
    // Stub: log the escalation. Wire up SMTP/SES in production.
    console.warn(
      `[argus escalation] email → ${contact} | contract: ${event.contractId} | trigger: ${event.trigger} | ${event.message}`
    );
  }

  private async dispatchGitHub(repo: string, event: EscalationEvent): Promise<void> {
    const proc = Bun.spawn(
      [
        "gh", "issue", "create",
        "--repo", repo,
        "--title", `[Argus] Escalation: ${event.trigger} on ${event.contractId}`,
        "--body", `**Contract:** ${event.contractId}\n**Trigger:** ${event.trigger}\n\n${event.message}`,
        "--label", "escalation",
      ],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" }
    );
    await proc.exited;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/cli && bun run test -- escalation
```
Expected: PASS — 3 escalation tests passing

- [ ] **Step 5: Commit**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus
git add packages/cli/src/daemon/escalation.ts packages/cli/src/daemon/__tests__/escalation.test.ts
git commit -m "feat(cli/daemon): add EscalationDispatcher for slack/email/github channels"
```

---

## Task 12: Cron engine + daemon runner

**Files:**
- Create: `packages/cli/src/daemon/cron.ts`
- Create: `packages/cli/src/daemon/runner.ts`
- Create: `packages/cli/src/daemon/__tests__/cron.test.ts`

The CronEngine reads all contracts from ContractStore that have `metadata.cron` set, schedules them with `croner`, and fires the orchestrator on each trigger. The DaemonRunner ties together ContractStore, EventStore, SpecialistRegistry, BudgetTracker, EscalationDispatcher, and Orchestrator.

- [ ] **Step 1: Write failing cron tests**

Create `packages/cli/src/daemon/__tests__/cron.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { extractCronPolicy } from "../cron.js";

describe("extractCronPolicy", () => {
  it("returns null when no cron metadata", () => {
    expect(extractCronPolicy({})).toBeNull();
    expect(extractCronPolicy({ trigger: "webhook" })).toBeNull();
  });

  it("returns cron string from metadata.cron", () => {
    expect(extractCronPolicy({ cron: "0 9 * * 1" })).toBe("0 9 * * 1");
  });

  it("returns null for non-string cron value", () => {
    expect(extractCronPolicy({ cron: 123 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/cli && bun run test -- cron
```
Expected: FAIL — `Cannot find module '../cron.js'`

- [ ] **Step 3: Create `packages/cli/src/daemon/cron.ts`**

```typescript
import { Cron } from "croner";
import pc from "picocolors";

export function extractCronPolicy(metadata: Record<string, string | number | boolean> | undefined): string | null {
  if (!metadata) return null;
  const val = metadata["cron"];
  if (typeof val !== "string" || !val.trim()) return null;
  return val.trim();
}

export interface CronJob {
  contractId: string;
  expression: string;
  stop(): void;
}

export function scheduleCron(
  contractId: string,
  expression: string,
  onTick: (contractId: string) => void
): CronJob {
  const job = new Cron(expression, () => {
    console.log(pc.cyan(`[daemon] cron tick for contract ${contractId}`));
    onTick(contractId);
  });

  return {
    contractId,
    expression,
    stop: () => job.stop(),
  };
}
```

- [ ] **Step 4: Create `packages/cli/src/daemon/runner.ts`**

```typescript
import { resolve } from "node:path";
import pc from "picocolors";
import { ContractStore } from "@argus/core";
import { EventStore, generateKeyPair, decryptKeyPair } from "@argus/lineage";
import { SpecialistRegistry, BunSandbox, Orchestrator } from "@argus/specialists";
import { BudgetTracker } from "./budget.js";
import { EscalationDispatcher } from "./escalation.js";
import { extractCronPolicy, scheduleCron } from "./cron.js";
import type { CronJob } from "./cron.js";
import { readFileSync, existsSync } from "node:fs";

export interface DaemonConfig {
  dbPath: string;
  registryPath: string;
  keyPath: string;
  passphrase: string;
  webhookPort?: number;
}

export class DaemonRunner {
  private cronJobs: CronJob[] = [];
  private running = false;

  async start(config: DaemonConfig): Promise<void> {
    if (this.running) throw new Error("Daemon already running");
    this.running = true;

    // Load key
    if (!existsSync(config.keyPath)) {
      throw new Error(`Key file not found: ${config.keyPath}`);
    }
    const keyBytes = new Uint8Array(readFileSync(config.keyPath));
    const { privateKey } = decryptKeyPair(keyBytes, config.passphrase);

    // Initialize stores
    const contractStore = new ContractStore(config.dbPath);
    const eventStore = new EventStore(config.dbPath.replace(/\.db$/, "-lineage.db"));
    const registry = new SpecialistRegistry(config.registryPath);
    const sandbox = new BunSandbox();
    const orchestrator = new Orchestrator(contractStore, eventStore, registry, sandbox, privateKey);
    const budgetTracker = new BudgetTracker();
    const escalation = new EscalationDispatcher();

    // Schedule all contracts with cron policies
    const contracts = contractStore.listAll?.() ?? [];
    for (const record of contracts) {
      const cronExpr = extractCronPolicy(record.metadata as Record<string, string | number | boolean>);
      if (!cronExpr) continue;

      const job = scheduleCron(record.id, cronExpr, async (contractId) => {
        const contract = contractStore.getLatest?.(contractId);
        if (!contract) return;

        const budgetCheck = budgetTracker.check(contractId, contract.budget);
        if (!budgetCheck.allowed) {
          console.log(pc.yellow(`[daemon] budget cap reached for ${contractId} — skipping run`));
          return;
        }
        if (budgetCheck.warning) {
          console.log(pc.yellow(`[daemon] budget warning for ${contractId}: over soft cap`));
        }

        const invocationId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const result = await orchestrator.run(contractId, invocationId);

        if (result.ok) {
          budgetTracker.record(contractId, { tokensUsed: result.value.tokensUsed, usdUsed: result.value.usdUsed });
          console.log(pc.green(`[daemon] ${contractId} completed: ${result.value.summary}`));
        } else {
          console.log(pc.red(`[daemon] ${contractId} failed: ${result.error.message}`));

          // Check escalation rules
          const contractData = contractStore.getLatest?.(contractId);
          if (contractData) {
            for (const rule of contractData.escalation ?? []) {
              const shouldEscalate =
                (result.error.code === "BUDGET_EXCEEDED" && rule.trigger.includes("budget")) ||
                (result.error.code === "EXECUTION_ERROR" && rule.trigger.includes("fail"));
              if (shouldEscalate) {
                await escalation.dispatch(rule, {
                  contractId,
                  trigger: rule.trigger,
                  message: result.error.message,
                });
              }
            }
          }
        }
      });

      this.cronJobs.push(job);
      console.log(pc.cyan(`[daemon] scheduled ${record.id} @ ${cronExpr}`));
    }

    console.log(pc.green(`[daemon] started — ${this.cronJobs.length} contract(s) scheduled`));
  }

  stop(): void {
    for (const job of this.cronJobs) job.stop();
    this.cronJobs = [];
    this.running = false;
    console.log(pc.dim("[daemon] stopped"));
  }

  isRunning(): boolean {
    return this.running;
  }
}
```

**Note:** The above calls `contractStore.listAll()` and `contractStore.getLatest()`. Check `packages/core/src/contract/store.ts` for actual method names. If they don't exist, add them to ContractStore before this task. Read the file and adjust accordingly.

- [ ] **Step 5: Run tests**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/cli && bun run test -- cron
```
Expected: PASS — 3 cron tests passing

- [ ] **Step 6: Commit**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus
git add packages/cli/src/daemon/cron.ts packages/cli/src/daemon/runner.ts packages/cli/src/daemon/__tests__/cron.test.ts
git commit -m "feat(cli/daemon): add CronEngine and DaemonRunner"
```

---

## Task 13: Daemon CLI command + wire into main.ts + README update

**Files:**
- Create: `packages/cli/src/commands/daemon.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `README.md`

- [ ] **Step 1: Write failing daemon command test**

Create `packages/cli/src/__tests__/daemon.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { daemonCommand } from "../commands/daemon.js";

describe("daemon command", () => {
  it("daemonCommand is a Commander Command named daemon", () => {
    expect(daemonCommand).toBeDefined();
    expect(daemonCommand.name()).toBe("daemon");
  });

  it("has start and stop subcommands", () => {
    const names = daemonCommand.commands.map((c: { name(): string }) => c.name());
    expect(names).toContain("start");
    expect(names).toContain("stop");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/cli && bun run test -- daemon
```
Expected: FAIL — `Cannot find module '../commands/daemon.js'`

- [ ] **Step 3: Create `packages/cli/src/commands/daemon.ts`**

```typescript
import { Command } from "commander";
import { resolve } from "node:path";
import pc from "picocolors";
import { DaemonRunner } from "../daemon/runner.js";

const DEFAULT_DB = resolve(process.env["HOME"] ?? "~", ".argus", "argus.db");
const DEFAULT_REGISTRY = resolve(process.env["HOME"] ?? "~", ".argus", "registry.json");

const runner = new DaemonRunner();

const startCmd = new Command("start")
  .description("Start the Argus daemon (cron scheduler + webhook listener)")
  .option("--db <path>", "Path to the Argus SQLite database", DEFAULT_DB)
  .option("--registry <path>", "Path to the specialist registry", DEFAULT_REGISTRY)
  .option("--key <path>", "Path to the signing key file (required)")
  .option("--passphrase <passphrase>", "Passphrase for the signing key")
  .action(async (opts: { db: string; registry: string; key?: string; passphrase?: string }) => {
    if (!opts.key) {
      console.error(pc.red("--key is required"));
      process.exit(1);
    }
    if (!opts.passphrase) {
      console.error(pc.red("--passphrase is required"));
      process.exit(1);
    }
    if (opts.passphrase) {
      console.warn(pc.yellow("Warning: passing --passphrase on the command line may expose it in shell history. Use ARGUS_PASSPHRASE env var in production."));
    }

    const passphrase = process.env["ARGUS_PASSPHRASE"] ?? opts.passphrase;

    try {
      await runner.start({
        dbPath: opts.db,
        registryPath: opts.registry,
        keyPath: opts.key,
        passphrase,
      });
      // Keep process alive
      process.on("SIGINT", () => {
        runner.stop();
        process.exit(0);
      });
      process.on("SIGTERM", () => {
        runner.stop();
        process.exit(0);
      });
    } catch (err: unknown) {
      console.error(pc.red(`Daemon failed to start: ${String(err)}`));
      process.exit(1);
    }
  });

const stopCmd = new Command("stop")
  .description("Stop the running Argus daemon (sends SIGTERM to daemon process)")
  .action(() => {
    console.log(pc.dim("Use Ctrl+C or SIGTERM to stop the daemon process."));
  });

export const daemonCommand = new Command("daemon")
  .description("Argus initiative engine — cron scheduler and event-driven specialist runner")
  .addCommand(startCmd)
  .addCommand(stopCmd);
```

- [ ] **Step 4: Wire daemon into `packages/cli/src/main.ts`**

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { ARGUS_VERSION } from "@argus/core";
import { contractCommand } from "./commands/contract.js";
import { keysCommand } from "./commands/keys.js";
import { lineageCommand } from "./commands/lineage.js";
import { fleetCommand } from "./commands/fleet.js";
import { daemonCommand } from "./commands/daemon.js";

const program = new Command();

program
  .name("argus")
  .description("Outcome-owning agents with signed lineage")
  .version(ARGUS_VERSION);

program.addCommand(contractCommand);
program.addCommand(keysCommand);
program.addCommand(lineageCommand);
program.addCommand(fleetCommand);
program.addCommand(daemonCommand);

program.parse(process.argv);
```

- [ ] **Step 5: Run all CLI tests**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/cli && bun run test
```
Expected: All CLI tests passing (contract, keys, lineage, fleet, daemon, budget, escalation, cron)

- [ ] **Step 6: Update `README.md` — add Phase 3 to "What's Built"**

In `README.md`, change Phase 3 row in the roadmap table from `🔨 In progress` to `✅ Complete` and add a new "Phase 3 — Fleet Layer" section under the "What's Built" heading:

```markdown
### Phase 3 — Fleet Layer ✅
Content-addressed specialist runtime, cron/webhook initiative engine, budget enforcement, and human-in-the-loop escalation.

```bash
# Manage specialists (content-addressed by BLAKE3 manifest hash)
argus fleet list
argus fleet install ./packages/specialists/src/specialists/outbound/index.ts
argus fleet remove <manifestHash>

# Start the initiative engine (cron + webhook daemon)
argus daemon start --key ~/.argus/myagent.key --passphrase "$PASSPHRASE"
```

Reference specialists:
- **outbound** — drafts cold outreach via Anthropic API (claude-haiku-4-5-20251001)
- **weekly-report** — generates Markdown weekly report from configured data sources
- **pr-review** — reviews GitHub PRs via gh CLI + Anthropic API, posts bot comment
```

- [ ] **Step 7: Run full test suite**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus && bun test
```
Expected: All tests passing across all packages

- [ ] **Step 8: Commit**

```bash
cd /Users/nikhilkumargupta/Desktop/Nikhil/argus
git add packages/cli/src/commands/daemon.ts packages/cli/src/main.ts packages/cli/src/__tests__/daemon.test.ts README.md
git commit -m "feat(cli): add argus daemon start/stop + update README for Phase 3"
```

---

## Self-Review Checklist

### Spec Coverage
- [x] Specialist interface + base: `types.ts` (Task 1), `sandbox.ts` (Task 2)
- [x] Bun subprocess isolation: `sandbox-worker.ts` + `BunSandbox` (Task 2)
- [x] Content-addressed specialist registry: `registry.ts` (Task 3), `loader.ts` (Task 4)
- [x] `argus fleet list/install/remove`: `fleet.ts` (Task 6)
- [x] Orchestrator: `orchestrator.ts` (Task 5) — reads contract, picks specialist, emits signed events
- [x] `outbound` specialist: Anthropic API draft (Task 7)
- [x] `weekly-report` specialist: Markdown report from data sources (Task 8)
- [x] `pr-review` specialist: gh CLI + Anthropic API + bot comment (Task 9)
- [x] Budget enforcement: `budget.ts` (Task 10) — hard/soft cap, `budget_exceeded` event from orchestrator
- [x] Human-in-the-loop escalation: `escalation.ts` (Task 11) — slack/email/github
- [x] `argus daemon start`: cron scheduling via croner (Task 12)
- [x] README updated after Phase 3: (Task 13)

### Notes for Implementer
- Task 5 (Orchestrator) requires checking `ContractStore` API. Read `packages/core/src/contract/store.ts` to find how to get the latest contract version — adjust the `load()` call accordingly, and add `listAll()` / `getLatest()` methods to ContractStore if they don't exist.
- Task 12 (DaemonRunner) similarly requires those ContractStore methods. Add them in the same fix.
- The `croner` package is installed via Task 6's `package.json` update. Run `bun install` from the repo root before Task 7.
- All specialist tests mock Anthropic SDK and Bun.spawn — real API keys are not needed for tests.
- The `ARGUS_PASSPHRASE` env var should be preferred over `--passphrase` in production. The daemon CLI warns about this.
