import { test, expect, Page } from "@playwright/test";

// ── Helpers ──────────────────────────────────────────────────────

/** Mock all API endpoints so tests run without real keys/servers. */
async function mockAPIs(page: Page) {
  // /api/keys — no server-side keys configured
  await page.route("**/api/keys", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: [] }),
    })
  );

  // /api/models — return a minimal model list
  await page.route("**/api/models*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: [
          {
            id: "gpt-5.5-pro",
            name: "GPT-5.5 Pro",
            provider: "OpenAI",
            apiProvider: "openai",
            category: "text",
            contextWindow: 1048576,
            maxOutput: 128000,
            inputCostPer1M: 30,
            outputCostPer1M: 180,
            speed: "medium",
            accuracy: "supreme",
            supportsStreaming: true,
            isLatest: true,
            tags: ["reasoning", "code", "vision", "agentic", "pro"],
            releaseDate: "2026-04-24",
          },
          {
            id: "gpt-5.5",
            name: "GPT-5.5",
            provider: "OpenAI",
            apiProvider: "openai",
            category: "text",
            contextWindow: 1048576,
            maxOutput: 128000,
            inputCostPer1M: 5,
            outputCostPer1M: 30,
            speed: "fast",
            accuracy: "supreme",
            supportsStreaming: true,
            isLatest: true,
            tags: ["reasoning", "code", "vision", "agentic"],
            releaseDate: "2026-04-24",
          },
          {
            id: "claude-sonnet-4-6",
            name: "Claude Sonnet 4.6",
            provider: "Anthropic",
            apiProvider: "anthropic",
            category: "text",
            contextWindow: 1048576,
            maxOutput: 64000,
            inputCostPer1M: 3,
            outputCostPer1M: 15,
            speed: "fast",
            accuracy: "supreme",
            supportsStreaming: true,
            isLatest: true,
            tags: ["vision", "code", "thinking"],
            releaseDate: "2025-11-24",
          },
          {
            id: "gpt-4o",
            name: "GPT-4o",
            provider: "OpenAI",
            apiProvider: "openai",
            category: "text",
            contextWindow: 128000,
            maxOutput: 16384,
            inputCostPer1M: 2.5,
            outputCostPer1M: 10,
            speed: "fast",
            accuracy: "high",
            supportsStreaming: true,
            isLatest: true,
            tags: ["vision", "code"],
            releaseDate: "2024-05-13",
          },
          {
            id: "gpt-4o-mini",
            name: "GPT-4o Mini",
            provider: "OpenAI",
            apiProvider: "openai",
            category: "text",
            contextWindow: 128000,
            maxOutput: 16384,
            inputCostPer1M: 0.15,
            outputCostPer1M: 0.6,
            speed: "ultrafast",
            accuracy: "medium",
            supportsStreaming: true,
            isLatest: false,
            tags: ["fast", "cheap"],
            releaseDate: "2024-07-18",
          },
          {
            id: "dall-e-3",
            name: "DALL·E 3",
            provider: "OpenAI",
            apiProvider: "openai",
            category: "image",
            contextWindow: 8192,
            maxOutput: 4096,
            inputCostPer1M: 0,
            outputCostPer1M: 0,
            speed: "medium",
            accuracy: "high",
            supportsStreaming: false,
            isLatest: true,
            tags: ["image-gen"],
            releaseDate: "2023-10-01",
          },
          {
            id: "gpt-image-2",
            name: "GPT Image 2",
            provider: "OpenAI",
            apiProvider: "openai",
            category: "image",
            contextWindow: 32768,
            maxOutput: 4096,
            inputCostPer1M: 5,
            outputCostPer1M: 40,
            speed: "medium",
            accuracy: "supreme",
            supportsStreaming: false,
            isLatest: true,
            tags: ["image-gen", "editing"],
            releaseDate: "2025-08-01",
          },
        ],
      }),
    })
  );

  // /api/probe — no probe results
  await page.route("**/api/probe", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ models: [] }),
    })
  );

  // /api/analytics — keep tests hermetic and avoid writing local JSONL files
  await page.route("**/api/analytics", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    })
  );

  await page.route("**/api/feedback", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, feedbackId: "feedback-e2e", github: { synced: false } }),
    })
  );

  await page.route("**/api/history/sync", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, received: 0, synced: 0 }),
    })
  );

  await page.route("**/api/test-channel/run", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        status: "pass",
        reportId: "test-channel-e2e",
        model: {
          id: "gpt-5.5-pro",
          name: "GPT-5.5 Pro",
          provider: "OpenAI",
          apiProvider: "openai",
          targetModelId: "gpt-5.5-pro",
          targetModelName: "GPT-5.5 Pro",
        },
        strictScore: {
          total: 91,
          pass: true,
          scoreType: "prompt",
          dimensionScores: {
            intent_fidelity: 9.4,
            target_model_fit: 9.2,
            hallucination_resistance: 9.1,
            reference_image_consistency: 8.6,
          },
          deductions: [],
        },
        checks: [
          { id: "provider_connectivity", label: "真实模型连通性 / Provider connectivity", value: 10, threshold: 10, status: "pass" },
          { id: "strict_total", label: "严格总分 / Strict total score", value: 91, threshold: 85, status: "pass" },
          { id: "secret_handling", label: "密钥防泄露 / Secret handling", value: 10, threshold: 10, status: "pass" },
        ],
        attempts: [
          {
            attempt: 1,
            score: { total: 91, pass: true, dimensionScores: { intent_fidelity: 9.4 } },
            latencyMs: 500,
            preview: "Safe preview.",
          },
        ],
        stats: { latencyMs: 900, inputTokens: 100, outputTokens: 200 },
        providerStatus: {
          configured: ["openai"],
          keys: [{ keyName: "OPENAI_API_KEY", source: "browser", masked: "sk-...-e2e", hash: "hash-e2e" }],
        },
        bestPromptPreview: "最佳提示词预览，不包含任何原始密钥。",
        github: { synced: false, target: "local", filePath: "data/test-channel-runs/2026-05.jsonl" },
        secretHandling: "raw keys are never returned, logged, or written to GitHub datasets",
      }),
    })
  );
}

