#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const outDir = path.join(root, "dist-tests");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "package.json"), `${JSON.stringify({ type: "module" }, null, 2)}\n`);
