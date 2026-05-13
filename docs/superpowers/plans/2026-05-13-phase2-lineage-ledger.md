# Phase 2 — Lineage Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tamper-evident, cryptographically signed event ledger where every Argus action is recorded as a content-addressed event chained via parent_id, signed with Ed25519, stored append-only in SQLite, and independently verifiable by any third party with the public key.

**Architecture:** Events are content-addressed (id = BLAKE3 of content fields), forming a hash chain via parent_id. Each event is signed with an Ed25519 key. The private key is encrypted at rest using XChaCha20-Poly1305 with PBKDF2 key derivation. A standalone `verifyChain()` function has zero Argus dependencies — it only needs `@noble/curves` and `@noble/hashes`. The replay engine reconstructs contract state deterministically from the chain.

**Tech Stack:** TypeScript + Bun, `@noble/curves` (Ed25519), `@noble/ciphers` (XChaCha20-Poly1305), `@noble/hashes` (BLAKE3 + PBKDF2 — already installed), `bun:sqlite`, `fast-check` (already installed)

**SECURITY NOTE:** This phase is security-critical. Every file in `signing/` and `chain/` must have `kind:security` label before merge. Do NOT roll any crypto — use audited `@noble/*` primitives only.

---

## File Map

```
packages/lineage/src/
  event/
    types.ts                      CREATE — Event, SignedEvent, ActionKind, EventRecord
    hash.ts                       CREATE — eventId() BLAKE3 content-addressing
    store.ts                      CREATE — EventStore (bun:sqlite, append-only)
    index.ts                      CREATE — barrel
  signing/
    sign.ts                       CREATE — signEvent(), verifyEvent() via Ed25519
    keys.ts                       CREATE — KeyPair, generate, encrypt/decrypt, save/load
    index.ts                      CREATE — barrel
  chain/
    verify.ts                     CREATE — verifyChain() standalone (no Argus dep)
    replay.ts                     CREATE — replayChain() deterministic state reconstruction
    diff.ts                       CREATE — diffChain()
    revert.ts                     CREATE — createRevertEvent()
    index.ts                      CREATE — barrel
  index.ts                        MODIFY — main barrel replacing placeholder

  __tests__/
    event/store.test.ts           CREATE
    signing/sign.test.ts          CREATE
    signing/keys.test.ts          CREATE
    chain/verify.test.ts          CREATE
    chain/verify.property.test.ts CREATE — 1000-event chain property tests
    chain/replay.test.ts          CREATE
    chain/revert.test.ts          CREATE
    chain/fuzz.test.ts            CREATE — fuzz verifier with malformed inputs

packages/lineage/vitest.config.ts MODIFY — add bun:sqlite mock alias
packages/lineage/src/__mocks__/bun-sqlite.ts  CREATE — same as cli mock

packages/cli/src/commands/
  keys.ts                         CREATE — argus keys generate/rotate/export
  lineage.ts                      CREATE — argus lineage replay/diff/revert/verify
packages/cli/src/main.ts          MODIFY — register keys + lineage commands
packages/cli/src/__tests__/keys.test.ts      CREATE
packages/cli/src/__tests__/lineage.test.ts   CREATE

docs/lineage-spec.md              CREATE — open spec (language-agnostic)
```

---

## Task 1: Add dependencies

**Files:**
- Modify: `packages/lineage/package.json`

- [ ] **Step 1: Update package.json**

```json
{
  "name": "@argus/lineage",
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
    "@noble/curves": "^1.6.0",
    "@noble/ciphers": "^1.0.0",
    "@noble/hashes": "^1.4.0"
  },
  "devDependencies": {
    "fast-check": "^3.21.0",
    "vitest": "^2.0.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
cd /path/to/argus && bun install
```

Expected: zero errors, bun.lock updated.

- [ ] **Step 3: Add bun:sqlite mock + vitest config to lineage package**

Create `packages/lineage/src/__mocks__/bun-sqlite.ts`:

```typescript
export class Database {
  constructor(_path?: string, _opts?: unknown) {}
  run(_sql: string, ..._args: unknown[]): void {}
  prepare(_sql: string) {
    return {
      run: (..._args: unknown[]) => {},
      get: (..._args: unknown[]) => null,
      all: (..._args: unknown[]) => [],
    };
  }
  close(): void {}
}
```

Update `packages/lineage/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      'bun:sqlite': resolve(__dirname, 'src/__mocks__/bun-sqlite.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add packages/lineage/package.json packages/lineage/vitest.config.ts packages/lineage/src/__mocks__/bun-sqlite.ts bun.lock
git commit -m "chore(lineage): add @noble/curves, @noble/ciphers, fast-check deps"
```

---

## Task 2: Event types and content hash

**Files:**
- Create: `packages/lineage/src/event/types.ts`
- Create: `packages/lineage/src/event/hash.ts`

- [ ] **Step 1: Create types.ts**

Create `packages/lineage/src/event/types.ts`:

```typescript
export type ActionKind =
  | "contract_created"
  | "contract_updated"
  | "specialist_started"
  | "specialist_completed"
  | "specialist_failed"
  | "escalation_triggered"
  | "budget_exceeded"
  | "revert";

export interface Event {
  id: string;            // BLAKE3 of canonical JSON of all fields except id
  contract_id: string;
  action_kind: ActionKind;
  payload_blake3: string; // BLAKE3 of action-specific payload
  parent_id: string | null; // null only for the genesis event of a contract
  timestamp: number;     // Unix milliseconds
  sequence: number;      // monotonically increasing per contract_id, starting at 0
}

export interface SignedEvent extends Event {
  signature: string;    // hex Ed25519 sig over canonical JSON of Event (all fields inc. id)
  public_key: string;   // hex Ed25519 public key
}

export interface EventRecord {
  id: string;
  contract_id: string;
  action_kind: string;
  payload_blake3: string;
  parent_id: string | null;
  timestamp: number;
  sequence: number;
  signature: string;
  public_key: string;
  created_at: number;   // DB insertion time (wall clock ms)
}
```

- [ ] **Step 2: Write failing hash test**

Create `packages/lineage/src/__tests__/event/hash.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { eventId } from "../../event/hash.js";
import type { Event } from "../../event/types.js";

const BASE: Omit<Event, "id"> = {
  contract_id: "outbound-3-demos",
  action_kind: "contract_created",
  payload_blake3: "a".repeat(64),
  parent_id: null,
  timestamp: 1_700_000_000_000,
  sequence: 0,
};

describe("eventId", () => {
  it("returns a 64-char hex string", () => {
    expect(eventId(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(eventId(BASE)).toBe(eventId(BASE));
  });

  it("changes when any field changes", () => {
    const h1 = eventId(BASE);
    const h2 = eventId({ ...BASE, sequence: 1 });
    const h3 = eventId({ ...BASE, contract_id: "other" });
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
  });
});
```

Run: `cd packages/lineage && bunx vitest run src/__tests__/event/hash.test.ts 2>&1 | head -5`
Expected: FAIL (module not found).

- [ ] **Step 3: Create hash.ts**

Create `packages/lineage/src/event/hash.ts`:

```typescript
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import type { Event } from "./types.js";

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[k] = sortKeys((obj as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return obj;
}

export function eventId(event: Omit<Event, "id">): string {
  const canonical = JSON.stringify(sortKeys(event));
  return bytesToHex(blake3(new TextEncoder().encode(canonical)));
}

export function canonicalEventJson(event: Event): string {
  return JSON.stringify(sortKeys(event as unknown as Record<string, unknown>));
}
```

- [ ] **Step 4: Run tests — all 3 pass**

