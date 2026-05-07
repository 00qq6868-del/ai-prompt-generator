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
});
