import { describe, expect, it } from "vitest";
import { initCommand } from "../commands/init.js";

describe("initCommand", () => {
  it("is a Commander Command named 'init'", () => {
    expect(initCommand).toBeDefined();
    expect(initCommand.name()).toBe("init");
  });

  it("has a description mentioning setup or wizard", () => {
    expect(initCommand.description().toLowerCase()).toMatch(/setup|wizard|init|agent/);
  });

  it("has no required options (fully interactive)", () => {
    const required = initCommand.options.filter((o: { required: boolean }) => o.required);
    expect(required).toHaveLength(0);
  });
});
