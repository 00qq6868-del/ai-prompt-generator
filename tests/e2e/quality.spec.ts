import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
});
