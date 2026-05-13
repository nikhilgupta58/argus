import { describe, it, expect } from "vitest";
import { specialistPublishCommand } from "../commands/specialist-publish.js";

describe("specialistPublishCommand", () => {
  it("is a Commander Command named 'specialist'", () => {
    expect(specialistPublishCommand).toBeDefined();
    expect(specialistPublishCommand.name()).toBe("specialist");
  });

  it("has a 'publish' subcommand", () => {
    const names = specialistPublishCommand.commands.map((c: { name(): string }) => c.name());
    expect(names).toContain("publish");
  });

  it("publish subcommand has --publisher option", () => {
    const publishCmd = specialistPublishCommand.commands.find(
      (c: { name(): string }) => c.name() === "publish"
    );
    expect(publishCmd).toBeDefined();
    const opts = publishCmd!.options.map((o: { long: string }) => o.long);
    expect(opts).toContain("--publisher");
  });
});
