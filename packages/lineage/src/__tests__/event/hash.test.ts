import { describe, it, expect } from "vitest";
import { eventId } from "../../event/hash.js";
import type { Event } from "../../event/types.js";

const BASE: Omit<Event, "id"> = {
  contract_id: "outbound-3-demos",
  action_kind: "contract_created",
  payload_blake3: "a".repeat(64),
  parent_id: null,
  timestamp: 1_700_000_000_000,
  sequence: 0,
};

describe("eventId", () => {
  it("returns a 64-char hex string", () => {
    expect(eventId(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(eventId(BASE)).toBe(eventId(BASE));
  });

  it("changes when any field changes", () => {
    const h1 = eventId(BASE);
    const h2 = eventId({ ...BASE, sequence: 1 });
    const h3 = eventId({ ...BASE, contract_id: "other" });
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
  });
});
