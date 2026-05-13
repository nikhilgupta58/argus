import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import { eventId } from "../event/hash.js";
import { signEvent } from "../signing/sign.js";
import type { SignedEvent } from "../event/types.js";

export function createRevertEvent(
  targetEvent: SignedEvent,
  latestEvent: SignedEvent,
  privateKey: Uint8Array,
): SignedEvent {
  const payload = JSON.stringify({ reverts: targetEvent.id });
  const payloadBytes = new TextEncoder().encode(payload);
  const payloadBlake3 = bytesToHex(blake3(payloadBytes));

  const base = {
    contract_id: targetEvent.contract_id,
    action_kind: "revert" as const,
    payload_blake3: payloadBlake3,
    parent_id: latestEvent.id,
    timestamp: Date.now(),
    sequence: latestEvent.sequence + 1,
  };

  const id = eventId(base);
  return signEvent({ ...base, id }, privateKey);
}
