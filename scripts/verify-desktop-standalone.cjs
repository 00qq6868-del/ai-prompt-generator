#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const requiredPaths = [
  ".next/standalone/server.js",
  ".next/standalone/.next",
  ".next/static",
  "public",
  "electron/main.js",
  "electron/preload.js",
];

function assert(condition, message) {
  if (!condition) {
    console.error(`[desktop-verify] ${message}`);
    process.exit(1);
  }
}

for (const rel of requiredPaths) {
  assert(fs.existsSync(path.join(root, rel)), `missing required desktop resource: ${rel}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const targets = pkg.build?.win?.target ?? [];
const targetNames = targets.map((target) => typeof target === "string" ? target : target.target);

assert(targetNames.includes("nsis"), "Windows installer target (nsis) is missing");
assert(targetNames.includes("portable"), "Windows portable target is missing");
assert(pkg.build?.nsis?.artifactName?.includes("Setup"), "NSIS artifact name should include Setup");
assert(pkg.build?.portable?.artifactName?.includes("Portable"), "Portable artifact name should include Portable");

const main = fs.readFileSync(path.join(root, "electron", "main.js"), "utf8");
assert(main.includes("http://127.0.0.1"), "desktop runtime must load the local loopback server");
assert(main.includes("PORTABLE_EXECUTABLE_DIR"), "portable data directory support is missing");
assert(!main.includes("www.myprompt.asia"), "desktop main process must not depend on the production domain");

console.log("[desktop-verify] standalone desktop checks passed");
