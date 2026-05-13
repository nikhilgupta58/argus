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
