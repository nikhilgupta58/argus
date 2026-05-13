import type { Contract, ContractKind, Result } from "@argus/core";

export type { Result };

export interface SpecialistContext {
  contractId: string;
  contractKind: ContractKind;
  contract: Contract;
  invocationId: string;
  budgetRemaining: { tokens?: number; usd?: number };
  metadata?: Record<string, unknown>;
}

export interface SpecialistOutput {
  summary: string;
  artifacts?: Record<string, unknown>;
  tokensUsed?: number;
  usdUsed?: number;
}

export type SpecialistErrorCode =
  | "EXECUTION_ERROR"
  | "BUDGET_EXCEEDED"
  | "SANDBOX_ERROR"
  | "INVALID_CONTRACT";

export interface SpecialistError {
  code: SpecialistErrorCode;
  message: string;
  details?: unknown;
}

export interface Specialist {
  name: string;
  version: string;
  contractKinds: string[];
  execute(ctx: SpecialistContext): Promise<Result<SpecialistOutput, SpecialistError>>;
}

export interface SpecialistManifest {
  name: string;
  version: string;
  contractKinds: string[];
  entrypoint: string;    // absolute resolved path
  codeHash: string;      // BLAKE3 hex of entrypoint file bytes
  manifestHash: string;  // BLAKE3 hex of canonical JSON of all fields except manifestHash
}
