export type ContractOperator = "gte" | "lte" | "eq";
export type ContractMeasurement = "automatic" | "manual";
export type ContractKind = "outbound" | "report" | "pr-review" | "custom";
export type EscalationChannel = "slack" | "email" | "github";

export interface SuccessCriterion {
  name: string;
  metric: string;
  target: number;
  operator: ContractOperator;
  measurement: ContractMeasurement;
}

export interface ContractBudget {
  tokens?: number;
  usd?: number;
  hard_cap: boolean;
}

export interface EscalationRule {
  trigger: string;
  channel: EscalationChannel;
  contact: string;
}

export interface Contract {
  id: string;
  version: string;
  kind: ContractKind;
  owner: string;
  outcome: string;
  deadline: string;
  success_criteria: SuccessCriterion[];
  budget: ContractBudget;
  escalation: EscalationRule[];
  metadata?: Record<string, string | number | boolean>;
}

export interface ContractError {
  code: "PARSE_ERROR" | "SCHEMA_ERROR";
  message: string;
  details?: unknown;
}

export type Result<T, E = ContractError> = { ok: true; value: T } | { ok: false; error: E };
