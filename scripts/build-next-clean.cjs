#!/usr/bin/env node

const { spawn } = require("child_process");

const nextBin = require.resolve("next/dist/bin/next");

const child = spawn(process.execPath, [nextBin, "build"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

const ansiPattern = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const suppressed = [
  "Service worker won't be automatically registered as per the config",
  "window.workbox.register()",
  "Service worker:",
  "  URL: /sw.js",
  "  Scope: /",
  "This app will fallback to these precached routes",
  "Documents (pages): /offline",
];

function shouldSuppress(line) {
  const plain = line.replace(ansiPattern, "");
  return suppressed.some((text) => plain.includes(text));
}

function forward(stream, target) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (shouldSuppress(line)) continue;
      target.write(`${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer && !shouldSuppress(buffer)) {
      target.write(buffer);
    }
  });
}

forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
