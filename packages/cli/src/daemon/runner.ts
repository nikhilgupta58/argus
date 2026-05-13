import { existsSync, readFileSync } from "node:fs";
import { ContractStore } from "@argus/core";
import { EventStore, decryptKeyPair } from "@argus/lineage";
import { BunSandbox, Orchestrator, SpecialistRegistry } from "@argus/specialists";
import pc from "picocolors";
import { BudgetTracker } from "./budget.js";
import { extractCronPolicy, scheduleCron } from "./cron.js";
import type { CronJob } from "./cron.js";
import { EscalationDispatcher } from "./escalation.js";

export interface DaemonConfig {
  dbPath: string;
  lineageDbPath: string;
  registryPath: string;
  keyPath: string;
  passphrase: string;
}

export class DaemonRunner {
  private cronJobs: CronJob[] = [];
  private running = false;

  async start(config: DaemonConfig): Promise<void> {
    if (this.running) throw new Error("Daemon already running");
    this.running = true;

    if (!existsSync(config.keyPath)) {
      throw new Error(`Key file not found: ${config.keyPath}`);
    }
    const keyBytes = new Uint8Array(readFileSync(config.keyPath));
    const { privateKey } = decryptKeyPair(keyBytes, config.passphrase);

    const contractStore = new ContractStore(config.dbPath);
    const eventStore = new EventStore(config.lineageDbPath);
    const registry = new SpecialistRegistry(config.registryPath);
    const sandbox = new BunSandbox();
    const orchestrator = new Orchestrator(contractStore, eventStore, registry, sandbox, privateKey);
    const budgetTracker = new BudgetTracker();
    const escalation = new EscalationDispatcher();

    // Schedule all contracts that have a cron policy
    const contracts = contractStore.listAll();
    for (const contract of contracts) {
      const cronExpr = extractCronPolicy(
        contract.metadata as Record<string, string | number | boolean> | undefined,
      );
      if (!cronExpr) continue;

      const job = scheduleCron(contract.id, cronExpr, async (contractId) => {
        const latest = contractStore.loadLatest(contractId);
        if (!latest) return;

        const budgetCheck = budgetTracker.check(contractId, latest.budget);
        if (!budgetCheck.allowed) {
          console.log(pc.yellow(`[daemon] budget cap reached for ${contractId} — skipping`));
          return;
        }
        if (budgetCheck.warning) {
          console.log(pc.yellow(`[daemon] budget soft cap exceeded for ${contractId}`));
        }

        const invocationId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const result = await orchestrator.run(contractId, invocationId);

        if (result.ok) {
          budgetTracker.record(contractId, {
            tokensUsed: result.value.tokensUsed,
            usdUsed: result.value.usdUsed,
          });
          console.log(pc.green(`[daemon] ${contractId} completed: ${result.value.summary}`));
        } else {
          console.log(pc.red(`[daemon] ${contractId} failed: ${result.error.message}`));
          const contractData = contractStore.loadLatest(contractId);
          if (contractData) {
            for (const rule of contractData.escalation ?? []) {
              const shouldEscalate =
                (result.error.code === "BUDGET_EXCEEDED" &&
                  rule.trigger.toLowerCase().includes("budget")) ||
                (result.error.code === "EXECUTION_ERROR" &&
                  rule.trigger.toLowerCase().includes("fail")) ||
                (result.error.code === "SANDBOX_ERROR" &&
                  rule.trigger.toLowerCase().includes("fail"));
              if (shouldEscalate) {
                await escalation.dispatch(rule, {
                  contractId,
                  trigger: rule.trigger,
                  message: result.error.message,
                });
              }
            }
          }
        }
      });

      this.cronJobs.push(job);
      console.log(pc.cyan(`[daemon] scheduled ${contract.id} @ ${cronExpr}`));
    }

    if (this.cronJobs.length === 0) {
      console.log(pc.yellow("[daemon] started — no contracts are scheduled to run automatically."));
      console.log(
        pc.dim('  To schedule a contract, add [metadata] cron = "0 9 * * *" to its TOML'),
      );
      console.log(pc.dim("  then run: argus contract edit <file>"));
    } else {
      console.log(pc.green(`[daemon] started — ${this.cronJobs.length} contract(s) scheduled`));
    }
  }

  stop(): void {
    for (const job of this.cronJobs) job.stop();
    this.cronJobs = [];
    this.running = false;
    console.log(pc.dim("[daemon] stopped"));
  }

  isRunning(): boolean {
    return this.running;
  }
}
