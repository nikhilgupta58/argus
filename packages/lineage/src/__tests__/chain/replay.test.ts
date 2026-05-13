import { describe, it, expect } from "vitest";
import { replayChain } from "../../chain/replay.js";
import { diffChain } from "../../chain/diff.js";
import { signEvent } from "../../signing/sign.js";
import { eventId } from "../../event/hash.js";
import { createRevertEvent } from "../../chain/revert.js";
import { verifyChain } from "../../chain/verify.js";
import { ed25519 } from "@noble/curves/ed25519";
import type { SignedEvent } from "../../event/types.js";

function makeChain(n: number, key: Uint8Array): SignedEvent[] {
  const events: SignedEvent[] = [];
  for (let i = 0; i < n; i++) {
    const base = {
      contract_id: "replay-test",
      action_kind: "specialist_started" as const,
      payload_blake3: "a".repeat(64),
      parent_id: i === 0 ? null : events[i - 1]!.id,
      timestamp: 1_700_000_000_000 + i * 1000,
      sequence: i,
    };
    events.push(signEvent({ ...base, id: eventId(base) }, key));
  }
  return events;
}

describe("replayChain", () => {
  it("throws on empty chain", () => {
    expect(() => replayChain([])).toThrow();
  });

  it("returns correct state for a 3-event chain", () => {
    const key = ed25519.utils.randomPrivateKey();
    const chain = makeChain(3, key);
    const state = replayChain(chain);
    expect(state.eventCount).toBe(3);
    expect(state.lastSequence).toBe(2);
    expect(state.hasRevert).toBe(false);
    expect(state.appliedActions).toHaveLength(3);
  });

  it("is deterministic regardless of input order", () => {
    const key = ed25519.utils.randomPrivateKey();
    const chain = makeChain(5, key);
    const shuffled = [...chain].sort(() => Math.random() - 0.5);
    const s1 = replayChain(chain);
    const s2 = replayChain(shuffled);
    expect(s1.lastEventId).toBe(s2.lastEventId);
    expect(s1.lastSequence).toBe(s2.lastSequence);
  });
});

describe("diffChain", () => {
  it("shows added events between versions", () => {
    const key = ed25519.utils.randomPrivateKey();
    const v1 = makeChain(3, key);
    const v2 = makeChain(5, key);
    const diff = diffChain(v1, v2);
    expect(diff.addedEvents).toHaveLength(2);
    expect(diff.fromSequence).toBe(2);
    expect(diff.toSequence).toBe(4);
  });
});

describe("createRevertEvent", () => {
  it("creates a valid signed revert event extending the chain", () => {
    const key = ed25519.utils.randomPrivateKey();
    const chain = makeChain(3, key);
    const target = chain[1]!;
    const latest = chain[2]!;
    const revert = createRevertEvent(target, latest, key);
    expect(revert.action_kind).toBe("revert");
    expect(revert.parent_id).toBe(latest.id);
    expect(revert.sequence).toBe(latest.sequence + 1);
  });

  it("revert event is itself verifiable (signature is valid)", () => {
    const key = ed25519.utils.randomPrivateKey();
    const chain = makeChain(3, key);
    const revert = createRevertEvent(chain[1]!, chain[2]!, key);
    const fullChain = [...chain, revert];
    expect(verifyChain(fullChain).valid).toBe(true);
  });

  it("reverts are replayable — replay shows hasRevert=true", () => {
    const key = ed25519.utils.randomPrivateKey();
    const chain = makeChain(3, key);
    const revert = createRevertEvent(chain[1]!, chain[2]!, key);
    const state = replayChain([...chain, revert]);
    expect(state.hasRevert).toBe(true);
    expect(state.eventCount).toBe(4);
  });
});
