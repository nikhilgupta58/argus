import { describe, it, expect } from "vitest";
import { diffContracts } from "../../contract/diff.js";
import { parseContract } from "../../contract/parser.js";
import type { Contract } from "../../contract/types.js";

function makeContract(overrides: Partial<Record<string, unknown>> = {}): Contract {
  const base = `
id = "diff-test"
version = "1.0.0"
kind = "custom"
owner = "test@example.com"
outcome = "Base outcome"
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
  const result = parseContract(base);
  if (!result.ok) throw new Error("invalid base: " + result.error.message);
  return { ...result.value, ...overrides } as Contract;
}

describe("diffContracts", () => {
  it("returns empty diff for identical contracts", () => {
    const c = makeContract();
    expect(diffContracts(c, c)).toEqual([]);
  });

  it("detects outcome_changed", () => {
    const a = makeContract();
    const b = makeContract({ outcome: "Different outcome" });
    expect(diffContracts(a, b)).toContain("outcome_changed");
  });

  it("detects deadline_shifted", () => {
    const a = makeContract();
    const b = makeContract({ deadline: "2027-01-01T00:00:00Z" });
    expect(diffContracts(a, b)).toContain("deadline_shifted");
  });

  it("detects budget_changed", () => {
    const a = makeContract();
    const b = makeContract({ budget: { usd: 99.0, hard_cap: true } });
    expect(diffContracts(a, b)).toContain("budget_changed");
  });

  it("detects criteria_modified", () => {
    const a = makeContract();
    const b = makeContract({
      success_criteria: [{ name: "done", metric: "tasks_completed", target: 5, operator: "gte", measurement: "automatic" }],
    });
    expect(diffContracts(a, b)).toContain("criteria_modified");
  });

  it("detects kind_changed", () => {
    const a = makeContract();
    const b = makeContract({ kind: "outbound" });
    expect(diffContracts(a, b)).toContain("kind_changed");
  });

  it("detects metadata_only when only metadata differs", () => {
    const a = makeContract();
    const b = makeContract({ metadata: { tag: "v2" } });
    const diff = diffContracts(a, b);
    expect(diff).toContain("metadata_only");
    expect(diff).toHaveLength(1);
  });
});