```bash
cd packages/lineage && bunx vitest run src/__tests__/event/hash.test.ts
```

Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/lineage/src/event/types.ts packages/lineage/src/event/hash.ts packages/lineage/src/__tests__/event/hash.test.ts
git commit -m "feat(lineage): Event types and BLAKE3 content-addressed event IDs"
```

---

## Task 3: EventStore (SQLite append-only)

**Files:**
- Create: `packages/lineage/src/event/store.ts`
- Create: `packages/lineage/src/__tests__/event/store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/lineage/src/__tests__/event/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventStore } from "../../event/store.js";
import { eventId } from "../../event/hash.js";
import type { SignedEvent } from "../../event/types.js";
import { rmSync } from "node:fs";

const DB = "/tmp/argus-lineage-test.db";

function makeEvent(overrides: Partial<SignedEvent> = {}): SignedEvent {
  const base = {
    contract_id: "test-contract",
    action_kind: "contract_created" as const,
    payload_blake3: "a".repeat(64),
    parent_id: null,
    timestamp: Date.now(),
    sequence: 0,
  };
  const id = eventId(base);
  return {
    ...base,
    id,
    signature: "s".repeat(128),
    public_key: "p".repeat(64),
    ...overrides,
  };
}

describe("EventStore", () => {
  let store: EventStore;

  beforeEach(() => { store = new EventStore(DB); });
  afterEach(() => {
    store.close();
    for (const s of [DB, `${DB}-wal`, `${DB}-shm`]) {
      try { rmSync(s); } catch {}
    }
  });

  it("saves and loads a signed event by id", () => {
    const ev = makeEvent();
    store.append(ev);
    const loaded = store.getById(ev.id);
    expect(loaded?.contract_id).toBe("test-contract");
    expect(loaded?.id).toBe(ev.id);
  });

  it("returns null for unknown event", () => {
    expect(store.getById("nonexistent")).toBeNull();
  });

  it("throws on duplicate id (append-only)", () => {
    const ev = makeEvent();
    store.append(ev);
    expect(() => store.append(ev)).toThrow();
  });

  it("getChain returns events sorted by sequence", () => {
    const ev0 = makeEvent({ sequence: 0 });
    const ev1 = makeEvent({
      sequence: 1,
      parent_id: ev0.id,
      action_kind: "specialist_started",
      payload_blake3: "b".repeat(64),
    });
    ev1.id = eventId({ ...ev1, id: undefined as unknown as string });
    store.append(ev0);
    store.append(ev1);
    const chain = store.getChain("test-contract");
    expect(chain).toHaveLength(2);
    expect(chain[0]!.sequence).toBe(0);
    expect(chain[1]!.sequence).toBe(1);
  });

  it("getLatest returns the highest-sequence event for a contract", () => {
    const ev0 = makeEvent({ sequence: 0 });
    const ev1 = makeEvent({ sequence: 1, parent_id: ev0.id, action_kind: "specialist_started", payload_blake3: "b".repeat(64) });
    ev1.id = eventId({ contract_id: ev1.contract_id, action_kind: ev1.action_kind, payload_blake3: ev1.payload_blake3, parent_id: ev1.parent_id, timestamp: ev1.timestamp, sequence: ev1.sequence });
    store.append(ev0);
    store.append(ev1);
    expect(store.getLatest("test-contract")?.sequence).toBe(1);
  });
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
cd packages/lineage && bunx vitest run src/__tests__/event/store.test.ts 2>&1 | head -5
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create store.ts**

Create `packages/lineage/src/event/store.ts`:

```typescript
import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
import type { SignedEvent } from "./types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  contract_id TEXT NOT NULL,
  action_kind TEXT NOT NULL,
  payload_blake3 TEXT NOT NULL,
  parent_id TEXT,
  timestamp INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  signature TEXT NOT NULL,
  public_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(contract_id, sequence)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_events_contract ON events(contract_id, sequence);
`;

export class EventStore {
  private db: Database;

  constructor(path: string = ":memory:") {
    const resolvedPath = path === ":memory:" ? path : resolve(path);
    if (resolvedPath !== ":memory:") {
      try { rmSync(`${resolvedPath}-wal`); } catch {}
      try { rmSync(`${resolvedPath}-shm`); } catch {}
    }
    this.db = new Database(resolvedPath, { create: true });
    this.db.run("PRAGMA journal_mode=WAL;");
    this.db.run(SCHEMA);
  }

  append(event: SignedEvent): void {
    this.db.prepare(`
      INSERT INTO events
        (id, contract_id, action_kind, payload_blake3, parent_id, timestamp, sequence, signature, public_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id, event.contract_id, event.action_kind, event.payload_blake3,
      event.parent_id, event.timestamp, event.sequence,
      event.signature, event.public_key, Date.now(),
    );
  }

  getById(id: string): SignedEvent | null {
    const row = this.db.prepare(
      "SELECT id,contract_id,action_kind,payload_blake3,parent_id,timestamp,sequence,signature,public_key FROM events WHERE id=?"
    ).get(id) as SignedEvent | null;
    return row ?? null;
  }

  getChain(contractId: string): SignedEvent[] {
    return this.db.prepare(
      "SELECT id,contract_id,action_kind,payload_blake3,parent_id,timestamp,sequence,signature,public_key FROM events WHERE contract_id=? ORDER BY sequence ASC, rowid ASC"
    ).all(contractId) as SignedEvent[];
  }

  getLatest(contractId: string): SignedEvent | null {
    const row = this.db.prepare(
      "SELECT id,contract_id,action_kind,payload_blake3,parent_id,timestamp,sequence,signature,public_key FROM events WHERE contract_id=? ORDER BY sequence DESC, rowid DESC LIMIT 1"
    ).get(contractId) as SignedEvent | null;
    return row ?? null;
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run — all 5 pass**

```bash
cd packages/lineage && bunx vitest run src/__tests__/event/store.test.ts
```

Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/lineage/src/event/store.ts packages/lineage/src/__tests__/event/store.test.ts
git commit -m "feat(lineage): append-only EventStore with bun:sqlite"
```

---

## Task 4: Ed25519 signing and verification

**Files:**
- Create: `packages/lineage/src/signing/sign.ts`
- Create: `packages/lineage/src/__tests__/signing/sign.test.ts`

- [ ] **Step 1: Write failing sign tests**

Create `packages/lineage/src/__tests__/signing/sign.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { signEvent, verifyEvent } from "../../signing/sign.js";
import { eventId } from "../../event/hash.js";
import { ed25519 } from "@noble/curves/ed25519";

function makePrivKey(): Uint8Array {
  return ed25519.utils.randomPrivateKey();
}

function makeBaseEvent() {
  const base = {
    contract_id: "sign-test",
    action_kind: "contract_created" as const,
    payload_blake3: "a".repeat(64),
    parent_id: null,
    timestamp: 1_700_000_000_000,
    sequence: 0,
  };
  return { ...base, id: eventId(base) };
}

describe("signEvent", () => {
  it("returns a SignedEvent with 128-char hex signature", () => {
    const key = makePrivKey();
    const event = makeBaseEvent();
    const signed = signEvent(event, key);
    expect(signed.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(signed.public_key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("includes all original event fields", () => {
    const key = makePrivKey();
    const event = makeBaseEvent();
    const signed = signEvent(event, key);
    expect(signed.id).toBe(event.id);
    expect(signed.contract_id).toBe(event.contract_id);
    expect(signed.sequence).toBe(0);
  });
});

describe("verifyEvent", () => {
  it("returns true for a correctly signed event", () => {
    const key = makePrivKey();
    const event = makeBaseEvent();
    const signed = signEvent(event, key);
    expect(verifyEvent(signed)).toBe(true);
  });

  it("returns false when signature is tampered", () => {
    const key = makePrivKey();
    const event = makeBaseEvent();
    const signed = signEvent(event, key);
    const tampered = { ...signed, signature: "f".repeat(128) };
    expect(verifyEvent(tampered)).toBe(false);
  });

  it("returns false when event content is tampered", () => {
    const key = makePrivKey();
    const event = makeBaseEvent();
    const signed = signEvent(event, key);
    const tampered = { ...signed, contract_id: "tampered-id" };
    expect(verifyEvent(tampered)).toBe(false);
  });

  it("returns false when public_key is wrong", () => {
    const key1 = makePrivKey();
    const key2 = makePrivKey();
    const event = makeBaseEvent();
    const signed = signEvent(event, key1);
    const wrongKey = { ...signed, public_key: Array.from(ed25519.getPublicKey(key2)).map(b => b.toString(16).padStart(2, "0")).join("") };
    expect(verifyEvent(wrongKey)).toBe(false);
  });
});
```

- [ ] **Step 2: Confirm fail**

```bash
cd packages/lineage && bunx vitest run src/__tests__/signing/sign.test.ts 2>&1 | head -5
```

- [ ] **Step 3: Create sign.ts**

Create `packages/lineage/src/signing/sign.ts`:

```typescript
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { canonicalEventJson } from "../event/hash.js";
import type { Event, SignedEvent } from "../event/types.js";

export function signEvent(event: Event, privateKey: Uint8Array): SignedEvent {
  const canonical = canonicalEventJson(event);
  const bytes = new TextEncoder().encode(canonical);
  const sig = ed25519.sign(bytes, privateKey);
  const pubKey = ed25519.getPublicKey(privateKey);
  return {
    ...event,
    signature: bytesToHex(sig),
    public_key: bytesToHex(pubKey),
  };
}

export function verifyEvent(event: SignedEvent): boolean {
  const { signature, public_key, ...base } = event;
  const canonical = canonicalEventJson(base as Event);
  const bytes = new TextEncoder().encode(canonical);
  try {
    return ed25519.verify(hexToBytes(signature), bytes, hexToBytes(public_key));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run — all 6 pass**

```bash
cd packages/lineage && bunx vitest run src/__tests__/signing/sign.test.ts
```

Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/lineage/src/signing/sign.ts packages/lineage/src/__tests__/signing/sign.test.ts
git commit -m "feat(lineage): Ed25519 signing and verification via @noble/curves"
```

---

## Task 5: Key management (generate, encrypt at rest, save/load)

**Files:**
- Create: `packages/lineage/src/signing/keys.ts`
- Create: `packages/lineage/src/__tests__/signing/keys.test.ts`

- [ ] **Step 1: Write failing key tests**

Create `packages/lineage/src/__tests__/signing/keys.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  encryptKeyPair,
  decryptKeyPair,
  keyPairToHex,
} from "../../signing/keys.js";
import { ed25519 } from "@noble/curves/ed25519";

describe("generateKeyPair", () => {
  it("returns 32-byte private and public keys", () => {
    const kp = generateKeyPair();
    expect(kp.privateKey).toHaveLength(32);
    expect(kp.publicKey).toHaveLength(32);
  });

  it("generates different keys each call", () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(a.privateKey).not.toEqual(b.privateKey);
  });

  it("publicKey is derived from privateKey", () => {
    const kp = generateKeyPair();
    expect(kp.publicKey).toEqual(ed25519.getPublicKey(kp.privateKey));
  });
});

describe("encryptKeyPair / decryptKeyPair", () => {
  it("round-trip with correct passphrase", () => {
    const kp = generateKeyPair();
    const encrypted = encryptKeyPair(kp, "my-passphrase");
    const recovered = decryptKeyPair(encrypted, "my-passphrase");
    expect(recovered.privateKey).toEqual(kp.privateKey);
    expect(recovered.publicKey).toEqual(kp.publicKey);
  });

  it("encrypted blob is 108 bytes", () => {
    const kp = generateKeyPair();
    const encrypted = encryptKeyPair(kp, "test");
    expect(encrypted).toHaveLength(108);
  });

  it("throws with wrong passphrase", () => {
    const kp = generateKeyPair();
    const encrypted = encryptKeyPair(kp, "correct");
    expect(() => decryptKeyPair(encrypted, "wrong")).toThrow();
  });

  it("two encryptions of same key produce different blobs (random nonce)", () => {
    const kp = generateKeyPair();
    const a = encryptKeyPair(kp, "same");
    const b = encryptKeyPair(kp, "same");
    expect(a).not.toEqual(b);
  });
});

describe("keyPairToHex", () => {
  it("returns hex strings of expected length", () => {
    const kp = generateKeyPair();
    const hex = keyPairToHex(kp);
    expect(hex.publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(hex.privateKey).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Confirm fail**

```bash
cd packages/lineage && bunx vitest run src/__tests__/signing/keys.test.ts 2>&1 | head -5
```

- [ ] **Step 3: Create keys.ts**

Create `packages/lineage/src/signing/keys.ts`:

```typescript
import { ed25519 } from "@noble/curves/ed25519";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "@noble/ciphers/webcrypto";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

export interface KeyPair {
  privateKey: Uint8Array; // 32 bytes
  publicKey: Uint8Array;  // 32 bytes
}

export interface KeyPairHex {
  privateKey: string; // 64-char hex
  publicKey: string;  // 64-char hex
}

// Key file format: version(4) + pbkdf2_salt(32) + xchacha_nonce(24) + encrypted_privkey(48) = 108 bytes
const VERSION = 1;
const PBKDF2_ITERS = 100_000;

export function generateKeyPair(): KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function encryptKeyPair(kp: KeyPair, passphrase: string): Uint8Array {
  const salt = randomBytes(32);
  const nonce = randomBytes(24);
  const dk = pbkdf2(sha256, passphrase, salt, { c: PBKDF2_ITERS, dkLen: 32 });
  const cipher = xchacha20poly1305(dk, nonce);
  const encrypted = cipher.encrypt(kp.privateKey); // 32 + 16 AEAD tag = 48 bytes
  const out = new Uint8Array(4 + 32 + 24 + encrypted.length);
  new DataView(out.buffer).setUint32(0, VERSION, true);
  out.set(salt, 4);
  out.set(nonce, 36);
  out.set(encrypted, 60);
  return out;
}

export function decryptKeyPair(data: Uint8Array, passphrase: string): KeyPair {
  if (data.length < 108) throw new Error("invalid key file: too short");
  const version = new DataView(data.buffer, data.byteOffset).getUint32(0, true);
  if (version !== VERSION) throw new Error(`unsupported key version: ${version}`);
  const salt = data.slice(4, 36);
  const nonce = data.slice(36, 60);
  const ciphertext = data.slice(60);
  const dk = pbkdf2(sha256, passphrase, salt, { c: PBKDF2_ITERS, dkLen: 32 });
  const cipher = xchacha20poly1305(dk, nonce);
  const privateKey = cipher.decrypt(ciphertext);
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function keyPairToHex(kp: KeyPair): KeyPairHex {
  return {
    privateKey: bytesToHex(kp.privateKey),
    publicKey: bytesToHex(kp.publicKey),
  };
}
```

- [ ] **Step 4: Run — all 8 pass**

```bash
cd packages/lineage && bunx vitest run src/__tests__/signing/keys.test.ts
```

Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/lineage/src/signing/keys.ts packages/lineage/src/__tests__/signing/keys.test.ts
git commit -m "feat(lineage): key generation + XChaCha20-Poly1305 encrypted key storage"
```

---

## Task 6: Chain integrity verification + property tests

**Files:**
- Create: `packages/lineage/src/chain/verify.ts`
- Create: `packages/lineage/src/__tests__/chain/verify.test.ts`
- Create: `packages/lineage/src/__tests__/chain/verify.property.test.ts`

- [ ] **Step 1: Write verify tests**

Create `packages/lineage/src/__tests__/chain/verify.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { verifyChain } from "../../chain/verify.js";
import { signEvent } from "../../signing/sign.js";
import { eventId } from "../../event/hash.js";
import { ed25519 } from "@noble/curves/ed25519";
import type { SignedEvent } from "../../event/types.js";

function makeChain(n: number): { events: SignedEvent[]; privateKey: Uint8Array } {
  const privateKey = ed25519.utils.randomPrivateKey();
  const events: SignedEvent[] = [];
  for (let i = 0; i < n; i++) {
    const base = {
      contract_id: "chain-test",
      action_kind: "specialist_started" as const,
      payload_blake3: "a".repeat(64),
      parent_id: i === 0 ? null : events[i - 1]!.id,
      timestamp: 1_700_000_000_000 + i * 1000,
      sequence: i,
    };
    const id = eventId(base);
    const signed = signEvent({ ...base, id }, privateKey);
    events.push(signed);
  }
  return { events, privateKey };
}

describe("verifyChain", () => {
  it("validates a clean 5-event chain", () => {
    const { events } = makeChain(5);
    const result = verifyChain(events);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.eventCount).toBe(5);
  });

  it("returns valid:true for empty chain", () => {
    expect(verifyChain([])).toMatchObject({ valid: true, eventCount: 0 });
  });

  it("detects tampered event content (id mismatch)", () => {
    const { events } = makeChain(3);
    const tampered = [...events];
    tampered[1] = { ...tampered[1]!, contract_id: "TAMPERED" };
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("ID mismatch") || e.includes("Chain break"))).toBe(true);
  });

  it("detects tampered signature", () => {
    const { events } = makeChain(3);
    const tampered = [...events];
    tampered[1] = { ...tampered[1]!, signature: "f".repeat(128) };
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("signature") || e.includes("Invalid"))).toBe(true);
  });

  it("detects broken parent_id chain", () => {
    const { events } = makeChain(3);
    const tampered = [...events];
    tampered[2] = { ...tampered[2]!, parent_id: "wrong-parent-id" };
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("Chain break") || e.includes("ID mismatch"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
cd packages/lineage && bunx vitest run src/__tests__/chain/verify.test.ts 2>&1 | head -5
```

- [ ] **Step 3: Create verify.ts (standalone — no Argus dependency, only @noble imports)**

Create `packages/lineage/src/chain/verify.ts`:

```typescript
import { ed25519 } from "@noble/curves/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { SignedEvent, Event } from "../event/types.js";

// NOTE: This file must remain independently verifiable.
// It only imports from @noble/* — no other Argus modules beyond type imports.

export interface VerificationResult {
  valid: boolean;
  eventCount: number;
  errors: string[];
}

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[k] = sortKeys((obj as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return obj;
}

function computeEventId(event: Omit<Event, "id">): string {
  return bytesToHex(blake3(new TextEncoder().encode(JSON.stringify(sortKeys(event)))));
}

function verifySignature(event: SignedEvent): boolean {
  const { signature, public_key, ...base } = event;
  const canonical = JSON.stringify(sortKeys(base as unknown as Record<string, unknown>));
  try {
    return ed25519.verify(hexToBytes(signature), new TextEncoder().encode(canonical), hexToBytes(public_key));
  } catch {
    return false;
  }
}

export function verifyChain(events: SignedEvent[]): VerificationResult {
  if (events.length === 0) return { valid: true, eventCount: 0, errors: [] };
  const errors: string[] = [];
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);

  if (sorted[0]!.parent_id !== null) {
    errors.push(`Genesis event (seq 0) has non-null parent_id: ${sorted[0]!.parent_id}`);
  }

  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i]!;

    // Verify id matches content
    const { id, signature, public_key, ...rest } = ev;
    const computedId = computeEventId(rest as Omit<Event, "id">);
    if (id !== computedId) {
      errors.push(`ID mismatch at seq ${ev.sequence}: stored=${id.slice(0, 8)}… computed=${computedId.slice(0, 8)}…`);
    }

    // Verify signature
    if (!verifySignature(ev)) {
      errors.push(`Invalid signature at seq ${ev.sequence} (event ${id.slice(0, 8)}…)`);
    }

    // Verify parent linkage
    if (i > 0) {
      const prev = sorted[i - 1]!;
      if (ev.parent_id !== prev.id) {
        errors.push(`Chain break at seq ${ev.sequence}: expected parent=${prev.id.slice(0, 8)}…, got=${(ev.parent_id ?? "null").slice(0, 8)}…`);
      }
    }
  }

  return { valid: errors.length === 0, eventCount: sorted.length, errors };
}
```

- [ ] **Step 4: Run verify tests — 5/5 pass**

```bash
cd packages/lineage && bunx vitest run src/__tests__/chain/verify.test.ts
```

- [ ] **Step 5: Write property tests (1000-event chains)**

Create `packages/lineage/src/__tests__/chain/verify.property.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { verifyChain } from "../../chain/verify.js";
import { signEvent } from "../../signing/sign.js";
import { eventId } from "../../event/hash.js";
import { ed25519 } from "@noble/curves/ed25519";
import type { SignedEvent } from "../../event/types.js";

function buildChain(n: number, privateKey: Uint8Array): SignedEvent[] {
  const events: SignedEvent[] = [];
  for (let i = 0; i < n; i++) {
    const base = {
      contract_id: "prop-test",
      action_kind: "specialist_started" as const,
      payload_blake3: "a".repeat(64),
      parent_id: i === 0 ? null : events[i - 1]!.id,
      timestamp: 1_700_000_000_000 + i * 1000,
      sequence: i,
    };
    events.push(signEvent({ ...base, id: eventId(base) }, privateKey));
  }
  return events;
}

describe("verifyChain — property tests", () => {
  it("any valid chain of 1–100 events always passes verification", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (n) => {
          const key = ed25519.utils.randomPrivateKey();
          const chain = buildChain(n, key);
          return verifyChain(chain).valid === true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it("mutating any event content always breaks the chain", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        fc.integer({ min: 0, max: 19 }),
        (n, mutateIdx) => {
          if (mutateIdx >= n) return true;
          const key = ed25519.utils.randomPrivateKey();
          const chain = buildChain(n, key);
          const tampered = [...chain];
          tampered[mutateIdx] = { ...tampered[mutateIdx]!, contract_id: "TAMPERED-" + mutateIdx };
          return verifyChain(tampered).valid === false;
        },
      ),
      { numRuns: 200 },
    );
  });

  it("1000-event chain verifies correctly", () => {
    const key = ed25519.utils.randomPrivateKey();
    const chain = buildChain(1000, key);
    const result = verifyChain(chain);
    expect(result.valid).toBe(true);
    expect(result.eventCount).toBe(1000);
  }, 30_000); // 30s timeout for 1000-event chain

  it("shuffling events does not affect validity (verifyChain sorts by sequence)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 30 }),
        (n) => {
          const key = ed25519.utils.randomPrivateKey();
          const chain = buildChain(n, key);
          const shuffled = [...chain].sort(() => Math.random() - 0.5);
          return verifyChain(shuffled).valid === true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
```

- [ ] **Step 6: Run property tests**

```bash
cd packages/lineage && bunx vitest run src/__tests__/chain/verify.property.test.ts --reporter=verbose
```

Expected: All 4 property tests PASS (the 1000-event test may take ~5–10s).

- [ ] **Step 7: Commit**

```bash
git add packages/lineage/src/chain/verify.ts packages/lineage/src/__tests__/chain/verify.test.ts packages/lineage/src/__tests__/chain/verify.property.test.ts
git commit -m "feat(lineage): standalone chain verifier + 200-run property tests, 1000-event chain"
```

---

## Task 7: Replay engine, lineage diff, and revert

**Files:**
- Create: `packages/lineage/src/chain/replay.ts`
- Create: `packages/lineage/src/chain/diff.ts`
- Create: `packages/lineage/src/chain/revert.ts`
- Create: `packages/lineage/src/__tests__/chain/replay.test.ts`
- Create: `packages/lineage/src/__tests__/chain/revert.test.ts`

- [ ] **Step 1: Create replay.ts**

Create `packages/lineage/src/chain/replay.ts`:

```typescript
import type { SignedEvent, ActionKind } from "../event/types.js";

export interface ReplayState {
  contractId: string;
  eventCount: number;
  lastEventId: string;
  lastSequence: number;
  appliedActions: ActionKind[];
  hasRevert: boolean;
}

export function replayChain(events: SignedEvent[]): ReplayState {
  if (events.length === 0) throw new Error("cannot replay empty event chain");
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const last = sorted[sorted.length - 1]!;
  return {
    contractId: last.contract_id,
    eventCount: sorted.length,
    lastEventId: last.id,
    lastSequence: last.sequence,
    appliedActions: sorted.map((e) => e.action_kind),
    hasRevert: sorted.some((e) => e.action_kind === "revert"),
  };
}
```

- [ ] **Step 2: Create diff.ts**

Create `packages/lineage/src/chain/diff.ts`:

```typescript
import type { SignedEvent } from "../event/types.js";
import type { ReplayState } from "./replay.js";
import { replayChain } from "./replay.js";

export interface ChainDiff {
  addedEvents: SignedEvent[];
  contractId: string;
  fromSequence: number;
  toSequence: number;
}

export function diffChain(before: SignedEvent[], after: SignedEvent[]): ChainDiff {
  const beforeIds = new Set(before.map((e) => e.id));
  const added = after.filter((e) => !beforeIds.has(e.id));
  const sorted = [...after].sort((a, b) => a.sequence - b.sequence);
  const fromState: ReplayState | null = before.length > 0 ? replayChain(before) : null;
  const toState: ReplayState = replayChain(after.length > 0 ? after : sorted);
  return {
    addedEvents: added.sort((a, b) => a.sequence - b.sequence),
    contractId: toState.contractId,
    fromSequence: fromState?.lastSequence ?? -1,
    toSequence: toState.lastSequence,
  };
}
```

- [ ] **Step 3: Create revert.ts**

Create `packages/lineage/src/chain/revert.ts`:

```typescript
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import { eventId } from "../event/hash.js";
import { signEvent } from "../signing/sign.js";
import type { SignedEvent } from "../event/types.js";

export function createRevertEvent(
  targetEvent: SignedEvent,
  latestEvent: SignedEvent,
  privateKey: Uint8Array,
): SignedEvent {
  const payload = JSON.stringify({ reverts: targetEvent.id });
  const payloadBytes = new TextEncoder().encode(payload);
  const payloadBlake3 = bytesToHex(blake3(payloadBytes));

  const base = {
    contract_id: targetEvent.contract_id,
    action_kind: "revert" as const,
    payload_blake3: payloadBlake3,
    parent_id: latestEvent.id,
    timestamp: Date.now(),
    sequence: latestEvent.sequence + 1,
  };

  const id = eventId(base);
  return signEvent({ ...base, id }, privateKey);
}
```

- [ ] **Step 4: Write tests**

Create `packages/lineage/src/__tests__/chain/replay.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { replayChain } from "../../chain/replay.js";
import { diffChain } from "../../chain/diff.js";
import { signEvent } from "../../signing/sign.js";
import { eventId } from "../../event/hash.js";
import { createRevertEvent } from "../../chain/revert.js";
import { verifyChain } from "../../chain/verify.js";
import { ed25519 } from "@noble/curves/ed25519";
import type { SignedEvent } from "../../event/types.js";

function makeChain(n: number, key: Uint8Array): SignedEvent[] {
  const events: SignedEvent[] = [];
  for (let i = 0; i < n; i++) {
    const base = {
      contract_id: "replay-test",
      action_kind: "specialist_started" as const,
      payload_blake3: "a".repeat(64),
      parent_id: i === 0 ? null : events[i - 1]!.id,
      timestamp: 1_700_000_000_000 + i * 1000,
      sequence: i,
    };
    events.push(signEvent({ ...base, id: eventId(base) }, key));
  }
  return events;
}

describe("replayChain", () => {
  it("throws on empty chain", () => {
    expect(() => replayChain([])).toThrow();
  });

  it("returns correct state for a 3-event chain", () => {
    const key = ed25519.utils.randomPrivateKey();
    const chain = makeChain(3, key);
    const state = replayChain(chain);
    expect(state.eventCount).toBe(3);
    expect(state.lastSequence).toBe(2);
    expect(state.hasRevert).toBe(false);
    expect(state.appliedActions).toHaveLength(3);
  });

  it("is deterministic regardless of input order", () => {
    const key = ed25519.utils.randomPrivateKey();
    const chain = makeChain(5, key);
    const shuffled = [...chain].sort(() => Math.random() - 0.5);
    const s1 = replayChain(chain);
    const s2 = replayChain(shuffled);
    expect(s1.lastEventId).toBe(s2.lastEventId);
    expect(s1.lastSequence).toBe(s2.lastSequence);
  });
});

describe("diffChain", () => {
  it("shows added events between versions", () => {
    const key = ed25519.utils.randomPrivateKey();
    const v1 = makeChain(3, key);
    const v2 = makeChain(5, key);
    const diff = diffChain(v1, v2);
    expect(diff.addedEvents).toHaveLength(2);
    expect(diff.fromSequence).toBe(2);
    expect(diff.toSequence).toBe(4);
  });
});

describe("createRevertEvent", () => {
  it("creates a valid signed revert event extending the chain", () => {
    const key = ed25519.utils.randomPrivateKey();
    const chain = makeChain(3, key);
    const target = chain[1]!;
    const latest = chain[2]!;
    const revert = createRevertEvent(target, latest, key);
    expect(revert.action_kind).toBe("revert");
    expect(revert.parent_id).toBe(latest.id);
    expect(revert.sequence).toBe(latest.sequence + 1);
  });

  it("revert event is itself verifiable (signature is valid)", () => {
    const key = ed25519.utils.randomPrivateKey();
    const chain = makeChain(3, key);
    const revert = createRevertEvent(chain[1]!, chain[2]!, key);
    const fullChain = [...chain, revert];
    expect(verifyChain(fullChain).valid).toBe(true);
  });

  it("reverts are replayable — replay shows hasRevert=true", () => {
    const key = ed25519.utils.randomPrivateKey();
    const chain = makeChain(3, key);
    const revert = createRevertEvent(chain[1]!, chain[2]!, key);
    const state = replayChain([...chain, revert]);
    expect(state.hasRevert).toBe(true);
    expect(state.eventCount).toBe(4);
  });
});
```

- [ ] **Step 5: Run — all tests pass**

```bash
cd packages/lineage && bunx vitest run src/__tests__/chain/replay.test.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/lineage/src/chain/replay.ts packages/lineage/src/chain/diff.ts packages/lineage/src/chain/revert.ts packages/lineage/src/__tests__/chain/replay.test.ts
git commit -m "feat(lineage): replay engine, chain diff, and revert (counter-events — never delete)"
```

---

## Task 8: Fuzz tests and barrel exports

**Files:**
- Create: `packages/lineage/src/__tests__/chain/fuzz.test.ts`
- Create: `packages/lineage/src/event/index.ts`
- Create: `packages/lineage/src/signing/index.ts`
- Create: `packages/lineage/src/chain/index.ts`
- Modify: `packages/lineage/src/index.ts`

- [ ] **Step 1: Create fuzz tests**

Create `packages/lineage/src/__tests__/chain/fuzz.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { verifyChain } from "../../chain/verify.js";
import type { SignedEvent } from "../../event/types.js";

function randomHex(len: number): string {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

describe("verifyChain — fuzz malformed inputs", () => {
  it("never throws on arbitrarily malformed event arrays", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 0, maxLength: 128 }),
            contract_id: fc.string({ minLength: 0, maxLength: 64 }),
            action_kind: fc.constantFrom("contract_created", "revert", "specialist_started"),
            payload_blake3: fc.string({ minLength: 0, maxLength: 128 }),
            parent_id: fc.option(fc.string({ minLength: 0, maxLength: 128 }), { nil: null }),
            timestamp: fc.integer(),
            sequence: fc.integer({ min: -10, max: 1000 }),
            signature: fc.string({ minLength: 0, maxLength: 256 }),
            public_key: fc.string({ minLength: 0, maxLength: 128 }),
          }),
          { maxLength: 20 },
        ),
        (events) => {
          try {
            const result = verifyChain(events as SignedEvent[]);
            // Should always return a structured result, never throw
            return typeof result.valid === "boolean" && Array.isArray(result.errors);
          } catch {
            return false;
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it("all-zeros event is invalid but does not throw", () => {
    const garbage: SignedEvent = {
      id: "0".repeat(64),
      contract_id: "x",
      action_kind: "contract_created",
      payload_blake3: "0".repeat(64),
      parent_id: null,
      timestamp: 0,
      sequence: 0,
      signature: "0".repeat(128),
      public_key: "0".repeat(64),
    };
    const result = verifyChain([garbage]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("truncated signature is detected as invalid", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 127 }),
        (shortSig) => {
          const event: SignedEvent = {
            id: randomHex(64),
            contract_id: "fuzz-test",
            action_kind: "contract_created",
            payload_blake3: randomHex(64),
            parent_id: null,
            timestamp: Date.now(),
            sequence: 0,
            signature: shortSig,
            public_key: randomHex(64),
          };
          const result = verifyChain([event]);
          return result.valid === false;
        },
      ),
      { numRuns: 200 },
    );
  });
});
```

- [ ] **Step 2: Run fuzz tests**

```bash
cd packages/lineage && bunx vitest run src/__tests__/chain/fuzz.test.ts
```

Expected: All 3 fuzz tests PASS.

- [ ] **Step 3: Create barrel exports**

Create `packages/lineage/src/event/index.ts`:

```typescript
export { eventId, canonicalEventJson } from "./hash.js";
export { EventStore } from "./store.js";
export type { Event, SignedEvent, ActionKind, EventRecord } from "./types.js";
```

Create `packages/lineage/src/signing/index.ts`:

```typescript
export { signEvent, verifyEvent } from "./sign.js";
export { generateKeyPair, encryptKeyPair, decryptKeyPair, keyPairToHex } from "./keys.js";
export type { KeyPair, KeyPairHex } from "./keys.js";
```

Create `packages/lineage/src/chain/index.ts`:

```typescript
export { verifyChain } from "./verify.js";
export type { VerificationResult } from "./verify.js";
export { replayChain } from "./replay.js";
export type { ReplayState } from "./replay.js";
export { diffChain } from "./diff.js";
export type { ChainDiff } from "./diff.js";
export { createRevertEvent } from "./revert.js";
```

Replace `packages/lineage/src/index.ts` completely:

```typescript
export * from "./event/index.js";
export * from "./signing/index.js";
export * from "./chain/index.js";
```

- [ ] **Step 4: Run full lineage suite**

```bash
cd packages/lineage && bunx vitest run
```

Expected: All tests PASS (target: 30+ tests).

- [ ] **Step 5: Commit**

```bash
git add packages/lineage/src/__tests__/chain/fuzz.test.ts packages/lineage/src/event/index.ts packages/lineage/src/signing/index.ts packages/lineage/src/chain/index.ts packages/lineage/src/index.ts
git commit -m "test(lineage): 500-run fuzz tests against chain verifier; barrel exports"
```

---

## Task 9: argus keys CLI commands

**Files:**
- Create: `packages/cli/src/commands/keys.ts`
- Create: `packages/cli/src/__tests__/keys.test.ts`
- Modify: `packages/cli/src/main.ts`

- [ ] **Step 1: Write failing test**

Create `packages/cli/src/__tests__/keys.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { keysCommand } from "../commands/keys.js";

describe("keysCommand", () => {
  it("is named 'keys'", () => {
    expect(keysCommand.name()).toBe("keys");
  });

  it("has generate, rotate, export subcommands", () => {
    const names = keysCommand.commands.map((c) => c.name());
    expect(names).toContain("generate");
    expect(names).toContain("rotate");
    expect(names).toContain("export");
  });
});
```

- [ ] **Step 2: Confirm fail**

```bash
cd packages/cli && bunx vitest run src/__tests__/keys.test.ts 2>&1 | head -5
```

- [ ] **Step 3: Create keys.ts**

Create `packages/cli/src/commands/keys.ts`:

```typescript
import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import { generateKeyPair, encryptKeyPair, decryptKeyPair, keyPairToHex } from "@argus/lineage";

const KEYS_DIR = process.env["ARGUS_KEYS_DIR"] ?? `${process.env["HOME"]}/.argus/keys`;

function keyPath(tenant: string): string {
  return resolve(KEYS_DIR, `${tenant}.key`);
}

function pubPath(tenant: string): string {
  return resolve(KEYS_DIR, `${tenant}.pub`);
}

function ensureKeysDir(): void {
  if (!existsSync(KEYS_DIR)) mkdirSync(KEYS_DIR, { recursive: true });
}

export const keysCommand = new Command("keys").description("Manage signing keys");

keysCommand
  .command("generate [tenant]")
  .description("Generate a new Ed25519 signing key pair")
  .option("--passphrase <pass>", "Encryption passphrase (use env ARGUS_PASSPHRASE in production)")
  .action((tenant: string = "default", opts: { passphrase?: string }) => {
    const passphrase = opts.passphrase ?? process.env["ARGUS_PASSPHRASE"];
    if (!passphrase) {
      console.error(pc.red("Error: --passphrase required (or set ARGUS_PASSPHRASE env var)"));
      process.exit(1);
    }
    if (existsSync(keyPath(tenant))) {
      console.error(pc.red(`Key for '${tenant}' already exists. Use 'rotate' to replace it.`));
      process.exit(1);
    }
    ensureKeysDir();
    const kp = generateKeyPair();
    const encrypted = encryptKeyPair(kp, passphrase);
    const hex = keyPairToHex(kp);
    writeFileSync(keyPath(tenant), encrypted);
    writeFileSync(pubPath(tenant), hex.publicKey + "\n", "utf-8");
    console.log(pc.green(`✓ Key pair generated for tenant '${tenant}'`));
    console.log(`  public key:  ${hex.publicKey}`);
    console.log(`  private key: ${keyPath(tenant)} (encrypted)`);
    console.log(pc.yellow("  Store your passphrase safely — there is no recovery path."));
  });

keysCommand
  .command("rotate [tenant]")
  .description("Generate a new key pair, archiving the old one")
  .option("--passphrase <pass>", "Passphrase for new key")
  .action((tenant: string = "default", opts: { passphrase?: string }) => {
    const passphrase = opts.passphrase ?? process.env["ARGUS_PASSPHRASE"];
    if (!passphrase) {
      console.error(pc.red("Error: --passphrase required"));
      process.exit(1);
    }
    ensureKeysDir();
    const existing = keyPath(tenant);
    if (existsSync(existing)) {
      const archivePath = `${existing}.${Date.now()}.bak`;
      const data = readFileSync(existing);
      writeFileSync(archivePath, data);
      console.log(pc.yellow(`  Archived old key → ${archivePath}`));
    }
    const kp = generateKeyPair();
    const encrypted = encryptKeyPair(kp, passphrase);
    const hex = keyPairToHex(kp);
    writeFileSync(keyPath(tenant), encrypted);
    writeFileSync(pubPath(tenant), hex.publicKey + "\n", "utf-8");
    console.log(pc.green(`✓ Key rotated for tenant '${tenant}'`));
    console.log(`  new public key: ${hex.publicKey}`);
  });

keysCommand
  .command("export [tenant]")
  .description("Print the public key for a tenant")
  .action((tenant: string = "default") => {
    const path = pubPath(tenant);
    if (!existsSync(path)) {
      console.error(pc.red(`No key found for tenant '${tenant}'. Run 'argus keys generate' first.`));
      process.exit(1);
    }
    const pubKey = readFileSync(path, "utf-8").trim();
    console.log(`${tenant}: ${pubKey}`);
  });
```

- [ ] **Step 4: Update packages/cli/package.json to add @argus/lineage dependency**

Add to `packages/cli/package.json` dependencies:
```json
"@argus/lineage": "workspace:*"
```

Also update `packages/cli/vitest.config.ts` to add lineage alias:
```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@argus/core': resolve(__dirname, '../core/src/index.ts'),
      '@argus/lineage': resolve(__dirname, '../lineage/src/index.ts'),
      'bun:sqlite': resolve(__dirname, 'src/__mocks__/bun-sqlite.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Run key tests**

```bash
cd packages/cli && bunx vitest run src/__tests__/keys.test.ts
```

Expected: 2/2 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/keys.ts packages/cli/src/__tests__/keys.test.ts packages/cli/package.json packages/cli/vitest.config.ts
git commit -m "feat(cli): argus keys generate/rotate/export commands"
```

---

## Task 10: argus lineage CLI commands

**Files:**
- Create: `packages/cli/src/commands/lineage.ts`
- Create: `packages/cli/src/__tests__/lineage.test.ts`
- Modify: `packages/cli/src/main.ts`

- [ ] **Step 1: Write failing test**

Create `packages/cli/src/__tests__/lineage.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { lineageCommand } from "../commands/lineage.js";

describe("lineageCommand", () => {
  it("is named 'lineage'", () => {
    expect(lineageCommand.name()).toBe("lineage");
  });

  it("has replay, diff, revert, verify subcommands", () => {
    const names = lineageCommand.commands.map((c) => c.name());
    expect(names).toContain("replay");
    expect(names).toContain("diff");
    expect(names).toContain("revert");
    expect(names).toContain("verify");
  });
});
```

- [ ] **Step 2: Create lineage.ts**

Create `packages/cli/src/commands/lineage.ts`:

```typescript
import { Command } from "commander";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import {
  EventStore,
  verifyChain,
  replayChain,
  diffChain,
  createRevertEvent,
  generateKeyPair,
  encryptKeyPair,
  decryptKeyPair,
} from "@argus/lineage";

const DB_PATH = process.env["ARGUS_DB"] ?? `${process.env["HOME"]}/.argus/argus.db`;
const KEYS_DIR = process.env["ARGUS_KEYS_DIR"] ?? `${process.env["HOME"]}/.argus/keys`;

function getStore(): EventStore {
  const dir = DB_PATH.replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return new EventStore(DB_PATH);
}

function loadPrivKey(tenant: string, passphrase: string): Uint8Array {
  const path = resolve(KEYS_DIR, `${tenant}.key`);
  if (!existsSync(path)) throw new Error(`Key file not found: ${path}`);
  const data = readFileSync(path);
  return decryptKeyPair(data, passphrase).privateKey;
}

export const lineageCommand = new Command("lineage").description("Manage event lineage");

lineageCommand
  .command("replay <contractId>")
  .description("Reconstruct the current state of a contract from its event chain")
  .action((contractId: string) => {
    const store = getStore();
    const chain = store.getChain(contractId);
    store.close();
    if (chain.length === 0) {
      console.error(pc.red(`No events found for contract: ${contractId}`));
      process.exit(1);
    }
    const state = replayChain(chain);
    console.log(pc.bold(`Replay: ${contractId}`));
    console.log(`  events:       ${state.eventCount}`);
    console.log(`  last event:   ${state.lastEventId}`);
    console.log(`  last seq:     ${state.lastSequence}`);
    console.log(`  has revert:   ${state.hasRevert}`);
    console.log(`  actions:`);
    for (const a of state.appliedActions) {
      console.log(`    - ${a}`);
    }
  });

lineageCommand
  .command("verify <contractId>")
  .description("Verify the signature chain for a contract (standalone — no trust required)")
  .action((contractId: string) => {
    const store = getStore();
    const chain = store.getChain(contractId);
    store.close();
    const result = verifyChain(chain);
    if (result.valid) {
      console.log(pc.green(`✓ Chain valid — ${result.eventCount} events, all signatures verified`));
    } else {
      console.error(pc.red(`✗ Chain invalid — ${result.errors.length} error(s):`));
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
  });

lineageCommand
  .command("revert <contractId> <eventId>")
  .description("Create a signed counter-event that reverts a specific event (never deletes)")
  .option("--tenant <name>", "Signing key tenant", "default")
  .option("--passphrase <pass>", "Key passphrase (or ARGUS_PASSPHRASE env)")
  .action((contractId: string, targetEventId: string, opts: { tenant: string; passphrase?: string }) => {
    const passphrase = opts.passphrase ?? process.env["ARGUS_PASSPHRASE"];
    if (!passphrase) {
      console.error(pc.red("Error: --passphrase required"));
      process.exit(1);
    }
    const store = getStore();
    const target = store.getById(targetEventId);
    const latest = store.getLatest(contractId);
    if (!target) { console.error(pc.red(`Event ${targetEventId} not found`)); store.close(); process.exit(1); }
    if (!latest) { console.error(pc.red(`No events for contract ${contractId}`)); store.close(); process.exit(1); }
    const privKey = loadPrivKey(opts.tenant, passphrase);
    const revert = createRevertEvent(target, latest, privKey);
    store.append(revert);
    store.close();
    console.log(pc.green(`✓ Revert event created: ${revert.id}`));
    console.log(`  reverts: ${targetEventId}`);
    console.log(`  new seq: ${revert.sequence}`);
  });

lineageCommand
  .command("diff <contractId> <fromSeq> <toSeq>")
  .description("Show events added between two sequence numbers")
  .action((contractId: string, fromSeqStr: string, toSeqStr: string) => {
    const fromSeq = parseInt(fromSeqStr, 10);
    const toSeq = parseInt(toSeqStr, 10);
    const store = getStore();
    const chain = store.getChain(contractId);
    store.close();
    const before = chain.filter((e) => e.sequence <= fromSeq);
    const after = chain.filter((e) => e.sequence <= toSeq);
    const diff = diffChain(before, after);
    console.log(pc.bold(`Diff ${contractId}: seq ${diff.fromSequence} → ${diff.toSequence}`));
    for (const ev of diff.addedEvents) {
      console.log(`  + [seq ${ev.sequence}] ${ev.action_kind} (${ev.id.slice(0, 12)}…)`);
    }
  });
```

- [ ] **Step 3: Update main.ts**

Replace `packages/cli/src/main.ts`:

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { ARGUS_VERSION } from "@argus/core";
import { contractCommand } from "./commands/contract.js";
import { keysCommand } from "./commands/keys.js";
import { lineageCommand } from "./commands/lineage.js";

const program = new Command();

program
  .name("argus")
  .description("Outcome-owning agents with signed lineage")
  .version(ARGUS_VERSION);

program.addCommand(contractCommand);
program.addCommand(keysCommand);
program.addCommand(lineageCommand);

program.parse(process.argv);
```

- [ ] **Step 4: Run lineage CLI tests**

```bash
cd packages/cli && bunx vitest run src/__tests__/lineage.test.ts
```

Expected: 2/2 PASS.

- [ ] **Step 5: Run full CLI suite**

```bash
cd packages/cli && bunx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/lineage.ts packages/cli/src/__tests__/lineage.test.ts packages/cli/src/main.ts
git commit -m "feat(cli): argus lineage replay/verify/revert/diff commands"
```

---

## Task 11: Lineage open spec document

**Files:**
- Create: `docs/lineage-spec.md`

- [ ] **Step 1: Create the spec**

Create `docs/lineage-spec.md`:

```markdown
# Argus Lineage Format Specification

**Version:** 0.1.0  
**Status:** Draft  
**Date:** 2026-05-13  
**Reference implementation:** https://github.com/nikhilgupta58/argus (`@argus/lineage`)

---

## Overview

The Argus Lineage Format is a language-agnostic specification for tamper-evident, append-only agent action logs. Each record is content-addressed, cryptographically signed, and chained via parent references. The format is designed to be independently verifiable by any third party holding only the public key.

---

## Event Schema

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (hex, 64 chars) | Yes | BLAKE3 hash of canonical JSON of all other fields (see Canonical Form) |
| `contract_id` | string | Yes | Identifier of the Outcome Contract this event belongs to |
| `action_kind` | enum (see below) | Yes | Type of action recorded |
| `payload_blake3` | string (hex, 64 chars) | Yes | BLAKE3 hash of action-specific payload (payload itself is out-of-band) |
| `parent_id` | string (hex, 64 chars) \| null | Yes | `null` for genesis event; otherwise `id` of the preceding event |
| `timestamp` | integer | Yes | Unix milliseconds (wall clock, not guaranteed monotonic) |
| `sequence` | integer | Yes | Monotonically increasing per `contract_id`, starting at 0 |

### ActionKind values

| Value | Meaning |
|-------|---------|
| `contract_created` | A new Outcome Contract was activated |
| `contract_updated` | An existing contract was updated |
| `specialist_started` | A specialist agent began executing |
| `specialist_completed` | A specialist agent completed successfully |
| `specialist_failed` | A specialist agent failed |
| `escalation_triggered` | A contract escalation rule fired |
| `budget_exceeded` | The contract budget cap was reached |
| `revert` | A counter-event reversing a previous action (see Revert) |

---

## Signed Event Schema

A Signed Event extends an Event with:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signature` | string (hex, 128 chars) | Yes | Ed25519 signature over canonical JSON of the Event |
| `public_key` | string (hex, 64 chars) | Yes | Ed25519 public key of the signer |

---

## Content Addressing

### BLAKE3 Hash

All content addresses use BLAKE3 (256-bit output). Output is lowercase hex, 64 characters.

### Canonical JSON Form

Before hashing or signing, JSON must be canonicalized:
1. Sort all object keys lexicographically (recursive, including nested objects)
2. No whitespace (compact encoding)
3. UTF-8 encoding

Example: `{"action_kind":"contract_created","contract_id":"my-contract","parent_id":null,"payload_blake3":"aaa...","sequence":0,"timestamp":1700000000000}` (keys sorted, id excluded for the id computation itself).

### Event ID Computation

```
id = BLAKE3(canonical_json({
  contract_id,
  action_kind,
  payload_blake3,
  parent_id,
  timestamp,
  sequence
}))
```

The `id` field is **excluded** from the input to its own hash computation.

---

## Signing

Events are signed with Ed25519 (RFC 8032).

### What is signed

The signature covers the canonical JSON of the full Event (including `id`):

```
signature = Ed25519_sign(
  canonical_json({
    id,
    contract_id,
    action_kind,
    payload_blake3,
    parent_id,
    timestamp,
    sequence
  }),
  private_key
)
```

### Key storage

Private keys should be encrypted at rest. The reference implementation uses:
- PBKDF2-SHA256 (100,000 iterations) for key derivation from passphrase
- XChaCha20-Poly1305 for private key encryption
- Format: `version(4 bytes LE) || pbkdf2_salt(32) || xchacha_nonce(24) || encrypted_key(48)` = 108 bytes

---

## Chain Integrity

A valid lineage chain satisfies:
1. Exactly one event has `parent_id = null` (the genesis event, `sequence = 0`)
2. Every other event has `parent_id = id` of the event with `sequence = this.sequence - 1`
3. Every event's `id` matches its computed BLAKE3 hash
4. Every event's `signature` verifies against its `public_key`

---

## Revert

A revert is a regular signed event with `action_kind = "revert"`. The `payload_blake3` field is the BLAKE3 hash of a JSON object `{"reverts": "<event_id>"}`. Revert events are appended to the chain — they never delete or modify existing events. A chain with a revert event is still valid and fully verifiable.

---

## Independent Verification

Any third party can verify a lineage export by:
1. Obtaining the exported chain (array of Signed Events, JSON or JSON Lines format)
2. Running the chain verification algorithm (checking id hashes, parent linkage, and signatures)
3. No Argus installation required — only BLAKE3 and Ed25519 implementations needed

The reference verifier is in `packages/lineage/src/chain/verify.ts`. It imports only `@noble/curves` and `@noble/hashes`.

---

## Export Format

A lineage export is a JSON array of Signed Event objects, sorted by `sequence` ascending:

```json
[
  { "id": "...", "contract_id": "...", "action_kind": "contract_created", ... },
  { "id": "...", "contract_id": "...", "action_kind": "specialist_started", ... }
]
```

Alternatively, JSON Lines (one JSON object per line) is supported for streaming.
```

Commit:

```bash
git add docs/lineage-spec.md
git commit -m "docs: lineage format open spec v0.1.0 — language-agnostic, independently verifiable"
```

---

## Phase 2 exit criteria

- [ ] `bun test packages/lineage/src` — all tests pass (target: 40+ tests)
- [ ] `bunx vitest run` from `packages/cli` — all tests pass
- [ ] 1000-event chain verifies correctly
- [ ] 500-run fuzz test passes (verifyChain never throws on malformed input)
- [ ] `argus keys generate --passphrase test default` creates `~/.argus/keys/default.key`
- [ ] `argus lineage verify <contract-id>` exits 0 on a valid chain, non-zero on tampered
- [ ] `docs/lineage-spec.md` is published and self-contained
- [ ] CHECKPOINT 1 blocker: before Phase 3, external security review must be **at minimum scheduled** for the signing + verification layer
