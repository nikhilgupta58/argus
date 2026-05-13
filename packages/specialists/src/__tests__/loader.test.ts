import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, rmSync } from "node:fs";
import { loadSpecialist } from "../loader.js";
import { computeCodeHash } from "../registry.js";
import type { SpecialistManifest } from "../types.js";

describe("loadSpecialist", () => {
  it("throws 'codeHash mismatch' when file content does not match manifest codeHash", async () => {
    const tmpFile = join(tmpdir(), `test-specialist-${Date.now()}.js`);
    writeFileSync(tmpFile, "export default {};");

    try {
      const manifest: SpecialistManifest = {
        name: "bad",
        version: "1.0.0",
        contractKinds: ["custom"],
        entrypoint: tmpFile,
        codeHash: "this-hash-is-definitely-wrong",
        manifestHash: "any",
      };
      await expect(loadSpecialist(manifest)).rejects.toThrow("codeHash mismatch");
    } finally {
      rmSync(tmpFile, { force: true });
    }
  });

  it("throws when entrypoint file does not exist", async () => {
    const manifest: SpecialistManifest = {
      name: "missing",
      version: "1.0.0",
      contractKinds: ["custom"],
      entrypoint: "/nonexistent/path/specialist.js",
      codeHash: "abc",
      manifestHash: "def",
    };
    await expect(loadSpecialist(manifest)).rejects.toThrow();
  });
});
