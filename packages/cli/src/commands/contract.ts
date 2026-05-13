import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { ContractStore, contractHash, diffContracts, parseContract } from "@argus/core";
import { Command } from "commander";
import pc from "picocolors";

const DB_PATH = process.env.ARGUS_DB ?? `${process.env.HOME}/.argus/argus.db`;

function getStore(): ContractStore {
  const dir = DB_PATH.replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return new ContractStore(DB_PATH);
}

export const contractCommand = new Command("contract").description("Manage Outcome Contracts");

contractCommand
  .command("validate <file>")
  .description("Validate a contract TOML file")
  .action((file: string) => {
    let toml: string;
    try {
      toml = readFileSync(file, "utf-8");
    } catch {
      console.error(pc.red(`Error: cannot read file ${file}`));
      process.exit(1);
    }
    const result = parseContract(toml);
    if (result.ok) {
      console.log(pc.green("✓ Valid contract"));
      console.log(`  id:      ${result.value.id}`);
      console.log(`  version: ${result.value.version}`);
      console.log(`  kind:    ${result.value.kind}`);
      console.log(`  hash:    ${contractHash(result.value)}`);
    } else {
      console.error(pc.red(`✗ Invalid contract: ${result.error.message}`));
      process.exit(1);
    }
  });

contractCommand
  .command("create <file>")
  .description("Parse, validate, and persist a new contract from a TOML file")
  .action((file: string) => {
    let toml: string;
    try {
      toml = readFileSync(file, "utf-8");
    } catch {
      console.error(pc.red(`Error: cannot read file ${file}`));
      process.exit(1);
    }
    const result = parseContract(toml);
    if (!result.ok) {
      console.error(pc.red(`✗ Validation failed: ${result.error.message}`));
      process.exit(1);
    }
    const store = getStore();
    try {
      store.save(result.value);
    } catch (err: unknown) {
      store.close();
      const msg = String(err);
      if (msg.includes("UNIQUE constraint")) {
        console.error(
          pc.yellow(
            `Contract '${result.value.id}' v${result.value.version} already exists in the store.`,
          ),
        );
        console.error(
          pc.dim("  Bump the version field in the TOML, then use `argus contract edit` to update."),
        );
      } else {
        console.error(pc.red(`Failed to save contract: ${msg}`));
      }
      process.exit(1);
    }
    store.close();
    console.log(pc.green(`✓ Contract saved: ${result.value.id} v${result.value.version}`));
    console.log(`  hash: ${contractHash(result.value)}`);
  });

contractCommand
  .command("edit <file>")
  .description("Save a new version of an existing contract (bump version in file first)")
  .action((file: string) => {
    let toml: string;
    try {
      toml = readFileSync(file, "utf-8");
    } catch {
      console.error(pc.red(`Error: cannot read file ${file}`));
      process.exit(1);
    }
    const result = parseContract(toml);
    if (!result.ok) {
      console.error(pc.red(`✗ Validation failed: ${result.error.message}`));
      process.exit(1);
    }
    const store = getStore();
    const latest = store.loadLatest(result.value.id);
    if (!latest) {
      console.error(pc.red(`Contract '${result.value.id}' not found. Use 'create' first.`));
      store.close();
      process.exit(1);
    }
    if (latest.version === result.value.version) {
      console.error(
        pc.red(`Version ${result.value.version} already exists. Bump the version field.`),
      );
      store.close();
      process.exit(1);
    }
    store.save(result.value, latest.version);
    store.close();
    console.log(
      pc.green(
        `✓ Contract updated: ${result.value.id} v${latest.version} → v${result.value.version}`,
      ),
    );
    console.log(`  hash: ${contractHash(result.value)}`);
  });

contractCommand
  .command("show <id> [version]")
  .description("Show a contract from the store")
  .action((id: string, version?: string) => {
    const store = getStore();
    const contract = version ? store.load(id, version) : store.loadLatest(id);
    store.close();
    if (!contract) {
      console.error(pc.red(`Contract not found: ${id}${version ? `@${version}` : ""}`));
      process.exit(1);
    }
    console.log(pc.bold(`Contract: ${contract.id} v${contract.version}`));
    console.log(`  kind:     ${contract.kind}`);
    console.log(`  owner:    ${contract.owner}`);
    console.log(`  outcome:  ${contract.outcome}`);
    console.log(`  deadline: ${contract.deadline}`);
    console.log(pc.bold("\nSuccess Criteria:"));
    for (const sc of contract.success_criteria) {
      console.log(`  [${sc.name}] ${sc.metric} ${sc.operator} ${sc.target}`);
    }
    console.log(pc.bold("\nBudget:"));
    if (contract.budget.tokens) console.log(`  tokens: ${contract.budget.tokens}`);
    if (contract.budget.usd) console.log(`  usd: $${contract.budget.usd}`);
    console.log(`  hard_cap: ${contract.budget.hard_cap}`);
  });

contractCommand
  .command("diff <id> <versionA> <versionB>")
  .description("Show semantic diff between two versions of a contract")
  .action((id: string, versionA: string, versionB: string) => {
    const store = getStore();
    const a = store.load(id, versionA);
    const b = store.load(id, versionB);
    store.close();
    if (!a) {
      console.error(pc.red(`Version ${versionA} not found`));
      process.exit(1);
    }
    if (!b) {
      console.error(pc.red(`Version ${versionB} not found`));
      process.exit(1);
    }
    const changes = diffContracts(a, b);
    if (changes.length === 0) {
      console.log(pc.green("No semantic changes between versions"));
    } else {
      console.log(pc.bold(`Changes from ${versionA} → ${versionB}:`));
      for (const change of changes) {
        console.log(`  ${pc.yellow("~")} ${change}`);
      }
    }
  });
