export class Database {
  constructor(_path?: string, _opts?: unknown) {}
  run(_sql: string, ..._args: unknown[]): void {}
  prepare(_sql: string) {
    return {
      run: (..._args: unknown[]) => {},
      get: (..._args: unknown[]) => null,
      all: (..._args: unknown[]) => [],
    };
  }
  close(): void {}
}
