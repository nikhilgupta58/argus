import { describe, expect, it } from "vitest";
import { contractHash } from "../../contract/hash.js";
import { parseContract } from "../../contract/parser.js";

const VALID_TOML = `
id = "hash-test"
version = "1.0.0"
kind = "custom"
owner = "test@example.com"
outcome = "Test hash stability"
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

describe("contractHash", () => {
  it("returns a 64-char hex string", () => {
    const result = parseContract(VALID_TOML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hash = contractHash(result.value);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same contract yields same hash", () => {
    const result = parseContract(VALID_TOML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(contractHash(result.value)).toBe(contractHash(result.value));
  });

  it("differs when outcome changes", () => {
    const r1 = parseContract(VALID_TOML);
    const r2 = parseContract(VALID_TOML.replace("Test hash stability", "Different outcome"));
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(contractHash(r1.value)).not.toBe(contractHash(r2.value));
  });
});
