import { describe, expect, it } from "vitest";
import { canonicalEventJson, eventId } from "../../event/hash.js";
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

  it("matches known hash vector", () => {
    expect(eventId(BASE)).toBe("cc1e8821c446a49ed6bcd020aecd11a6d324c56a9c211657ce1d13c1b8c2e730");
  });
});

describe("canonicalEventJson", () => {
  it("includes all fields including id and sorts keys", () => {
    const event = { ...BASE, id: "abc123" };
    const json = canonicalEventJson(event as import("../../event/types.js").Event);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    expect(keys).toEqual([...keys].sort());
    expect(parsed.id).toBe("abc123");
    expect(parsed.contract_id).toBe("outbound-3-demos");
  });

  it("is deterministic across calls", () => {
    const event = { ...BASE, id: "abc123" };
    const j1 = canonicalEventJson(event as import("../../event/types.js").Event);
    const j2 = canonicalEventJson(event as import("../../event/types.js").Event);
    expect(j1).toBe(j2);
  });
});
