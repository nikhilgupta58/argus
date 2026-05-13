import { Cron } from "croner";
import pc from "picocolors";

export function extractCronPolicy(
  metadata: Record<string, string | number | boolean> | undefined
): string | null {
  if (!metadata) return null;
  const val = metadata["cron"];
  if (typeof val !== "string" || !val.trim()) return null;
  return val.trim();
}

export interface CronJob {
  contractId: string;
  expression: string;
  stop(): void;
}

export function scheduleCron(
  contractId: string,
  expression: string,
  onTick: (contractId: string) => void
): CronJob {
  const job = new Cron(expression, () => {
    console.log(pc.cyan(`[daemon] cron tick for contract ${contractId}`));
    onTick(contractId);
  });

  return {
    contractId,
    expression,
    stop: () => job.stop(),
  };
}
