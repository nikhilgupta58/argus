import { describe, it, expect } from "vitest";
import { DaemonRunner } from "../runner.js";

describe("DaemonRunner", () => {
  it("starts with isRunning() = false", () => {
    const runner = new DaemonRunner();
    expect(runner.isRunning()).toBe(false);
  });

  it("throws if started twice without stopping", async () => {
    const runner = new DaemonRunner();
    (runner as unknown as Record<string, unknown>)["running"] = true;
    await expect(
      runner.start({
        dbPath: ":memory:",
        lineageDbPath: ":memory:",
        registryPath: "/tmp/fake-registry.json",
        keyPath: "/nonexistent/key.bin",
        passphrase: "test",
      }),
    ).rejects.toThrow("Daemon already running");
  });

  it("stop() sets isRunning() to false", () => {
    const runner = new DaemonRunner();
    (runner as unknown as Record<string, unknown>)["running"] = true;
    runner.stop();
    expect(runner.isRunning()).toBe(false);
  });
});
