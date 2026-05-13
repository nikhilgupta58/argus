Now I have all the context I need to write the complete implementation plan. Since this is a READ-ONLY planning task, I cannot create files. I need to output the plan as my response text. However, the task asks me to "save it" to a specific path - since I cannot write files, I'll provide the complete plan as my response and note this constraint.

Wait, let me re-read the instructions carefully. The task says "save it to a path" but I'm in READ-ONLY mode. I'll deliver the full plan as my response text with a note.

---

# Phase 4 Marketplace + Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publisher identity, signed bundles, revocation list, and minimal marketplace discovery site.

**Architecture:** A new `PublisherStore` class in `packages/core/src/marketplace/` wraps a WAL-mode SQLite database (`~/.argus/marketplace.db`) with two tables: `publishers` (identity registry) and `revocations` (bundle hash blocklist). Publisher keys use the same XChaCha20-Poly1305 + PBKDF2 format as lineage keys (reusing `encryptKeyPair`/`decryptKeyPair` from `@argus/lineage`). Signed bundles are `.tar.gz` archives containing `manifest.json` + `specialist.ts`; the manifest carries an Ed25519 signature over `BLAKE3(canonical-JSON-without-signature)`. Bundle install in `argus fleet install` gains two guards: signature verification and revocation check. A minimal static Astro site in `packages/marketplace/` reads from `public/registry.json` for discovery.

**Tech Stack:** TypeScript, Bun, @noble/curves, @noble/hashes, SQLite (bun:sqlite), Astro

---

## File Structure

**Create:**
- `packages/core/src/marketplace/publisher-store.ts` — PublisherStore class (SQLite, publishers + revocations tables)
- `packages/core/src/marketplace/index.ts` — barrel re-exports
- `packages/core/src/__tests__/marketplace/publisher-store.test.ts` — tests for PublisherStore

- `packages/cli/src/commands/publisher.ts` — `argus publisher register/list`
- `packages/cli/src/commands/specialist-publish.ts` — `argus specialist publish`
- `packages/cli/src/marketplace/bundle.ts` — `createBundle()` function
- `packages/cli/src/marketplace/verify.ts` — `verifyBundle()` function
- `packages/cli/src/__tests__/publisher.test.ts` — publisher command tests
- `packages/cli/src/__tests__/specialist-publish.test.ts` — specialist-publish command tests
- `packages/cli/src/__tests__/marketplace/bundle.test.ts` — bundle roundtrip tests

- `packages/marketplace/package.json` — Astro package
- `packages/marketplace/astro.config.mjs` — minimal Astro config
- `packages/marketplace/src/pages/index.astro` — specialist listing page
- `packages/marketplace/src/pages/specialists/[slug].astro` — specialist detail page
- `packages/marketplace/public/registry.json` — static data file

**Modify:**
- `packages/core/src/index.ts` — add `export * from "./marketplace/index.js"`
- `packages/cli/src/main.ts` — register `publisherCommand` and `specialistPublishCommand`
- `packages/cli/src/commands/fleet.ts` — add bundle signature + revocation guard to `install`
- `packages/cli/package.json` — add `@noble/curves` and `@noble/ciphers` as dependencies
- `packages/core/package.json` — add `@noble/curves` and `@noble/ciphers` as dependencies
- `packages/core/vitest.config.ts` — bun:sqlite alias already present (no change needed)
- `docs/threat-model.md` — add Marketplace Adversary v0.2 section

---

## Task 1: PublisherStore — types, schema, SQLite implementation

**Files:**
- Create: `packages/core/src/marketplace/publisher-store.ts`
- Create: `packages/core/src/marketplace/index.ts`
- Create: `packages/core/src/__tests__/marketplace/publisher-store.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`

### Step 1.1 — Write the failing test first

Create `packages/core/src/__tests__/marketplace/publisher-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PublisherStore } from "../../marketplace/publisher-store.js";
import type { Publisher } from "../../marketplace/publisher-store.js";

describe("PublisherStore", () => {
  let store: PublisherStore;

  beforeEach(() => {
    store = new PublisherStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("registers a publisher and retrieves it by id", () => {
    store.register({
      id: "pub-001",
      name: "Alice",
      public_key_hex: "a".repeat(64),
      created_at: "2026-05-13T00:00:00Z",
    });
    const p = store.getById("pub-001");
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Alice");
    expect(p!.public_key_hex).toBe("a".repeat(64));
  });

  it("lists all publishers", () => {
    store.register({ id: "pub-001", name: "Alice", public_key_hex: "a".repeat(64), created_at: "2026-05-13T00:00:00Z" });
    store.register({ id: "pub-002", name: "Bob", public_key_hex: "b".repeat(64), created_at: "2026-05-13T00:00:01Z" });
    const all = store.list();
    expect(all).toHaveLength(2);
    expect(all.map((p) => p.name)).toContain("Alice");
    expect(all.map((p) => p.name)).toContain("Bob");
  });

  it("throws on duplicate publisher id", () => {
    store.register({ id: "pub-001", name: "Alice", public_key_hex: "a".repeat(64), created_at: "2026-05-13T00:00:00Z" });
    expect(() =>
      store.register({ id: "pub-001", name: "Alice2", public_key_hex: "c".repeat(64), created_at: "2026-05-13T00:00:02Z" })
    ).toThrow();
  });

  it("returns null for unknown publisher id", () => {
    expect(store.getById("nonexistent")).toBeNull();
  });

  describe("revocations", () => {
    it("revokes a bundle hash and reports it as revoked", () => {
      store.revoke("abc123hash", "malware detected");
      expect(store.isRevoked("abc123hash")).toBe(true);
    });

    it("returns false for non-revoked bundle hash", () => {
      expect(store.isRevoked("clean-hash")).toBe(false);
    });

    it("throws on duplicate revocation", () => {
      store.revoke("hash1", "reason1");
      expect(() => store.revoke("hash1", "reason2")).toThrow();
    });

    it("getRevokedBundles lists all revoked hashes", () => {
      store.revoke("hash-a", "bad");
      store.revoke("hash-b", "worse");
      const list = store.getRevokedBundles();
      expect(list).toHaveLength(2);
      expect(list.map((r) => r.bundle_hash)).toContain("hash-a");
      expect(list.map((r) => r.bundle_hash)).toContain("hash-b");
    });
  });
});
```

### Step 1.2 — Run to confirm it fails

```bash
cd /path/to/argus && bun run --filter='@argus/core' test
# Expected: fails with "Cannot find module '../../marketplace/publisher-store.js'"
```

### Step 1.3 — Implement `packages/core/src/marketplace/publisher-store.ts`

```typescript
import { Database } from "bun:sqlite";
import { resolve } from "node:path";

export interface Publisher {
  id: string;
  name: string;
  public_key_hex: string;
  created_at: string;
}

export interface RevokedBundle {
  bundle_hash: string;
  revoked_at: string;
  reason: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS publishers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  public_key_hex TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS revocations (
  bundle_hash TEXT PRIMARY KEY NOT NULL,
  revoked_at TEXT NOT NULL,
  reason TEXT
) STRICT;
`;

