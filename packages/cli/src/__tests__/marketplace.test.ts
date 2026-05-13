import { describe, it, expect } from "vitest";
import { marketplaceCommand } from "../commands/marketplace.js";

describe("marketplaceCommand", () => {
  it("is a Commander Command named 'marketplace'", () => {
    expect(marketplaceCommand).toBeDefined();
    expect(marketplaceCommand.name()).toBe("marketplace");
  });

  it("has a 'revoke' subcommand", () => {
    const names = marketplaceCommand.commands.map((c: { name(): string }) => c.name());
    expect(names).toContain("revoke");
  });

  it("revoke subcommand accepts a bundleHash argument", () => {
    const revokeCmd = marketplaceCommand.commands.find(
      (c: { name(): string }) => c.name() === "revoke"
    );
    expect(revokeCmd).toBeDefined();
    expect(revokeCmd!.registeredArguments.length).toBeGreaterThan(0);
  });
});
