export class SQLiteError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "SQLiteError";
  }
}

export class Database {
  run(_sql: string, ..._args: unknown[]): void {}
  prepare(_sql: string) {
    return {
      run: (..._args: unknown[]) => {},
      get: (..._args: unknown[]) => null,
      all: (..._args: unknown[]) => [],
      values: (..._args: unknown[]) => [] as unknown[][],
      iterate: (..._args: unknown[]) => ([] as unknown[])[Symbol.iterator](),
    };
  }
  query(_sql: string) {
    return this.prepare(_sql);
  }
  close(): void {}
}

export default Database;