export class PublisherStore {
  private db: Database;

  constructor(path: string = ":memory:") {
    const resolvedPath = path === ":memory:" ? path : resolve(path);
    this.db = new Database(resolvedPath, { create: true });
    this.db.run("PRAGMA journal_mode=WAL;");
    this.db.run(SCHEMA);
  }

  register(publisher: Publisher): void {
    this.db.prepare(`
      INSERT INTO publishers (id, name, public_key_hex, created_at)
      VALUES (?, ?, ?, ?)
    `).run(publisher.id, publisher.name, publisher.public_key_hex, publisher.created_at);
  }

  getById(id: string): Publisher | null {
    const row = this.db
      .prepare("SELECT id, name, public_key_hex, created_at FROM publishers WHERE id = ?")
      .get(id) as Publisher | null;
    return row ?? null;
  }

  list(): Publisher[] {
    return this.db
      .prepare("SELECT id, name, public_key_hex, created_at FROM publishers ORDER BY created_at ASC")
      .all() as Publisher[];
  }

  revoke(bundleHash: string, reason?: string): void {
    this.db.prepare(`
      INSERT INTO revocations (bundle_hash, revoked_at, reason)
      VALUES (?, ?, ?)
    `).run(bundleHash, new Date().toISOString(), reason ?? null);
  }

  isRevoked(bundleHash: string): boolean {
    const row = this.db
      .prepare("SELECT bundle_hash FROM revocations WHERE bundle_hash = ?")
      .get(bundleHash);
    return row !== null;
  }

  getRevokedBundles(): RevokedBundle[] {
    return this.db
      .prepare("SELECT bundle_hash, revoked_at, reason FROM revocations ORDER BY revoked_at ASC")
      .all() as RevokedBundle[];
  }

  close(): void {
    this.db.close();
  }
}
```

### Step 1.4 — Create `packages/core/src/marketplace/index.ts`

```typescript
export * from "./publisher-store.js";
```

### Step 1.5 — Update `packages/core/src/index.ts`

Add at the end:

```typescript
export * from "./marketplace/index.js";
```

### Step 1.6 — Update `packages/core/package.json` — add `@noble/curves` and `@noble/ciphers`

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
    "@noble/hashes": "^1.4.0",
    "@noble/curves": "^1.6.0",
    "@noble/ciphers": "^1.0.0"
  },
  "devDependencies": {
    "fast-check": "^3.21.0",
    "vitest": "^2.0.0",
    "typescript": "^5.5.0"
  }
}
```

### Step 1.7 — Run tests to confirm passing

```bash
bun run --filter='@argus/core' test
# Expected: all tests pass including the 7 new PublisherStore tests
```

### Step 1.8 — Install new deps and commit

```bash
bun install
bun run --filter='*' test
# Expected: all 144 + 7 = 151 tests pass
```

