import { Database } from "bun:sqlite";
import { rmSync } from "node:fs";
import { contractHash } from "./hash.js";
import type { Contract } from "./types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  parent_version TEXT,
  body_blake3 TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  owner TEXT NOT NULL,
  PRIMARY KEY (id, version)
) STRICT;
`;

export interface ContractRecord {
  id: string;
  version: string;
  parent_version: string | null;
  body_blake3: string;
  created_at: number;
  owner: string;
}

export class ContractStore {
  private db: Database;

  constructor(path: string = ":memory:") {
    // Clean up stale WAL/SHM files that can prevent schema creation when the
    // main DB file was removed but the journal files were left behind.
    if (path !== ":memory:") {
      try { rmSync(`${path}-wal`); } catch {}
      try { rmSync(`${path}-shm`); } catch {}
    }
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode=WAL;");
    this.db.exec(SCHEMA);
  }

  save(contract: Contract, parentVersion?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO contracts (id, version, parent_version, body_blake3, body, created_at, owner)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      contract.id,
      contract.version,
      parentVersion ?? null,
      contractHash(contract),
      JSON.stringify(contract),
      Date.now(),
      contract.owner,
    );
  }

  load(id: string, version: string): Contract | null {
    const row = this.db
      .prepare("SELECT body FROM contracts WHERE id = ? AND version = ?")
      .get(id, version) as { body: string } | null;
    return row ? (JSON.parse(row.body) as Contract) : null;
  }

  loadLatest(id: string): Contract | null {
    const row = this.db
      .prepare("SELECT body FROM contracts WHERE id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .get(id) as { body: string } | null;
    return row ? (JSON.parse(row.body) as Contract) : null;
  }

  listVersions(id: string): ContractRecord[] {
    return this.db
      .prepare(
        "SELECT id, version, parent_version, body_blake3, created_at, owner FROM contracts WHERE id = ? ORDER BY created_at ASC",
      )
      .all(id) as ContractRecord[];
  }

  close(): void {
    this.db.close();
  }
}
