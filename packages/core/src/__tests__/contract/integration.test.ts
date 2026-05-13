import { readFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ContractStore, contractHash, diffContracts, parseContract } from "../../contract/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = "/tmp/argus-integration-test.db";
const EXAMPLES = join(__dirname, "../../../../../examples/contracts");

afterEach(() => {
  try {
    rmSync(DB_PATH);
  } catch {}
  try {
    rmSync(`${DB_PATH}-wal`);
  } catch {}
  try {
    rmSync(`${DB_PATH}-shm`);
  } catch {}
});

describe("Contract Layer — end-to-end", () => {
  it("full lifecycle: create → save → load → edit → diff → save → load latest", () => {
    const store = new ContractStore(DB_PATH);

    const toml = readFileSync(join(EXAMPLES, "outbound-3-demos.toml"), "utf-8");
    const r1 = parseContract(toml);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    store.save(r1.value);
    const loaded1 = store.load("outbound-3-demos", "1.0.0");
    expect(loaded1?.outcome).toContain("3 qualified demo calls");

    const v2 = {
      ...r1.value,
      version: "2.0.0",
      outcome: "Land 5 qualified demo calls from cold outbound within 30 days",
    };

    store.save(v2, "1.0.0");

    const changes = diffContracts(r1.value, v2);
    expect(changes).toContain("outcome_changed");
    expect(changes).not.toContain("budget_changed");
    expect(changes).not.toContain("deadline_shifted");

    const latest = store.loadLatest("outbound-3-demos");
    expect(latest?.version).toBe("2.0.0");
    expect(latest?.outcome).toContain("5 qualified demo calls");

    const h1 = contractHash(r1.value);
    const h2 = contractHash(v2);
    expect(h1).not.toBe(h2);

    const versions = store.listVersions("outbound-3-demos");
    expect(versions).toHaveLength(2);

    store.close();
  });

  it("all three example contracts parse, persist, and reload with matching hashes", () => {
    const store = new ContractStore(DB_PATH);
    const files = ["outbound-3-demos.toml", "weekly-rev-report.toml", "pr-review-sla.toml"];

    for (const file of files) {
      const toml = readFileSync(join(EXAMPLES, file), "utf-8");
      const r = parseContract(toml);
      if (!r.ok) throw new Error(`${file}: ${r.error.message}`);

      store.save(r.value);
      const loaded = store.loadLatest(r.value.id);
      expect(loaded?.id).toBe(r.value.id);
      if (!loaded) throw new Error("loaded contract is null");
      expect(contractHash(loaded)).toBe(contractHash(r.value));
    }

    store.close();
  });

  it("parse + hash + store + load completes in under 200ms", () => {
    const start = performance.now();
    const store = new ContractStore(DB_PATH);
    const toml = readFileSync(join(EXAMPLES, "outbound-3-demos.toml"), "utf-8");
    const r = parseContract(toml);
    if (!r.ok) throw new Error(r.error.message);
    store.save(r.value);
    store.loadLatest("outbound-3-demos");
    store.close();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});
