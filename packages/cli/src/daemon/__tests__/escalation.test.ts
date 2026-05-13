import type { EscalationRule } from "@argus/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EscalationDispatcher } from "../escalation.js";

describe("EscalationDispatcher", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches slack channel via fetch POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const rule: EscalationRule = {
      trigger: "budget > 80%",
      channel: "slack",
      contact: "https://hooks.slack.com/services/FAKE/WEBHOOK",
    };

    const dispatcher = new EscalationDispatcher();
    await dispatcher.dispatch(rule, {
      contractId: "c1",
      trigger: "budget > 80%",
      message: "Budget at 85%",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/services/FAKE/WEBHOOK");
    expect(JSON.parse(opts.body).text).toContain("Budget at 85%");
  });

  it("dispatches github channel via gh issue create", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal("Bun", {
      spawn: vi.fn().mockReturnValue({
        exited: Promise.resolve(0),
        stdout: new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode("https://github.com/org/repo/issues/99"));
            c.close();
          },
        }),
        stderr: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
      }),
    });

    const rule: EscalationRule = {
      trigger: "specialist_failed",
      channel: "github",
      contact: "org/repo",
    };

    const dispatcher = new EscalationDispatcher();
    await dispatcher.dispatch(rule, {
      contractId: "c1",
      trigger: "specialist_failed",
      message: "Specialist crashed",
    });

    expect(Bun.spawn as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
    const [cmd] = (Bun.spawn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(cmd).toContain("gh");
    expect(cmd).toContain("issue");
    expect(cmd).toContain("create");
  });

  it("email channel logs to console (no external call)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const rule: EscalationRule = {
      trigger: "budget > 80%",
      channel: "email",
      contact: "admin@example.com",
    };

    const dispatcher = new EscalationDispatcher();
    await dispatcher.dispatch(rule, {
      contractId: "c1",
      trigger: "budget > 80%",
      message: "Budget near limit",
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
