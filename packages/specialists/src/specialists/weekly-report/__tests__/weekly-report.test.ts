import { describe, expect, it } from "vitest";
import type { SpecialistContext } from "../../../types.js";
import { weeklyReportSpecialist } from "../index.js";

const makeCtx = (): SpecialistContext => ({
  contractId: "c2",
  contractKind: "report",
  invocationId: "inv-2",
  contract: {
    id: "c2",
    version: "1.0.0",
    kind: "report",
    owner: "owner@example.com",
    outcome: "Produce weekly revenue report",
    deadline: "2026-12-31T00:00:00Z",
    success_criteria: [],
    budget: { tokens: 100000, usd: 2, hard_cap: false },
    escalation: [],
    metadata: {
      data_sources: "revenue,signups,churn",
      report_title: "Weekly Business Review",
    },
  },
  budgetRemaining: { tokens: 100000, usd: 2 },
});

describe("WeeklyReportSpecialist", () => {
  it("has correct name, version, and contractKinds", () => {
    expect(weeklyReportSpecialist.name).toBe("weekly-report");
    expect(weeklyReportSpecialist.version).toBe("1.0.0");
    expect(weeklyReportSpecialist.contractKinds).toContain("report");
  });

  it("returns Markdown report with all data source sections", async () => {
    const result = await weeklyReportSpecialist.execute(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary).toContain("report");
      const report = result.value.artifacts?.report as string;
      expect(report).toContain("# Weekly Business Review");
      expect(report).toContain("## Revenue");
      expect(report).toContain("## Signups");
      expect(report).toContain("## Churn");
    }
  });

  it("returns EXECUTION_ERROR when no data sources configured", async () => {
    const ctx: SpecialistContext = {
      ...makeCtx(),
      contract: {
        ...makeCtx().contract,
        metadata: {},
      },
    };
    const result = await weeklyReportSpecialist.execute(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("EXECUTION_ERROR");
  });
});
