import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { verifyChain } from "../../chain/verify.js";
import type { SignedEvent } from "../../event/types.js";

function randomHex(len: number): string {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

describe("verifyChain — fuzz malformed inputs", () => {
  it("never throws on arbitrarily malformed event arrays", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 0, maxLength: 128 }),
            contract_id: fc.string({ minLength: 0, maxLength: 64 }),
            action_kind: fc.constantFrom("contract_created", "revert", "specialist_started"),
            payload_blake3: fc.string({ minLength: 0, maxLength: 128 }),
            parent_id: fc.option(fc.string({ minLength: 0, maxLength: 128 }), { nil: null }),
            timestamp: fc.integer(),
            sequence: fc.integer({ min: -10, max: 1000 }),
            signature: fc.string({ minLength: 0, maxLength: 256 }),
            public_key: fc.string({ minLength: 0, maxLength: 128 }),
          }),
          { maxLength: 20 },
        ),
        (events) => {
          try {
            const result = verifyChain(events as SignedEvent[]);
            return typeof result.valid === "boolean" && Array.isArray(result.errors);
          } catch {
            return false;
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it("all-zeros event is invalid but does not throw", () => {
    const garbage: SignedEvent = {
      id: "0".repeat(64),
      contract_id: "x",
      action_kind: "contract_created",
      payload_blake3: "0".repeat(64),
      parent_id: null,
      timestamp: 0,
      sequence: 0,
      signature: "0".repeat(128),
      public_key: "0".repeat(64),
    };
    const result = verifyChain([garbage]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("truncated signature is detected as invalid", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 127 }), (shortSig) => {
        const event: SignedEvent = {
          id: randomHex(64),
          contract_id: "fuzz-test",
          action_kind: "contract_created",
          payload_blake3: randomHex(64),
          parent_id: null,
          timestamp: Date.now(),
          sequence: 0,
          signature: shortSig,
          public_key: randomHex(64),
        };
        const result = verifyChain([event]);
        return result.valid === false;
      }),
      { numRuns: 200 },
    );
  });
});
