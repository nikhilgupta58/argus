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
