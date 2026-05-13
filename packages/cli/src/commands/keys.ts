import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline";
import { decryptKeyPair, encryptKeyPair, generateKeyPair, keyPairToHex } from "@argus/lineage";
import { Command } from "commander";
import pc from "picocolors";

const KEYS_DIR = process.env.ARGUS_KEYS_DIR ?? `${process.env.HOME}/.argus/keys`;

function sanitizeTenant(tenant: string): string {
  const safe = basename(tenant);
  if (!safe || safe !== tenant || safe.includes("/") || safe.includes("\\")) {
    console.error(pc.red("Error: tenant name must not contain path separators"));
    process.exit(1);
  }
  return safe;
}

function keyPath(tenant: string): string {
  return resolve(KEYS_DIR, `${sanitizeTenant(tenant)}.key`);
}

function pubPath(tenant: string): string {
  return resolve(KEYS_DIR, `${sanitizeTenant(tenant)}.pub`);
}

function ensureKeysDir(): void {
  if (!existsSync(KEYS_DIR)) mkdirSync(KEYS_DIR, { recursive: true });
}

async function promptPassphrase(confirm = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => {
      process.stderr.write(q);
      // Disable echo if TTY
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
          } else if (ch === "") {
            process.exit(1);
          } else if (ch === "") {
            buf = buf.slice(0, -1);
          } else {
            buf += ch;
          }
        };
        process.stdin.on("data", onData);
        process.stdin.resume();
      } else {
        rl.question("", (ans) => {
          rl.close();
          resolve(ans);
        });
      }
    });

  const pass = await ask("Passphrase (hidden): ");
  if (confirm) {
    const pass2 = await ask("Confirm passphrase: ");
    if (pass !== pass2) {
      console.error(pc.red("Passphrases do not match."));
      process.exit(1);
    }
  }
  rl.close();
  if (!pass) {
    console.error(pc.red("Passphrase cannot be empty."));
    process.exit(1);
  }
  return pass;
}

export const keysCommand = new Command("keys").description("Manage signing keys");

keysCommand
  .command("generate [tenant]")
  .description("Generate a new Ed25519 signing key pair")
  .option("--passphrase <pass>", "Encryption passphrase (omit to be prompted)")
  .action(async (tenant, opts: { passphrase?: string }) => {
    let passphrase = opts.passphrase ?? process.env.ARGUS_PASSPHRASE;
    if (!passphrase) {
      passphrase = await promptPassphrase(true);
    } else if (opts.passphrase) {
      console.warn(
        pc.yellow(
          "  Warning: passing --passphrase on the command line may expose it in shell history. Prefer ARGUS_PASSPHRASE env var.",
        ),
      );
    }
    if (existsSync(keyPath(tenant))) {
      console.error(pc.red(`Key for '${tenant}' already exists. Use 'rotate' to replace it.`));
      process.exit(1);
    }
    ensureKeysDir();
    const kp = generateKeyPair();
    const encrypted = encryptKeyPair(kp, passphrase);
    const hex = keyPairToHex(kp);
    writeFileSync(keyPath(tenant), encrypted);
    writeFileSync(pubPath(tenant), `${hex.publicKey}\n`, "utf-8");
    console.log(pc.green(`✓ Key pair generated for tenant '${tenant}'`));
    console.log(`  public key:  ${hex.publicKey}`);
    console.log(`  private key: ${keyPath(tenant)} (encrypted)`);
    console.log(pc.yellow("  Store your passphrase safely — there is no recovery path."));
  });

keysCommand
  .command("rotate [tenant]")
  .description("Generate a new key pair, archiving the old one")
  .option("--passphrase <pass>", "Passphrase for new key (omit to be prompted)")
  .action(async (tenant, opts: { passphrase?: string }) => {
    let passphrase = opts.passphrase ?? process.env.ARGUS_PASSPHRASE;
    if (!passphrase) {
      passphrase = await promptPassphrase(true);
    } else if (opts.passphrase) {
      console.warn(
        pc.yellow(
          "  Warning: passing --passphrase on the command line may expose it in shell history. Prefer ARGUS_PASSPHRASE env var.",
        ),
      );
    }
    ensureKeysDir();
    const existing = keyPath(tenant);
    if (existsSync(existing)) {
      const archivePath = `${existing}.${Date.now()}.bak`;
      const data = readFileSync(existing);
      writeFileSync(archivePath, data);
      console.log(pc.yellow(`  Archived old key → ${archivePath}`));
    }
    const kp = generateKeyPair();
    const encrypted = encryptKeyPair(kp, passphrase);
    const hex = keyPairToHex(kp);
    writeFileSync(keyPath(tenant), encrypted);
    writeFileSync(pubPath(tenant), `${hex.publicKey}\n`, "utf-8");
    console.log(pc.green(`✓ Key rotated for tenant '${tenant}'`));
    console.log(`  new public key: ${hex.publicKey}`);
  });

keysCommand
  .command("export [tenant]")
  .description("Print the public key for a tenant")
  .action((tenant = "default") => {
    const path = pubPath(tenant);
    if (!existsSync(path)) {
      console.error(
        pc.red(`No key found for tenant '${tenant}'. Run 'argus keys generate' first.`),
      );
      process.exit(1);
    }
    const pubKey = readFileSync(path, "utf-8").trim();
    console.log(`${tenant}: ${pubKey}`);
  });
