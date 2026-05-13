import { describe, it, expect } from "vitest";
import { BudgetTracker } from "../budget.js";

const makeContractBudget = (tokens: number, usd: number, hard_cap = true) => ({
  tokens,
  usd,
  hard_cap,
});

describe("BudgetTracker", () => {
  it("allows first invocation when budget is full", () => {
    const tracker = new BudgetTracker();
    const budget = makeContractBudget(1000, 5);
    expect(tracker.check("c1", budget)).toEqual({ allowed: true, tokensRemaining: 1000, usdRemaining: 5 });
  });

  it("records spend and reduces remaining budget", () => {
    const tracker = new BudgetTracker();
    const budget = makeContractBudget(1000, 5);
    tracker.record("c1", { tokensUsed: 300, usdUsed: 1.5 });
    const remaining = tracker.check("c1", budget);
    expect(remaining.tokensRemaining).toBe(700);
    expect(remaining.usdRemaining).toBeCloseTo(3.5);
  });

  it("blocks when hard_cap tokens exceeded", () => {
    const tracker = new BudgetTracker();
    tracker.record("c1", { tokensUsed: 1001 });
    const result = tracker.check("c1", makeContractBudget(1000, 5, true));
    expect(result.allowed).toBe(false);
  });

  it("blocks when hard_cap usd exceeded", () => {
    const tracker = new BudgetTracker();
    tracker.record("c1", { usdUsed: 5.01 });
    const result = tracker.check("c1", makeContractBudget(1000, 5, true));
    expect(result.allowed).toBe(false);
  });

  it("allows (with warning) when hard_cap is false even if over budget", () => {
    const tracker = new BudgetTracker();
    tracker.record("c1", { tokensUsed: 2000 });
    const result = tracker.check("c1", makeContractBudget(1000, 5, false));
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(true);
  });

  it("accumulates spend across multiple records", () => {
    const tracker = new BudgetTracker();
    tracker.record("c1", { tokensUsed: 200, usdUsed: 1 });
    tracker.record("c1", { tokensUsed: 300, usdUsed: 1.5 });
    const result = tracker.check("c1", makeContractBudget(1000, 5));
    expect(result.tokensRemaining).toBe(500);
    expect(result.usdRemaining).toBeCloseTo(2.5);
  });

  it("tracks separate contracts independently", () => {
    const tracker = new BudgetTracker();
    tracker.record("c1", { tokensUsed: 900 });
    tracker.record("c2", { tokensUsed: 100 });
    const budget = makeContractBudget(1000, 5);
    expect(tracker.check("c1", budget).tokensRemaining).toBe(100);
    expect(tracker.check("c2", budget).tokensRemaining).toBe(900);
  });
});
