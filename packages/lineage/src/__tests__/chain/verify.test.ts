import { ed25519 } from "@noble/curves/ed25519";
import { describe, expect, it } from "vitest";
import { verifyChain } from "../../chain/verify.js";
import { eventId } from "../../event/hash.js";
import type { SignedEvent } from "../../event/types.js";
import { signEvent } from "../../signing/sign.js";

function makeChain(n: number): { events: SignedEvent[]; privateKey: Uint8Array } {
  const privateKey = ed25519.utils.randomPrivateKey();
  const events: SignedEvent[] = [];
  for (let i = 0; i < n; i++) {
    const base = {
      contract_id: "chain-test",
      action_kind: "specialist_started" as const,
      payload_blake3: "a".repeat(64),
      parent_id: i === 0 ? null : events[i - 1]?.id,
      timestamp: 1_700_000_000_000 + i * 1000,
      sequence: i,
    };
    const id = eventId(base);
    const signed = signEvent({ ...base, id }, privateKey);
    events.push(signed);
  }
  return { events, privateKey };
}

describe("verifyChain", () => {
  it("validates a clean 5-event chain", () => {
    const { events } = makeChain(5);
    const result = verifyChain(events);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.eventCount).toBe(5);
  });

  it("returns valid:true for empty chain", () => {
    expect(verifyChain([])).toMatchObject({ valid: true, eventCount: 0 });
  });

  it("detects tampered event content (id mismatch)", () => {
    const { events } = makeChain(3);
    const tampered = [...events];
    tampered[1] = { ...(tampered[1] as SignedEvent), contract_id: "TAMPERED" };
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("ID mismatch") || e.includes("Chain break"))).toBe(
      true,
    );
  });

  it("detects tampered signature", () => {
    const { events } = makeChain(3);
    const tampered = [...events];
    tampered[1] = { ...(tampered[1] as SignedEvent), signature: "f".repeat(128) };
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("signature") || e.includes("Invalid"))).toBe(true);
  });

  it("detects broken parent_id chain", () => {
    const { events } = makeChain(3);
    const tampered = [...events];
    tampered[2] = { ...(tampered[2] as SignedEvent), parent_id: "wrong-parent-id" };
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Chain break") || e.includes("ID mismatch"))).toBe(
      true,
    );
  });
});
