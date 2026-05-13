import { describe, it, expect } from "vitest";
import { publisherCommand } from "../commands/publisher.js";

describe("publisherCommand", () => {
  it("is a Commander Command named 'publisher'", () => {
    expect(publisherCommand).toBeDefined();
    expect(publisherCommand.name()).toBe("publisher");
  });

  it("has register and list subcommands", () => {
    const names = publisherCommand.commands.map((c: { name(): string }) => c.name());
    expect(names).toContain("register");
    expect(names).toContain("list");
  });

  it("register subcommand has --name option", () => {
    const registerCmd = publisherCommand.commands.find(
      (c: { name(): string }) => c.name() === "register"
    );
    expect(registerCmd).toBeDefined();
    const opts = registerCmd!.options.map((o: { long: string }) => o.long);
    expect(opts).toContain("--name");
  });
});
