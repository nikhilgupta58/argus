import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SpecialistContext } from "../../../types.js";

// vi.mock is hoisted to the top — define it once with a controllable spy
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

// Import AFTER mock registration
const { outboundSpecialist } = await import("../index.js");

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
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("has correct name, version, and contractKinds", () => {
    expect(outboundSpecialist.name).toBe("outbound");
    expect(outboundSpecialist.version).toBe("1.0.0");
    expect(outboundSpecialist.contractKinds).toContain("outbound");
  });

  it("returns drafted email on success (mocked Anthropic)", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "Subject: Quick note\n\nHi Jane, ..." }],
      usage: { input_tokens: 300, output_tokens: 150 },
    });

    const result = await outboundSpecialist.execute(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary).toContain("drafted");
      expect(result.value.artifacts?.["drafted"]).toContain("Jane");
      expect(result.value.tokensUsed).toBe(450);
    }
  });

  it("returns EXECUTION_ERROR when Anthropic call fails", async () => {
    mockCreate.mockRejectedValue(new Error("API rate limit"));

    const result = await outboundSpecialist.execute(makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("EXECUTION_ERROR");
  });
});
