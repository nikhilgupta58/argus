import { z } from "zod";

const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const semverRegex = /^\d+\.\d+\.\d+$/;

export const SuccessCriterionSchema = z.object({
  name: z.string().min(1).max(64),
  metric: z.string().min(1).max(128),
  target: z.number(),
  operator: z.enum(["gte", "lte", "eq"]),
  measurement: z.enum(["automatic", "manual"]).default("automatic"),
});

export const ContractBudgetSchema = z
  .object({
    tokens: z.number().positive().optional(),
    usd: z.number().positive().optional(),
    hard_cap: z.boolean(),
  })
  .refine((b) => b.tokens !== undefined || b.usd !== undefined, {
    message: "At least one of tokens or usd must be specified",
  });

export const EscalationRuleSchema = z.object({
  trigger: z.string().min(1).max(64),
  channel: z.enum(["slack", "email", "github"]),
  contact: z.string().min(1).max(256),
});

export const ContractSchema = z
  .object({
    id: z
      .string()
      .min(3)
      .max(64)
      .regex(slugRegex, "id must be a lowercase slug (a-z, 0-9, hyphens)"),
    version: z
      .string()
      .regex(semverRegex, "version must be semver (e.g. 1.0.0)"),
    kind: z.enum(["outbound", "report", "pr-review", "custom"]),
    owner: z.string().email(),
    outcome: z.string().min(1).max(500),
    deadline: z.string().datetime({ message: "deadline must be ISO 8601 UTC datetime" }),
    success_criteria: z.array(SuccessCriterionSchema).min(1).max(10),
    budget: ContractBudgetSchema,
    escalation: z.array(EscalationRuleSchema).min(1).max(5),
    metadata: z
      .record(z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
  })
  .refine(
    (c) =>
      new Set(c.success_criteria.map((s) => s.name)).size ===
      c.success_criteria.length,
    { message: "success_criteria names must be unique within a contract" },
  )
  .refine(
    (c) =>
      new Set(c.escalation.map((e) => e.trigger)).size ===
      c.escalation.length,
    { message: "escalation triggers must be unique within a contract" },
  );

export type ContractInput = z.input<typeof ContractSchema>;
export type ContractOutput = z.output<typeof ContractSchema>;
