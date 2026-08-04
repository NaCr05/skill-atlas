import { expect, test } from "@playwright/test";
import path from "node:path";

const artifact = (name: string) => path.resolve("artifacts", name);

test("capture sanitized public screenshots", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  // This marker exists only in the committed test fixture. Refuse to capture a
  // developer's real inventory if the screenshot environment is misconfigured.
  await expect(page.getByText("ready-skill", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "自动布局" }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2_300);

  await page.screenshot({ path: artifact("dashboard-desktop.png") });

  await page.locator(".language-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: artifact("dashboard-desktop-en.png") });

  await page.goto("/skills");
  await expect(page.getByText("ready-skill", { exact: true }).first()).toBeVisible();
  const detailLink = page.locator('a[href^="/skills/"]').first();
  await expect(detailLink).toBeVisible();
  await detailLink.click();
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator("code.path-block")).toBeVisible();
  await page.screenshot({
    path: artifact("detail-desktop.png"),
    fullPage: true,
    mask: [page.locator("code.path-block")],
    maskColor: "#0e1523",
  });

  await page.goto("/marketplace");
  await expect(page.locator("main h1")).toBeVisible();
  await page.screenshot({ path: artifact("marketplace-desktop.png"), fullPage: true });

  await page.locator(".language-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("ready-skill", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: artifact("dashboard-mobile-top.png") });
  await page.screenshot({ path: artifact("dashboard-mobile.png"), fullPage: true });
});
