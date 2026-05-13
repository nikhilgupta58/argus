import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { ContractStore, parseContract } from "@argus/core";
import { encryptKeyPair, generateKeyPair, keyPairToHex } from "@argus/lineage";
import { Command } from "commander";
import pc from "picocolors";

const ARGUS_DIR = resolve(process.env.HOME ?? "~", ".argus");
const CONTRACTS_DIR = resolve(ARGUS_DIR, "contracts");
const KEYS_DIR = resolve(ARGUS_DIR, "keys");
const DB_PATH = process.env.ARGUS_DB ?? resolve(ARGUS_DIR, "argus.db");
const DEFAULT_KEY_PATH = resolve(KEYS_DIR, "default.key");

type Rl = ReturnType<typeof createInterface>;

function ask(rl: Rl, question: string, defaultValue?: string): Promise<string> {
  return new Promise((res) => {
    const hint = defaultValue ? ` ${pc.dim(`(${defaultValue})`)}` : "";
    rl.question(`${question}${hint}: `, (ans) => res(ans.trim() || defaultValue || ""));
  });
}

function askChoice(rl: Rl, question: string, choices: string[]): Promise<number> {
  return new Promise((res) => {
    console.log(`\n${question}`);
    choices.forEach((c, i) => console.log(`  ${pc.cyan(String(i + 1))}. ${c}`));
    rl.question("\nYour choice: ", (ans) => {
      const n = Number.parseInt(ans.trim(), 10);
      if (n >= 1 && n <= choices.length) return res(n - 1);
      res(0);
    });
  });
}

function askYesNo(rl: Rl, question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  return new Promise((res) => {
    rl.question(`${question} [${hint}] `, (ans) => {
      const a = ans.trim().toLowerCase();
      if (!a) return res(defaultYes);
      res(a === "y" || a === "yes");
    });
  });
}

