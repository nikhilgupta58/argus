import { beforeEach, describe, expect, it, vi } from "vitest";
import { BunSandbox } from "../sandbox.js";
import type { SpecialistContext, SpecialistOutput } from "../types.js";

const makeCtx = (): SpecialistContext => ({
  contractId: "c1",
  contractKind: "outbound",
  contract: {} as never,
  invocationId: "inv-1",
  budgetRemaining: { tokens: 100 },
});

describe("BunSandbox", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed result from subprocess stdout", async () => {
    const output: SpecialistOutput = { summary: "done", tokensUsed: 10 };
    const result = { ok: true, value: output };
    const encoder = new TextEncoder();

    vi.stubGlobal("Bun", {
      spawn: vi.fn().mockReturnValue({
        exited: Promise.resolve(0),
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(JSON.stringify(result)));
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
      }),
    });

    const sandbox = new BunSandbox();
    const r = await sandbox.run("/fake/specialist.js", makeCtx());
    expect(r).toEqual(result);
  });

  it("returns SANDBOX_ERROR when process exits non-zero", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal("Bun", {
      spawn: vi.fn().mockReturnValue({
        exited: Promise.resolve(1),
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode("ReferenceError: x is not defined"));
            controller.close();
          },
        }),
      }),
    });

    const sandbox = new BunSandbox();
    const r = await sandbox.run("/fake/specialist.js", makeCtx());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("SANDBOX_ERROR");
      expect(r.error.message).toContain("code 1");
    }
  });

  it("returns SANDBOX_ERROR on spawn exception", async () => {
    vi.stubGlobal("Bun", {
      spawn: vi.fn().mockImplementation(() => {
        throw new Error("spawn failed");
      }),
    });

    const sandbox = new BunSandbox();
    const r = await sandbox.run("/fake/specialist.js", makeCtx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SANDBOX_ERROR");
  });
});
