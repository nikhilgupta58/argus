import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SpecialistContext } from "../../../types.js";

// vi.mock is hoisted — define with a controllable spy
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

// Import AFTER mock registration
const { prReviewSpecialist } = await import("../index.js");

const makeCtx = (): SpecialistContext => ({
  contractId: "c3",
  contractKind: "pr-review",
  invocationId: "inv-3",
  contract: {
    id: "c3",
    version: "1.0.0",
    kind: "pr-review",
    owner: "owner@example.com",
    outcome: "Review PRs against security and code quality rubric",
    deadline: "2026-12-31T00:00:00Z",
    success_criteria: [],
    budget: { tokens: 200000, usd: 5, hard_cap: true },
    escalation: [],
    metadata: {
      repo: "nikhilgupta58/argus",
      pr_number: "42",
      rubric: "Check for security vulnerabilities, test coverage, and code quality",
    },
  },
  budgetRemaining: { tokens: 200000, usd: 5 },
});

describe("PrReviewSpecialist", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockCreate.mockReset();
  });

  it("has correct name, version, and contractKinds", () => {
    expect(prReviewSpecialist.name).toBe("pr-review");
    expect(prReviewSpecialist.version).toBe("1.0.0");
    expect(prReviewSpecialist.contractKinds).toContain("pr-review");
  });

  it("returns review on success (mocked gh + Anthropic)", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "## Review\n\nLGTM. No security issues found." }],
      usage: { input_tokens: 400, output_tokens: 200 },
    });

    const encoder = new TextEncoder();
    let callCount = 0;

    vi.stubGlobal("Bun", {
      spawn: vi.fn().mockImplementation(() => {
        callCount++;
        // First call: gh pr view — returns PR JSON
        // Second call: gh pr comment — returns empty stdout
        const stdout =
          callCount === 1
            ? JSON.stringify({
                title: "Add feature X",
                body: "Implements feature X",
                additions: 50,
                deletions: 10,
              })
            : "";
        return {
          exited: Promise.resolve(0),
          stdin: { write: vi.fn(), end: vi.fn() },
          stdout: new ReadableStream({
            start(c) {
              c.enqueue(encoder.encode(stdout));
              c.close();
            },
          }),
          stderr: new ReadableStream({
            start(c) {
              c.close();
            },
          }),
        };
      }),
    });

    const result = await prReviewSpecialist.execute(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary).toContain("PR #42");
      expect(result.value.artifacts?.["review"]).toContain("Review");
      expect(result.value.tokensUsed).toBe(600);
    }
  });

  it("returns EXECUTION_ERROR when gh CLI fails", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal("Bun", {
      spawn: vi.fn().mockReturnValue({
        exited: Promise.resolve(1),
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
        stderr: new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode("gh: repository not found"));
            c.close();
          },
        }),
      }),
    });

    const result = await prReviewSpecialist.execute(makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("EXECUTION_ERROR");
  });

  it("returns EXECUTION_ERROR when required metadata is missing", async () => {
    const ctx: SpecialistContext = {
      ...makeCtx(),
      contract: { ...makeCtx().contract, metadata: {} },
    };
    const result = await prReviewSpecialist.execute(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("EXECUTION_ERROR");
      expect(result.error.message).toContain("repo");
    }
  });
});
