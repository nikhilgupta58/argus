import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import type { SignedEvent } from "./types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  contract_id TEXT NOT NULL,
  action_kind TEXT NOT NULL,
  payload_blake3 TEXT NOT NULL,
  parent_id TEXT,
  timestamp INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  signature TEXT NOT NULL,
  public_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(contract_id, sequence)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_events_contract ON events(contract_id, sequence);
`;

export class EventStore {
  private db: Database;

  constructor(path = ":memory:") {
    const resolvedPath = path === ":memory:" ? path : resolve(path);
    this.db = new Database(resolvedPath, { create: true });
    this.db.run(SCHEMA);
  }

  append(event: SignedEvent): void {
    this.db
      .prepare(`
      INSERT INTO events
        (id, contract_id, action_kind, payload_blake3, parent_id, timestamp, sequence, signature, public_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        event.id,
        event.contract_id,
        event.action_kind,
        event.payload_blake3,
        event.parent_id,
        event.timestamp,
        event.sequence,
        event.signature,
        event.public_key,
        Date.now(),
      );
  }

  getById(id: string): SignedEvent | null {
    const row = this.db
      .prepare(
        "SELECT id,contract_id,action_kind,payload_blake3,parent_id,timestamp,sequence,signature,public_key FROM events WHERE id=?",
      )
      .get(id) as SignedEvent | null;
    return row ?? null;
  }

  getChain(contractId: string): SignedEvent[] {
    return this.db
      .prepare(
        "SELECT id,contract_id,action_kind,payload_blake3,parent_id,timestamp,sequence,signature,public_key FROM events WHERE contract_id=? ORDER BY sequence ASC, rowid ASC",
      )
      .all(contractId) as SignedEvent[];
  }

  getLatest(contractId: string): SignedEvent | null {
    const row = this.db
      .prepare(
        "SELECT id,contract_id,action_kind,payload_blake3,parent_id,timestamp,sequence,signature,public_key FROM events WHERE contract_id=? ORDER BY sequence DESC, rowid DESC LIMIT 1",
      )
      .get(contractId) as SignedEvent | null;
    return row ?? null;
  }

  close(): void {
    this.db.close();
  }
}
