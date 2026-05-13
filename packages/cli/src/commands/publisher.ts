import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PublisherStore } from "@argus/core";
import type { Publisher } from "@argus/core";
import { encryptKeyPair, generateKeyPair, keyPairToHex } from "@argus/lineage";
import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_MARKETPLACE_DB = resolve(process.env.HOME ?? "~", ".argus", "marketplace.db");
const DEFAULT_KEYS_DIR = resolve(process.env.HOME ?? "~", ".argus", "publisher-keys");

function getStore(): PublisherStore {
  const dbPath = process.env.ARGUS_MARKETPLACE_DB ?? DEFAULT_MARKETPLACE_DB;
  const dir = resolve(dbPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return new PublisherStore(dbPath);
}

function ensureKeysDir(): void {
  if (!existsSync(DEFAULT_KEYS_DIR)) mkdirSync(DEFAULT_KEYS_DIR, { recursive: true });
}

const registerCmd = new Command("register")
  .description("Register a new publisher identity (generates an Ed25519 keypair)")
  .requiredOption("--name <display-name>", "Human-readable publisher display name")
  .option(
    "--passphrase <pass>",
    "Passphrase to encrypt the private key (use env ARGUS_PASSPHRASE in production)",
  )
  .action((opts: { name: string; passphrase?: string }) => {
    const passphrase = opts.passphrase ?? process.env.ARGUS_PASSPHRASE;
    if (!passphrase) {
      console.error(pc.red("Error: --passphrase required (or set ARGUS_PASSPHRASE env var)"));
      process.exit(1);
    }
    if (opts.passphrase) {
      console.warn(
        pc.yellow(
          "  Warning: passing --passphrase on the command line may expose it in shell history.",
        ),
      );
    }

    const id = `pub-${randomBytes(8).toString("hex")}`;
    const kp = generateKeyPair();
    const encrypted = encryptKeyPair(kp, passphrase);
    const hex = keyPairToHex(kp);

    ensureKeysDir();
    writeFileSync(join(DEFAULT_KEYS_DIR, `${id}.key`), encrypted);
    writeFileSync(join(DEFAULT_KEYS_DIR, `${id}.pub`), `${hex.publicKey}\n`, "utf-8");

    const store = getStore();
    try {
      store.register({
        id,
        name: opts.name,
        public_key_hex: hex.publicKey,
        created_at: new Date().toISOString(),
      });
    } finally {
      store.close();
    }

    console.log(pc.green("Publisher registered"));
    console.log(`  id:          ${id}`);
    console.log(`  name:        ${opts.name}`);
    console.log(`  public key:  ${hex.publicKey}`);
    console.log(pc.yellow("  Store your passphrase safely — there is no recovery path."));
  });

const listCmd = new Command("list").description("List all registered publishers").action(() => {
  const store = getStore();
  let publishers: Publisher[];
  try {
    publishers = store.list();
  } finally {
    store.close();
  }

  if (publishers.length === 0) {
    console.log(pc.dim("No publishers registered."));
    return;
  }
  for (const p of publishers) {
    console.log(
      `${pc.green(p.name)}  ${pc.dim(p.id)}  pubkey: ${p.public_key_hex.slice(0, 16)}...`,
    );
  }
});

export const publisherCommand = new Command("publisher")
  .description("Manage publisher identities")
  .addCommand(registerCmd)
  .addCommand(listCmd);
