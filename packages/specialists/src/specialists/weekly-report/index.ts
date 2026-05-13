import type { Specialist, SpecialistContext, SpecialistOutput, SpecialistError } from "../../types.js";
import type { Result } from "@argus/core";

// Stub data fetchers — replace with real API calls in production
function fetchDataSource(source: string): Record<string, unknown> {
  const stubs: Record<string, Record<string, unknown>> = {
    revenue: { current_week: 48200, prev_week: 43100, change_pct: 11.8 },
    signups: { current_week: 312, prev_week: 289, change_pct: 8.0 },
    churn: { current_week: 14, prev_week: 18, change_pct: -22.2 },
    default: { note: "stub data — configure real data source integration" },
  };
  return stubs[source] ?? stubs["default"]!;
}

function renderSection(source: string, data: Record<string, unknown>): string {
  const title = source.charAt(0).toUpperCase() + source.slice(1);
  const rows = Object.entries(data)
    .map(([k, v]) => `- **${k}**: ${v}`)
    .join("\n");
  return `## ${title}\n\n${rows}`;
}

export const weeklyReportSpecialist: Specialist = {
  name: "weekly-report",
  version: "1.0.0",
  contractKinds: ["report"],

  async execute(ctx: SpecialistContext): Promise<Result<SpecialistOutput, SpecialistError>> {
    const meta = ctx.contract.metadata ?? {};
    const rawSources = String(meta["data_sources"] ?? "").trim();
    if (!rawSources) {
      return {
        ok: false,
        error: { code: "EXECUTION_ERROR", message: "No data_sources configured in contract metadata" },
      };
    }

    const title = String(meta["report_title"] ?? "Weekly Report");
    const sources = rawSources.split(",").map((s) => s.trim()).filter(Boolean);
    const date = new Date().toISOString().slice(0, 10);

    const sections = sources.map((src) => {
      const data = fetchDataSource(src);
      return renderSection(src, data);
    });

    const report = [`# ${title}`, `*Generated: ${date}*`, "", ...sections].join("\n\n");
    const summary = `${title} report generated for ${sources.length} data source(s): ${sources.join(", ")}`;

    return {
      ok: true,
      value: {
        summary,
        artifacts: { report, dataSourceCount: sources.length },
        tokensUsed: 0,
      },
    };
  },
};

export default weeklyReportSpecialist;