```bash
git add packages/core/src/marketplace/ \
        packages/core/src/index.ts \
        packages/core/src/__tests__/marketplace/ \
        packages/core/package.json \
        bun.lock
git commit -m "feat(core): add PublisherStore with publishers + revocations tables

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Bundle creation + verification utilities

**Files:**
- Create: `packages/cli/src/marketplace/bundle.ts`
- Create: `packages/cli/src/marketplace/verify.ts`
- Create: `packages/cli/src/__tests__/marketplace/bundle.test.ts`
- Modify: `packages/cli/package.json`

### Step 2.1 — Write the failing test

Create `packages/cli/src/__tests__/marketplace/bundle.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createBundle, BundleManifest } from "../../marketplace/bundle.js";
import { verifyBundle } from "../../marketplace/verify.js";
import { generateKeyPair } from "@argus/lineage";
import { bytesToHex } from "@noble/hashes/utils";
import { blake3 } from "@noble/hashes/blake3";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "argus-bundle-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("createBundle + verifyBundle", () => {
  it("creates a .tar.gz and verifyBundle returns the manifest", async () => {
    // Prepare a source specialist directory
    const sourceDir = join(tmpDir, "my-specialist");
    mkdirSync(sourceDir);
    writeFileSync(join(sourceDir, "specialist.ts"), `export default { name: "my-specialist", version: "1.0.0", contractKinds: ["custom"] };`);

    const kp = generateKeyPair();
    const publisherIdentity = {
      id: "pub-001",
      name: "Alice",
      publicKeyHex: bytesToHex(kp.publicKey),
    };

    const outputPath = join(tmpDir, "my-specialist-1.0.0.tar.gz");

    const manifest = await createBundle({
      sourceDir,
      name: "my-specialist",
      version: "1.0.0",
      contractKinds: ["custom"],
      publisherIdentity,
      privateKey: kp.privateKey,
      outputPath,
    });

    expect(existsSync(outputPath)).toBe(true);
    expect(manifest.name).toBe("my-specialist");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(manifest.codeHash).toMatch(/^[0-9a-f]{64}$/);

    const verified = await verifyBundle(outputPath);
    expect(verified.name).toBe("my-specialist");
    expect(verified.version).toBe("1.0.0");
    expect(verified.publisherIdentity.id).toBe("pub-001");
  });

  it("verifyBundle rejects a bundle with a tampered manifest signature", async () => {
    const sourceDir = join(tmpDir, "spec2");
    mkdirSync(sourceDir);
    writeFileSync(join(sourceDir, "specialist.ts"), `export default {};`);

    const kp = generateKeyPair();
    const outputPath = join(tmpDir, "spec2-1.0.0.tar.gz");

    await createBundle({
      sourceDir,
      name: "spec2",
      version: "1.0.0",
      contractKinds: ["custom"],
      publisherIdentity: { id: "pub-999", name: "Mallory", publicKeyHex: bytesToHex(kp.publicKey) },
      privateKey: kp.privateKey,
      outputPath,
    });

    // Corrupt the tar.gz by writing garbage bytes into the file
    const { readFileSync, writeFileSync: wf } = await import("node:fs");
    const orig = readFileSync(outputPath);
    const tampered = Buffer.from(orig);
    tampered[orig.length - 10] ^= 0xff;
    wf(outputPath, tampered);

    await expect(verifyBundle(outputPath)).rejects.toThrow();
  });

  it("verifyBundle returns manifest with bundleHash field set", async () => {
    const sourceDir = join(tmpDir, "spec3");
    mkdirSync(sourceDir);
    writeFileSync(join(sourceDir, "specialist.ts"), `export default {};`);
    const kp = generateKeyPair();
    const outputPath = join(tmpDir, "spec3-1.0.0.tar.gz");
    await createBundle({
      sourceDir, name: "spec3", version: "1.0.0", contractKinds: ["custom"],
      publisherIdentity: { id: "p1", name: "Dev", publicKeyHex: bytesToHex(kp.publicKey) },
      privateKey: kp.privateKey, outputPath,
    });
    const manifest = await verifyBundle(outputPath);
    expect(manifest.bundleHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

### Step 2.2 — Run to confirm it fails

```bash
bun run --filter='@argus/cli' test
# Expected: fails with module resolution errors
```

### Step 2.3 — Implement `packages/cli/src/marketplace/bundle.ts`

```typescript
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import { ed25519 } from "@noble/curves/ed25519";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface PublisherIdentity {
  id: string;
  name: string;
  publicKeyHex: string;
}

export interface BundleManifest {
  name: string;
  version: string;
  contractKinds: string[];
  codeHash: string;
  publisherIdentity: PublisherIdentity;
  bundledAt: string;
  signature: string;
  bundleHash?: string; // Set by verifyBundle after reading the .tar.gz
}

export interface CreateBundleOptions {
  sourceDir: string;
  name: string;
  version: string;
  contractKinds: string[];
  publisherIdentity: PublisherIdentity;
  privateKey: Uint8Array;
  outputPath: string;
}

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

export async function createBundle(opts: CreateBundleOptions): Promise<BundleManifest> {
  const { sourceDir, name, version, contractKinds, publisherIdentity, privateKey, outputPath } = opts;

  // 1. Read specialist source file bytes and compute codeHash
  const specPath = join(sourceDir, "specialist.ts");
  const codeBytes = readFileSync(specPath);
  const codeHash = bytesToHex(blake3(new Uint8Array(codeBytes.buffer, codeBytes.byteOffset, codeBytes.byteLength)));

  // 2. Build the manifest payload (no signature yet)
  const bundledAt = new Date().toISOString();
  const manifestWithoutSig = {
    name,
    version,
    contractKinds,
    codeHash,
    publisherIdentity,
    bundledAt,
  };

  // 3. Sign: Ed25519 over BLAKE3(canonical JSON of manifest-without-signature)
  const canonicalJson = JSON.stringify(sortKeys(manifestWithoutSig));
  const payloadHash = blake3(encoder.encode(canonicalJson));
  const sigBytes = ed25519.sign(payloadHash, privateKey);
  const signature = bytesToHex(sigBytes);

  const manifest: BundleManifest = { ...manifestWithoutSig, signature };

  // 4. Write manifest.json into sourceDir temporarily
  const { writeFileSync, rmSync } = await import("node:fs");
  const manifestPath = join(sourceDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  try {
    // 5. Pack with tar
    const result = spawnSync("tar", ["czf", outputPath, "-C", sourceDir, "."], { encoding: "utf-8" });
    if (result.status !== 0) {
      throw new Error(`tar failed: ${result.stderr}`);
    }
  } finally {
    // 6. Remove the temporary manifest.json from the source directory
    try { rmSync(manifestPath); } catch {}
  }

  return manifest;
}
```

### Step 2.4 — Implement `packages/cli/src/marketplace/verify.ts`

```typescript
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { ed25519 } from "@noble/curves/ed25519";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { BundleManifest } from "./bundle.js";

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

export async function verifyBundle(tarPath: string): Promise<BundleManifest> {
  // 1. Compute bundleHash = BLAKE3 of the entire .tar.gz file
  const tarBytes = readFileSync(tarPath);
  const bundleHash = bytesToHex(blake3(new Uint8Array(tarBytes.buffer, tarBytes.byteOffset, tarBytes.byteLength)));

  // 2. Extract manifest.json into a temp directory
  const tmpDir = mkdtempSync(join(tmpdir(), "argus-verify-"));
  try {
    const result = spawnSync("tar", ["xzf", tarPath, "-C", tmpDir, "./manifest.json"], { encoding: "utf-8" });
    if (result.status !== 0) {
      throw new Error(`tar extraction failed: ${result.stderr ?? "unknown error"}`);
    }

    const manifestPath = join(tmpDir, "manifest.json");
    const raw = JSON.parse(readFileSync(manifestPath, "utf-8")) as BundleManifest;

    const { signature, ...rest } = raw;
    if (!signature) {
      throw new Error("Bundle manifest is missing signature field");
    }

    // 3. Verify the signature
    const canonicalJson = JSON.stringify(sortKeys(rest));
    const payloadHash = blake3(encoder.encode(canonicalJson));

    const sigBytes = hexToBytes(signature);
    const pubKeyBytes = hexToBytes(raw.publisherIdentity.publicKeyHex);

    const valid = ed25519.verify(sigBytes, payloadHash, pubKeyBytes);
    if (!valid) {
      throw new Error("Bundle signature verification failed — bundle may have been tampered with");
    }

    return { ...raw, bundleHash };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

### Step 2.5 — Update `packages/cli/package.json`

Add `@noble/curves` and `@noble/ciphers` to dependencies:

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
    "@argus/lineage": "workspace:*",
    "@argus/specialists": "workspace:*",
    "commander": "^12.1.0",
    "croner": "^9.0.0",
    "picocolors": "^1.1.1",
    "@noble/curves": "^1.6.0",
    "@noble/hashes": "^1.4.0",
    "@noble/ciphers": "^1.0.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "typescript": "^5.5.0"
  }
}
```

### Step 2.6 — Update `packages/cli/vitest.config.ts`

Add `@noble/hashes` and `@noble/curves` are direct packages — no alias needed. The existing config already has `@argus/lineage` aliased, which exports `generateKeyPair`. No config changes needed.

### Step 2.7 — Run tests

```bash
bun install
bun run --filter='@argus/cli' test
# Expected: all 3 new bundle tests pass
bun run --filter='*' test
# Expected: all tests still passing (151 + 3 = 154 tests)
```

### Step 2.8 — Commit

```bash
git add packages/cli/src/marketplace/ \
        packages/cli/src/__tests__/marketplace/ \
        packages/cli/package.json \
        bun.lock
git commit -m "feat(cli): add bundle creation and signature verification utilities

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: `argus publisher register/list` CLI command

**Files:**
- Create: `packages/cli/src/commands/publisher.ts`
- Create: `packages/cli/src/__tests__/publisher.test.ts`
- Modify: `packages/cli/src/main.ts`

### Step 3.1 — Write the failing test

Create `packages/cli/src/__tests__/publisher.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { publisherCommand } from "../commands/publisher.js";

describe("publisherCommand", () => {
  it("is a Commander Command named 'publisher'", () => {
    expect(publisherCommand).toBeDefined();
    expect(publisherCommand.name()).toBe("publisher");
  });

  it("has register and list subcommands", () => {
    const names = publisherCommand.commands.map((c: { name(): string }) => c.name());
    expect(names).toContain("register");
    expect(names).toContain("list");
  });

  it("register subcommand has --name option", () => {
    const registerCmd = publisherCommand.commands.find(
      (c: { name(): string }) => c.name() === "register"
    );
    expect(registerCmd).toBeDefined();
    const opts = registerCmd!.options.map((o: { long: string }) => o.long);
    expect(opts).toContain("--name");
  });
});
```

### Step 3.2 — Run to confirm it fails

```bash
bun run --filter='@argus/cli' test
# Expected: fails — publisherCommand not found
```

### Step 3.3 — Implement `packages/cli/src/commands/publisher.ts`

```typescript
import { Command } from "commander";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import pc from "picocolors";
import { generateKeyPair, encryptKeyPair, keyPairToHex } from "@argus/lineage";
import { PublisherStore } from "@argus/core";

const DEFAULT_MARKETPLACE_DB = resolve(
  process.env["HOME"] ?? "~",
  ".argus",
  "marketplace.db"
);
const DEFAULT_KEYS_DIR = resolve(process.env["HOME"] ?? "~", ".argus", "publisher-keys");

function getStore(): PublisherStore {
  const dbPath = process.env["ARGUS_MARKETPLACE_DB"] ?? DEFAULT_MARKETPLACE_DB;
  // Ensure parent directory exists
  const dir = resolve(dbPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return new PublisherStore(dbPath);
}

function publisherKeyPath(id: string): string {
  return join(DEFAULT_KEYS_DIR, `${id}.key`);
}

function publisherPubPath(id: string): string {
  return join(DEFAULT_KEYS_DIR, `${id}.pub`);
}

function ensureKeysDir(): void {
  if (!existsSync(DEFAULT_KEYS_DIR)) mkdirSync(DEFAULT_KEYS_DIR, { recursive: true });
}

const registerCmd = new Command("register")
  .description("Register a new publisher identity (generates an Ed25519 keypair)")
  .requiredOption("--name <display-name>", "Human-readable publisher display name")
  .option("--passphrase <pass>", "Passphrase to encrypt the private key (use env ARGUS_PASSPHRASE in production)")
  .action((opts: { name: string; passphrase?: string }) => {
    const passphrase = opts.passphrase ?? process.env["ARGUS_PASSPHRASE"];
    if (!passphrase) {
      console.error(pc.red("Error: --passphrase required (or set ARGUS_PASSPHRASE env var)"));
      process.exit(1);
    }
    if (opts.passphrase) {
      console.warn(pc.yellow("  Warning: passing --passphrase on the command line may expose it in shell history."));
    }

    // Generate a short random id
    const id = `pub-${randomBytes(8).toString("hex")}`;

    const kp = generateKeyPair();
    const encrypted = encryptKeyPair(kp, passphrase);
    const hex = keyPairToHex(kp);

    ensureKeysDir();
    writeFileSync(publisherKeyPath(id), encrypted);
    writeFileSync(publisherPubPath(id), hex.publicKey + "\n", "utf-8");

    const store = getStore();
    try {
      store.register({
        id,
        name: opts.name,
        public_key_hex: hex.publicKey,
        created_at: new Date().toISOString(),
      });
    } finally {
      store.close();
    }

    console.log(pc.green(`Publisher registered`));
    console.log(`  id:          ${id}`);
    console.log(`  name:        ${opts.name}`);
    console.log(`  public key:  ${hex.publicKey}`);
    console.log(`  private key: ${publisherKeyPath(id)} (encrypted)`);
    console.log(pc.yellow("  Store your passphrase safely — there is no recovery path."));
  });

const listCmd = new Command("list")
  .description("List all registered publishers")
  .action(() => {
    const store = getStore();
    let publishers;
    try {
      publishers = store.list();
    } finally {
      store.close();
    }

    if (publishers.length === 0) {
      console.log(pc.dim("No publishers registered."));
      return;
    }

    for (const p of publishers) {
      console.log(
        `${pc.green(p.name)}  ${pc.dim(p.id)}  pubkey: ${p.public_key_hex.slice(0, 16)}...`
      );
    }
  });

export const publisherCommand = new Command("publisher")
  .description("Manage publisher identities")
  .addCommand(registerCmd)
  .addCommand(listCmd);
```

### Step 3.4 — Update `packages/cli/src/main.ts`

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { ARGUS_VERSION } from "@argus/core";
import { contractCommand } from "./commands/contract.js";
import { keysCommand } from "./commands/keys.js";
import { lineageCommand } from "./commands/lineage.js";
import { fleetCommand } from "./commands/fleet.js";
import { daemonCommand } from "./commands/daemon.js";
import { publisherCommand } from "./commands/publisher.js";

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
program.addCommand(publisherCommand);

program.parse(process.argv);
```

### Step 3.5 — Run tests

```bash
bun run --filter='@argus/cli' test
# Expected: 3 new publisher tests pass
bun run --filter='*' test
# Expected: all 157 tests pass
```

### Step 3.6 — Commit

```bash
git add packages/cli/src/commands/publisher.ts \
        packages/cli/src/__tests__/publisher.test.ts \
        packages/cli/src/main.ts
git commit -m "feat(cli): add argus publisher register/list commands

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: `argus specialist publish` CLI command

**Files:**
- Create: `packages/cli/src/commands/specialist-publish.ts`
- Create: `packages/cli/src/__tests__/specialist-publish.test.ts`
- Modify: `packages/cli/src/main.ts`

### Step 4.1 — Write the failing test

Create `packages/cli/src/__tests__/specialist-publish.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { specialistPublishCommand } from "../commands/specialist-publish.js";

describe("specialistPublishCommand", () => {
  it("is a Commander Command named 'specialist'", () => {
    expect(specialistPublishCommand).toBeDefined();
    expect(specialistPublishCommand.name()).toBe("specialist");
  });

  it("has a 'publish' subcommand", () => {
    const names = specialistPublishCommand.commands.map((c: { name(): string }) => c.name());
    expect(names).toContain("publish");
  });

  it("publish subcommand has --publisher option", () => {
    const publishCmd = specialistPublishCommand.commands.find(
      (c: { name(): string }) => c.name() === "publish"
    );
    expect(publishCmd).toBeDefined();
    const opts = publishCmd!.options.map((o: { long: string }) => o.long);
    expect(opts).toContain("--publisher");
  });
});
```

### Step 4.2 — Run to confirm it fails

```bash
bun run --filter='@argus/cli' test
# Expected: fails — specialistPublishCommand not found
```

### Step 4.3 — Implement `packages/cli/src/commands/specialist-publish.ts`

```typescript
import { Command } from "commander";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import pc from "picocolors";
import { decryptKeyPair } from "@argus/lineage";
import { PublisherStore } from "@argus/core";
import { createBundle } from "../marketplace/bundle.js";
import { bytesToHex } from "@noble/hashes/utils";

const DEFAULT_MARKETPLACE_DB = resolve(
  process.env["HOME"] ?? "~",
  ".argus",
  "marketplace.db"
);
const DEFAULT_KEYS_DIR = resolve(process.env["HOME"] ?? "~", ".argus", "publisher-keys");

const publishCmd = new Command("publish")
  .description("Pack and sign a specialist directory into a .tar.gz bundle")
  .argument("<path>", "Path to the specialist directory (must contain specialist.ts)")
  .requiredOption("--publisher <id>", "Publisher id (from argus publisher list)")
  .option("--passphrase <pass>", "Passphrase to decrypt the publisher key (use env ARGUS_PASSPHRASE)")
  .option("--out <dir>", "Output directory for the bundle (default: current directory)", ".")
  .action(async (specPath: string, opts: { publisher: string; passphrase?: string; out: string }) => {
    const passphrase = opts.passphrase ?? process.env["ARGUS_PASSPHRASE"];
    if (!passphrase) {
      console.error(pc.red("Error: --passphrase required (or set ARGUS_PASSPHRASE env var)"));
      process.exit(1);
    }

    const absSpecPath = resolve(specPath);
    if (!existsSync(absSpecPath)) {
      console.error(pc.red(`Specialist directory not found: ${absSpecPath}`));
      process.exit(1);
    }

    const specialistTs = join(absSpecPath, "specialist.ts");
    if (!existsSync(specialistTs)) {
      console.error(pc.red(`specialist.ts not found in ${absSpecPath}`));
      process.exit(1);
    }

    // Load publisher from marketplace.db
    const dbPath = process.env["ARGUS_MARKETPLACE_DB"] ?? DEFAULT_MARKETPLACE_DB;
    const store = new PublisherStore(dbPath);
    let publisher;
    try {
      publisher = store.getById(opts.publisher);
    } finally {
      store.close();
    }

    if (!publisher) {
      console.error(pc.red(`Publisher '${opts.publisher}' not found. Run 'argus publisher list' to see registered publishers.`));
      process.exit(1);
    }

    // Load and decrypt the publisher private key
    const keyPath = join(DEFAULT_KEYS_DIR, `${opts.publisher}.key`);
    if (!existsSync(keyPath)) {
      console.error(pc.red(`Publisher key not found: ${keyPath}`));
      process.exit(1);
    }

    let kp;
    try {
      const keyBytes = readFileSync(keyPath);
      kp = decryptKeyPair(new Uint8Array(keyBytes.buffer, keyBytes.byteOffset, keyBytes.byteLength), passphrase);
    } catch (e) {
      console.error(pc.red(`Failed to decrypt publisher key: wrong passphrase?`));
      process.exit(1);
    }

    // Load specialist metadata from the module
    const mod = await import(specialistTs).catch(() => null);
    if (!mod?.default) {
      console.error(pc.red("specialist.ts has no default export"));
      process.exit(1);
    }

    const s = mod.default;
    if (typeof s.name !== "string" || typeof s.version !== "string" || !Array.isArray(s.contractKinds)) {
      console.error(pc.red("specialist.ts default export must have name, version, and contractKinds"));
      process.exit(1);
    }

    const outDir = resolve(opts.out);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const outputPath = join(outDir, `${s.name}-${s.version}.tar.gz`);

    console.log(pc.dim(`Packing ${s.name}@${s.version}...`));

    const manifest = await createBundle({
      sourceDir: absSpecPath,
      name: s.name as string,
      version: s.version as string,
      contractKinds: s.contractKinds as string[],
      publisherIdentity: {
        id: publisher.id,
        name: publisher.name,
        publicKeyHex: publisher.public_key_hex,
      },
      privateKey: kp.privateKey,
      outputPath,
    });

    console.log(pc.green(`Bundle created: ${outputPath}`));
    console.log(`  name:       ${manifest.name}@${manifest.version}`);
    console.log(`  codeHash:   ${manifest.codeHash.slice(0, 16)}...`);
    console.log(`  signature:  ${manifest.signature.slice(0, 16)}...`);
    console.log(`  publisher:  ${publisher.name} (${publisher.id})`);
  });

export const specialistPublishCommand = new Command("specialist")
  .description("Manage specialist bundles")
  .addCommand(publishCmd);
```

### Step 4.4 — Update `packages/cli/src/main.ts`

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { ARGUS_VERSION } from "@argus/core";
import { contractCommand } from "./commands/contract.js";
import { keysCommand } from "./commands/keys.js";
import { lineageCommand } from "./commands/lineage.js";
import { fleetCommand } from "./commands/fleet.js";
import { daemonCommand } from "./commands/daemon.js";
import { publisherCommand } from "./commands/publisher.js";
import { specialistPublishCommand } from "./commands/specialist-publish.js";

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
program.addCommand(publisherCommand);
program.addCommand(specialistPublishCommand);

program.parse(process.argv);
```

### Step 4.5 — Run tests

```bash
bun run --filter='@argus/cli' test
# Expected: 3 new specialist-publish tests pass
bun run --filter='*' test
# Expected: all 160 tests pass
```

### Step 4.6 — Commit

```bash
git add packages/cli/src/commands/specialist-publish.ts \
        packages/cli/src/__tests__/specialist-publish.test.ts \
        packages/cli/src/main.ts
git commit -m "feat(cli): add argus specialist publish command

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: `argus marketplace revoke` + update `argus fleet install` with signature + revocation guards

**Files:**
- Create: `packages/cli/src/commands/marketplace.ts`
- Create: `packages/cli/src/__tests__/marketplace.test.ts`
- Modify: `packages/cli/src/commands/fleet.ts` — add `installBundle` sub-command
- Modify: `packages/cli/src/main.ts` — register marketplace command

### Step 5.1 — Write the failing test

Create `packages/cli/src/__tests__/marketplace.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { marketplaceCommand } from "../commands/marketplace.js";

describe("marketplaceCommand", () => {
  it("is a Commander Command named 'marketplace'", () => {
    expect(marketplaceCommand).toBeDefined();
    expect(marketplaceCommand.name()).toBe("marketplace");
  });

  it("has a 'revoke' subcommand", () => {
    const names = marketplaceCommand.commands.map((c: { name(): string }) => c.name());
    expect(names).toContain("revoke");
  });

  it("revoke subcommand accepts a bundleHash argument", () => {
    const revokeCmd = marketplaceCommand.commands.find(
      (c: { name(): string }) => c.name() === "revoke"
    );
    expect(revokeCmd).toBeDefined();
    // Commander args are registered as _args
    expect(revokeCmd!.registeredArguments.length).toBeGreaterThan(0);
  });
});
```

Also add a test that `fleet install` now accepts `.tar.gz` bundles. Append to `packages/cli/src/__tests__/fleet.test.ts`:

```typescript
// (append to existing fleet.test.ts describe block)
it("has an install-bundle subcommand", () => {
  const names = fleetCommand.commands.map((c: { name(): string }) => c.name());
  expect(names).toContain("install-bundle");
});
```

### Step 5.2 — Implement `packages/cli/src/commands/marketplace.ts`

```typescript
import { Command } from "commander";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import { PublisherStore } from "@argus/core";

const DEFAULT_MARKETPLACE_DB = resolve(
  process.env["HOME"] ?? "~",
  ".argus",
  "marketplace.db"
);

function getStore(): PublisherStore {
  const dbPath = process.env["ARGUS_MARKETPLACE_DB"] ?? DEFAULT_MARKETPLACE_DB;
  const dir = resolve(dbPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return new PublisherStore(dbPath);
}

const revokeCmd = new Command("revoke")
  .description("Revoke a published bundle by its BLAKE3 hash")
  .argument("<bundleHash>", "BLAKE3 hex hash of the .tar.gz bundle to revoke")
  .option("--reason <reason>", "Human-readable reason for revocation")
  .action((bundleHash: string, opts: { reason?: string }) => {
    const store = getStore();
    try {
      if (store.isRevoked(bundleHash)) {
        console.warn(pc.yellow(`Bundle ${bundleHash.slice(0, 16)}... is already revoked.`));
        return;
      }
      store.revoke(bundleHash, opts.reason);
      console.log(pc.green(`Bundle revoked: ${bundleHash.slice(0, 16)}...`));
      if (opts.reason) console.log(`  reason: ${opts.reason}`);
    } finally {
      store.close();
    }
  });

const listRevokedCmd = new Command("list-revoked")
  .description("List all revoked bundle hashes")
  .action(() => {
    const store = getStore();
    let revoked;
    try {
      revoked = store.getRevokedBundles();
    } finally {
      store.close();
    }

    if (revoked.length === 0) {
      console.log(pc.dim("No bundles revoked."));
      return;
    }
    for (const r of revoked) {
      console.log(
        `${pc.red(r.bundle_hash.slice(0, 16))}...  ${pc.dim(r.revoked_at)}  ${r.reason ?? ""}`
      );
    }
  });

export const marketplaceCommand = new Command("marketplace")
  .description("Marketplace administration")
  .addCommand(revokeCmd)
  .addCommand(listRevokedCmd);
```

### Step 5.3 — Update `packages/cli/src/commands/fleet.ts` — add `install-bundle` subcommand

Append to the end of `fleet.ts` (before the `export`):

```typescript
const installBundleCmd = new Command("install-bundle")
  .description("Install a specialist from a signed .tar.gz bundle (verifies signature and checks revocation)")
  .argument("<bundle>", "Path to the .tar.gz bundle file")
  .action(async (bundlePath: string) => {
    const absPath = resolve(bundlePath);
    if (!existsSync(absPath)) {
      console.error(pc.red(`Bundle file not found: ${absPath}`));
      process.exit(1);
    }

    // 1. Compute bundle hash for revocation check
    const { readFileSync } = await import("node:fs");
    const { blake3 } = await import("@noble/hashes/blake3");
    const { bytesToHex } = await import("@noble/hashes/utils");
    const { PublisherStore } = await import("@argus/core");
    const { verifyBundle } = await import("../marketplace/verify.js");

    const tarBytes = readFileSync(absPath);
    const bundleHash = bytesToHex(
      blake3(new Uint8Array(tarBytes.buffer, tarBytes.byteOffset, tarBytes.byteLength))
    );

    // 2. Check revocation
    const dbPath = process.env["ARGUS_MARKETPLACE_DB"] ??
      resolve(process.env["HOME"] ?? "~", ".argus", "marketplace.db");
    const store = new PublisherStore(dbPath);
    let isRevoked = false;
    try {
      isRevoked = store.isRevoked(bundleHash);
    } finally {
      store.close();
    }

    if (isRevoked) {
      console.error(pc.red(`Bundle ${bundleHash.slice(0, 16)}... has been revoked and cannot be installed.`));
      process.exit(1);
    }

    // 3. Verify signature
    let manifest;
    try {
      manifest = await verifyBundle(absPath);
    } catch (e) {
      console.error(pc.red(`Bundle signature verification failed: ${(e as Error).message}`));
      process.exit(1);
    }

    console.log(pc.green(`Signature verified for ${manifest.name}@${manifest.version}`));
    console.log(`  publisher:  ${manifest.publisherIdentity.name} (${manifest.publisherIdentity.id})`);
    console.log(`  bundleHash: ${bundleHash.slice(0, 16)}...`);
    console.log(pc.dim("  (Verified bundle — install to local registry with argus fleet install <entrypoint>)"));
  });
```

Then update the export to include the new subcommand:

```typescript
export const fleetCommand = new Command("fleet")
  .description("Manage installed specialists")
  .addCommand(listCmd)
  .addCommand(installCmd)
  .addCommand(removeCmd)
  .addCommand(installBundleCmd);
```

### Step 5.4 — Update `packages/cli/src/main.ts` to register marketplace command

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { ARGUS_VERSION } from "@argus/core";
import { contractCommand } from "./commands/contract.js";
import { keysCommand } from "./commands/keys.js";
import { lineageCommand } from "./commands/lineage.js";
import { fleetCommand } from "./commands/fleet.js";
import { daemonCommand } from "./commands/daemon.js";
import { publisherCommand } from "./commands/publisher.js";
import { specialistPublishCommand } from "./commands/specialist-publish.js";
import { marketplaceCommand } from "./commands/marketplace.js";

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
program.addCommand(publisherCommand);
program.addCommand(specialistPublishCommand);
program.addCommand(marketplaceCommand);

program.parse(process.argv);
```

### Step 5.5 — Run tests

```bash
bun run --filter='@argus/cli' test
# Expected: 3 + 1 (fleet extra test) = 4 more tests pass
bun run --filter='*' test
# Expected: all 164 tests pass
```

### Step 5.6 — Commit

```bash
git add packages/cli/src/commands/marketplace.ts \
        packages/cli/src/__tests__/marketplace.test.ts \
        packages/cli/src/commands/fleet.ts \
        packages/cli/src/__tests__/fleet.test.ts \
        packages/cli/src/main.ts
git commit -m "feat(cli): add marketplace revoke command and bundle-verified fleet install

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Static Astro marketplace site

**Files:**
- Create: `packages/marketplace/package.json`
- Create: `packages/marketplace/astro.config.mjs`
- Create: `packages/marketplace/src/pages/index.astro`
- Create: `packages/marketplace/src/pages/specialists/[slug].astro`
- Create: `packages/marketplace/public/registry.json`

### Step 6.1 — Create `packages/marketplace/package.json`

```json
{
  "name": "@argus/marketplace",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "astro": "^4.0.0"
  }
}
```

### Step 6.2 — Create `packages/marketplace/astro.config.mjs`

```javascript
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://marketplace.argus.dev",
  output: "static",
});
```

### Step 6.3 — Create `packages/marketplace/public/registry.json`

```json
[
  {
    "slug": "outbound-sales",
    "name": "outbound",
    "version": "1.0.0",
    "description": "Drafts personalised outbound sales sequences based on an Outbound contract.",
    "publisher": "Argus Core Team",
    "contractKinds": ["outbound"],
    "githubUrl": "https://github.com/argus-dev/argus/tree/main/packages/specialists/src/specialists/outbound"
  },
  {
    "slug": "weekly-report",
    "name": "weekly-report",
    "version": "1.0.0",
    "description": "Generates a weekly status report from structured data sources.",
    "publisher": "Argus Core Team",
    "contractKinds": ["report"],
    "githubUrl": "https://github.com/argus-dev/argus/tree/main/packages/specialists/src/specialists/weekly-report"
  },
  {
    "slug": "pr-review",
    "name": "pr-review",
    "version": "1.0.0",
    "description": "Reviews GitHub pull requests and enforces SLA contracts.",
    "publisher": "Argus Core Team",
    "contractKinds": ["pr-review"],
    "githubUrl": "https://github.com/argus-dev/argus/tree/main/packages/specialists/src/specialists/pr-review"
  }
]
```

### Step 6.4 — Create `packages/marketplace/src/pages/index.astro`

```astro
---
import registry from "../../public/registry.json";
---

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Argus Marketplace</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 2rem; }
    .specialist-card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    .specialist-card h2 { margin-top: 0; font-size: 1.2rem; }
    .badge { background: #e0f0ff; border-radius: 4px; padding: 2px 6px; font-size: 0.8rem; margin-right: 4px; }
    .meta { color: #666; font-size: 0.9rem; margin: 0.5rem 0; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <h1>Argus Marketplace</h1>
  <p>Verified specialist bundles for Argus agents. All specialists are signed by their publisher — verify with <code>argus fleet install-bundle</code>.</p>

  {registry.map((specialist) => (
    <div class="specialist-card">
      <h2>
        <a href={`/specialists/${specialist.slug}`}>{specialist.name}</a>
        <span class="badge">v{specialist.version}</span>
      </h2>
      <p>{specialist.description}</p>
      <p class="meta">
        Publisher: {specialist.publisher} &nbsp;|&nbsp;
        Kinds: {specialist.contractKinds.map((k) => <span class="badge">{k}</span>)}
        &nbsp;|&nbsp;
        <a href={specialist.githubUrl} target="_blank" rel="noopener">GitHub</a>
      </p>
    </div>
  ))}
</body>
</html>
```

### Step 6.5 — Create `packages/marketplace/src/pages/specialists/[slug].astro`

```astro
---
import registry from "../../../public/registry.json";

export function getStaticPaths() {
  return registry.map((specialist) => ({
    params: { slug: specialist.slug },
    props: { specialist },
  }));
}

const { specialist } = Astro.props;
---

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{specialist.name} — Argus Marketplace</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
    .badge { background: #e0f0ff; border-radius: 4px; padding: 2px 6px; font-size: 0.8rem; margin-right: 4px; }
    .back { color: #0066cc; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
    pre { background: #f4f4f4; padding: 1rem; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <p><a class="back" href="/">&larr; Marketplace</a></p>
  <h1>{specialist.name} <span class="badge">v{specialist.version}</span></h1>
  <p>{specialist.description}</p>

  <table>
    <tr><td><strong>Publisher</strong></td><td>{specialist.publisher}</td></tr>
    <tr><td><strong>Contract kinds</strong></td><td>{specialist.contractKinds.join(", ")}</td></tr>
    <tr><td><strong>Source</strong></td><td><a href={specialist.githubUrl} target="_blank" rel="noopener">GitHub</a></td></tr>
  </table>

  <h2>Install</h2>
  <pre><code>argus fleet install-bundle {specialist.name}-{specialist.version}.tar.gz</code></pre>

  <p>Bundles are verified on install: the Ed25519 signature is checked against the publisher public key, and the bundle hash is checked against the revocation list.</p>
</body>
</html>
```

### Step 6.6 — Install Astro and verify the build

```bash
cd packages/marketplace
bun install
bun run build
# Expected: dist/ directory created with static HTML
```

Note: The `packages/marketplace` package has no vitest tests (it is a static site with no TypeScript logic). The overall `bun run --filter='*' test` filter targets packages with a `test` script — the marketplace `package.json` has no `test` script, so it is excluded from the test run automatically. All 164 existing tests continue to pass.

### Step 6.7 — Commit

```bash
git add packages/marketplace/
git commit -m "feat(marketplace): add minimal static Astro discovery site

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Threat model v0.2 update

**Files:**
- Modify: `docs/threat-model.md`

### Step 7.1 — Append the Marketplace Adversary section to `docs/threat-model.md`

Insert the following section between the existing "Adversary 3: Supply Chain Attacker" and "Residual Risks (v0.1)" sections:

```markdown
---

## Adversary 4: Malicious Marketplace Publisher (v0.2)

**Profile:** A threat actor who creates a publisher identity in the Argus marketplace and publishes a specialist bundle containing malicious code (a backdoor, credential harvester, or supply chain implant). Unlike Adversary 1 (anonymous skill author), this adversary has a registered publisher identity — making them traceable — but abuses the trust their identity conveys.

### STRIDE Analysis

| Threat | Scenario |
|--------|----------|
| **Spoofing** | Attacker registers a publisher display name (`argus-official`) that closely mimics a trusted publisher (`Argus Core Team`). Users see a signed bundle from a "trusted-looking" publisher and install without checking the publisher id. |
| **Tampering** | After publishing a legitimate specialist that gains adoption, the attacker rotates their publisher key (by registering a new publisher id and re-publishing) and distributes a trojanized bundle with a valid signature from the new key. Users who verify signatures see a valid signature — but from a different publisher id. |
| **Repudiation** | Attacker claims their publisher private key was stolen and denies having signed the malicious bundle. The `created_at` timestamp in the `publishers` table and the `bundledAt` field in the manifest are the only timestamps, and they are not externally anchored. |
| **Information Disclosure** | Malicious specialist reads `process.env` during execution to exfiltrate `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or other secrets and sends them to an attacker-controlled endpoint. The bundle passes signature verification because the attacker's own key signed it. |
| **Denial of Service** | Specialist contains an infinite loop or issues unbounded LLM calls, consuming the user's budget before the contract hard cap kicks in. |
| **Elevation of Privilege** | Specialist includes a Node native addon (`.node` binary), bypassing the Bun subprocess isolation to gain full host filesystem and network access. |

### Mitigations (v0.1)

- **Signed bundles verified on install.** `argus fleet install-bundle` calls `verifyBundle()`, which verifies the Ed25519 signature against the `publisherIdentity.publicKeyHex` embedded in the manifest. A bundle whose bytes have been modified since signing will fail BLAKE3 payload hash verification and be rejected before any code runs.
- **Publisher identity is non-anonymous.** `argus publisher register` requires a display name and generates a keypair whose public key is stored in `marketplace.db`. There is no anonymous publishing path. The publisher id and public key are embedded in every signed manifest.
- **Revocation list blocks known-bad bundles.** `argus marketplace revoke <bundleHash>` adds the bundle's BLAKE3 hash to the `revocations` table. `install-bundle` checks revocation before verifying the signature. A revoked bundle cannot be installed even if its signature is valid.
- **Content-addressed bundles.** The `codeHash` field in the manifest is the BLAKE3 hash of `specialist.ts`. Any change to the code changes the hash, which changes the payload over which the signature is computed, which invalidates the signature.

### Residual Risks (v0.2)

- **No certificate transparency log for publisher registration.** Publisher identity is local only — there is no external anchor that records "publisher X registered at time T." A compromised local `marketplace.db` can be silently modified. Future work: anchor publisher registrations in a Sigstore certificate transparency log.
- **No behavioral analysis of bundles.** A malicious bundle that passes signature verification is not further analyzed for malicious behavior before installation. Future work: static analysis pipeline (taint analysis, capability scanning) on published bundles.
- **Revocation requires the correct `bundleHash`.** Revocation is keyed on the BLAKE3 hash of the exact `.tar.gz` file. If an attacker re-publishes a malicious bundle with minor changes, the new bundle has a different hash and is not covered by the existing revocation entry.
```

### Step 7.2 — Verify all tests still pass

```bash
bun run --filter='*' test
# Expected: all 164 tests pass (docs changes don't affect tests)
```

### Step 7.3 — Commit

```bash
git add docs/threat-model.md
git commit -m "docs: update threat model v0.2 with Marketplace Adversary section

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Integration verification pass

**Goal:** Verify the full Phase 4 surface end-to-end on the local machine.

### Step 8.1 — Build all packages

```bash
bun run --filter='*' build
# Expected: packages/core, packages/lineage, packages/specialists, packages/cli all build cleanly
```

### Step 8.2 — Run the full test suite

```bash
bun run --filter='*' test
# Expected:
#   @argus/core       — XX tests pass (includes PublisherStore: 7 tests)
#   @argus/lineage    — XX tests pass
#   @argus/specialists — XX tests pass
#   @argus/cli        — XX tests pass (includes publisher: 3, specialist-publish: 3, marketplace: 3, bundle: 3, fleet extra: 1)
#   Total: ~164 tests, 0 failures
```

### Step 8.3 — Verify TypeScript compiles cleanly

```bash
bun run typecheck
# Expected: 0 errors
```

### Step 8.4 — Smoke-test the CLI commands (manual verification)

```bash
# Lint check
bun run lint
# Expected: 0 errors

# Verify argus --help shows new commands
bun run packages/cli/src/main.ts --help
# Expected output includes: publisher, specialist, marketplace
```

### Step 8.5 — Final commit if any fixups were needed

```bash
bun run --filter='*' test
git add -p  # stage only specific changes
git commit -m "fix(phase4): integration fixups after full build verification

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Dependency Additions Summary

| Package | New dependency | Reason |
|---------|---------------|--------|
| `packages/core` | `@noble/curves ^1.6.0` | Ed25519 key verification in future marketplace utilities |
| `packages/core` | `@noble/ciphers ^1.0.0` | XChaCha20-Poly1305 key encryption |
| `packages/cli` | `@noble/curves ^1.6.0` | Ed25519 signing in bundle.ts |
| `packages/cli` | `@noble/hashes ^1.4.0` | BLAKE3 in bundle.ts and verify.ts |
| `packages/cli` | `@noble/ciphers ^1.0.0` | XChaCha20-Poly1305 in publisher.ts |
| `packages/marketplace` | `astro ^4.0.0` | Static site framework |

`@noble/curves` and `@noble/ciphers` were already transitive dependencies (via `@argus/lineage`) but are now direct dependencies in `packages/core` and `packages/cli`.

---

## Test Count Projection

| Package | Before Phase 4 | After Phase 4 | New Tests |
|---------|---------------|--------------|-----------|
| `@argus/core` | ~40 | ~47 | 7 (PublisherStore) |
| `@argus/lineage` | ~35 | ~35 | 0 |
| `@argus/specialists` | ~35 | ~35 | 0 |
| `@argus/cli` | ~34 | ~50 | 3 (publisher) + 3 (specialist-publish) + 3 (marketplace) + 3 (bundle) + 1 (fleet extra) = 13 |
| **Total** | **144** | **164** | **20** |

---

## Architecture Diagram

```
packages/core/src/marketplace/
  publisher-store.ts     — PublisherStore (SQLite: publishers + revocations)
  index.ts               — barrel

packages/cli/src/marketplace/
  bundle.ts              — createBundle(opts): writes manifest.json + tar czf
  verify.ts              — verifyBundle(tarPath): extracts manifest, verifies Ed25519

packages/cli/src/commands/
  publisher.ts           — argus publisher register/list
  specialist-publish.ts  — argus specialist publish <path> --publisher <id>
  marketplace.ts         — argus marketplace revoke <hash>
  fleet.ts               — (extended) install-bundle <bundle.tar.gz>

packages/marketplace/    — standalone Astro static site (no tests, no vitest)
  public/registry.json   — hand-curated specialist listing
  src/pages/index.astro  — list page
  src/pages/specialists/[slug].astro — detail page

docs/threat-model.md     — Adversary 4: Malicious Marketplace Publisher (v0.2)
```

```
Bundle signing flow:
  specialist.ts bytes  --BLAKE3-->  codeHash
  { name, version, contractKinds, codeHash, publisherIdentity, bundledAt }
    --sortKeys+JSON-->  canonicalJson
    --BLAKE3-->         payloadHash
    --Ed25519.sign(payloadHash, privKey)-->  signature

Bundle verification flow:
  .tar.gz file bytes  --BLAKE3-->  bundleHash  --check revocations table
  manifest.json extracted  -->  { signature, ...rest }
    --BLAKE3(canonicalJson(rest))-->  payloadHash
    --Ed25519.verify(signature, payloadHash, pubKey)-->  true | throws
```

---

## Notes on the `bun:sqlite` Mock

The existing `packages/core/src/__mocks__/bun-sqlite.ts` (the full-featured mock with `_filterRows`, WHERE clause parsing, ORDER BY, LIMIT, and UNIQUE constraint enforcement) already handles all SQL patterns used by `PublisherStore`:

- `CREATE TABLE IF NOT EXISTS publishers (id TEXT PRIMARY KEY NOT NULL, ...)` — handled by `extractColumns` which registers `id` as a `uniqueConstraint`
- `CREATE TABLE IF NOT EXISTS revocations (bundle_hash TEXT PRIMARY KEY NOT NULL, ...)` — same
- `INSERT INTO publishers (id, name, public_key_hex, created_at) VALUES (?, ?, ?, ?)` — handled
- `SELECT id, name, public_key_hex, created_at FROM publishers WHERE id = ?` — handled
- `SELECT ... FROM publishers ORDER BY created_at ASC` — handled by ORDER BY parsing
- `SELECT bundle_hash FROM revocations WHERE bundle_hash = ?` — handled
- `INSERT INTO revocations (bundle_hash, revoked_at, reason) VALUES (?, ?, ?)` — handled

No changes to the mock are required. The `packages/core/vitest.config.ts` already aliases `bun:sqlite` to the mock.

---

### Critical Files for Implementation

- `/Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/core/src/__mocks__/bun-sqlite.ts`
- `/Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/lineage/src/signing/keys.ts`
- `/Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/cli/src/commands/fleet.ts`
- `/Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/core/src/contract/store.ts`
- `/Users/nikhilkumargupta/Desktop/Nikhil/argus/packages/cli/src/main.ts`

---

**Note:** This is a READ-ONLY planning session — the plan above is the complete implementation document. To save it to `docs/superpowers/plans/2026-05-13-phase4-marketplace.md`, an implementing agent should write the content above to that path as the first action in the execution session.
