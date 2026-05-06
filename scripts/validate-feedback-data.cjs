const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2] || path.join(process.cwd(), "data");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else if (item.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

function assertString(row, key, file, line) {
  if (typeof row[key] !== "string") {
    throw new Error(`${file}:${line} missing string field ${key}`);
  }
}

function validateRow(row, file, line) {
  assertString(row, "schema_version", file, line);
  assertString(row, "id", file, line);
  assertString(row, "created_at", file, line);
  if (row.user_star_rating !== null && row.user_star_rating !== undefined) {
    const rating = Number(row.user_star_rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new Error(`${file}:${line} user_star_rating must be 1-5`);
    }
  }
  if (row.strict_score !== null && row.strict_score !== undefined) {
    const total = Number(row.strict_score.total);
    if (!Number.isFinite(total) || total < 0 || total > 100) {
      throw new Error(`${file}:${line} strict_score.total must be 0-100`);
    }
  }
}

let count = 0;
for (const file of walk(root)) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((lineText, index) => {
    const trimmed = lineText.trim();
    if (!trimmed) return;
    let row;
    try {
      row = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`${file}:${index + 1} invalid JSON: ${error.message}`);
    }
    validateRow(row, file, index + 1);
    count += 1;
  });
}

console.log(`Validated ${count} JSONL row(s) under ${root}`);
