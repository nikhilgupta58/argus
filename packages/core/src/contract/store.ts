import { Database } from "bun:sqlite";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
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
    const resolvedPath = path === ":memory:" ? path : resolve(path);
    this.db = new Database(resolvedPath, { create: true });
    this.db.run("PRAGMA journal_mode=WAL;");
    // clean up stale WAL/SHM files from previous abnormal exits
    if (resolvedPath !== ":memory:") {
      try { rmSync(`${resolvedPath}-wal`); } catch {}
      try { rmSync(`${resolvedPath}-shm`); } catch {}
    }
    this.db.run(SCHEMA);
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

  listAll(): Contract[] {
    const rows = this.db
      .prepare(
        `SELECT body FROM contracts c1
         WHERE created_at = (SELECT MAX(created_at) FROM contracts c2 WHERE c1.id = c2.id)
         ORDER BY c1.id ASC`,
      )
      .all() as { body: string }[];
    return rows.map((r) => JSON.parse(r.body) as Contract);
  }

  close(): void {
    this.db.close();
  }
}
