import fs from "node:fs";
import path from "node:path";

const schemaPath = path.join(process.cwd(), "database", "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

const requiredTables = [
  "prompts",
  "prompt_versions",
  "feedback",
  "test_runs",
  "model_preferences",
  "test_run_images",
  "dataset_exports",
  "quality_gate_results",
];

const requiredFragments = [
  "CREATE EXTENSION IF NOT EXISTS \"pgcrypto\"",
  "CHECK (star_rating BETWEEN 1 AND 5)",
  "CHECK (preference IN ('new_better', 'old_better', 'blend_needed', 'both_bad'))",
  "CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'))",
  "CHECK (size_bytes <= 15728640)",
  "privacy_findings JSONB",
  "ON DELETE CASCADE",
];

const unsafeFragments = [
  "DROP DATABASE",
  "DROP SCHEMA",
  "TRUNCATE ",
  "ALTER SYSTEM",
];

const errors = [];
for (const table of requiredTables) {
  const pattern = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\b`, "i");
  if (!pattern.test(schema)) errors.push(`missing table ${table}`);
}

for (const fragment of requiredFragments) {
  if (!schema.includes(fragment)) errors.push(`missing schema guard: ${fragment}`);
}

for (const fragment of unsafeFragments) {
  if (schema.toUpperCase().includes(fragment)) errors.push(`unsafe schema fragment: ${fragment}`);
}

if (errors.length) {
  console.error(`Schema validation failed:\n${errors.join("\n")}`);
  process.exit(1);
}

console.log(`Schema validation OK: ${requiredTables.length} tables, ${requiredFragments.length} guards.`);
