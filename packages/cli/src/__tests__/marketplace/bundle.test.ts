import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPair } from "@argus/lineage";
import { bytesToHex } from "@noble/hashes/utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBundle } from "../../marketplace/bundle.js";
import { verifyBundle } from "../../marketplace/verify.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "argus-bundle-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("createBundle + verifyBundle", () => {
  it("creates a .tar.gz and verifyBundle returns the manifest", async () => {
    const sourceDir = join(tmpDir, "my-specialist");
    mkdirSync(sourceDir);
    writeFileSync(
      join(sourceDir, "specialist.ts"),
      `export default { name: "my-specialist", version: "1.0.0", contractKinds: ["custom"] };`,
    );

    const kp = generateKeyPair();
    const publisherIdentity = {
      id: "pub-001",
      name: "Alice",
      publicKeyHex: bytesToHex(kp.publicKey),
    };

    const outputPath = join(tmpDir, "my-specialist-1.0.0.tar.gz");

    const manifest = await createBundle({
      sourceDir,
      name: "my-specialist",
      version: "1.0.0",
      contractKinds: ["custom"],
      publisherIdentity,
      privateKey: kp.privateKey,
      outputPath,
    });

    expect(existsSync(outputPath)).toBe(true);
    expect(manifest.name).toBe("my-specialist");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(manifest.codeHash).toMatch(/^[0-9a-f]{64}$/);

    const verified = await verifyBundle(outputPath);
    expect(verified.name).toBe("my-specialist");
    expect(verified.version).toBe("1.0.0");
    expect(verified.publisherIdentity.id).toBe("pub-001");
  });

  it("verifyBundle rejects a bundle with tampered bytes", async () => {
    const sourceDir = join(tmpDir, "spec2");
    mkdirSync(sourceDir);
    writeFileSync(join(sourceDir, "specialist.ts"), "export default {};");

    const kp = generateKeyPair();
    const outputPath = join(tmpDir, "spec2-1.0.0.tar.gz");

    await createBundle({
      sourceDir,
      name: "spec2",
      version: "1.0.0",
      contractKinds: ["custom"],
      publisherIdentity: { id: "pub-999", name: "Mallory", publicKeyHex: bytesToHex(kp.publicKey) },
      privateKey: kp.privateKey,
      outputPath,
    });

    // Corrupt the tar.gz
    const { readFileSync, writeFileSync: wf } = await import("node:fs");
    const orig = readFileSync(outputPath);
    const tampered = Buffer.from(orig);
    tampered[20] ^= 0xff;
    wf(outputPath, tampered);

    await expect(verifyBundle(outputPath)).rejects.toThrow();
  });

  it("verifyBundle returns manifest with bundleHash field set", async () => {
    const sourceDir = join(tmpDir, "spec3");
    mkdirSync(sourceDir);
    writeFileSync(join(sourceDir, "specialist.ts"), "export default {};");
    const kp = generateKeyPair();
    const outputPath = join(tmpDir, "spec3-1.0.0.tar.gz");
    await createBundle({
      sourceDir,
      name: "spec3",
      version: "1.0.0",
      contractKinds: ["custom"],
      publisherIdentity: { id: "p1", name: "Dev", publicKeyHex: bytesToHex(kp.publicKey) },
      privateKey: kp.privateKey,
      outputPath,
    });
    const manifest = await verifyBundle(outputPath);
    expect(manifest.bundleHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
