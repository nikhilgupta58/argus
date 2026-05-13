import { describe, expect, it } from "vitest";
import { daemonCommand } from "../commands/daemon.js";

describe("daemonCommand", () => {
  it("is a Commander Command named daemon", () => {
    expect(daemonCommand).toBeDefined();
    expect(daemonCommand.name()).toBe("daemon");
  });

  it("has start and stop subcommands", () => {
    const names = daemonCommand.commands.map((c: { name(): string }) => c.name());
    expect(names).toContain("start");
    expect(names).toContain("stop");
  });
});
