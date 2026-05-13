import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import type { Contract } from "./types.js";

function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

export function contractHash(contract: Contract): string {
  const json = JSON.stringify(sortObjectKeys(contract as unknown as Record<string, unknown>));
  const bytes = new TextEncoder().encode(json);
  return bytesToHex(blake3(bytes));
}
