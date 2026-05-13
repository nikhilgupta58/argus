import { describe, it, expect } from "vitest";
import { signEvent, verifyEvent } from "../../signing/sign.js";
import { eventId } from "../../event/hash.js";
import { ed25519 } from "@noble/curves/ed25519";

function makePrivKey(): Uint8Array {
  return ed25519.utils.randomPrivateKey();
}

function makeBaseEvent() {
  const base = {
    contract_id: "sign-test",
    action_kind: "contract_created" as const,
    payload_blake3: "a".repeat(64),
    parent_id: null,
    timestamp: 1_700_000_000_000,
    sequence: 0,
  };
  return { ...base, id: eventId(base) };
}

describe("signEvent", () => {
  it("returns a SignedEvent with 128-char hex signature", () => {
    const key = makePrivKey();
    const event = makeBaseEvent();
    const signed = signEvent(event, key);
    expect(signed.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(signed.public_key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("includes all original event fields", () => {
    const key = makePrivKey();
    const event = makeBaseEvent();
    const signed = signEvent(event, key);
    expect(signed.id).toBe(event.id);
    expect(signed.contract_id).toBe(event.contract_id);
    expect(signed.sequence).toBe(0);
  });
});

describe("verifyEvent", () => {
  it("returns true for a correctly signed event", () => {
    const key = makePrivKey();
    const event = makeBaseEvent();
    const signed = signEvent(event, key);
    expect(verifyEvent(signed)).toBe(true);
  });

  it("returns false when signature is tampered", () => {
    const key = makePrivKey();
    const event = makeBaseEvent();
    const signed = signEvent(event, key);
    const tampered = { ...signed, signature: "f".repeat(128) };
    expect(verifyEvent(tampered)).toBe(false);
  });

  it("returns false when event content is tampered", () => {
    const key = makePrivKey();
    const event = makeBaseEvent();
    const signed = signEvent(event, key);
    const tampered = { ...signed, contract_id: "tampered-id" };
    expect(verifyEvent(tampered)).toBe(false);
  });

  it("returns false when public_key is wrong", () => {
    const key1 = makePrivKey();
    const key2 = makePrivKey();
    const event = makeBaseEvent();
    const signed = signEvent(event, key1);
    const wrongKey = { ...signed, public_key: Array.from(ed25519.getPublicKey(key2)).map(b => b.toString(16).padStart(2, "0")).join("") };
    expect(verifyEvent(wrongKey)).toBe(false);
  });
});
