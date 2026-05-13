import { sortObjectKeys } from "./hash.js";
import type { Contract } from "./types.js";

export type DiffCategory =
  | "outcome_changed"
  | "deadline_shifted"
  | "budget_changed"
  | "criteria_added"
  | "criteria_removed"
  | "criteria_modified"
  | "escalation_changed"
  | "kind_changed"
  | "metadata_changed"
  | "metadata_only";

function stableJson(val: unknown): string {
  return JSON.stringify(sortObjectKeys(val));
}

export function diffContracts(a: Contract, b: Contract): DiffCategory[] {
  const changes: DiffCategory[] = [];

  if (a.kind !== b.kind) changes.push("kind_changed");
  if (a.outcome !== b.outcome) changes.push("outcome_changed");
  if (a.deadline !== b.deadline) changes.push("deadline_shifted");

  if (stableJson(a.budget) !== stableJson(b.budget)) {
    changes.push("budget_changed");
  }

  const aNames = new Set(a.success_criteria.map((s) => s.name));
  const bNames = new Set(b.success_criteria.map((s) => s.name));

  const added = [...bNames].filter((n) => !aNames.has(n));
  const removed = [...aNames].filter((n) => !bNames.has(n));
  if (added.length > 0) changes.push("criteria_added");
  if (removed.length > 0) changes.push("criteria_removed");

  const sharedNames = [...aNames].filter((n) => bNames.has(n));
  const aMap = new Map(a.success_criteria.map((s) => [s.name, s]));
  const bMap = new Map(b.success_criteria.map((s) => [s.name, s]));
  const criteriaModified = sharedNames.some(
    (n) => stableJson(aMap.get(n)) !== stableJson(bMap.get(n)),
  );
  if (criteriaModified) changes.push("criteria_modified");

  if (stableJson(a.escalation) !== stableJson(b.escalation)) {
    changes.push("escalation_changed");
  }

  const coreChanged = changes.length > 0;
  const metaChanged = stableJson(a.metadata ?? {}) !== stableJson(b.metadata ?? {});
  if (metaChanged) {
    changes.push(coreChanged ? "metadata_changed" : "metadata_only");
  }

  return changes;
}
