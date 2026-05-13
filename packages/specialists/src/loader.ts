import { readFileSync } from "node:fs";
import { computeCodeHash } from "./registry.js";
import type { Specialist, SpecialistManifest } from "./types.js";

export async function loadSpecialist(manifest: SpecialistManifest): Promise<Specialist> {
  const fileBuffer = readFileSync(manifest.entrypoint);
  const fileBytes = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
  const actualHash = computeCodeHash(fileBytes);
  if (actualHash !== manifest.codeHash) {
    throw new Error(
      `codeHash mismatch for ${manifest.name}@${manifest.version}: expected ${manifest.codeHash}, got ${actualHash}`,
    );
  }
  const mod = await import(manifest.entrypoint);
  if (!mod.default || typeof mod.default.execute !== "function") {
    throw new Error(`Specialist ${manifest.name} has no default export with execute()`);
  }
  return mod.default as Specialist;
}
