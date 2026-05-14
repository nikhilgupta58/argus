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
    const hint = defaultValue ? pc.dim(` (or press Enter for: ${defaultValue})`) : "";
    rl.question(`${question}${hint}: `, (ans) => res(ans.trim() || defaultValue || ""));
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

async function promptPassphrase(): Promise<string> {
  return new Promise((res) => {
    process.stdout.write("  Create a password to protect your key (hidden): ");
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
        res(ans);
      });
    }
  });
}

// ── Plain-English Parser ───────────────────────────────────────────────────────

function extractEmail(text: string): string {
  const m = text.match(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i);
  return m ? m[0] : "";
}

function extractBudget(text: string): number {
  // "$20", "20 dollars", "budget 50", "usd 100"
  const m =
    text.match(/\$\s*(\d+(?:\.\d+)?)/i) ??
    text.match(/(\d+(?:\.\d+)?)\s*(?:dollars?|usd)/i) ??
    text.match(/budget\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
  return m ? Number.parseFloat(m[1]) : 5;
}

function extractDeadline(text: string): string {
  const t = text.toLowerCase();
  const now = new Date();

  // "this week" → next Sunday
  if (t.includes("this week") || t.includes("end of week")) {
    const d = new Date(now);
    d.setDate(d.getDate() + (7 - d.getDay()));
    return d.toISOString().slice(0, 10);
  }
  // "next week"
  if (t.includes("next week")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 14 - d.getDay());
    return d.toISOString().slice(0, 10);
  }
  // "this month" / "end of month"
  if (t.includes("this month") || t.includes("end of month")) {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
  }
  // "next month"
  if (t.includes("next month")) {
    const d = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    return d.toISOString().slice(0, 10);
  }
  // "in N days/weeks/months"
  const inMatch = t.match(/in\s+(\d+)\s+(day|week|month)/);
  if (inMatch) {
    const n = Number.parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const d = new Date(now);
    if (unit === "day") d.setDate(d.getDate() + n);
    else if (unit === "week") d.setDate(d.getDate() + n * 7);
    else d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 10);
  }
  // "by June", "by end of June", "by June 30"
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  for (let i = 0; i < months.length; i++) {
    if (t.includes(months[i])) {
      const dayMatch = t.match(new RegExp(`${months[i]}\\s+(\\d{1,2})`));
      const day = dayMatch ? Number.parseInt(dayMatch[1], 10) : 0;
      const year = now.getMonth() > i ? now.getFullYear() + 1 : now.getFullYear();
      const d = day ? new Date(year, i, day) : new Date(year, i + 1, 0); // last day of month
      return d.toISOString().slice(0, 10);
    }
  }
  // "YYYY-MM-DD" literal
  const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) return dateMatch[1];

  // default: 3 months
  const d = new Date(now);
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

function extractSchedule(text: string): { cron: string; label: string } {
  const t = text.toLowerCase();
  if (t.includes("every hour") || t.includes("hourly"))
    return { cron: "0 * * * *", label: "every hour" };
  if (t.includes("every day") || t.includes("daily"))
    return { cron: "0 9 * * *", label: "every day at 9am" };
  if (t.includes("every week") || t.includes("weekly") || t.includes("every monday"))
    return { cron: "0 9 * * 1", label: "every Monday at 9am" };
  // default: daily
  return { cron: "0 9 * * *", label: "every day at 9am" };
}

function inferKind(text: string): string {
  const t = text.toLowerCase();
  if (/client|lead|sales|outreach|customer|freelance|prospect|demo/.test(t)) return "outbound";
  if (/report|weekly|daily|summary|monitor|digest/.test(t)) return "reporting";
  if (/pr|pull.?request|code.?review/.test(t)) return "review";
  return "outbound";
}

