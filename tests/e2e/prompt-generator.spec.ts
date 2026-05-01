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
}

/** Build a SSE response body that streams chunks then sends a done event. */
function buildSSEBody(optimizedPrompt: string) {
  const chunks = optimizedPrompt.match(/.{1,20}/g) ?? [optimizedPrompt];
  let body = "";
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
      meta: { generatorModel: "GPT-4o Mini", targetModel: "GPT-4o" },
      generatorModelCost: { input: 0.00015, output: 0.0006 },
    },
  })}\n\n`;
  body += "data: [DONE]\n\n";
  return body;
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

  test("5. target model cards select and generator picker opens", async ({ page }) => {
    await page.getByRole("tab", { name: /文生图/ }).click();
    const imageModel = page.getByRole("button", { name: /DALL·E 3/ });
    await imageModel.click();
    await expect(imageModel).toHaveAttribute("aria-pressed", "true");

    const generatorTrigger = page
      .getByRole("button", { name: /GPT-4o Mini|点击选择生成器模型/ })
      .first();
    await generatorTrigger.click();

    const dialog = page.getByRole("dialog", { name: "选择生成器模型" });
    await expect(dialog).toBeVisible({ timeout: 3000 });
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
});
