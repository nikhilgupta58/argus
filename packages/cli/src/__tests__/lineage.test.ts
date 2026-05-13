import { describe, it, expect } from "vitest";
import { lineageCommand } from "../commands/lineage.js";

describe("lineageCommand", () => {
  it("is named 'lineage'", () => {
    expect(lineageCommand.name()).toBe("lineage");
  });

  it("has replay, diff, revert, verify subcommands", () => {
    const names = lineageCommand.commands.map((c) => c.name());
    expect(names).toContain("replay");
    expect(names).toContain("diff");
    expect(names).toContain("revert");
    expect(names).toContain("verify");
  });
});
