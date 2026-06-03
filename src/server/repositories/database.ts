import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDatabasePool(): pg.Pool {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is not configured. V3 is using the local JSON fallback store.");
  }
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.POSTGRES_POOL_MAX ?? 8),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export async function runProductionMigration(input: {
  schemaPath?: string;
  dryRun?: boolean;
} = {}) {
  const schemaPath = input.schemaPath ?? path.join(process.cwd(), "database", "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf8");
  const statements = schema
    .split(/;\s*(?:\r?\n|$)/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !item.startsWith("--"));

  if (input.dryRun) {
    return {
      ok: true as const,
      mode: "dry_run",
      schemaPath,
      statementCount: statements.length,
      databaseConfigured: hasDatabaseUrl(),
    };
  }

  const db = getDatabasePool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (const statement of statements) {
      await client.query(statement);
    }
    await client.query("COMMIT");
    return {
      ok: true as const,
      mode: "executed",
      schemaPath,
      statementCount: statements.length,
      databaseConfigured: true,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function databaseHealth() {
  if (!hasDatabaseUrl()) {
    return {
      ok: true as const,
      mode: "local_json_fallback",
      databaseConfigured: false,
      warning: "DATABASE_URL is not configured; production should enable PostgreSQL before multi-user deployment.",
    };
  }
  const db = getDatabasePool();
  const result = await db.query("SELECT now() AS now");
  return {
    ok: true as const,
    mode: "postgres",
    databaseConfigured: true,
    now: result.rows[0]?.now ?? null,
  };
}

