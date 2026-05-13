import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import { ed25519 } from "@noble/curves/ed25519";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface PublisherIdentity {
  id: string;
  name: string;
  publicKeyHex: string;
}

export interface BundleManifest {
  name: string;
  version: string;
  contractKinds: string[];
  codeHash: string;
  publisherIdentity: PublisherIdentity;
  bundledAt: string;
  signature: string;
  bundleHash?: string;
}

export interface CreateBundleOptions {
  sourceDir: string;
  name: string;
  version: string;
  contractKinds: string[];
  publisherIdentity: PublisherIdentity;
  privateKey: Uint8Array;
  outputPath: string;
}

const encoder = new TextEncoder();

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.keys(obj as object).sort().map((k) => [k, sortKeys((obj as Record<string, unknown>)[k])])
    );
  }
  return obj;
}

export async function createBundle(opts: CreateBundleOptions): Promise<BundleManifest> {
  const { sourceDir, name, version, contractKinds, publisherIdentity, privateKey, outputPath } = opts;

  const specPath = join(sourceDir, "specialist.ts");
  const codeBytes = readFileSync(specPath);
  const codeHash = bytesToHex(blake3(new Uint8Array(codeBytes.buffer, codeBytes.byteOffset, codeBytes.byteLength)));

  const bundledAt = new Date().toISOString();
  const manifestWithoutSig = { name, version, contractKinds, codeHash, publisherIdentity, bundledAt };

  const canonicalJson = JSON.stringify(sortKeys(manifestWithoutSig));
  const payloadHash = blake3(encoder.encode(canonicalJson));
  const sigBytes = ed25519.sign(payloadHash, privateKey);
  const signature = bytesToHex(sigBytes);

  const manifest: BundleManifest = { ...manifestWithoutSig, signature };

  const manifestPath = join(sourceDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  try {
    const result = spawnSync("tar", ["czf", outputPath, "-C", sourceDir, "."], { encoding: "utf-8" });
    if (result.status !== 0) {
      throw new Error(`tar failed: ${result.stderr}`);
    }
  } finally {
    try { rmSync(manifestPath); } catch {}
  }

  return manifest;
}
