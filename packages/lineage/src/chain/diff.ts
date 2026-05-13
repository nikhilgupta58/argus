import type { SignedEvent } from "../event/types.js";
import type { ReplayState } from "./replay.js";
import { replayChain } from "./replay.js";

export interface ChainDiff {
  addedEvents: SignedEvent[];
  contractId: string;
  fromSequence: number;
  toSequence: number;
}

export function diffChain(before: SignedEvent[], after: SignedEvent[]): ChainDiff {
  const beforeIds = new Set(before.map((e) => e.id));
  const added = after.filter((e) => !beforeIds.has(e.id));
  const fromState: ReplayState | null = before.length > 0 ? replayChain(before) : null;
  if (after.length === 0) {
    return {
      addedEvents: [],
      contractId: fromState?.contractId ?? "",
      fromSequence: fromState?.lastSequence ?? -1,
      toSequence: -1,
    };
  }
  const toState: ReplayState = replayChain(after);
  return {
    addedEvents: added.sort((a, b) => a.sequence - b.sequence),
    contractId: toState.contractId,
    fromSequence: fromState?.lastSequence ?? -1,
    toSequence: toState.lastSequence,
  };
}
