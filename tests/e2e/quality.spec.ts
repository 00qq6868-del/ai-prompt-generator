import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

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
  await page.waitForTimeout(1000);
}

async function expectScrollable(locator: Locator, page: Page, useWheel: boolean) {
  await expect(locator).toBeVisible({ timeout: 15_000 });
  await locator.scrollIntoViewIfNeeded();

  const before = await locator.evaluate((el) => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    overflowY: window.getComputedStyle(el).overflowY,
  }));

  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight + 1);
  expect(["auto", "scroll"]).toContain(before.overflowY);

  if (useWheel) {
    await locator.hover();
    await page.mouse.wheel(0, 900);
    await expect
      .poll(() => locator.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(before.scrollTop);
    return;
  }

  const after = await locator.evaluate((el) => {
    el.scrollTop = Math.min(el.scrollTop + 900, el.scrollHeight - el.clientHeight);
    return el.scrollTop;
  });
  expect(after).toBeGreaterThan(before.scrollTop);
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

  test("model picker dialogs and target model list remain scrollable", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");

    const targetScroller = page.getByTestId("target-model-scroll");
    await expect(page.getByText(/显示前 50 个|Showing 50/)).toBeVisible({ timeout: 15_000 });
    await expectScrollable(targetScroller, page, !isMobile);

    const checkDialogScroll = async (buttonName: RegExp, dialogName: string) => {
      await page.getByRole("button", { name: buttonName }).click();
      const dialog = page.getByRole("dialog", { name: dialogName });
      await expect(dialog).toBeVisible({ timeout: 3000 });

      const scroller = page.getByTestId("model-picker-scroll");
      await expectScrollable(scroller, page, !isMobile);

      await dialog.getByRole("button", { name: "关闭 Close" }).click();
      await expect(dialog).toBeHidden();
    };

    await checkDialogScroll(
      /选择生成器模型 Open generator model picker/,
      "选择生成器模型",
    );
    await checkDialogScroll(
      /选择评价模型 Open evaluator model picker/,
      "选择评价模型",
    );
  });

  test("download page exposes desktop and mobile download entries", async ({
    page,
  }) => {
    await page.goto("/download");

    await expect(
      page.getByRole("heading", { name: "下载 AI 提示词生成器" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /下载安装版/ })).toHaveAttribute(
      "href",
      "/api/download/windows"
    );
    await expect(page.getByRole("link", { name: /下载便携版/ })).toHaveAttribute(
      "href",
      "/api/download/windows/portable"
    );
    await expect(page.getByRole("link", { name: /下载 Mac 版/ })).toHaveAttribute(
      "href",
      "/api/download/mac"
    );
    await expect(page.getByRole("link", { name: /Mac 便携 ZIP/ })).toHaveAttribute(
      "href",
      "/api/download/mac/portable"
    );
    await expect(page.getByRole("link", { name: /下载 Linux AppImage/ })).toHaveAttribute(
      "href",
      "/api/download/linux"
    );
    await expect(page.getByRole("link", { name: /下载 Android APK/ })).toHaveAttribute(
      "href",
      "/api/download/android"
    );
    await expect(page.getByRole("link", { name: /打开并安装 PWA/ })).toHaveAttribute(
      "href",
      "/"
    );
    await expect(page.getByRole("link", { name: /查看发布页/ })).toBeVisible();
  });
});
