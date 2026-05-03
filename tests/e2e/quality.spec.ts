import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function waitForFiniteAnimations(page: Page) {
  await page.waitForFunction(() => {
    const finiteAnimations = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getTiming();
      return timing?.iterations !== Infinity;
    });

    return finiteAnimations.every((animation) =>
      animation.playState === "finished" || animation.playState === "idle"
    );
  });
}

test.describe("Quality and accessibility audit", () => {
  test("desktop homepage has no obvious layout or accessibility regressions", async ({
    page,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto("/");
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("textarea")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /生成优化提示词|Generate optimized prompt/ })
    ).toBeVisible();

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyHeight: document.body.scrollHeight,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.bodyHeight).toBeGreaterThan(500);
    await waitForFiniteAnimations(page);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);

    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("desktop-homepage", {
      body: screenshot,
      contentType: "image/png",
    });

    expect(consoleErrors).toEqual([]);
  });

  test("mobile homepage remains usable and does not overflow horizontally", async ({
    page,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("textarea")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /生成优化提示词|Generate optimized prompt/ })
    ).toBeVisible();

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      interactiveCount: document.querySelectorAll("button, textarea, input, select, a")
        .length,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.interactiveCount).toBeGreaterThan(5);

    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("mobile-homepage", {
      body: screenshot,
      contentType: "image/png",
    });

    expect(consoleErrors).toEqual([]);
  });

  test("provider filters wrap long Chinese names instead of clipping them", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByRole("tab", { name: /全部\s+[1-9]/ }).first()).toBeVisible({
      timeout: 15000,
    });

    const providerTab = page.getByRole("tab", { name: /月之暗面/ }).first();
    await expect(providerTab).toBeVisible({ timeout: 15000 });
    await expect(providerTab).toContainText("月之暗面");

    const box = await providerTab.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();

    if (box && viewport) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
  });

  test("download page exposes the Windows desktop download entry", async ({
    page,
  }) => {
    await page.goto("/download");

    await expect(
      page.getByRole("heading", { name: "下载 AI 提示词生成器" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /下载 Windows 版/ })).toHaveAttribute(
      "href",
      "/api/download/windows"
    );
    await expect(page.getByRole("link", { name: /查看发布页/ })).toBeVisible();
  });
});
