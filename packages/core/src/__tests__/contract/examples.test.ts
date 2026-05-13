import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseContract } from "../../contract/parser.js";

const EXAMPLES_DIR = join(import.meta.dir, "../../../../../examples/contracts");

const EXAMPLES = [
  "outbound-3-demos.toml",
  "weekly-rev-report.toml",
  "pr-review-sla.toml",
];

describe("example contracts", () => {
  for (const file of EXAMPLES) {
    it(`${file} parses and validates`, () => {
      const toml = readFileSync(join(EXAMPLES_DIR, file), "utf-8");
      const result = parseContract(toml);
      if (!result.ok) {
        throw new Error(`${file} failed: ${result.error.message}`);
      }
      expect(result.ok).toBe(true);
    });
  }
});