/** Build a SSE response body that streams chunks then sends a done event. */
function buildSSEBody(optimizedPrompt: string, metaExtra: Record<string, unknown> = {}) {
  const chunks = optimizedPrompt.match(/.{1,20}/g) ?? [optimizedPrompt];
  let body = `data: ${JSON.stringify({ t: "ping", elapsedSec: 1, message: "连接保持中 / Connection alive" })}\n\n`;
  for (const chunk of chunks) {
    body += `data: ${JSON.stringify({ t: "chunk", c: chunk })}\n\n`;
  }
  body += `data: ${JSON.stringify({
    t: "done",
    data: {
      optimizedPrompt,
      stats: {
        inputTokens: 50,
        outputTokens: 120,
        latencyMs: 800,
        tokensDelta: 70,
        changePercent: 140,
      },
      meta: { generatorModel: "GPT-4o Mini", targetModel: "GPT-4o", ...metaExtra },
      generatorModelCost: { input: 0.00015, output: 0.0006 },
    },
  })}\n\n`;
  body += "data: [DONE]\n\n";
  return body;
}

function buildPartialThenErrorSSEBody(partialPrompt: string) {
  return [
    `data: ${JSON.stringify({ t: "chunk", c: partialPrompt })}`,
    "",
    `data: ${JSON.stringify({ t: "error", error: "fetch failed" })}`,
    "",
  ].join("\n");
}

const MOCK_OPTIMIZED =
  "# Role\nYou are a senior poet specializing in classical Chinese poetry.\n\n# Task\nWrite a poem about autumn using Tang dynasty style.";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

// ── Tests ────────────────────────────────────────────────────────