async function promptPassphrase(rl: Rl): Promise<string> {
  return new Promise((res) => {
    process.stdout.write("  Choose a passphrase to protect your key (hidden): ");
    if ((process.stdin as NodeJS.ReadStream).isTTY) {
      (process.stdin as NodeJS.ReadStream).setRawMode(true);
      let buf = "";
      process.stdin.setEncoding("utf8");
      const onData = (ch: string) => {
        if (ch === "\r" || ch === "\n") {
          process.stdin.removeListener("data", onData);
          (process.stdin as NodeJS.ReadStream).setRawMode(false);
          process.stdout.write("\n");
          res(buf);
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
      rl.question("", (ans) => res(ans));
    }
  });
}

function slugify(text: string): string {
  return (
    text
      .replace(/\S+@\S+\.\S+/g, "") // strip emails
      .replace(/https?:\/\/\S+/g, "") // strip URLs
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join("-")
      .slice(0, 32) || "my-contract"
  );
}

function inferKind(outcome: string): string {
  const o = outcome.toLowerCase();
  if (/client|lead|sales|outreach|customer|freelance|prospect/.test(o)) return "outbound";
  if (/report|weekly|daily|summary|monitor|digest/.test(o)) return "reporting";
  if (/pr|pull.?request|code.?review|review/.test(o)) return "review";
  return "outbound";
}

function monthsFromNow(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

export const initCommand = new Command("init")
  .description("Interactive setup wizard — create your first Argus agent in under 5 minutes")
  .action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    console.log();
    console.log(pc.bold("  Welcome to Argus"));
    console.log(pc.dim("  Let's get your first AI agent set up. Takes about 2 minutes.\n"));

    try {
      // ── Step 1: Outcome ───────────────────────────────────────────────────
      console.log(pc.bold("Step 1 of 4 — What do you want your agent to do?"));
      const outcome = await ask(
        rl,
        pc.cyan("  Describe the goal"),
        "Find 3 potential freelance clients this week",
      );
      console.log();

      // ── Step 2: Schedule ──────────────────────────────────────────────────
      console.log(pc.bold("Step 2 of 4 — How often should it run?"));
      const scheduleIdx = await askChoice(rl, "", [
        "Every day at 9am",
        "Every Monday at 9am",
        "Every hour",
        "On demand only (you trigger it manually)",
      ]);
      const cronMap = ["0 9 * * *", "0 9 * * 1", "0 * * * *", ""];
      const cronExpr = cronMap[scheduleIdx] ?? "";
      const scheduleLabel = ["daily at 9am", "every Monday at 9am", "every hour", "on demand"][
        scheduleIdx
      ];
      console.log();

      // ── Step 3: Budget & deadline ─────────────────────────────────────────
      console.log(pc.bold("Step 3 of 4 — Budget & deadline"));
      const budgetUsd = await ask(rl, pc.cyan("  Max spend in USD"), "5");
      const deadlineDefault = monthsFromNow(3);
      const deadlineInput = await ask(rl, pc.cyan("  Deadline (YYYY-MM-DD)"), deadlineDefault);
      const deadline = /^\d{4}-\d{2}-\d{2}$/.test(deadlineInput)
        ? `${deadlineInput}T00:00:00Z`
        : `${deadlineDefault}T00:00:00Z`;
      const alertEmail = await ask(
        rl,
        pc.cyan("  Alert email when budget hits 80%"),
        "you@example.com",
      );
      console.log();

      // ── Step 4: Owner ─────────────────────────────────────────────────────
      console.log(pc.bold("Step 4 of 4 — About you"));
      const owner = await ask(rl, pc.cyan("  Your email address"), alertEmail);
      console.log();

      // ── Derive IDs ────────────────────────────────────────────────────────
      const contractId = slugify(outcome);
      const kind = inferKind(outcome);
      const usd = Number.parseFloat(budgetUsd) || 5;

      const toml = [
        `id = "${contractId}"`,
        `version = "1.0.0"`,
        `kind = "${kind}"`,
        `owner = "${owner}"`,
        `outcome = "${outcome.replace(/"/g, '\\"')}"`,
        `deadline = "${deadline}"`,
        "",
        "[[success_criteria]]",
        `name = "primary_goal"`,
        `metric = "outcome_reached"`,
        "target = 1",
        `operator = "gte"`,
        `measurement = "manual"`,
        "",
        "[budget]",
        `usd = ${usd}`,
        "tokens = 500000",
        "hard_cap = true",
        "",
        "[[escalation]]",
        `trigger = "budget > 80%"`,
        `channel = "email"`,
        `contact = "${alertEmail}"`,
        ...(cronExpr
          ? ["", "[metadata]", `cron = "${cronExpr}"`]
          : ["", "# To schedule this contract, add:", "# [metadata]", `# cron = "0 9 * * *"`]),
      ].join("\n");

      // ── Show summary ──────────────────────────────────────────────────────
      console.log(pc.bold("  Here's what I'll create:\n"));
      console.log(`  ${pc.cyan("Goal:")}      ${outcome}`);
      console.log(`  ${pc.cyan("Schedule:")}  ${scheduleLabel}`);
      console.log(`  ${pc.cyan("Budget:")}    $${usd} max`);
      console.log(`  ${pc.cyan("Deadline:")}  ${deadline.slice(0, 10)}`);
      console.log(`  ${pc.cyan("Alerts:")}    ${alertEmail}`);
      console.log();

      const confirmed = await askYesNo(rl, "  Looks good?");
      if (!confirmed) {
        console.log(pc.dim("  Cancelled. Run `argus init` to start over."));
        rl.close();
        return;
      }
      console.log();

      // ── Write contract TOML ───────────────────────────────────────────────
      ensureDir(CONTRACTS_DIR);
      const tomlPath = resolve(CONTRACTS_DIR, `${contractId}.toml`);
      writeFileSync(tomlPath, toml, "utf-8");

      // ── Save to contract store ────────────────────────────────────────────
      ensureDir(ARGUS_DIR);
      const parsed = parseContract(toml);
      if (parsed.ok) {
        const store = new ContractStore(DB_PATH);
        store.save(parsed.value);
        store.close();
        console.log(pc.green("  ✓ Contract saved"));
        console.log(pc.dim(`    ${tomlPath}`));
      } else {
        console.log(
          pc.yellow(
            `  ⚠ Contract written but could not be saved to store: ${parsed.error.message}`,
          ),
        );
      }
      console.log();

      // ── Generate key ──────────────────────────────────────────────────────
      let keyGenerated = false;
      if (!existsSync(DEFAULT_KEY_PATH)) {
        const genKey = await askYesNo(rl, "  Generate a signing key for your agent?");
        if (genKey) {
          const passphrase = await promptPassphrase(rl);
          if (!passphrase) {
            console.log(pc.yellow("  Skipping key generation — passphrase was empty."));
          } else {
            ensureDir(KEYS_DIR);
            const kp = generateKeyPair();
            const encrypted = encryptKeyPair(kp, passphrase);
            const hex = keyPairToHex(kp);
            writeFileSync(DEFAULT_KEY_PATH, encrypted);
            writeFileSync(resolve(KEYS_DIR, "default.pub"), `${hex.publicKey}\n`, "utf-8");
            console.log(pc.green("  ✓ Signing key generated"));
            console.log(pc.dim(`    ${DEFAULT_KEY_PATH}`));
            console.log(pc.dim("    Keep your passphrase safe — it cannot be recovered."));
            keyGenerated = true;
          }
        }
      } else {
        console.log(pc.dim("  Signing key already exists — skipping key generation."));
        keyGenerated = true;
      }
      console.log();

      // ── Next steps ────────────────────────────────────────────────────────
      console.log(pc.bold("  You're all set!\n"));
      if (cronExpr && keyGenerated) {
        console.log("  Start your agent:");
        console.log(`  ${pc.cyan("argus daemon start")} --key ${DEFAULT_KEY_PATH}`);
        console.log();
        console.log(
          pc.dim(
            `  The agent will run ${scheduleLabel} and keep a signed record of everything it does.`,
          ),
        );
      } else if (!keyGenerated) {
        console.log("  Next, generate a signing key:");
        console.log(`  ${pc.cyan("argus keys generate")} default`);
        console.log();
        console.log("  Then start the daemon:");
        console.log(`  ${pc.cyan("argus daemon start")} --key ${DEFAULT_KEY_PATH}`);
      } else {
        console.log("  Your contract is saved. To run it manually:");
        console.log(`  ${pc.cyan("argus daemon start")} --key ${DEFAULT_KEY_PATH}`);
        console.log();
        console.log(`  To add a schedule later, edit ${pc.dim(tomlPath)} and add:`);
        console.log(`  ${pc.dim("[metadata]")}`);
        console.log(`  ${pc.dim('cron = "0 9 * * *"')}  ${pc.dim("# runs daily at 9am")}`);
        console.log(`  Then: ${pc.cyan("argus contract edit")} ${tomlPath}`);
      }
      console.log();
      console.log(pc.dim("  See all commands: argus --help"));
      console.log(pc.dim(`  View your contract: argus contract show ${contractId}`));
    } finally {
      rl.close();
    }
  });
