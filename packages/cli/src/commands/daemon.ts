import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { Command } from "commander";
import pc from "picocolors";
import { DaemonRunner } from "../daemon/runner.js";

const ARGUS_DIR = resolve(process.env.HOME ?? "~", ".argus");
const DEFAULT_DB = process.env.ARGUS_DB ?? resolve(ARGUS_DIR, "argus.db");
const DEFAULT_LINEAGE_DB = resolve(ARGUS_DIR, "lineage.db");
const DEFAULT_REGISTRY = resolve(ARGUS_DIR, "registry.json");
const DEFAULT_KEY = resolve(ARGUS_DIR, "keys", "default.key");

const runner = new DaemonRunner();

async function promptPassphrase(): Promise<string> {
  return new Promise((resolve) => {
    process.stderr.write("Key passphrase (hidden): ");
    if ((process.stdin as NodeJS.ReadStream).isTTY) {
      (process.stdin as NodeJS.ReadStream).setRawMode(true);
      let buf = "";
      process.stdin.setEncoding("utf8");
      const onData = (ch: string) => {
        if (ch === "\r" || ch === "\n") {
          process.stdin.removeListener("data", onData);
          (process.stdin as NodeJS.ReadStream).setRawMode(false);
          process.stderr.write("\n");
          resolve(buf);
        } else if (ch === "") {
          process.exit(1);
        } else if (ch === "") {
          buf = buf.slice(0, -1);
        } else {
          buf += ch;
        }
      };
      process.stdin.on("data", onData);
      process.stdin.resume();
    } else {
      const rl = createInterface({ input: process.stdin });
      rl.question("", (ans) => {
        rl.close();
        resolve(ans);
      });
    }
  });
}

const startCmd = new Command("start")
  .description("Start the Argus daemon (cron scheduler)")
  .option("--db <path>", "Path to the contracts SQLite database", DEFAULT_DB)
  .option("--lineage-db <path>", "Path to the lineage SQLite database", DEFAULT_LINEAGE_DB)
  .option("--registry <path>", "Path to the specialist registry", DEFAULT_REGISTRY)
  .option("--key <path>", "Path to the signing key file", DEFAULT_KEY)
  .option(
    "--passphrase <passphrase>",
    "Passphrase for the signing key (omit to be prompted; prefer ARGUS_PASSPHRASE env var)",
  )
  .action(
    async (opts: {
      db: string;
      lineageDb: string;
      registry: string;
      key?: string;
      passphrase?: string;
    }) => {
      if (!opts.key || !existsSync(opts.key)) {
        console.error(pc.red(`Key file not found: ${opts.key ?? DEFAULT_KEY}`));
        console.error(
          pc.dim("  Run `argus keys generate default` to create one, or pass --key <path>"),
        );
        process.exit(1);
      }
      let passphrase = process.env.ARGUS_PASSPHRASE ?? opts.passphrase;
      if (!passphrase) {
        passphrase = await promptPassphrase();
      } else if (opts.passphrase) {
        console.warn(
          pc.yellow(
            "Warning: passing --passphrase on the command line may expose it in shell history. Use ARGUS_PASSPHRASE env var instead.",
          ),
        );
      }

      try {
        await runner.start({
          dbPath: opts.db,
          lineageDbPath: opts.lineageDb,
          registryPath: opts.registry,
          keyPath: opts.key,
          passphrase,
        });
        process.on("SIGINT", () => {
          runner.stop();
          process.exit(0);
        });
        process.on("SIGTERM", () => {
          runner.stop();
          process.exit(0);
        });
      } catch (err: unknown) {
        console.error(pc.red(`Daemon failed to start: ${String(err)}`));
        process.exit(1);
      }
    },
  );

const stopCmd = new Command("stop")
  .description("Stop the daemon (send SIGTERM to the daemon process)")
  .action(() => {
    console.log(pc.dim("Send SIGTERM or Ctrl+C to the running daemon process to stop it."));
  });

export const daemonCommand = new Command("daemon")
  .description("Argus initiative engine — cron-driven specialist runner")
  .addCommand(startCmd)
  .addCommand(stopCmd);
