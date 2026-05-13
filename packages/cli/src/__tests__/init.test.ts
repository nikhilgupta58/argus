import { describe, expect, it } from "vitest";
import { initCommand } from "../commands/init.js";

describe("initCommand", () => {
  it("is a Commander Command named 'init'", () => {
    expect(initCommand).toBeDefined();
    expect(initCommand.name()).toBe("init");
  });

  it("has a description mentioning setup or wizard", () => {
    expect(initCommand.description().toLowerCase()).toMatch(/setup|wizard|init/);
  });

  it("has --out option", () => {
    const opts = initCommand.options.map((o: { long: string }) => o.long);
    expect(opts).toContain("--out");
  });
});
