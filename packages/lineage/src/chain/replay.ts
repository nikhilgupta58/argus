import type { SignedEvent, ActionKind } from "../event/types.js";

export interface ReplayState {
  contractId: string;
  eventCount: number;
  lastEventId: string;
  lastSequence: number;
  appliedActions: ActionKind[];
  hasRevert: boolean;
}

export function replayChain(events: SignedEvent[]): ReplayState {
  if (events.length === 0) throw new Error("cannot replay empty event chain");
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const last = sorted[sorted.length - 1]!;
  return {
    contractId: last.contract_id,
    eventCount: sorted.length,
    lastEventId: last.id,
    lastSequence: last.sequence,
    appliedActions: sorted.map((e) => e.action_kind),
    hasRevert: sorted.some((e) => e.action_kind === "revert"),
  };
}