function slugify(text: string): string {
  return (
    text
      .replace(/\S+@\S+\.\S+/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\$\d+/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join("-")
      .slice(0, 32) || "my-contract"
  );
}

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function friendlyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ── Command ────────────────────────────────────────────────────────────────────

export const initCommand = new Command("init")
  .description("Set up your first Argus agent — just describe what you want in plain English")
  .action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    console.log();
    console.log(pc.bold("  Hi! I'm Argus."));
    console.log(
      `  Tell me what you want your agent to do — in your own words.\n${pc.dim("  Include your email, budget, and deadline if you know them.\n")}`,
    );
    console.log(
      pc.dim(
        "  Example: find me 3 freelance clients by end of June, budget $20, email me at hi@me.com\n",
      ),
    );

    try {
      // ── Step 1: free-form input ──────────────────────────────────────────
      const raw = await ask(rl, pc.cyan("  What do you want?"));
      if (!raw) {
        console.log(pc.dim("\n  Nothing entered. Run `argus init` to try again."));
        rl.close();
        return;
      }
      console.log();

      // ── Parse ────────────────────────────────────────────────────────────
      const email = extractEmail(raw);
      const budget = extractBudget(raw);
      const deadline = extractDeadline(raw);
      const schedule = extractSchedule(raw);
      const kind = inferKind(raw);
      const contractId = slugify(raw);

      // strip email address, budget phrase, and contact-me trailing words from outcome
      const outcome = raw
        .replace(/\S+@\S+\.\S+/g, "")
        .replace(/,?\s*budget\s*[:\-]?\s*\$?\d+(?:\.\d+)?/gi, "")
        .replace(/,?\s*(email(?:\s+me)?(?:\s+at)?|alert(?:s)?(?:\s+me)?(?:\s+at)?|notify(?:\s+me)?(?:\s+at)?|contact(?:\s+me)?(?:\s+at)?)\s*$/i, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      // ── Confirm in plain English ─────────────────────────────────────────
      console.log("  Here's what I understood:\n");
      console.log(`  ${pc.bold("Goal:")}     ${outcome}`);
      console.log(`  ${pc.bold("Runs:")}     ${schedule.label}`);
      console.log(`  ${pc.bold("Budget:")}   $${budget} max (agent stops if it hits this)`);
      console.log(`  ${pc.bold("Deadline:")} ${friendlyDate(deadline)}`);
      console.log(
        `  ${pc.bold("Alerts:")}   ${email || pc.dim("(no email found — I'll skip alerts)")}`,
      );
      console.log();

      // Fill in gaps
      let ownerEmail = email;
      let alertEmail = email;

      if (!email) {
        ownerEmail = await ask(rl, pc.cyan("  What's your email address?"), "you@example.com");
        alertEmail = ownerEmail;
        console.log();
      }

      const confirmed = await askYesNo(rl, "  Does that look right?");
      if (!confirmed) {
        console.log();
        console.log("  No problem. Run `argus init` and try again — just be a bit more specific.");
        rl.close();
        return;
      }
      console.log();

      // ── Write contract ───────────────────────────────────────────────────
      const toml = [
        `id = "${contractId}"`,
        `version = "1.0.0"`,
        `kind = "${kind}"`,
        `owner = "${ownerEmail}"`,
        `outcome = "${outcome.replace(/"/g, '\\"')}"`,
        `deadline = "${deadline}T00:00:00Z"`,
        "",
        "[[success_criteria]]",
        `name = "primary_goal"`,
        `metric = "outcome_reached"`,
        "target = 1",
        `operator = "gte"`,
        `measurement = "manual"`,
        "",
        "[budget]",
        `usd = ${budget}`,
        "tokens = 500000",
        "hard_cap = true",
        "",
        "[[escalation]]",
        `trigger = "budget > 80%"`,
        `channel = "email"`,
        `contact = "${alertEmail}"`,
        "",
        "[metadata]",
        `cron = "${schedule.cron}"`,
      ].join("\n");

      ensureDir(CONTRACTS_DIR);
      const tomlPath = resolve(CONTRACTS_DIR, `${contractId}.toml`);
      writeFileSync(tomlPath, toml, "utf-8");

      const parsed = parseContract(toml);
      if (parsed.ok) {
        const store = new ContractStore(DB_PATH);
        try {
          store.save(parsed.value);
        } catch {
          // already exists — that's fine, keep going
        }
        store.close();
      }

      console.log(pc.green("  ✓ Contract created"));
      console.log();

      // ── Generate key ─────────────────────────────────────────────────────
      let keyReady = existsSync(DEFAULT_KEY_PATH);
      if (!keyReady) {
        console.log("  One more thing — I need a key to sign everything your agent does.");
        console.log(pc.dim("  This is what proves the records haven't been tampered with.\n"));
        const makeKey = await askYesNo(rl, "  Create a signing key now?");
        if (makeKey) {
          const passphrase = await promptPassphrase();
          if (passphrase) {
            ensureDir(KEYS_DIR);
            const kp = generateKeyPair();
            const encrypted = encryptKeyPair(kp, passphrase);
            const hex = keyPairToHex(kp);
            writeFileSync(DEFAULT_KEY_PATH, encrypted);
            writeFileSync(resolve(KEYS_DIR, "default.pub"), `${hex.publicKey}\n`, "utf-8");
            console.log(pc.green("  ✓ Signing key created"));
            console.log(pc.dim("  Remember that password — there's no way to recover it.\n"));
            keyReady = true;
          }
        }
      } else {
        console.log(pc.dim("  (Signing key already exists — reusing it)\n"));
      }

      // ── Done ─────────────────────────────────────────────────────────────
      console.log(pc.bold("  You're all set!\n"));

      if (keyReady) {
        console.log("  Start your agent with:");
        console.log(`  ${pc.cyan("argus daemon start")}\n`);
        console.log(
          pc.dim(
            `  It will run ${schedule.label} and alert you at ${alertEmail || ownerEmail} if anything needs attention.`,
          ),
        );
      } else {
        console.log("  To create a signing key later, run:");
        console.log(`  ${pc.cyan("argus keys generate default")}\n`);
        console.log("  Then start your agent:");
        console.log(`  ${pc.cyan("argus daemon start")}`);
      }

      console.log();
      console.log(pc.dim(`  Check your contract anytime: argus contract show ${contractId}`));
      console.log(pc.dim("  See what your agent did:     argus lineage verify <contract-id>"));
    } finally {
      rl.close();
    }
  });
