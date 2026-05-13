import { parse as parseTOML } from "smol-toml";
import { ContractSchema } from "./schema.js";
import type { Contract, ContractError, Result } from "./types.js";

export function parseContract(toml: string): Result<Contract, ContractError> {
  let raw: unknown;
  try {
    raw = parseTOML(toml);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "PARSE_ERROR",
        message: `TOML parse error: ${err instanceof Error ? err.message : String(err)}`,
        details: err,
      },
    };
  }

  const result = ContractSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: "SCHEMA_ERROR",
        message: result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        details: result.error.issues,
      },
    };
  }

  return { ok: true, value: result.data };
}
