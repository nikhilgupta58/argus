import Anthropic from "@anthropic-ai/sdk";
import type { Result } from "@argus/core";
import type {
  Specialist,
  SpecialistContext,
  SpecialistError,
  SpecialistOutput,
} from "../../types.js";

const anthropic = new Anthropic();

export const outboundSpecialist: Specialist = {
  name: "outbound",
  version: "1.0.0",
  contractKinds: ["outbound"],

  async execute(ctx: SpecialistContext): Promise<Result<SpecialistOutput, SpecialistError>> {
    const meta = ctx.contract.metadata ?? {};
    const prospectName = String(meta.prospect_name ?? "");
    const prospectEmail = String(meta.prospect_email ?? "");
    const prospectCompany = String(meta.prospect_company ?? "");
    const prospectRole = String(meta.prospect_role ?? "");
    const rubric = String(meta.rubric ?? "Be concise and value-focused");

    if (!prospectName || !prospectEmail) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_ERROR",
          message: "Missing prospect_name or prospect_email in contract metadata",
        },
      };
    }

    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `You are an expert at cold outreach. Write a personalized cold email for the following prospect.

Outcome goal: ${ctx.contract.outcome}
Rubric: ${rubric}

Prospect:
- Name: ${prospectName}
- Email: ${prospectEmail}
- Company: ${prospectCompany}
- Role: ${prospectRole}

Write a concise, high-conversion cold email. Include Subject line. Do not send — just draft the text.`,
          },
        ],
      });

      const drafted = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

      return {
        ok: true,
        value: {
          summary: `drafted cold email for ${prospectName} at ${prospectCompany} (not yet sent)`,
          artifacts: { drafted, prospectEmail, sent: false },
          tokensUsed,
        },
      };
    } catch (err: unknown) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_ERROR",
          message: String(err),
        },
      };
    }
  },
};

export default outboundSpecialist;
