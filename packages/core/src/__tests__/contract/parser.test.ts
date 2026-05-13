import { describe, expect, it } from "vitest";
import { parseContract } from "../../contract/parser.js";

const VALID_TOML = `
id = "outbound-q2-2026"
version = "1.0.0"
kind = "outbound"
owner = "nikhil@example.com"
outcome = "Land 3 qualified demo calls from cold outbound"
deadline = "2026-06-30T23:59:59Z"

[[success_criteria]]
name = "demo_calls"
metric = "qualified_demo_calls"
target = 3
operator = "gte"

[budget]
tokens = 500000
usd = 50.0
hard_cap = true

[[escalation]]
trigger = "budget_80pct"
channel = "slack"
contact = "@nikhil"
`;

describe("parseContract", () => {
  it("parses a valid contract", () => {
    const result = parseContract(VALID_TOML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("outbound-q2-2026");
    expect(result.value.kind).toBe("outbound");
    expect(result.value.success_criteria).toHaveLength(1);
    expect(result.value.success_criteria[0]?.measurement).toBe("automatic");
  });

  it("returns PARSE_ERROR on invalid TOML syntax", () => {
    const result = parseContract("id = [broken toml");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PARSE_ERROR");
  });

  it("returns SCHEMA_ERROR when id is not a slug", () => {
    const bad = VALID_TOML.replace('id = "outbound-q2-2026"', 'id = "UPPER CASE"');
    const result = parseContract(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_ERROR");
    expect(result.error.message).toContain("id");
  });

  it("returns SCHEMA_ERROR when budget has no tokens or usd", () => {
    const bad = VALID_TOML.replace(
      "[budget]\ntokens = 500000\nusd = 50.0\nhard_cap = true",
      "[budget]\nhard_cap = true",
    );
    const result = parseContract(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_ERROR");
  });

  it("returns SCHEMA_ERROR when success_criteria names are duplicated", () => {
    const dup = `${VALID_TOML}
[[success_criteria]]
name = "demo_calls"
metric = "other_metric"
target = 1
operator = "gte"
`;
    const result = parseContract(dup);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_ERROR");
  });

  it("returns SCHEMA_ERROR on invalid email owner", () => {
    const bad = VALID_TOML.replace('owner = "nikhil@example.com"', 'owner = "not-an-email"');
    const result = parseContract(bad);
    expect(result.ok).toBe(false);
  });

  it("returns SCHEMA_ERROR on invalid deadline format", () => {
    const bad = VALID_TOML.replace(
      'deadline = "2026-06-30T23:59:59Z"',
      'deadline = "June 30, 2026"',
    );
    const result = parseContract(bad);
    expect(result.ok).toBe(false);
  });
});
