import { runProductionMigration, databaseHealth } from "../dist-tests/src/server/repositories/database.js";

const dryRun = process.argv.includes("--dry-run");

try {
  const health = await databaseHealth();
  const migration = await runProductionMigration({ dryRun });
  console.log(JSON.stringify({ ok: true, health, migration }, null, 2));
  process.exit(0);
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}
