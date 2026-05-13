import { describe, expect, it } from "vitest";
import { contractCommand } from "../commands/contract.js";

describe("contractCommand", () => {
  it("is a commander Command named 'contract'", () => {
    expect(contractCommand.name()).toBe("contract");
  });

  it("has create, edit, validate, show, diff subcommands", () => {
    const names = contractCommand.commands.map((c) => c.name());
    expect(names).toContain("create");
    expect(names).toContain("edit");
    expect(names).toContain("validate");
    expect(names).toContain("show");
    expect(names).toContain("diff");
  });
});
