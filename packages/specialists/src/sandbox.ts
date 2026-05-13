import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Result } from "@argus/core";
import type { SpecialistContext, SpecialistError, SpecialistOutput } from "./types.js";

const SANDBOX_TIMEOUT_MS = 30_000;
const workerPath = resolve(fileURLToPath(import.meta.url), "../sandbox-worker.ts");

export class BunSandbox {
  async run(
    entrypoint: string,
    ctx: SpecialistContext,
    timeoutMs = SANDBOX_TIMEOUT_MS,
  ): Promise<Result<SpecialistOutput, SpecialistError>> {
    let proc: ReturnType<typeof Bun.spawn> | null = null;
    const timeoutHandle = setTimeout(() => proc?.kill(), timeoutMs);

    try {
      proc = Bun.spawn(["bun", "run", workerPath, entrypoint], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });

      proc.stdin.write(JSON.stringify(ctx));
      proc.stdin.end();

      const exitCode = await proc.exited;
      clearTimeout(timeoutHandle);

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        return {
          ok: false,
          error: {
            code: "SANDBOX_ERROR",
            message: `Process exited with code ${exitCode}: ${stderr}`,
          },
        };
      }

      const stdout = await new Response(proc.stdout).text();
      return JSON.parse(stdout) as Result<SpecialistOutput, SpecialistError>;
    } catch (err: unknown) {
      clearTimeout(timeoutHandle);
      return { ok: false, error: { code: "SANDBOX_ERROR", message: String(err) } };
    }
  }
}
