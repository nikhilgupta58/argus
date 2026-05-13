import { describe, expect, it } from "vitest";
import type { Specialist } from "../index.js";

describe("Specialist", () => {
  it("placeholder test", () => {
    const specialist: Specialist = { name: "test", version: "0.0.1" };
    expect(specialist.name).toBe("test");
  });
});
