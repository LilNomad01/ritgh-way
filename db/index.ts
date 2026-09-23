import { Pool, types, type PoolClient, type QueryResult } from "pg";

types.setTypeParser(20, (value) => Number(value));

type D1Meta = {
  changes: number;
  last_row_id?: number;
};

type D1Result<T = Record<string, unknown>> = {
  results: T[];
  success: true;
  meta: D1Meta;
};

const TABLES_WITH_ID = new Set([
  "students",
  "course_modules",
  "course_sections",
  "lessons",
  "lesson_exercises",
  "user_accounts",
  "placement_attempts",
  "lesson_progress",
  "exercise_attempts",
  "practice_sessions",
  "video_progress",
  "section_exams",
  "section_exam_questions",
  "section_exam_attempts",
  "lesson_videos",
]);

const globalDatabase = globalThis as typeof globalThis & {
  __rightWayPostgresPool?: Pool;
};

function databaseUrl() {
  const value = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!value) {
    throw new Error(
      "DATABASE_URL is not configured. Use the Supabase transaction-pooler connection string in Vercel."
    );
  }
  return value;
}

function pool() {
  if (!globalDatabase.__rightWayPostgresPool) {
    globalDatabase.__rightWayPostgresPool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.POSTGRES_POOL_MAX || 5),
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalDatabase.__rightWayPostgresPool;
}

function quoteCamelCaseAliases(sql: string) {
  return sql.replace(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b/g, (match, alias: string) =>
    /[A-Z]/.test(alias) ? `AS "${alias}"` : match
  );
}

function replaceQuestionMarks(sql: string) {
  let index = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let output = "";

  for (let position = 0; position < sql.length; position += 1) {
    const character = sql[position];
    const next = sql[position + 1];

    if (character === "'" && !doubleQuoted) {
      output += character;
      if (singleQuoted && next === "'") {
        output += next;
        position += 1;
        continue;
      }
      singleQuoted = !singleQuoted;
      continue;
    }

    if (character === '"' && !singleQuoted) {
      output += character;
      if (doubleQuoted && next === '"') {
        output += next;
        position += 1;
        continue;
      }
      doubleQuoted = !doubleQuoted;
      continue;
    }

    if (character === "?" && !singleQuoted && !doubleQuoted) {
      index += 1;
      output += `$${index}`;
      continue;
    }

    output += character;
  }

  return output;
}

function normalizeSql(input: string) {
  let sql = input.trim().replace(/;\s*$/, "");

  const insertOrIgnore = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);
  if (insertOrIgnore) {
    sql = sql.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i, "INSERT INTO");
  }

  sql = sql.replace(
    /\bMAX\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*,\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)/gi,
    "GREATEST($1, $2)"
  );

  sql = quoteCamelCaseAliases(sql);
  sql = replaceQuestionMarks(sql);

  if (insertOrIgnore && !/\bON\s+CONFLICT\b/i.test(sql)) {
    sql += " ON CONFLICT DO NOTHING";
  }

  return sql;
}

function tableForInsert(sql: string) {
  const match = sql.match(/^\s*INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+["`]?(\w+)["`]?/i);
  return match?.[1]?.toLowerCase();
}

function addReturningId(sql: string) {
  const table = tableForInsert(sql);
  if (!table || !TABLES_WITH_ID.has(table) || /\bRETURNING\b/i.test(sql)) return sql;
  return `${sql} RETURNING id`;
}

class PostgresPreparedStatement {
  private values: unknown[] = [];

  constructor(private readonly sourceSql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  private async query(client: PoolClient | Pool, returningId = false): Promise<QueryResult> {
    let sql = normalizeSql(this.sourceSql);
    if (returningId) sql = addReturningId(sql);
    return client.query(sql, this.values);
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = await this.query(pool());
    return {
      results: result.rows as T[],
      success: true,
      meta: { changes: result.rowCount ?? 0 },
    };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.query(pool());
    return (result.rows[0] as T | undefined) ?? null;
  }

  async run(): Promise<D1Result> {
    const result = await this.query(pool(), true);
    const id = result.rows[0]?.id;
    return {
      results: result.rows,
      success: true,
      meta: {
        changes: result.rowCount ?? 0,
        ...(id === undefined ? {} : { last_row_id: Number(id) }),
      },
    };
  }

  async executeOn(client: PoolClient): Promise<D1Result> {
    let sql = normalizeSql(this.sourceSql);
    sql = addReturningId(sql);
    const result = await client.query(sql, this.values);
    const id = result.rows[0]?.id;
    return {
      results: result.rows,
      success: true,
      meta: {
        changes: result.rowCount ?? 0,
        ...(id === undefined ? {} : { last_row_id: Number(id) }),
      },
    };
  }
}

class PostgresD1Compat {
  prepare(sql: string) {
    return new PostgresPreparedStatement(sql);
  }

  async batch(statements: PostgresPreparedStatement[]) {
    const client = await pool().connect();
    try {
      await client.query("BEGIN");
      const results: D1Result[] = [];
      for (const statement of statements) {
        results.push(await statement.executeOn(client));
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

let database: PostgresD1Compat | undefined;

export function getD1() {
  database ??= new PostgresD1Compat();
  return database;
}

export function getDb() {
  return getD1();
}
