import { describe, expect, it } from "vitest";
import { keysCommand } from "../commands/keys.js";

describe("keysCommand", () => {
  it("is named 'keys'", () => {
    expect(keysCommand.name()).toBe("keys");
  });

  it("has generate, rotate, export subcommands", () => {
    const names = keysCommand.commands.map((c) => c.name());
    expect(names).toContain("generate");
    expect(names).toContain("rotate");
    expect(names).toContain("export");
  });
});
