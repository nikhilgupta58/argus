import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { SpecialistRegistry, computeManifestHash, computeCodeHash } from "../registry.js";
import type { SpecialistManifest } from "../types.js";

let _counter = 0;
const tmpRegistryPath = () =>
  join(tmpdir(), `argus-registry-test-${Date.now()}-${++_counter}.json`);

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
    const prBase = { name: "pr-review", version: "1.0.0", contractKinds: ["pr-review"], entrypoint: "/e2", codeHash: "hh" };
    const prManifest: SpecialistManifest = { ...prBase, manifestHash: computeManifestHash(prBase) };
    reg.add(prManifest);
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
