import { describe, expect, it } from "vitest";
import { fleetCommand } from "../commands/fleet.js";

describe("fleetCommand", () => {
  it("is a Commander Command named fleet", () => {
    expect(fleetCommand).toBeDefined();
    expect(fleetCommand.name()).toBe("fleet");
  });

  it("has list, install, remove subcommands", () => {
    const names = fleetCommand.commands.map((c: { name(): string }) => c.name());
    expect(names).toContain("list");
    expect(names).toContain("install");
    expect(names).toContain("remove");
  });

  it("has an install-bundle subcommand", () => {
    const names = fleetCommand.commands.map((c: { name(): string }) => c.name());
    expect(names).toContain("install-bundle");
  });
});
