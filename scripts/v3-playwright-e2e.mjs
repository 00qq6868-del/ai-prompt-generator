import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const logDir = path.join(root, ".local-data", "e2e");
let baseUrl = process.env.V3_E2E_BASE_URL ?? process.env.V3_SMOKE_BASE_URL ?? "";
let server = null;

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAvailablePort() {
  const configured = Number(process.env.V3_E2E_PORT ?? 0);
  if (configured > 0) return configured;
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 3202;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok) return;
    } catch {
      // wait until Next is ready
    }
    await sleep(750);
  }
  throw new Error(`server did not become ready at ${baseUrl}`);
}

async function startServerIfNeeded() {
  if (baseUrl) {
    await waitForServer();
    return;
  }
  const port = await getAvailablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  await fs.mkdir(logDir, { recursive: true });
  const out = createWriteStream(path.join(logDir, "next-start.out.log"), { flags: "w" });
  const err = createWriteStream(path.join(logDir, "next-start.err.log"), { flags: "w" });
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  server = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: { ...process.env, NODE_ENV: "production" },
  });
  server.stdout?.pipe(out);
  server.stderr?.pipe(err);
  await fs.writeFile(path.join(logDir, "pid.txt"), `${server.pid}\n`, "utf8");
  await waitForServer();
}

async function stopServer() {
  if (!server) return;
  try {
    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
        killer.on("exit", resolve);
        killer.on("error", resolve);
      });
    } else {
      server.kill("SIGTERM");
    }
  } catch {
    // cleanup best-effort
  }
}

await startServerIfNeeded();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /生成 V3 提示词/ }).click();
  await page.waitForSelector("text=生成结果与质量门槛", { timeout: 20_000 });
  await page.waitForSelector("text=version", { timeout: 20_000 });
  await page.getByRole("button", { name: "提交反馈" }).click();
  await page.waitForSelector("text=反馈已保存", { timeout: 20_000 });
  await page.getByRole("button", { name: "同步测试记录" }).click();
  await page.waitForSelector("text=测试记录已保存", { timeout: 20_000 });
  await page.getByRole("button", { name: "补传离线队列" }).click();
  await page.waitForSelector("text=离线队列处理", { timeout: 20_000 });
  const metrics = await page.locator(".metric strong").allTextContents();
  const promptText = await page.locator(".prompt-output").first().innerText();
  if (!promptText.includes("Negative Prompt")) {
    throw new Error("generated prompt did not include Negative Prompt");
  }
  console.log(JSON.stringify({ ok: true, baseUrl, metrics }, null, 2));
} finally {
  await browser.close();
  await stopServer();
}
