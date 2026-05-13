import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { Command } from "commander";
import pc from "picocolors";

function ask(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultValue?: string,
): Promise<string> {
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${question} (${pc.dim(defaultValue)}): ` : `${question}: `;
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

function askYesNo(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultYes = true,
): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(`${question} [${hint}]: `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (!a) resolve(defaultYes);
      else resolve(a === "y" || a === "yes");
    });
  });
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "my-contract"
  );
}

function sixMonthsFromNow(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export const initCommand = new Command("init")
  .description("Interactive setup wizard — create your first Argus contract in under 5 minutes")
  .option("--out <path>", "Output path for the contract file", ".")
  .action(async (opts: { out: string }) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    console.log();
    console.log(pc.bold("Welcome to Argus! Let's set up your first outcome contract."));
    console.log(pc.dim("Press Enter to accept the default (shown in grey).\n"));

    try {
      // Step 1: Outcome
      const outcome = await ask(
        rl,
        pc.cyan("What should your agent accomplish?"),
        "Draft outreach emails to 10 potential customers",
      );

      // Step 2: Deadline
      const defaultDeadline = sixMonthsFromNow().slice(0, 10); // YYYY-MM-DD
      const deadlineInput = await ask(
        rl,
        pc.cyan("What's the deadline? (YYYY-MM-DD)"),
        defaultDeadline,
      );
      const deadline = /^\d{4}-\d{2}-\d{2}$/.test(deadlineInput)
        ? `${deadlineInput}T00:00:00Z`
        : `${defaultDeadline}T00:00:00Z`;

      // Step 3: Budget
      const budgetUsd = await ask(rl, pc.cyan("Maximum budget in USD"), "10");
      const budgetTokens = await ask(rl, pc.cyan("Maximum LLM tokens"), "500000");

      // Step 4: Alert contact
      console.log();
      console.log(pc.dim("When should Argus alert you? (e.g. when budget hits 80%)"));
      const alertContact = await ask(
        rl,
        pc.cyan("Your email or Slack channel for alerts"),
        "you@example.com",
      );
      const alertChannel = alertContact.startsWith("#") ? "slack" : "email";

      // Step 5: Owner
      const owner = await ask(
        rl,
        pc.cyan("Your email address (contract owner)"),
        "you@example.com",
      );

      // Derive contract id and filename
      const contractId = slugify(outcome);
      const filename = `${contractId}.toml`;
      const outDir = resolve(opts.out);
      const outPath = resolve(outDir, filename);

      if (existsSync(outPath)) {
        const overwrite = await askYesNo(
          rl,
          pc.yellow(`${filename} already exists. Overwrite?`),
          false,
        );
        if (!overwrite) {
          console.log(pc.dim("Aborted. No files written."));
          rl.close();
          return;
        }
      }

      // Generate TOML
      const usd = Number.parseFloat(budgetUsd) || 10;
      const tokens = Number.parseInt(budgetTokens) || 500000;

      const toml = `id = "${contractId}"
version = "1.0.0"
kind = "outbound"
owner = "${owner}"
outcome = "${outcome.replace(/"/g, '\\"')}"
deadline = "${deadline}"

[[success_criteria]]
name = "primary_goal"
metric = "outcome_reached"
target = 1
operator = "gte"
measurement = "manual"

[budget]
tokens = ${tokens}
usd = ${usd}
hard_cap = true

[[escalation]]
trigger = "budget > 80%"
channel = "${alertChannel}"
contact = "${alertContact}"
`;

      writeFileSync(outPath, toml, "utf-8");

      console.log();
      console.log(pc.green(`✓ Contract written to ${outPath}`));
      console.log();
      console.log(pc.bold("Next steps:"));
      console.log(`  1. Review and edit ${pc.cyan(filename)} if needed`);
      console.log(`  2. ${pc.cyan("argus contract create")} ${filename}`);
      console.log(`  3. ${pc.cyan("argus keys generate")} myagent`);
      console.log(`  4. ${pc.cyan("argus daemon start")} --key ~/.argus/myagent.key`);
      console.log();
      console.log(pc.dim("  Run 'argus --help' to see all available commands."));
    } finally {
      rl.close();
    }
  });
