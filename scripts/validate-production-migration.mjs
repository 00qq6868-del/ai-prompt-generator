import fs from "node:fs";
import path from "node:path";

const schemaPath = path.join(process.cwd(), "database", "schema.sql");
const composePath = path.join(process.cwd(), "docker-compose.yml");
const schema = fs.readFileSync(schemaPath, "utf8");
const compose = fs.readFileSync(composePath, "utf8");

const requirements = [
  { id: "postgres_service", ok: /postgres:\s*\n[\s\S]*image:\s*postgres:16/.test(compose), fix: "docker-compose.yml must define postgres:16 service." },
  { id: "redis_service", ok: /redis:\s*\n[\s\S]*image:\s*redis:7/.test(compose), fix: "docker-compose.yml must define redis:7 service." },
  { id: "database_url", ok: /DATABASE_URL:/.test(compose), fix: "web service must receive DATABASE_URL." },
  { id: "pgcrypto", ok: /CREATE EXTENSION IF NOT EXISTS "pgcrypto"/.test(schema), fix: "schema.sql must enable pgcrypto." },
  { id: "prompts", ok: /CREATE TABLE IF NOT EXISTS prompts/.test(schema), fix: "schema.sql must include prompts table." },
  { id: "feedback_memory", ok: /CREATE TABLE IF NOT EXISTS feedback_memory/.test(schema), fix: "schema.sql must include feedback_memory table." },
  { id: "github_ledger", ok: /CREATE TABLE IF NOT EXISTS github_ledger_entries/.test(schema), fix: "schema.sql must include github_ledger_entries table." },
  { id: "provider_registry", ok: /CREATE TABLE IF NOT EXISTS provider_registry_validations/.test(schema), fix: "schema.sql must include provider_registry_validations table." },
  { id: "vector_ready", ok: /embedding vector|embedding FLOAT8\[\]|VECTOR_FALLBACK/.test(schema), fix: "schema.sql must include vector-ready feedback_memory embedding column or documented fallback." },
];

const failed = requirements.filter((item) => !item.ok);
console.log(JSON.stringify({ ok: failed.length === 0, requirements, failed }, null, 2));
process.exit(failed.length ? 1 : 0);
