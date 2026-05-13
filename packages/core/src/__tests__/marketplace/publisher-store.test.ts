import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    expect(p?.name).toBe("Alice");
    expect(p?.public_key_hex).toBe("a".repeat(64));
  });

  it("lists all publishers", () => {
    store.register({
      id: "pub-001",
      name: "Alice",
      public_key_hex: "a".repeat(64),
      created_at: "2026-05-13T00:00:00Z",
    });
    store.register({
      id: "pub-002",
      name: "Bob",
      public_key_hex: "b".repeat(64),
      created_at: "2026-05-13T00:00:01Z",
    });
    const all = store.list();
    expect(all).toHaveLength(2);
    expect(all.map((p) => p.name)).toContain("Alice");
    expect(all.map((p) => p.name)).toContain("Bob");
  });

  it("throws on duplicate publisher id", () => {
    store.register({
      id: "pub-001",
      name: "Alice",
      public_key_hex: "a".repeat(64),
      created_at: "2026-05-13T00:00:00Z",
    });
    expect(() =>
      store.register({
        id: "pub-001",
        name: "Alice2",
        public_key_hex: "c".repeat(64),
        created_at: "2026-05-13T00:00:02Z",
      }),
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
