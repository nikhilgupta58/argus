export class SQLiteError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "SQLiteError";
  }
}

type Row = Record<string, unknown>;

interface TableData {
  rows: Row[];
  columns: string[];
  primaryKey: string | null;
  uniqueConstraints: string[][];
}

function parseSql(sql: string): { type: string; table: string } {
  const s = sql.trim().toUpperCase();
  if (s.startsWith("INSERT INTO")) {
    const m = sql.match(/INSERT INTO\s+(\w+)/i);
    return { type: "INSERT", table: m?.[1] ?? "" };
  }
  if (s.startsWith("SELECT")) {
    const m = sql.match(/FROM\s+(\w+)/i);
    return { type: "SELECT", table: m?.[1] ?? "" };
  }
  if (s.startsWith("CREATE TABLE")) {
    const m =
      sql.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i) ?? sql.match(/CREATE TABLE\s+(\w+)/i);
    return { type: "CREATE_TABLE", table: m?.[1] ?? "" };
  }
  if (s.startsWith("CREATE INDEX")) {
    return { type: "CREATE_INDEX", table: "" };
  }
  if (s.startsWith("PRAGMA")) {
    return { type: "PRAGMA", table: "" };
  }
  return { type: "UNKNOWN", table: "" };
}

function splitTopLevelCommas(s: string): string[] {
  // Split by commas that are not inside parentheses
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function extractColumns(createSql: string): {
  columns: string[];
  primaryKey: string | null;
  uniqueConstraints: string[][];
} {
  // Extract the body between the outermost parentheses of CREATE TABLE
  const bodyMatch = createSql.match(/\((.+)\)(?:\s+STRICT)?[^)]*$/is);
  if (!bodyMatch) return { columns: [], primaryKey: null, uniqueConstraints: [] };

  const body = bodyMatch[1];
  const columns: string[] = [];
  let primaryKey: string | null = null;
  const uniqueConstraints: string[][] = [];

  // Split by top-level commas (respects nested parentheses)
  const parts = splitTopLevelCommas(body);

  for (const part of parts) {
    const upper = part.toUpperCase().trim();
    // Table-level PRIMARY KEY constraint: PRIMARY KEY (col1, col2, ...)
    if (upper.startsWith("PRIMARY KEY")) {
      const m = part.match(/PRIMARY KEY\s*\(([^)]+)\)/i);
      if (m) {
        const pkCols = m[1].split(",").map((c) => c.trim());
        // Treat composite PK as a unique constraint (enforced the same way)
        uniqueConstraints.push(pkCols);
        // If single-column PK, also set primaryKey for legacy checks
        if (pkCols.length === 1) primaryKey = pkCols[0] as string;
      }
      continue;
    }
    if (upper.startsWith("UNIQUE(") || upper.startsWith("UNIQUE (")) {
      const m = part.match(/UNIQUE\s*\(([^)]+)\)/i);
      if (m) {
        uniqueConstraints.push(m[1].split(",").map((c) => c.trim()));
      }
      continue;
    }
    // Column definition: first word is column name
    const colMatch = part.trim().match(/^(\w+)\s/);
    if (colMatch) {
      const colName = colMatch[1];
      columns.push(colName);
      if (upper.includes("PRIMARY KEY")) {
        primaryKey = colName;
        // Single-column inline PRIMARY KEY: enforce uniqueness
        uniqueConstraints.push([colName]);
      } else if (upper.includes("UNIQUE")) {
        uniqueConstraints.push([colName]);
      }
    }
  }

  return { columns, primaryKey, uniqueConstraints };
}

export class Database {
  private tables: Map<string, TableData> = new Map();
  private _nextRowid = 1;

  run(sql: string, ..._args: unknown[]): void {
    const { type, table } = parseSql(sql);
    if (type === "CREATE_TABLE" && table) {
      if (!this.tables.has(table)) {
        const { columns, primaryKey, uniqueConstraints } = extractColumns(sql);
        this.tables.set(table, { rows: [], columns, primaryKey, uniqueConstraints });
      }
    }
    // PRAGMA, CREATE INDEX, etc. — no-op
  }

