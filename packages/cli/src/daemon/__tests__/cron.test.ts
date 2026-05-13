import { describe, expect, it } from "vitest";
import { extractCronPolicy } from "../cron.js";

describe("extractCronPolicy", () => {
  it("returns null when metadata is undefined", () => {
    expect(extractCronPolicy(undefined)).toBeNull();
  });

  it("returns null when no cron key in metadata", () => {
    expect(extractCronPolicy({})).toBeNull();
    expect(extractCronPolicy({ trigger: "webhook" })).toBeNull();
  });

  it("returns cron string from metadata.cron", () => {
    expect(extractCronPolicy({ cron: "0 9 * * 1" })).toBe("0 9 * * 1");
  });

  it("returns null for non-string cron value", () => {
    expect(extractCronPolicy({ cron: 123 })).toBeNull();
  });

  it("returns null for empty string cron value", () => {
    expect(extractCronPolicy({ cron: "   " })).toBeNull();
  });
});
