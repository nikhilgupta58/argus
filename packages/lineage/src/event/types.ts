export type ActionKind =
  | "contract_created"
  | "contract_updated"
  | "specialist_started"
  | "specialist_completed"
  | "specialist_failed"
  | "escalation_triggered"
  | "budget_exceeded"
  | "revert";

export interface Event {
  id: string;            // BLAKE3 of canonical JSON of all fields except id
  contract_id: string;
  action_kind: ActionKind;
  payload_blake3: string; // BLAKE3 of action-specific payload
  parent_id: string | null; // null only for the genesis event of a contract
  timestamp: number;     // Unix milliseconds
  sequence: number;      // monotonically increasing per contract_id, starting at 0
}

export interface SignedEvent extends Event {
  signature: string;    // hex Ed25519 sig over canonical JSON of Event (all fields inc. id)
  public_key: string;   // hex Ed25519 public key
}

export interface EventRecord {
  id: string;
  contract_id: string;
  action_kind: string;
  payload_blake3: string;
  parent_id: string | null;
  timestamp: number;
  sequence: number;
  signature: string;
  public_key: string;
  created_at: number;   // DB insertion time (wall clock ms)
}
