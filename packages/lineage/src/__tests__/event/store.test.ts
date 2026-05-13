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
    const ev1base = {
      contract_id: "test-contract",
      action_kind: "specialist_started" as const,
      payload_blake3: "b".repeat(64),
      parent_id: ev0.id,
      timestamp: Date.now(),
      sequence: 1,
    };
    const ev1: SignedEvent = {
      ...ev1base,
      id: eventId(ev1base),
      signature: "s".repeat(128),
      public_key: "p".repeat(64),
    };
    store.append(ev0);
    store.append(ev1);
    const chain = store.getChain("test-contract");
    expect(chain).toHaveLength(2);
    expect(chain[0]!.sequence).toBe(0);
    expect(chain[1]!.sequence).toBe(1);
  });

  it("getLatest returns the highest-sequence event for a contract", () => {
    const ev0 = makeEvent({ sequence: 0 });
    const ev1base = {
      contract_id: "test-contract",
      action_kind: "specialist_started" as const,
      payload_blake3: "b".repeat(64),
      parent_id: ev0.id,
      timestamp: Date.now(),
      sequence: 1,
    };
    const ev1: SignedEvent = {
      ...ev1base,
      id: eventId(ev1base),
      signature: "s".repeat(128),
      public_key: "p".repeat(64),
    };
    store.append(ev0);
    store.append(ev1);
    expect(store.getLatest("test-contract")?.sequence).toBe(1);
  });
});
