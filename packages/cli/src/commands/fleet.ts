import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import { SpecialistRegistry, computeManifestHash, computeCodeHash } from "@argus/specialists";
import type { SpecialistManifest } from "@argus/specialists";

const DEFAULT_REGISTRY = resolve(process.env["HOME"] ?? "~", ".argus", "registry.json");

function getRegistry(): SpecialistRegistry {
  return new SpecialistRegistry(DEFAULT_REGISTRY);
}

const listCmd = new Command("list")
  .description("List all installed specialists")
  .action(() => {
    const reg = getRegistry();
    const specialists = reg.list();
    if (specialists.length === 0) {
      console.log(pc.dim("No specialists installed."));
      return;
    }
    for (const s of specialists) {
      console.log(
        `${pc.green(s.name)}@${pc.cyan(s.version)}  ${pc.dim(s.manifestHash.slice(0, 12))}  kinds: ${s.contractKinds.join(", ")}`
      );
    }
  });

const installCmd = new Command("install")
  .description("Install a specialist from a file path (content-addressed)")
  .argument("<path>", "Path to the specialist module")
  .action(async (specPath: string) => {
    const absPath = resolve(specPath);
    if (!existsSync(absPath)) {
      console.error(pc.red(`File not found: ${absPath}`));
      process.exit(1);
    }

    const fileBuffer = readFileSync(absPath);
    const fileBytes = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
    const codeHash = computeCodeHash(fileBytes);

    const mod = await import(absPath).catch(() => null);
    if (!mod?.default) {
      console.error(pc.red("Specialist module has no default export"));
      process.exit(1);
    }

    const s = mod.default;
    if (typeof s.name !== "string" || typeof s.version !== "string" || !Array.isArray(s.contractKinds)) {
      console.error(pc.red("Specialist default export must have name, version, and contractKinds"));
      process.exit(1);
    }

    const base = {
      name: s.name as string,
      version: s.version as string,
      contractKinds: s.contractKinds as string[],
      entrypoint: absPath,
      codeHash,
    };
    const manifestHash = computeManifestHash(base);
    const manifest: SpecialistManifest = { ...base, manifestHash };

    const reg = getRegistry();
    reg.add(manifest);
    console.log(pc.green(`Installed ${s.name}@${s.version} (${manifestHash.slice(0, 12)})`));
  });

const removeCmd = new Command("remove")
  .description("Remove a specialist by manifest hash prefix")
  .argument("<hash>", "Manifest hash (or prefix) of the specialist to remove")
  .action((hash: string) => {
    const reg = getRegistry();
    const match = reg.list().find((m) => m.manifestHash.startsWith(hash));
    if (!match) {
      console.error(pc.red(`No specialist found matching hash: ${hash}`));
      process.exit(1);
    }
    reg.remove(match.manifestHash);
    console.log(pc.green(`Removed ${match.name}@${match.version}`));
  });

export const fleetCommand = new Command("fleet")
  .description("Manage installed specialists")
  .addCommand(listCmd)
  .addCommand(installCmd)
  .addCommand(removeCmd);
