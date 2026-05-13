import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import type { SpecialistManifest } from "./types.js";

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

export function computeManifestHash(manifest: Omit<SpecialistManifest, "manifestHash">): string {
  return bytesToHex(blake3(encoder.encode(JSON.stringify(sortKeys(manifest)))));
}

export function computeCodeHash(fileBytes: Uint8Array): string {
  return bytesToHex(blake3(fileBytes));
}

export class SpecialistRegistry {
  private entries: Map<string, SpecialistManifest> = new Map();
  private readonly registryPath: string;

  constructor(registryPath: string) {
    this.registryPath = resolve(registryPath);
    this.load();
  }

  private load(): void {
    if (!existsSync(this.registryPath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.registryPath, "utf-8")) as SpecialistManifest[];
      for (const m of raw) this.entries.set(m.manifestHash, m);
    } catch {
      // corrupt registry — start fresh
    }
  }

  private save(): void {
    writeFileSync(this.registryPath, JSON.stringify([...this.entries.values()], null, 2), "utf-8");
  }

  add(manifest: SpecialistManifest): void {
    const expected = computeManifestHash({
      name: manifest.name,
      version: manifest.version,
      contractKinds: manifest.contractKinds,
      entrypoint: manifest.entrypoint,
      codeHash: manifest.codeHash,
    });
    if (expected !== manifest.manifestHash) {
      throw new Error(`manifestHash mismatch: expected ${expected}, got ${manifest.manifestHash}`);
    }
    this.entries.set(manifest.manifestHash, manifest);
    this.save();
  }

  remove(manifestHash: string): void {
    this.entries.delete(manifestHash);
    this.save();
  }

  list(): SpecialistManifest[] {
    return [...this.entries.values()];
  }

  get(manifestHash: string): SpecialistManifest | undefined {
    return this.entries.get(manifestHash);
  }

  findByKind(contractKind: string): SpecialistManifest[] {
    return [...this.entries.values()].filter((m) => m.contractKinds.includes(contractKind));
  }
}
