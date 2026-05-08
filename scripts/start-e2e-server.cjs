#!/usr/bin/env node

const { spawn } = require("child_process");

const hostname = process.env.HOSTNAME || "127.0.0.1";
const port = process.env.PORT || "3000";
const nextBin = require.resolve("next/dist/bin/next");

const child = spawn(process.execPath, [nextBin, "start", "--hostname", hostname, "--port", port], {
  cwd: process.cwd(),
  env: { ...process.env, HOSTNAME: hostname, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});

const suppressed = [
  '"next start" does not work with "output: standalone" configuration.',
  'Use "node .next/standalone/server.js" instead.',
];

function forward(stream, target) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (suppressed.some((text) => line.includes(text))) continue;
      target.write(`${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer && !suppressed.some((text) => buffer.includes(text))) {
      target.write(buffer);
    }
  });
}

forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);

function stop() {
  if (!child.killed) {
    child.kill();
  }
}

process.on("SIGINT", () => {
  stop();
  process.exit(130);
});

process.on("SIGTERM", () => {
  stop();
  process.exit(143);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
