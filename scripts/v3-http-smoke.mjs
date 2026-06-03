import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const logDir = path.join(root, ".local-data", "smoke");
let server = null;
let selectedPort = Number(process.env.V3_SMOKE_PORT ?? 0);
let baseUrl = process.env.V3_SMOKE_BASE_URL ?? "";

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAvailablePort() {
  if (selectedPort > 0) return selectedPort;
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 3201;
      probe.close(() => resolve(port));
    });
  });
}

async function requestJson(pathname, init = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${pathname} failed ${res.status}: ${text.slice(0, 500)}`);
  }
  return body;
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok) return;
    } catch {
      // keep waiting
    }
    await sleep(750);
  }
  throw new Error(`server did not become ready at ${baseUrl}`);
}

async function startServerIfNeeded() {
  if (process.env.V3_SMOKE_BASE_URL) {
    baseUrl = process.env.V3_SMOKE_BASE_URL;
    await waitForServer();
    return;
  }
  selectedPort = await getAvailablePort();
  baseUrl = `http://127.0.0.1:${selectedPort}`;
  await fs.mkdir(logDir, { recursive: true });
  const out = createWriteStream(path.join(logDir, "next-start.out.log"), { flags: "w" });
  const err = createWriteStream(path.join(logDir, "next-start.err.log"), { flags: "w" });
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  server = spawn(process.execPath, [nextBin, "start", "-p", String(selectedPort), "-H", "127.0.0.1"], {
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
    // smoke should not fail just because shutdown cleanup raced.
  }
}

async function main() {
  await startServerIfNeeded();

  const home = await fetch(baseUrl);
  if (!home.ok) throw new Error(`home returned ${home.status}`);

  const preference = await requestJson("/api/v3/model-preferences?deviceId=smoke-device");
  const updatedPreference = await requestJson("/api/v3/model-preferences", {
    method: "PUT",
    body: JSON.stringify({
      deviceId: "smoke-device",
      targetModelId: "gpt-image-2",
      generatorModelIds: ["gpt-5.5", "claude-opus-4-7"],
      evaluatorModelIds: ["gpt-5.5"],
      imageJudgeModelIds: ["gpt-5.5"],
      isLocked: true,
    }),
  });

  const generated = await requestJson("/api/v3/prompts/generate", {
    method: "POST",
    body: JSON.stringify({
      deviceId: "smoke-device-auto",
      userIdea: "用参考照片生成商业海报，保留人物身份，中文标题清晰，手部不能畸形",
      failedDimensions: ["hand_anatomy", "text_rendering", "reference_similarity"],
      hasReferenceImage: true,
    }),
  });

  const promptId = generated.data.promptId;
  const versionId = generated.data.versionId;
  const optimizedPrompt = generated.data.optimizedPrompt;

  const feedback = await requestJson("/api/v3/feedback", {
    method: "POST",
    body: JSON.stringify({
      eventId: `smoke-feedback-${promptId}`,
      promptId,
      promptVersionId: versionId,
      userScore: 55,
      starRating: 2,
      preference: "blend_needed",
      userNotes: "评分虚高，手部和文字要更严格，不能网络错误后丢上下文。",
    }),
  });

  const testRun = await requestJson("/api/v3/test-runs", {
    method: "POST",
    body: JSON.stringify({
      eventId: `smoke-test-${promptId}`,
      promptId,
      promptVersionId: versionId,
      originalPrompt: "原始测试",
      optimizedPrompt,
      targetModelId: "gpt-image-2",
      externalScore: 55,
    }),
  });

  const imageBlob = new Blob([Buffer.from("fake-png-for-smoke")], { type: "image/png" });
  const form = new FormData();
  form.set("file", imageBlob, "reference.png");
  form.set("imageRole", "reference");
  form.set("eventId", `smoke-image-${testRun.data.testRun.id}`);
  form.set("metadata", JSON.stringify({ smoke: true }));
  const imageRes = await fetch(`${baseUrl}/api/v3/test-runs/${testRun.data.testRun.id}/images`, {
    method: "POST",
    body: form,
  });
  const imageText = await imageRes.text();
  let image = null;
  try {
    image = imageText ? JSON.parse(imageText) : null;
  } catch {
    throw new Error(`image upload returned non-json ${imageRes.status}: ${imageText.slice(0, 500)}`);
  }
  if (!imageRes.ok) throw new Error(`image upload failed ${imageRes.status}: ${JSON.stringify(image)}`);

  const score = await requestJson("/api/v3/scoring/prompt", {
    method: "POST",
    body: JSON.stringify({ promptText: optimizedPrompt, userIdea: "商业海报", failedDimensions: ["hand_anatomy"] }),
  });

  const decision = await requestJson(`/api/v3/prompts/${promptId}/decision`, {
    method: "POST",
    body: JSON.stringify({
      decision: "blend_needed",
      newVersionId: versionId,
      newPrompt: optimizedPrompt,
      oldPrompt: "旧版结构稳定但缺少手部和文字约束",
      userIdea: "商业海报",
      notes: "融合旧结构和新细节",
      failedDimensions: ["hand_anatomy"],
    }),
  });

  const compared = await requestJson(`/api/v3/prompts/${promptId}/compare`);
  const exported = await requestJson("/api/v3/dataset/export", {
    method: "POST",
    body: JSON.stringify({ reason: "http_smoke" }),
  });

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    preferenceBefore: preference.data.targetModelId,
    preferenceLocked: updatedPreference.data.isLocked,
    promptId,
    versionId,
    modality: generated.data.modality,
    targetModelId: generated.data.targetModelId,
    modelSelection: generated.data.modelSelection,
    qualityPass: generated.qualityGate.pass,
    feedbackNeedsOptimization: feedback.data.needsOptimization,
    testRunId: testRun.data.testRun.id,
    imageSha256: image.data.sha256,
    score: score.data.score.totalScore,
    syntheticVersionId: decision.data.syntheticVersionId,
    compareVersions: compared.data.versions.length,
    exportedItems: exported.data.itemCount,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer();
  });
