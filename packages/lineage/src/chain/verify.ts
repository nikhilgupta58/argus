import { ed25519 } from "@noble/curves/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { Event, SignedEvent } from "../event/types.js";

export interface VerificationResult {
  valid: boolean;
  eventCount: number;
  errors: string[];
}

const encoder = new TextEncoder();

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

function computeEventId(event: Omit<Event, "id">): string {
  return bytesToHex(blake3(encoder.encode(JSON.stringify(sortKeys(event)))));
}

function verifySignature(event: SignedEvent): boolean {
  const { signature, public_key, ...base } = event;
  const canonical = JSON.stringify(sortKeys(base as unknown as Record<string, unknown>));
  try {
    return ed25519.verify(hexToBytes(signature), encoder.encode(canonical), hexToBytes(public_key));
  } catch {
    return false;
  }
}

export function verifyChain(events: SignedEvent[]): VerificationResult {
  if (events.length === 0) return { valid: true, eventCount: 0, errors: [] };
  const errors: string[] = [];
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);

  if (sorted[0]?.parent_id !== null) {
    errors.push(`Genesis event (seq 0) has non-null parent_id: ${sorted[0]?.parent_id}`);
  }

  // Check sequence starts at 0
  if (sorted[0]?.sequence !== 0) {
    errors.push(`Chain does not start at sequence 0: first sequence is ${sorted[0]?.sequence}`);
  }

  // Check sequences are contiguous
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1] as SignedEvent;
    const curr = sorted[i] as SignedEvent;
    if (curr.sequence !== prev.sequence + 1) {
      errors.push(
        `Non-contiguous sequence at index ${i}: expected ${prev.sequence + 1}, got ${curr.sequence}`,
      );
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i] as SignedEvent;
    const { id, signature, public_key, ...rest } = ev;
    const computedId = computeEventId(rest as Omit<Event, "id">);
    if (id !== computedId) {
      errors.push(
        `ID mismatch at seq ${ev.sequence}: stored=${id.slice(0, 8)}… computed=${computedId.slice(0, 8)}…`,
      );
    }
    if (!verifySignature(ev)) {
      errors.push(`Invalid signature at seq ${ev.sequence} (event ${id.slice(0, 8)}…)`);
    }
    if (i > 0) {
      const prev = sorted[i - 1] as SignedEvent;
      if (ev.parent_id !== prev.id) {
        errors.push(
          `Chain break at seq ${ev.sequence}: expected parent=${prev.id.slice(0, 8)}…, got=${(ev.parent_id ?? "null").slice(0, 8)}…`,
        );
      }
    }
  }

  return { valid: errors.length === 0, eventCount: sorted.length, errors };
}
