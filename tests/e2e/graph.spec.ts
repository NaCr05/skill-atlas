import { expect, test } from "@playwright/test";

test("global capability map keeps context while inspecting a Skill", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Skills 知识图谱" })).toBeVisible();
  const primaryNavigation = page.getByRole("navigation", { name: "主导航" });
  await expect(primaryNavigation.getByRole("link").first()).toHaveText("知识图谱");
  await expect(primaryNavigation.getByRole("link", { name: "知识图谱" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "全局地图" })).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("skill-atlas-core")).toBeVisible();
  const workspace = page.locator("section[data-expanded]");
  await page.getByRole("button", { name: "全屏浏览" }).click();
  await expect(workspace).toHaveAttribute("data-expanded", "true");
  await expect(page.getByRole("button", { name: "退出全屏" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(workspace).toHaveAttribute("data-expanded", "false");

  const canvas = page.getByLabel("Skills 关系画布");
  const globalNodes = canvas.locator("article");
  const globalNodeCount = await globalNodes.count();
  expect(globalNodeCount).toBeGreaterThan(1);

  const readyNode = globalNodes.filter({ hasText: "$ready-skill" });
  await expect(readyNode).toHaveCount(1);
  await readyNode.click();
  await expect(page.getByRole("heading", { name: "ready-skill", exact: true })).toBeVisible();
  await expect(globalNodes).toHaveCount(globalNodeCount);

  await page.getByRole("button", { name: "聚焦探索" }).click();
  await expect(page.getByRole("button", { name: "聚焦探索" })).toHaveAttribute("data-active", "true");
  expect(await canvas.locator("article").count()).toBeLessThanOrEqual(globalNodeCount);

  await page.getByRole("button", { name: "全局地图" }).click();
  await expect(canvas.locator("article")).toHaveCount(globalNodeCount);
});

test("global capability map remains within a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "全局地图" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
});
