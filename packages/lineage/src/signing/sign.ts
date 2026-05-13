import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { canonicalEventJson } from "../event/hash.js";
import type { Event, SignedEvent } from "../event/types.js";

const encoder = new TextEncoder();

export function signEvent(event: Event, privateKey: Uint8Array): SignedEvent {
  const canonical = canonicalEventJson(event);
  const bytes = encoder.encode(canonical);
  const sig = ed25519.sign(bytes, privateKey);
  const pubKey = ed25519.getPublicKey(privateKey);
  return {
    ...event,
    signature: bytesToHex(sig),
    public_key: bytesToHex(pubKey),
  };
}

export function verifyEvent(event: SignedEvent): boolean {
  const { signature, public_key, ...base } = event;
  const canonical = canonicalEventJson(base as Event);
  const bytes = encoder.encode(canonical);
  try {
    return ed25519.verify(hexToBytes(signature), bytes, hexToBytes(public_key));
  } catch {
    return false;
  }
}
