import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import type { Event } from "./types.js";

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[k] = sortKeys((obj as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return obj;
}

export function eventId(event: Omit<Event, "id">): string {
  const canonical = JSON.stringify(sortKeys(event));
  return bytesToHex(blake3(new TextEncoder().encode(canonical)));
}

export function canonicalEventJson(event: Event): string {
  return JSON.stringify(sortKeys(event as unknown as Record<string, unknown>));
}
