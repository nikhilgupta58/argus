import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { verifyChain } from "../../chain/verify.js";
import { signEvent } from "../../signing/sign.js";
import { eventId } from "../../event/hash.js";
import { ed25519 } from "@noble/curves/ed25519";
import type { SignedEvent } from "../../event/types.js";

function buildChain(n: number, privateKey: Uint8Array): SignedEvent[] {
  const events: SignedEvent[] = [];
  for (let i = 0; i < n; i++) {
    const base = {
      contract_id: "prop-test",
      action_kind: "specialist_started" as const,
      payload_blake3: "a".repeat(64),
      parent_id: i === 0 ? null : events[i - 1]!.id,
      timestamp: 1_700_000_000_000 + i * 1000,
      sequence: i,
    };
    events.push(signEvent({ ...base, id: eventId(base) }, privateKey));
  }
  return events;
}

describe("verifyChain — property tests", () => {
  it("any valid chain of 1–100 events always passes verification", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (n) => {
          const key = ed25519.utils.randomPrivateKey();
          const chain = buildChain(n, key);
          return verifyChain(chain).valid === true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it("mutating any event content always breaks the chain", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        fc.integer({ min: 0, max: 19 }),
        (n, mutateIdx) => {
          if (mutateIdx >= n) return true;
          const key = ed25519.utils.randomPrivateKey();
          const chain = buildChain(n, key);
          const tampered = [...chain];
          tampered[mutateIdx] = { ...tampered[mutateIdx]!, contract_id: "TAMPERED-" + mutateIdx };
          return verifyChain(tampered).valid === false;
        },
      ),
      { numRuns: 200 },
    );
  });

  it("1000-event chain verifies correctly", () => {
    const key = ed25519.utils.randomPrivateKey();
    const chain = buildChain(1000, key);
    const result = verifyChain(chain);
    expect(result.valid).toBe(true);
    expect(result.eventCount).toBe(1000);
  }, 60_000); // 60s timeout

  it("shuffling events does not affect validity (verifyChain sorts by sequence)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 30 }),
        (n) => {
          const key = ed25519.utils.randomPrivateKey();
          const chain = buildChain(n, key);
          const shuffled = [...chain].sort(() => Math.random() - 0.5);
          return verifyChain(shuffled).valid === true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
