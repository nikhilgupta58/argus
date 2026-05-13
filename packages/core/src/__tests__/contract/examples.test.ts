import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseContract } from "../../contract/parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dirname, "../../../../../examples/contracts");

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
