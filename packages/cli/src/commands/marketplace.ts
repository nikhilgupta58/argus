import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PublisherStore } from "@argus/core";
import type { RevokedBundle } from "@argus/core";
import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_MARKETPLACE_DB = resolve(process.env.HOME ?? "~", ".argus", "marketplace.db");

function getStore(): PublisherStore {
  const dbPath = process.env.ARGUS_MARKETPLACE_DB ?? DEFAULT_MARKETPLACE_DB;
  const dir = resolve(dbPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return new PublisherStore(dbPath);
}

const revokeCmd = new Command("revoke")
  .description("Revoke a published bundle by its BLAKE3 hash")
  .argument("<bundleHash>", "BLAKE3 hex hash of the .tar.gz bundle to revoke")
  .option("--reason <reason>", "Human-readable reason for revocation")
  .action((bundleHash: string, opts: { reason?: string }) => {
    const store = getStore();
    try {
      if (store.isRevoked(bundleHash)) {
        console.warn(pc.yellow(`Bundle ${bundleHash.slice(0, 16)}... is already revoked.`));
        return;
      }
      store.revoke(bundleHash, opts.reason);
      console.log(pc.green(`Bundle revoked: ${bundleHash.slice(0, 16)}...`));
      if (opts.reason) console.log(`  reason: ${opts.reason}`);
    } finally {
      store.close();
    }
  });

const listRevokedCmd = new Command("list-revoked")
  .description("List all revoked bundle hashes")
  .action(() => {
    const store = getStore();
    let revoked: RevokedBundle[];
    try {
      revoked = store.getRevokedBundles();
    } finally {
      store.close();
    }
    if (revoked.length === 0) {
      console.log(pc.dim("No bundles revoked."));
      return;
    }
    for (const r of revoked) {
      console.log(
        `${pc.red(r.bundle_hash.slice(0, 16))}...  ${pc.dim(r.revoked_at)}  ${r.reason ?? ""}`,
      );
    }
  });

export const marketplaceCommand = new Command("marketplace")
  .description("Marketplace administration")
  .addCommand(revokeCmd)
  .addCommand(listRevokedCmd);
