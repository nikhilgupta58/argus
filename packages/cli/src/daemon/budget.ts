import type { ContractBudget } from "@argus/core";

interface SpendRecord {
  tokensUsed: number;
  usdUsed: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  tokensRemaining: number;
  usdRemaining: number;
  warning?: boolean;
}

export class BudgetTracker {
  private spent: Map<string, SpendRecord> = new Map();

  record(contractId: string, spend: { tokensUsed?: number; usdUsed?: number }): void {
    const existing = this.spent.get(contractId) ?? { tokensUsed: 0, usdUsed: 0 };
    this.spent.set(contractId, {
      tokensUsed: existing.tokensUsed + (spend.tokensUsed ?? 0),
      usdUsed: existing.usdUsed + (spend.usdUsed ?? 0),
    });
  }

  check(contractId: string, budget: ContractBudget): BudgetCheckResult {
    const used = this.spent.get(contractId) ?? { tokensUsed: 0, usdUsed: 0 };
    const tokensLimit = budget.tokens ?? Infinity;
    const usdLimit = budget.usd ?? Infinity;
    const tokensRemaining = Math.max(0, tokensLimit - used.tokensUsed);
    const usdRemaining = Math.max(0, usdLimit - used.usdUsed);
    const over = used.tokensUsed > tokensLimit || used.usdUsed > usdLimit;

    if (over && budget.hard_cap) {
      return { allowed: false, tokensRemaining, usdRemaining };
    }
    if (over) {
      return { allowed: true, tokensRemaining, usdRemaining, warning: true };
    }
    return { allowed: true, tokensRemaining, usdRemaining };
  }
}
