import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContractStore } from "@argus/core";
import { EventStore, generateKeyPair } from "@argus/lineage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Orchestrator } from "../orchestrator.js";
import { SpecialistRegistry, computeManifestHash } from "../registry.js";
import { BunSandbox } from "../sandbox.js";
import type { SpecialistManifest, SpecialistOutput } from "../types.js";

function makeTestRegistry(): SpecialistRegistry {
  const tmpPath = join(tmpdir(), `argus-orch-reg-${Date.now()}.json`);
  const reg = new SpecialistRegistry(tmpPath);
  const base = {
    name: "outbound",
    version: "1.0.0",
    contractKinds: ["outbound"],
    entrypoint: "/fake/outbound.js",
    codeHash: "abc",
  };
  const manifest: SpecialistManifest = { ...base, manifestHash: computeManifestHash(base) };
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
    const kp = generateKeyPair();
    privateKey = kp.privateKey;
    registry = makeTestRegistry();
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
