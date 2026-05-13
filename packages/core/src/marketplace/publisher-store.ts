import { Database } from "bun:sqlite";
import { resolve } from "node:path";

export interface Publisher {
  id: string;
  name: string;
  public_key_hex: string;
  created_at: string;
}

export interface RevokedBundle {
  bundle_hash: string;
  revoked_at: string;
  reason: string | null;
}

const SCHEMA_PUBLISHERS = `
CREATE TABLE IF NOT EXISTS publishers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  public_key_hex TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const SCHEMA_REVOCATIONS = `
CREATE TABLE IF NOT EXISTS revocations (
  bundle_hash TEXT PRIMARY KEY NOT NULL,
  revoked_at TEXT NOT NULL,
  reason TEXT
);
`;

export class PublisherStore {
  private db: Database;

  constructor(path = ":memory:") {
    const resolvedPath = path === ":memory:" ? path : resolve(path);
    this.db = new Database(resolvedPath, { create: true });
    this.db.run("PRAGMA journal_mode=WAL;");
    this.db.run(SCHEMA_PUBLISHERS);
    this.db.run(SCHEMA_REVOCATIONS);
  }

  register(publisher: Publisher): void {
    this.db
      .prepare(`
      INSERT INTO publishers (id, name, public_key_hex, created_at)
      VALUES (?, ?, ?, ?)
    `)
      .run(publisher.id, publisher.name, publisher.public_key_hex, publisher.created_at);
  }

  getById(id: string): Publisher | null {
    const row = this.db
      .prepare("SELECT id, name, public_key_hex, created_at FROM publishers WHERE id = ?")
      .get(id) as Publisher | null;
    return row ?? null;
  }

  list(): Publisher[] {
    return this.db
      .prepare(
        "SELECT id, name, public_key_hex, created_at FROM publishers ORDER BY created_at ASC",
      )
      .all() as Publisher[];
  }

  revoke(bundleHash: string, reason?: string): void {
    this.db
      .prepare(`
      INSERT INTO revocations (bundle_hash, revoked_at, reason)
      VALUES (?, ?, ?)
    `)
      .run(bundleHash, new Date().toISOString(), reason ?? null);
  }

  isRevoked(bundleHash: string): boolean {
    const row = this.db
      .prepare("SELECT bundle_hash FROM revocations WHERE bundle_hash = ?")
      .get(bundleHash);
    return row !== null;
  }

  getRevokedBundles(): RevokedBundle[] {
    return this.db
      .prepare("SELECT bundle_hash, revoked_at, reason FROM revocations ORDER BY revoked_at ASC")
      .all() as RevokedBundle[];
  }

  close(): void {
    this.db.close();
  }
}
