import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { parseContract } from "../../contract/parser.js";
import { contractHash } from "../../contract/hash.js";

function buildTOML(overrides: Record<string, string> = {}): string {
  return `
id = "${overrides["id"] ?? "prop-test"}"
version = "1.0.0"
kind = "custom"
owner = "${overrides["owner"] ?? "test@example.com"}"
outcome = "${overrides["outcome"] ?? "Property test outcome"}"
deadline = "2026-12-31T23:59:59Z"

[[success_criteria]]
name = "done"
metric = "tasks_completed"
target = ${overrides["target"] ?? "1"}
operator = "gte"

[budget]
usd = 10.0
hard_cap = true

[[escalation]]
trigger = "budget_80pct"
channel = "email"
contact = "test@example.com"
`;
}

describe("parseContract — property tests", () => {
  it("valid slugs always parse successfully", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/),
        (id) => {
          const result = parseContract(buildTOML({ id }));
          return result.ok === true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("round-trip: parse → hash is stable across repeated calls", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => !s.includes('"') && !s.includes("\\") && s.trim().length > 0),
        (outcome) => {
          const r = parseContract(buildTOML({ outcome }));
          if (!r.ok) return true;
          return contractHash(r.value) === contractHash(r.value);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("any mutation to outcome changes the hash", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 80 }).filter((s) => !s.includes('"') && !s.includes("\\") && s.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 80 }).filter((s) => !s.includes('"') && !s.includes("\\") && s.trim().length > 0),
        ),
        ([o1, o2]) => {
          if (o1 === o2) return true;
          const r1 = parseContract(buildTOML({ outcome: o1 }));
          const r2 = parseContract(buildTOML({ outcome: o2 }));
          if (!r1.ok || !r2.ok) return true;
          return contractHash(r1.value) !== contractHash(r2.value);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("malformed TOML prefix always returns ok:false", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (garbage) => {
          const result = parseContract("[[[[" + garbage);
          return result.ok === false;
        },
      ),
      { numRuns: 50 },
    );
  });
});
