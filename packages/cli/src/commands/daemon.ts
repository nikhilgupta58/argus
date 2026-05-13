import { resolve } from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { DaemonRunner } from "../daemon/runner.js";

const DEFAULT_DB = resolve(process.env.HOME ?? "~", ".argus", "argus.db");
const DEFAULT_LINEAGE_DB = resolve(process.env.HOME ?? "~", ".argus", "lineage.db");
const DEFAULT_REGISTRY = resolve(process.env.HOME ?? "~", ".argus", "registry.json");

const runner = new DaemonRunner();

const startCmd = new Command("start")
  .description("Start the Argus daemon (cron scheduler)")
  .option("--db <path>", "Path to the contracts SQLite database", DEFAULT_DB)
  .option("--lineage-db <path>", "Path to the lineage SQLite database", DEFAULT_LINEAGE_DB)
  .option("--registry <path>", "Path to the specialist registry", DEFAULT_REGISTRY)
  .option("--key <path>", "Path to the signing key file (required)")
  .option(
    "--passphrase <passphrase>",
    "Passphrase for the signing key (prefer ARGUS_PASSPHRASE env var)",
  )
  .action(
    async (opts: {
      db: string;
      lineageDb: string;
      registry: string;
      key?: string;
      passphrase?: string;
    }) => {
      if (!opts.key) {
        console.error(pc.red("--key is required"));
        process.exit(1);
      }
      const passphrase = process.env.ARGUS_PASSPHRASE ?? opts.passphrase ?? "";
      if (!passphrase) {
        console.error(pc.red("--passphrase or ARGUS_PASSPHRASE env var is required"));
        process.exit(1);
      }
      if (opts.passphrase) {
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
