import { Command } from "commander";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import pc from "picocolors";
import { decryptKeyPair } from "@argus/lineage";
import { PublisherStore } from "@argus/core";
import { createBundle } from "../marketplace/bundle.js";

const DEFAULT_MARKETPLACE_DB = resolve(process.env["HOME"] ?? "~", ".argus", "marketplace.db");
const DEFAULT_KEYS_DIR = resolve(process.env["HOME"] ?? "~", ".argus", "publisher-keys");

const publishCmd = new Command("publish")
  .description("Pack and sign a specialist directory into a .tar.gz bundle")
  .argument("<path>", "Path to the specialist directory (must contain specialist.ts)")
  .requiredOption("--publisher <id>", "Publisher id (from argus publisher list)")
  .option("--passphrase <pass>", "Passphrase to decrypt the publisher key (use env ARGUS_PASSPHRASE)")
  .option("--out <dir>", "Output directory for the bundle (default: current directory)", ".")
  .action(async (specPath: string, opts: { publisher: string; passphrase?: string; out: string }) => {
    const passphrase = opts.passphrase ?? process.env["ARGUS_PASSPHRASE"];
    if (!passphrase) {
      console.error(pc.red("Error: --passphrase required (or set ARGUS_PASSPHRASE env var)"));
      process.exit(1);
    }

    const absSpecPath = resolve(specPath);
    if (!existsSync(absSpecPath) || !existsSync(join(absSpecPath, "specialist.ts"))) {
      console.error(pc.red(`specialist.ts not found in ${absSpecPath}`));
      process.exit(1);
    }

    const dbPath = process.env["ARGUS_MARKETPLACE_DB"] ?? DEFAULT_MARKETPLACE_DB;
    const store = new PublisherStore(dbPath);
    let publisher;
    try {
      publisher = store.getById(opts.publisher);
    } finally {
      store.close();
    }

    if (!publisher) {
      console.error(pc.red(`Publisher '${opts.publisher}' not found.`));
      process.exit(1);
    }

    const keyPath = join(DEFAULT_KEYS_DIR, `${opts.publisher}.key`);
    if (!existsSync(keyPath)) {
      console.error(pc.red(`Publisher key not found: ${keyPath}`));
      process.exit(1);
    }

    let kp;
    try {
      const keyBytes = readFileSync(keyPath);
      kp = decryptKeyPair(new Uint8Array(keyBytes.buffer, keyBytes.byteOffset, keyBytes.byteLength), passphrase);
    } catch {
      console.error(pc.red("Failed to decrypt publisher key: wrong passphrase?"));
      process.exit(1);
    }

    const mod = await import(join(absSpecPath, "specialist.ts")).catch(() => null);
    if (!mod?.default || typeof mod.default.name !== "string" || !Array.isArray(mod.default.contractKinds)) {
      console.error(pc.red("specialist.ts default export must have name, version, and contractKinds"));
      process.exit(1);
    }

    const s = mod.default;
    const outDir = resolve(opts.out);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const outputPath = join(outDir, `${s.name}-${s.version}.tar.gz`);

    console.log(pc.dim(`Packing ${s.name}@${s.version}...`));
    const manifest = await createBundle({
      sourceDir: absSpecPath,
      name: s.name as string,
      version: s.version as string,
      contractKinds: s.contractKinds as string[],
      publisherIdentity: { id: publisher.id, name: publisher.name, publicKeyHex: publisher.public_key_hex },
      privateKey: kp.privateKey,
      outputPath,
    });

    console.log(pc.green(`Bundle created: ${outputPath}`));
    console.log(`  name:     ${manifest.name}@${manifest.version}`);
    console.log(`  codeHash: ${manifest.codeHash.slice(0, 16)}...`);
  });

export const specialistPublishCommand = new Command("specialist")
  .description("Manage specialist bundles")
  .addCommand(publishCmd);