  prepare(sql: string) {
    const self = this;
    const { type, table } = parseSql(sql);

    return {
      run(...args: unknown[]): void {
        if (type === "INSERT" && table) {
          const tableData = self.tables.get(table);
          if (!tableData) throw new SQLiteError(`no such table: ${table}`);

          // Extract column names from INSERT INTO ... (cols) VALUES (?)
          const colsMatch = sql.match(/INSERT INTO\s+\w+\s*\(([^)]+)\)/i);
          if (!colsMatch) throw new SQLiteError("malformed INSERT");

          const cols = colsMatch[1].split(",").map((c) => c.trim());
          const row: Row = {};
          for (let i = 0; i < cols.length; i++) {
            row[cols[i]] = args[i] ?? null;
          }

          // Check UNIQUE constraints (including PRIMARY KEY, which is registered as a unique constraint)
          for (const constraint of tableData.uniqueConstraints) {
            const existing = tableData.rows.find((r) =>
              constraint.every((col) => r[col] === row[col]),
            );
            if (existing) {
              throw new SQLiteError(
                `UNIQUE constraint failed: ${constraint.map((c) => `${table}.${c}`).join(", ")}`,
                "SQLITE_CONSTRAINT_UNIQUE",
              );
            }
          }

          row.rowid = self._nextRowid++;
          tableData.rows.push(row);
        } else if (type === "UNKNOWN") {
          throw new SQLiteError(`Mock: unsupported statement type: ${sql}`);
        }
      },

      get(...args: unknown[]): Row | null {
        if (type === "SELECT" && table) {
          const tableData = self.tables.get(table);
          if (!tableData) return null;

          const results = self._filterRows(sql, tableData.rows, args);
          return results[0] ?? null;
        }
        return null;
      },

      all(...args: unknown[]): Row[] {
        if (type === "SELECT" && table) {
          const tableData = self.tables.get(table);
          if (!tableData) return [];

          return self._filterRows(sql, tableData.rows, args);
        }
        return [];
      },

      values(..._args: unknown[]): unknown[][] {
        return [];
      },

      iterate(..._args: unknown[]): Iterator<unknown> {
        return ([] as unknown[])[Symbol.iterator]();
      },
    };
  }

  _filterRows(sql: string, rows: Row[], args: unknown[]): Row[] {
    let results = [...rows];

    // Parse WHERE clause: WHERE col=?  (simple single or AND conditions)
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/is);
    if (whereMatch) {
      const conditions = whereMatch[1].split(/\s+AND\s+/i);
      let argIdx = 0;
      for (const cond of conditions) {
        const eqMatch = cond.match(/(\w+)\s*=\s*\?/);
        if (eqMatch) {
          const col = eqMatch[1];
          const val = args[argIdx++];
          results = results.filter((r) => r[col] === val);
        }
      }
    }

    // Parse ORDER BY clause
    const orderMatch = sql.match(/ORDER BY\s+(.+?)(?:\s+LIMIT|$)/is);
    if (orderMatch) {
      const orderParts = orderMatch[1].split(",").map((p) => p.trim());
      results.sort((a, b) => {
        for (const part of orderParts) {
          const m = part.match(/(\w+)(?:\s+(ASC|DESC))?/i);
          if (!m) continue;
          const col = m[1];
          const dir = (m[2] ?? "ASC").toUpperCase();
          const av = a[col];
          const bv = b[col];
          let cmp = 0;
          if (typeof av === "number" && typeof bv === "number") {
            cmp = av - bv;
          } else if (typeof av === "string" && typeof bv === "string") {
            cmp = av < bv ? -1 : av > bv ? 1 : 0;
          }
          if (dir === "DESC") cmp = -cmp;
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
    }

    // Parse LIMIT clause
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      results = results.slice(0, Number.parseInt(limitMatch[1], 10));
    }

    // Project only selected columns (SELECT col1, col2, ... FROM)
    const selectMatch = sql.match(/^SELECT\s+(.+?)\s+FROM/is);
    if (selectMatch && selectMatch[1].trim() !== "*") {
      const selectedCols = selectMatch[1].split(",").map((c) => c.trim());
      results = results.map((row) => {
        const projected: Row = {};
        for (const col of selectedCols) {
          projected[col] = row[col] ?? null;
        }
        return projected;
      });
    }

    return results;
  }

  query(sql: string) {
    return this.prepare(sql);
  }

  close(): void {}
}

export default Database;
