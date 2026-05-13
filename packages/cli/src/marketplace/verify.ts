import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ed25519 } from "@noble/curves/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { BundleManifest } from "./bundle.js";

const encoder = new TextEncoder();

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.keys(obj as object)
        .sort()
        .map((k) => [k, sortKeys((obj as Record<string, unknown>)[k])]),
    );
  }
  return obj;
}

export async function verifyBundle(tarPath: string): Promise<BundleManifest> {
  const tarBytes = readFileSync(tarPath);
  const bundleHash = bytesToHex(
    blake3(new Uint8Array(tarBytes.buffer, tarBytes.byteOffset, tarBytes.byteLength)),
  );

  const tmpDir = mkdtempSync(join(tmpdir(), "argus-verify-"));
  try {
    const result = spawnSync("tar", ["xzf", tarPath, "-C", tmpDir, "./manifest.json"], {
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      throw new Error(`tar extraction failed: ${result.stderr ?? "unknown error"}`);
    }

    const raw = JSON.parse(readFileSync(join(tmpDir, "manifest.json"), "utf-8")) as BundleManifest;

    const { signature, bundleHash: _bh, ...rest } = raw;
    if (!signature) throw new Error("Bundle manifest is missing signature field");

    const canonicalJson = JSON.stringify(sortKeys(rest));
    const payloadHash = blake3(encoder.encode(canonicalJson));

    const valid = ed25519.verify(
      hexToBytes(signature),
      payloadHash,
      hexToBytes(raw.publisherIdentity.publicKeyHex),
    );
    if (!valid)
      throw new Error("Bundle signature verification failed — bundle may have been tampered with");

    return { ...raw, bundleHash };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