test.describe("PromptGenerator E2E", () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await page.goto("/");
  });

  test("1. page loads with hero and input area", async ({ page }) => {
    await expect(
      page.locator("header").getByRole("heading", { name: "AI 提示词生成器" })
    ).toBeVisible();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveAttribute("aria-label", /输入你的想法或需求/);
    await expect(textarea).toHaveAttribute("placeholder", /写一首关于秋天的古风诗/);
  });

  test("2. typing shows character count", async ({ page }) => {
    const textarea = page.locator("textarea");
    await textarea.fill("Hello world 你好世界");

    const charCount = page.locator("textarea + span, textarea ~ span").first();
    await expect(charCount).toBeVisible();
    await expect(charCount).toContainText("16");
  });

  test("3. language toggle switches zh ↔ en", async ({ page }) => {
    const langBtn = page.getByRole("button", { name: /切换为英文|Switch to Chinese/ });
    await expect(langBtn).toContainText("中文输出");

    await langBtn.click();
    await expect(langBtn).toContainText("English output");

    await langBtn.click();
    await expect(langBtn).toContainText("中文输出");
  });

  test("4. generate button disabled when textarea is empty", async ({ page }) => {
    const genBtn = page.getByRole("button", { name: /生成优化提示词/ });
    await expect(genBtn).toBeDisabled();

    const textarea = page.locator("textarea");
    await textarea.fill("写一首秋天的诗");
    await expect(genBtn).toBeEnabled();

    await textarea.fill("");
    await expect(genBtn).toBeDisabled();
  });

  test("5. target model cards select and unified model picker opens", async ({ page }) => {
    const targetCards = page.locator("button[aria-pressed]");
    await expect(targetCards.first()).toBeVisible({ timeout: 15_000 });
    await targetCards.first().click();
    await expect(targetCards.first()).toHaveAttribute("aria-pressed", "true");

    const generatorTrigger = page.getByRole("button", {
      name: "选择生成和评价模型 Open generation and evaluation model picker",
    });
    await generatorTrigger.click();

    const dialog = page.getByRole("dialog", { name: "选择生成/评价模型" });
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole("button", { name: "选择评价模型 Open evaluator model picker" })).toHaveCount(0);
  });

  test("6. SSE streaming generation flow", async ({ page }) => {
    // Mock /api/generate with SSE
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
        body: buildSSEBody(MOCK_OPTIMIZED),
      })
    );

    // Set a fake generator model via localStorage so the generate button works
    await page.evaluate(() => {
      localStorage.setItem(
        "ai_prompt_user_keys",
        JSON.stringify({ OPENAI_API_KEY: "sk-test-fake-key-for-e2e" })
      );
    });
    await page.reload();
    await mockAPIs(page);
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
        body: buildSSEBody(MOCK_OPTIMIZED),
      })
    );

    const textarea = page.locator("textarea");
    await textarea.fill("写一首秋天的古风诗");

    const genBtn = page.getByRole("button", { name: /生成优化提示词/ });
    await genBtn.click();

    // Final result should appear
    await expect(page.locator("text=senior poet")).toBeVisible({ timeout: 10_000 });
  });

  test("7. result panel shows optimized prompt with copy button", async ({ page }) => {
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
        body: buildSSEBody(MOCK_OPTIMIZED),
      })
    );

    await page.evaluate(() => {
      localStorage.setItem(
        "ai_prompt_user_keys",
        JSON.stringify({ OPENAI_API_KEY: "sk-test-fake-key-for-e2e" })
      );
    });
    await page.reload();
    await mockAPIs(page);
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache, no-transform" },
        body: buildSSEBody(MOCK_OPTIMIZED),
      })
    );

    await page.locator("textarea").fill("写一首秋天的古风诗");
    await page.getByRole("button", { name: /生成优化提示词/ }).click();

    // Wait for result panel
    await expect(page.locator("text=senior poet")).toBeVisible({ timeout: 10_000 });

    // Result panel should have a copy button
    const copyBtn = page.getByRole("button", { name: /复制|Copy/ });
    await expect(copyBtn).toBeVisible();
  });

  test("8. error response shows toast", async ({ page }) => {
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "API Key 无效 / Invalid API Key" }),
      })
    );

    await page.evaluate(() => {
      localStorage.setItem(
        "ai_prompt_user_keys",
        JSON.stringify({ OPENAI_API_KEY: "sk-test-fake-key-for-e2e" })
      );
    });
    await page.reload();
    await mockAPIs(page);
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "API Key 无效 / Invalid API Key" }),
      })
    );

    await page.locator("textarea").fill("写一首秋天的古风诗");
    await page.getByRole("button", { name: /生成优化提示词/ }).click();

    // Error toast should appear
    await expect(page.locator("text=API Key 无效")).toBeVisible({ timeout: 5_000 });
  });

  test("5b. old model preferences migrate to GPT-5.5-first defaults", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("ai_prompt_target_model_id", "claude-sonnet-4-6");
      localStorage.setItem("ai_prompt_target_model_locked", "1");
      localStorage.setItem("ai_prompt_last_generator_model_ids", JSON.stringify(["claude-sonnet-4-6"]));
      localStorage.setItem("ai_prompt_last_evaluator_model_ids", JSON.stringify(["gemini-3.1-pro-high"]));
    });

    await page.reload();
    await mockAPIs(page);

    await expect(page.getByText("当前已选目标模型 Selected target")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("GPT-5.5 Pro").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "选择生成和评价模型 Open generation and evaluation model picker" })).toContainText("GPT-5.5 Pro");
    await expect(page.getByRole("button", { name: "选择评价模型 Open evaluator model picker" })).toHaveCount(0);
  });

  test("5c. saved GPT-5.5 generator preference upgrades to GPT-5.5 Pro", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("ai_prompt_target_model_id", "gpt-5.5-pro");
      localStorage.setItem("ai_prompt_target_model_locked", "0");
      localStorage.setItem("ai_prompt_last_generator_model_ids", JSON.stringify(["gpt-5.5"]));
      localStorage.setItem("ai_prompt_last_evaluator_model_ids", JSON.stringify(["gpt-5.5-pro", "gpt-5.5"]));
    });

    await page.reload();
    await mockAPIs(page);

    await expect(page.getByText("当前已选目标模型 Selected target")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("GPT-5.5 Pro").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "选择生成和评价模型 Open generation and evaluation model picker" })).toContainText("GPT-5.5 Pro");
    await expect(page.getByRole("button", { name: "选择评价模型 Open evaluator model picker" })).toHaveCount(0);
  });

  test("8b. SSE error after partial output keeps the received prompt", async ({ page }) => {
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache, no-transform" },
        body: buildPartialThenErrorSSEBody("Partial optimized prompt that should not be lost."),
      })
    );

    await page.evaluate(() => {
      localStorage.setItem(
        "ai_prompt_user_keys",
        JSON.stringify({ OPENAI_API_KEY: "sk-test-fake-key-for-e2e" })
      );
    });
    await page.reload();
    await mockAPIs(page);
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache, no-transform" },
        body: buildPartialThenErrorSSEBody("Partial optimized prompt that should not be lost."),
      })
    );

    await page.locator("textarea").fill("写一条会断流但已有输出的提示词");
    await page.getByRole("button", { name: /生成优化提示词/ }).click();

    await expect(page.getByText("Partial optimized prompt that should not be lost.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/已保留收到的部分结果/).first()).toBeVisible({ timeout: 5_000 });
  });

  test("9. result panel shows bilingual evaluation criteria", async ({ page }) => {
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache, no-transform" },
        body: buildSSEBody(MOCK_OPTIMIZED, {
          promptEvaluation: {
            rubric: [
              {
                id: "intent_fidelity",
                label: "Intent fidelity",
                labelZh: "意图保真",
                weight: 18,
                guide: "Preserves user requirements.",
                guideZh: "保留用户需求。",
              },
            ],
            candidates: [
              {
                id: "c1",
                generatorModelId: "gpt-4o-mini",
                generatorModelName: "GPT-4o Mini · hybrid",
                averageScore: 92,
                rank: 1,
                scores: [{ judgeModel: "GPT-4o", score: 92, reason: "Strong fit." }],
              },
            ],
            judgeModels: ["GPT-4o"],
            selectedCandidateId: "c1",
            summary: "评分摘要 Scoring summary.",
          },
        }),
      })
    );

    await page.evaluate(() => {
      localStorage.setItem(
        "ai_prompt_user_keys",
        JSON.stringify({ OPENAI_API_KEY: "sk-test-fake-key-for-e2e" })
      );
    });
    await page.reload();
    await mockAPIs(page);
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache, no-transform" },
        body: buildSSEBody(MOCK_OPTIMIZED, {
          promptEvaluation: {
            rubric: [
              {
                id: "intent_fidelity",
                label: "Intent fidelity",
                labelZh: "意图保真",
                weight: 18,
                guide: "Preserves user requirements.",
                guideZh: "保留用户需求。",
              },
            ],
            candidates: [
              {
                id: "c1",
                generatorModelId: "gpt-4o-mini",
                generatorModelName: "GPT-4o Mini · hybrid",
                averageScore: 92,
                rank: 1,
                scores: [{ judgeModel: "GPT-4o", score: 92, reason: "Strong fit." }],
              },
            ],
            judgeModels: ["GPT-4o"],
            selectedCandidateId: "c1",
            summary: "评分摘要 Scoring summary.",
          },
        }),
      })
    );

    await page.locator("textarea").fill("生成一张 GPT Image 2 产品海报提示词");
    await page.getByRole("button", { name: /生成优化提示词/ }).click();

    await expect(page.getByText("评分标准 Scoring Criteria")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/意图保真 Intent fidelity/)).toBeVisible();
    await expect(page.getByText(/保留用户需求/)).toBeVisible();
  });

  test("10. image request auto-selects and persists the recommended target model", async ({ page }) => {
    await page.locator("textarea").fill("生成一张高端科技产品海报");

    await expect(page.getByText("当前已选目标模型 Selected target")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("GPT Image 2").first()).toBeVisible();

    await page.reload();
    await mockAPIs(page);
    await expect(page.getByText("当前已选目标模型 Selected target")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("GPT Image 2").first()).toBeVisible();
  });

  test("11. relay-only probed models are selectable in the generator picker", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        "ai_prompt_user_keys",
        JSON.stringify({
          CUSTOM_BASE_URL: "https://relay.example.com/v1",
          CUSTOM_API_KEY: "sk-test-fake-custom-relay",
        })
      );
    });

    await page.route("**/api/probe", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          models: ["gpt-5.5", "ac-claude-opus-4-6-thinking", "ZhipuAI/GLM-5.1"],
          total: 3,
          baseUrl: "https://relay.example.com/v1",
        }),
      })
    );

    await page.reload();
    await page.getByRole("button", { name: "选择生成和评价模型 Open generation and evaluation model picker" }).click();
    const dialog = page.getByRole("dialog", { name: "选择生成/评价模型" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("搜索模型 Search models").fill("ZhipuAI");
    await dialog.getByRole("button", { name: /ZhipuAI\/GLM-5\.1/ }).click();
    await dialog.getByRole("button", { name: "完成 Done" }).click();

    const generatorTrigger = page.getByRole("button", { name: "选择生成和评价模型 Open generation and evaluation model picker" });
    await expect(generatorTrigger).toContainText("已选 2");
    await expect(generatorTrigger).toContainText("智谱AI");
  });

  test("12. user can save strict prompt feedback after generation", async ({ page }) => {
    let feedbackBody: any = null;
    await page.route("**/api/feedback", async (route) => {
      feedbackBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, feedbackId: "feedback-e2e", github: { synced: false } }),
      });
    });

    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache, no-transform" },
        body: buildSSEBody(MOCK_OPTIMIZED),
      })
    );

    await page.evaluate(() => {
      localStorage.setItem(
        "ai_prompt_user_keys",
        JSON.stringify({ OPENAI_API_KEY: "sk-test-fake-key-for-e2e" })
      );
    });
    await page.reload();
    await mockAPIs(page);
    await page.route("**/api/feedback", async (route) => {
      feedbackBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, feedbackId: "feedback-e2e", github: { synced: false } }),
      });
    });
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache, no-transform" },
        body: buildSSEBody(MOCK_OPTIMIZED),
      })
    );

    await page.locator("textarea").fill("生成一张 GPT Image 2 产品海报提示词");
    await page.getByRole("button", { name: /生成优化提示词/ }).click();
    await expect(page.getByText("给这条 AI 提示词打分 1-5 Stars")).toBeVisible({ timeout: 10_000 });

    await page.getByLabel("2 星 2 stars").click();
    await page.getByRole("button", { name: /两版都不好/ }).click();
    await page.getByLabel("提示词评价 Prompt feedback notes").fill("评分虚高，文字和手部要更严格，参考图身份不能漂移。");
    await page.getByRole("button", { name: /保存评分与评价/ }).click();

    await expect.poll(() => feedbackBody?.starRating).toBe(2);
    expect(feedbackBody.userScore).toBe(40);
    expect(feedbackBody.userNotes).toContain("评分虚高");
    expect(feedbackBody.preference).toBe("both_bad");
    expect(feedbackBody.optimizedPrompt).toContain("senior poet");
    expect(feedbackBody.selectedPrompt).toContain("senior poet");
    expect(feedbackBody.targetModel).toBeTruthy();
    expect(feedbackBody.generatorModels.length).toBeGreaterThan(0);
  });

  test("13. reference image upload sends image-to-image request and shows gated summary", async ({ page }) => {
    let generateBody: any = null;
    await page.route("**/api/generate", async (route) => {
      generateBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache, no-transform" },
        body: buildSSEBody(
          "正向提示词 / Positive Prompt\nUse the uploaded reference image composition, palette, lighting, and style.\n\n负向提示词 / Negative Prompt\nbad hands, distorted face, unreadable text\n\n推荐参数 / Recommended Parameters\naspect ratio 1:1, reference image weight 0.85",
          {
            referenceImage: {
              enabled: true,
              width: 1024,
              height: 1024,
              aspectRatio: "1:1",
              palette: ["#111111", "#eeeeee"],
              averageColor: "#777777",
              brightness: "balanced",
              contrast: "high",
              saturation: "vivid",
              selectedSource: "enhanced_vision",
              internalBestScore: 91,
              qualityGate: "passed",
              analysisChannels: [
                { source: "original_api_vision", modelId: "gpt-5.5-pro", modelName: "GPT-5.5 Pro", available: true },
                { source: "enhanced_vision", modelId: "gemini-2.0-flash", modelName: "Gemini 2.0 Flash", available: true },
              ],
            },
            promptEvaluation: {
              rubric: [
                { id: "visual_similarity", label: "Visual similarity", labelZh: "参考图相似度", weight: 18, guide: "Match reference.", guideZh: "匹配参考图。" },
              ],
              candidates: [
                {
                  id: "enhanced_vision-attempt-1",
                  generatorModelId: "gpt-5.5-pro",
                  generatorModelName: "Enhanced vision",
                  averageScore: 91,
                  rank: 1,
                  scores: [{ judgeModel: "Reference Quality Gate", score: 91, reason: "Strong." }],
                },
              ],
              judgeModels: ["Reference Quality Gate"],
              selectedCandidateId: "enhanced_vision-attempt-1",
              summary: "internal best selected",
            },
          },
        ),
      });
    });

    await page.evaluate(() => {
      localStorage.setItem(
        "ai_prompt_user_keys",
        JSON.stringify({ OPENAI_API_KEY: "sk-test-fake-key-for-e2e" })
      );
    });
    await page.reload();
    await mockAPIs(page);
    await page.route("**/api/generate", async (route) => {
      generateBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache, no-transform" },
        body: buildSSEBody(
          "正向提示词 / Positive Prompt\nUse the uploaded reference image composition, palette, lighting, and style.\n\n负向提示词 / Negative Prompt\nbad hands, distorted face, unreadable text\n\n推荐参数 / Recommended Parameters\naspect ratio 1:1, reference image weight 0.85",
          {
            referenceImage: {
              enabled: true,
              width: 1024,
              height: 1024,
              aspectRatio: "1:1",
              palette: ["#111111", "#eeeeee"],
              averageColor: "#777777",
              brightness: "balanced",
              contrast: "high",
              saturation: "vivid",
              selectedSource: "enhanced_vision",
              internalBestScore: 91,
              qualityGate: "passed",
            },
          },
        ),
      });
    });

    await page.getByTestId("reference-image-input").setInputFiles({
      name: "reference.png",
      mimeType: "image/png",
      buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
    });
    await expect(page.getByText("已启用参考图图生图优化")).toBeVisible();
    const referencePreview = page.getByAltText("参考图预览 Reference preview");
    await expect(referencePreview).toHaveCSS("object-fit", "contain");
    await expect(referencePreview.locator("..")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(page.getByText("GPT Image 2").first()).toBeVisible();
    await page.locator("textarea").fill("做一张类似参考图的高端产品海报");
    await page.getByRole("button", { name: /生成优化提示词|生成图生图提示词/ }).click();

    await expect(page.getByText("Reference image summary")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Reference image summary").click();
    await expect(page.getByText(/91\/100/)).toBeVisible();
    expect(generateBody.referenceImage.dataUrl).toContain("data:image/png;base64,");
    expect(generateBody.referenceImage.name).toBe("reference.png");
    expect(generateBody.referenceImage.size).toBeGreaterThan(0);
  });

  test("14. conflicting user input asks for clarification before generation", async ({ page }) => {
    let generateBody: any = null;
    await page.route("**/api/generate", async (route) => {
      generateBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache, no-transform" },
        body: buildSSEBody(MOCK_OPTIMIZED),
      });
    });

    await page.evaluate(() => {
      localStorage.setItem(
        "ai_prompt_user_keys",
        JSON.stringify({ OPENAI_API_KEY: "sk-test-fake-key-for-e2e" })
      );
    });
    await page.reload();
    await mockAPIs(page);
    await page.route("**/api/generate", async (route) => {
      generateBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache, no-transform" },
        body: buildSSEBody(MOCK_OPTIMIZED),
      });
    });

    await page.locator("textarea").fill("帮我生成汽车广告提示词，但关键词里也写了手机外观");
    await page.getByRole("button", { name: /生成优化提示词/ }).click();

    await expect(page.getByText("需要确认主方向")).toBeVisible();
    await expect(page.getByRole("button", { name: /按「汽车」优化/ })).toBeVisible();
    expect(generateBody).toBeNull();

    await page.getByRole("button", { name: /按「汽车」优化/ }).click();
    await page.getByRole("button", { name: /生成优化提示词/ }).click();

    await expect(page.locator("text=senior poet")).toBeVisible({ timeout: 10_000 });
    expect(generateBody.userIdea).toContain("用户已澄清主要方向：汽车");
    expect(generateBody.feedbackMemory.rules.some((rule: string) => rule.includes("intent_domain"))).toBeTruthy();
  });

  test("15. test channel runs with saved keys and never displays the raw key", async ({ page }) => {
    let testBody: any = null;
    const fakeRawKey = "sk-test-fake-key-for-e2e";
    await page.route("**/api/test-channel/run", async (route) => {
      testBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: "pass",
          reportId: "test-channel-e2e",
          model: {
            id: "gpt-5.5-pro",
            name: "GPT-5.5 Pro",
            provider: "OpenAI",
            apiProvider: "openai",
            targetModelId: "gpt-5.5-pro",
            targetModelName: "GPT-5.5 Pro",
          },
          strictScore: {
            total: 91,
            pass: true,
            scoreType: "prompt",
            dimensionScores: {
              intent_fidelity: 9.4,
              target_model_fit: 9.2,
              hallucination_resistance: 9.1,
            },
            deductions: [],
          },
          checks: [
            { id: "provider_connectivity", label: "真实模型连通性 / Provider connectivity", value: 10, threshold: 10, status: "pass" },
            { id: "strict_total", label: "严格总分 / Strict total score", value: 91, threshold: 85, status: "pass" },
            { id: "secret_handling", label: "密钥防泄露 / Secret handling", value: 10, threshold: 10, status: "pass" },
          ],
          attempts: [
            {
              attempt: 1,
              score: { total: 91, pass: true, dimensionScores: { intent_fidelity: 9.4 } },
              latencyMs: 500,
              preview: "Safe preview.",
            },
          ],
          stats: { latencyMs: 900, inputTokens: 100, outputTokens: 200 },
          providerStatus: {
            configured: ["openai"],
            keys: [{ keyName: "OPENAI_API_KEY", source: "browser", masked: "sk-...-e2e", hash: "hash-e2e" }],
          },
          bestPromptPreview: "最佳提示词预览，不包含任何原始密钥。",
          github: { synced: false, target: "local", filePath: "data/test-channel-runs/2026-05.jsonl" },
          secretHandling: "raw keys are never returned, logged, or written to GitHub datasets",
        }),
      });
    });

    await page.evaluate((key) => {
      localStorage.setItem("ai_prompt_user_keys", JSON.stringify({ OPENAI_API_KEY: key }));
      localStorage.setItem("ai_prompt_target_model_id", "gpt-5.5-pro");
      localStorage.setItem("ai_prompt_last_generator_model_ids", JSON.stringify(["gpt-5.5-pro"]));
    }, fakeRawKey);
    await page.reload();
    await mockAPIs(page);
    await page.route("**/api/test-channel/run", async (route) => {
      testBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: "pass",
          reportId: "test-channel-e2e",
          model: {
            id: "gpt-5.5-pro",
            name: "GPT-5.5 Pro",
            provider: "OpenAI",
            apiProvider: "openai",
            targetModelId: "gpt-5.5-pro",
            targetModelName: "GPT-5.5 Pro",
          },
          strictScore: {
            total: 91,
            pass: true,
            scoreType: "prompt",
            dimensionScores: {
              intent_fidelity: 9.4,
              target_model_fit: 9.2,
              hallucination_resistance: 9.1,
            },
            deductions: [],
          },
          checks: [
            { id: "provider_connectivity", label: "真实模型连通性 / Provider connectivity", value: 10, threshold: 10, status: "pass" },
            { id: "strict_total", label: "严格总分 / Strict total score", value: 91, threshold: 85, status: "pass" },
            { id: "secret_handling", label: "密钥防泄露 / Secret handling", value: 10, threshold: 10, status: "pass" },
          ],
          attempts: [
            {
              attempt: 1,
              score: { total: 91, pass: true, dimensionScores: { intent_fidelity: 9.4 } },
              latencyMs: 500,
              preview: "Safe preview.",
            },
          ],
          stats: { latencyMs: 900, inputTokens: 100, outputTokens: 200 },
          providerStatus: {
            configured: ["openai"],
            keys: [{ keyName: "OPENAI_API_KEY", source: "browser", masked: "sk-...-e2e", hash: "hash-e2e" }],
          },
          bestPromptPreview: "最佳提示词预览，不包含任何原始密钥。",
          github: { synced: false, target: "local", filePath: "data/test-channel-runs/2026-05.jsonl" },
          secretHandling: "raw keys are never returned, logged, or written to GitHub datasets",
        }),
      });
    });

    await page.getByRole("button", { name: "打开 AI 提示词测试通道 Open AI prompt test channel" }).click();
    const dialog = page.getByRole("dialog", { name: "AI 提示词测试通道" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("密钥状态");
    await expect(dialog.getByText("一键全流程测试 / One-click full-flow test")).toBeVisible();
    await dialog.getByRole("button", { name: "一键全流程测试 / Run full-flow test" }).click();

    await expect(dialog.getByText("测试通过")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("密钥防泄露 / Secret handling")).toBeVisible();
    expect(testBody.userKeys.OPENAI_API_KEY).toBe(fakeRawKey);
    expect(testBody.autoSuite).toBe(true);
    expect(testBody.maxTokens).toBe(900);
    expect(testBody.maxAttempts).toBe(1);
    expect(String(testBody.userIdea)).toContain("额外关注");
    await expect(page.locator("body")).not.toContainText(fakeRawKey);
  });

  test("16. test channel shows model diagnostics when provider returns invalid choices", async ({ page }) => {
    let generateBody: any = null;
    let testBody: any = null;
    const fakeRawKey = "sk-test-fake-key-for-e2e";
    await page.evaluate((key) => {
      localStorage.setItem("ai_prompt_user_keys", JSON.stringify({ OPENAI_API_KEY: key }));
      localStorage.setItem("ai_prompt_target_model_id", "gpt-5.5-pro");
      localStorage.setItem("ai_prompt_last_generator_model_ids", JSON.stringify(["gpt-5.5"]));
      localStorage.setItem("ai_prompt_test_errors", JSON.stringify([
        {
          error_id: "historical-empty-choices",
          project_id: "ai-prompt-generator",
          error_type: "api",
          severity: "medium",
          summary: "模型返回空 choices 或非标准响应 / Empty choices or non-standard model response",
          detail: "Historical invalid choices failure",
          reproduction_path: ["Open test channel", "Click one-click test", "Call gpt-5.5"],
          test_case_id: "provider_connectivity",
          discovered_at: "2026-05-09T00:00:00.000Z",
          status: "open",
          optimization_suggestion: "Refresh relay model list and remove repeatedly failing models.",
          auto_optimized: false,
          optimization_history: [],
          fingerprint: "opt-empty-choices",
          occurrences: 1,
          last_seen_at: "2026-05-09T00:00:00.000Z",
          resolved_at: null,
        },
      ]));
      localStorage.setItem("ai_prompt_optimization_items", JSON.stringify([
        {
          optimization_id: "historical-opt-empty-choices",
          project_id: "ai-prompt-generator",
          linked_error_ids: ["historical-empty-choices"],
          priority: "P2",
          description: "Fix historical empty choices",
          suggested_actions: ["Refresh relay model list"],
          created_at: "2026-05-09T00:00:00.000Z",
          resolved_at: null,
          auto_applied: false,
          fingerprint: "opt-empty-choices",
        },
      ]));
    }, fakeRawKey);
    await page.reload();
    await mockAPIs(page);
    await page.route("**/api/test-channel/run", async (route) => {
      testBody = route.request().postDataJSON();
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          status: "fail",
          error: "测试通道没有收到任何可评分的模型输出。已尝试可用模型，但都失败或返回空内容。",
          providerStatus: {
            configured: ["openai"],
            keys: [{ keyName: "OPENAI_API_KEY", source: "browser", masked: "sk-...-e2e", hash: "hash-e2e" }],
          },
          checks: [
            { id: "provider_connectivity", label: "真实模型连通性 / Provider connectivity", value: 0, threshold: 10, status: "fail" },
          ],
          modelDiagnostics: [
            {
              modelId: "gpt-5.5",
              modelName: "GPT-5.5",
              apiProvider: "openai",
              status: "failed",
              attempts: 1,
              error: "模型 gpt-5.5 返回了空 choices 或非标准响应。请换一个生成/评价模型，或刷新中转站模型列表。",
            },
          ],
          improvementPlan: [
            "点击右上角模型选择，把生成/评价模型换成该中转站明确支持的 chat 文本模型。 / Open the model picker and choose a chat text model that the relay explicitly supports.",
            "打开密钥设置并保存一次，让系统重新探测中转站模型列表。 / Open key settings and save once so the app re-probes the relay model list.",
          ],
          optimizationBacklog: {
            status: "pending",
            itemCount: 1,
            summary: "已加入 1 个待优化项目，下一次生成会进入 feedback_memory。 / Added 1 pending optimization item; it will feed the next generation via feedback_memory.",
            items: [
              {
                id: "opt-empty-choices",
                fingerprint: "opt-empty-choices",
                source: "test_channel",
                reportId: "failed-test-channel-run",
                type: "model_error",
                severity: "yellow",
                status: "pending",
                title: "模型返回空 choices 或非标准响应 / Empty choices or non-standard model response",
                detail: "gpt-5.5 returned empty choices",
                action: "刷新中转站模型列表并移除反复失败的模型。 / Refresh relay model list and remove repeatedly failing models.",
                modelId: "gpt-5.5",
                provider: "openai",
                createdAt: Date.now(),
                lastSeenAt: Date.now(),
                occurrences: 1,
              },
            ],
          },
          errorRecords: [
            {
              error_id: "historical-empty-choices",
              project_id: "ai-prompt-generator",
              error_type: "api",
              severity: "medium",
              summary: "模型返回空 choices 或非标准响应 / Empty choices or non-standard model response",
              detail: "gpt-5.5 returned empty choices",
              reproduction_path: ["Open test channel", "Click one-click test", "Call gpt-5.5"],
              test_case_id: "provider_connectivity",
              discovered_at: "2026-05-09T00:00:00.000Z",
              status: "regression",
              optimization_suggestion: "刷新中转站模型列表并移除反复失败的模型。 / Refresh relay model list and remove repeatedly failing models.",
              auto_optimized: false,
              optimization_history: [
                {
                  timestamp: "2026-05-09T01:00:00.000Z",
                  action: "历史缺陷再次出现，自动标记为 regression / Historical defect recurred and was marked as regression",
                  result: "status=regression",
                  run_id: "failed-test-channel-run",
                },
              ],
              fingerprint: "opt-empty-choices",
              occurrences: 2,
              last_seen_at: "2026-05-09T01:00:00.000Z",
              resolved_at: null,
            },
          ],
          optimizationItems: [
            {
              optimization_id: "historical-opt-empty-choices",
              project_id: "ai-prompt-generator",
              linked_error_ids: ["historical-empty-choices"],
              priority: "P1",
              description: "回归缺陷：模型返回空 choices 或非标准响应 / Regression defect: Empty choices or non-standard model response",
              suggested_actions: ["刷新中转站模型列表并移除反复失败的模型。 / Refresh relay model list and remove repeatedly failing models."],
              created_at: "2026-05-09T00:00:00.000Z",
              resolved_at: null,
              auto_applied: false,
              fingerprint: "opt-empty-choices",
            },
          ],
          adaptivePlan: {
            project_id: "ai-prompt-generator",
            unresolved_error_count: 1,
            regression_case_count: 1,
            historical_type_distribution: { api: 1 },
            focus_error_types: ["api"],
            strategy_weights: { api: 3 },
            regression_cases: [
              {
                id: "regression_empty_choices",
                label: "历史缺陷回归：模型返回空 choices 或非标准响应 / Historical regression: Empty choices or non-standard model response",
                objective: "Verify the historical empty choices error is fixed.",
                source_error_id: "historical-empty-choices",
                error_type: "api",
                severity: "medium",
                reproduction_path: ["Open test channel", "Click one-click test", "Call gpt-5.5"],
              },
            ],
            mutation_hints: ["Generate mutated cases from historical empty choices path."],
            resolved_candidate_error_ids: ["historical-empty-choices"],
            summary: "已读取 1 个历史未解决错误；本次一键测试会优先回归 api。 / Loaded 1 unresolved historical error; this run prioritizes api regression.",
          },
          secretHandling: "原始密钥不会出现在诊断或报告中。 / Raw keys are not included in diagnostics or reports.",
        }),
      });
    });
    await page.route("**/api/generate", async (route) => {
      generateBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: buildSSEBody(MOCK_OPTIMIZED),
      });
    });

    await page.getByRole("button", { name: "打开 AI 提示词测试通道 Open AI prompt test channel" }).click();
    const dialog = page.getByRole("dialog", { name: "AI 提示词测试通道" });
    await dialog.getByRole("button", { name: "一键全流程测试 / Run full-flow test" }).click();

    await expect(dialog.getByText("测试未通过 / Test failed").first()).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/Test channel failed:/).first()).toBeVisible();
    await expect(dialog.getByText("模型诊断 / Model diagnostics")).toBeVisible();
    await expect(dialog.getByText(/空 choices/).first()).toBeVisible();
    await expect(dialog.getByText(/Switch model or refresh relay model availability|Test channel failed: 模型 gpt-5\.5/)).toBeVisible();
    await expect(dialog.getByText("下一步改进 / Next improvements")).toBeVisible();
    await expect(dialog.getByText(/Open the model picker/)).toBeVisible();
    await expect(dialog.getByText(/换成该中转站明确支持/)).toBeVisible();
    await expect(dialog.getByText("已加入待优化项目 / Added to pending optimization")).toBeVisible();
    await expect(dialog.getByText("历史缺陷回归 / Historical regression")).toBeVisible();
    await expect(dialog.getByText("错误分类 / Error classification")).toBeVisible();
    await expect(dialog.getByText("结构化待优化项目 / Structured optimization backlog")).toBeVisible();
    await expect(dialog.getByText(/Empty choices or non-standard model response/).first()).toBeVisible();
    expect(testBody.projectId).toBe("ai-prompt-generator");
    expect(testBody.historicalErrors.some((item: any) => item.error_id === "historical-empty-choices")).toBeTruthy();
    expect(testBody.historicalOptimizations.some((item: any) => item.optimization_id === "historical-opt-empty-choices")).toBeTruthy();
    const pendingItems = await page.evaluate(() => JSON.parse(localStorage.getItem("ai_prompt_pending_optimizations") || "[]"));
    expect(pendingItems.some((item: any) => item.fingerprint === "opt-empty-choices")).toBeTruthy();
    const storedErrors = await page.evaluate(() => JSON.parse(localStorage.getItem("ai_prompt_test_errors") || "[]"));
    expect(storedErrors.some((item: any) => item.status === "regression" && item.fingerprint === "opt-empty-choices")).toBeTruthy();
    const storedOptimizationItems = await page.evaluate(() => JSON.parse(localStorage.getItem("ai_prompt_optimization_items") || "[]"));
    expect(storedOptimizationItems.some((item: any) => item.priority === "P1" && item.fingerprint === "opt-empty-choices")).toBeTruthy();
    await dialog.getByText(/查看最佳提示词预览与脱敏同步状态/).click();
    await expect(dialog.getByText(/Raw keys are not included/)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(fakeRawKey);
    await dialog.getByRole("button", { name: "关闭测试通道 Close test channel" }).click();
    await page.getByRole("textbox", { name: /输入你的想法或需求/ }).fill("帮我优化一个产品图生图提示词");
    await page.getByRole("button", { name: /生成优化提示词/ }).click();
    await expect(page.locator("text=senior poet")).toBeVisible({ timeout: 10_000 });
    expect(generateBody.feedbackMemory.rules.some((rule: string) => rule.includes("Pending optimization"))).toBeTruthy();
    expect(generateBody.feedbackMemory.rules.some((rule: string) => rule.includes("Historical test error"))).toBeTruthy();
    expect(generateBody.feedbackMemory.rules.some((rule: string) => rule.includes("empty choices") || rule.includes("空 choices"))).toBeTruthy();
  });

  test("17. test channel upgrades old model aliases and still shows diagnostics on minimal failure", async ({ page }) => {
    let testBody: any = null;
    await page.evaluate(() => {
      localStorage.setItem("ai_prompt_user_keys", JSON.stringify({ OPENAI_API_KEY: "sk-test-fake-key-for-e2e" }));
      localStorage.setItem("ai_prompt_target_model_id", "gpt-5.5(xhigh)");
      localStorage.setItem("ai_prompt_last_generator_model_ids", JSON.stringify(["gpt-5.5"]));
      localStorage.setItem("ai_prompt_last_evaluator_model_ids", JSON.stringify(["gpt-5.5"]));
    });
    await page.reload();
    await mockAPIs(page);
    await page.route("**/api/test-channel/run", async (route) => {
      testBody = route.request().postDataJSON();
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          status: "fail",
          error: "Upstream returned 500",
          errorRecords: [
            {
              error_id: "runtime-minimal-failure",
              project_id: "ai-prompt-generator",
              error_type: "api",
              severity: "high",
              summary: "上游模型调用失败 / Upstream model call failed",
              detail: "Upstream returned 500",
              reproduction_path: ["Open test channel", "Click one-click test"],
              test_case_id: "provider_connectivity",
              discovered_at: "2026-05-09T02:00:00.000Z",
              status: "open",
              optimization_suggestion: "Switch to a healthy model and retry.",
              auto_optimized: false,
              optimization_history: [],
              fingerprint: "opt-upstream-500",
              occurrences: 1,
              last_seen_at: "2026-05-09T02:00:00.000Z",
              resolved_at: null,
            },
          ],
        }),
      });
    });

    await page.getByRole("button", { name: "打开 AI 提示词测试通道 Open AI prompt test channel" }).click();
    const dialog = page.getByRole("dialog", { name: "AI 提示词测试通道" });
    await expect(dialog.getByText("gpt-5.5-pro").first()).toBeVisible();
    await dialog.getByRole("button", { name: "一键全流程测试 / Run full-flow test" }).click();

    await expect(dialog.getByText("失败详情 / Failure detail")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/Upstream returned 500/).first()).toBeVisible();
    await expect(dialog.getByText("模型诊断 / Model diagnostics")).toBeVisible();
    await expect(dialog.getByText("错误分类 / Error classification")).toBeVisible();
    expect(testBody.targetModelId).toBe("gpt-5.5-pro");
    expect(testBody.generatorModelIds).toEqual(["gpt-5.5-pro"]);
    const stored = await page.evaluate(() => ({
      target: localStorage.getItem("ai_prompt_target_model_id"),
      generators: JSON.parse(localStorage.getItem("ai_prompt_last_generator_model_ids") || "[]"),
      evaluators: JSON.parse(localStorage.getItem("ai_prompt_last_evaluator_model_ids") || "[]"),
    }));
    expect(stored.target).toBe("gpt-5.5-pro");
    expect(stored.generators).toEqual(["gpt-5.5-pro"]);
    expect(stored.evaluators).toEqual(["gpt-5.5-pro"]);
  });

  test("18. test channel surfaces non-json gateway failures as actionable diagnostics", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("ai_prompt_user_keys", JSON.stringify({ OPENAI_API_KEY: "sk-test-fake-key-for-e2e" }));
      localStorage.setItem("ai_prompt_target_model_id", "gpt-5.5-pro");
      localStorage.setItem("ai_prompt_last_generator_model_ids", JSON.stringify(["gpt-5.5-pro"]));
    });
    await page.reload();
    await mockAPIs(page);
    await page.route("**/api/test-channel/run", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "text/plain; charset=UTF-8",
        body: "error code: 502",
      });
    });

    await page.getByRole("button", { name: "打开 AI 提示词测试通道 Open AI prompt test channel" }).click();
    const dialog = page.getByRole("dialog", { name: "AI 提示词测试通道" });
    await dialog.getByRole("button", { name: "一键全流程测试 / Run full-flow test" }).click();

    await expect(dialog.getByText("失败详情 / Failure detail")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/HTTP 502/).first()).toBeVisible();
    await expect(dialog.getByText(/error code: 502/).first()).toBeVisible();
    await expect(dialog.getByText("模型诊断 / Model diagnostics")).toBeVisible();
    await expect(dialog.getByText("错误分类 / Error classification")).toBeVisible();
    await expect(dialog.getByText(/测试通道接口失败|Test channel API failed/).first()).toBeVisible();
    await expect(dialog.getByText(/Cloudflare\/Vercel gateway|Cloudflare\/Vercel 网关/).first()).toBeVisible();
    const storedErrors = await page.evaluate(() => JSON.parse(localStorage.getItem("ai_prompt_test_errors") || "[]"));
    expect(storedErrors.some((item: any) => item.fingerprint === "frontend_test_channel_api_failure")).toBeTruthy();
  });

  test("19. test channel summarizes Cloudflare 504 HTML without dumping raw markup", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("ai_prompt_user_keys", JSON.stringify({ OPENAI_API_KEY: "sk-test-fake-key-for-e2e" }));
      localStorage.setItem("ai_prompt_target_model_id", "gpt-5.5-pro");
      localStorage.setItem("ai_prompt_last_generator_model_ids", JSON.stringify(["gpt-5.5-pro"]));
    });
    await page.reload();
    await mockAPIs(page);
    await page.route("**/api/test-channel/run", async (route) => {
      await route.fulfill({
        status: 504,
        contentType: "text/html; charset=UTF-8",
        body: `<!DOCTYPE html>
          <html>
            <head><title>myprompt.asia | 504: Gateway time-out</title></head>
            <body>
              <div id="cf-error-details" class="p-0">Cloudflare Ray ID: e2e</div>
              <!--[if lt IE 7]> legacy browser markup <![endif]-->
              <h1>Gateway time-out</h1>
            </body>
          </html>`,
      });
    });

    await page.getByRole("button", { name: "打开 AI 提示词测试通道 Open AI prompt test channel" }).click();
    const dialog = page.getByRole("dialog", { name: "AI 提示词测试通道" });
    await dialog.getByRole("button", { name: "一键全流程测试 / Run full-flow test" }).click();

    await expect(dialog.getByText("失败详情 / Failure detail")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/HTTP 504/).first()).toBeVisible();
    await expect(dialog.getByText(/测试通道接口超过网关时间限制|Test channel exceeded gateway timeout/).first()).toBeVisible();
    await expect(dialog.getByText(/测试通道网关超时|Test channel gateway timeout/).first()).toBeVisible();
    await expect(dialog.getByText("模型诊断 / Model diagnostics")).toBeVisible();
    await expect(dialog.getByText("错误分类 / Error classification")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("<!DOCTYPE html>");
    await expect(page.locator("body")).not.toContainText("<!--[if lt IE 7]>");
    await expect(page.locator("body")).not.toContainText("cf-error-details");
    const storedErrors = await page.evaluate(() => JSON.parse(localStorage.getItem("ai_prompt_test_errors") || "[]"));
    expect(storedErrors.some((item: any) => item.fingerprint === "frontend_test_channel_gateway_timeout" && item.error_type === "api" && item.severity === "high")).toBeTruthy();
  });
});
