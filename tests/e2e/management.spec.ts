import { expect, test } from "@playwright/test";

test("storage, source policy, portability, and Windows distribution surfaces are reachable", async ({ page }) => {
  await page.goto("/storage");
  await expect(page.getByRole("heading", { name: /备份与归档|Backups and archives/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /更新备份|Update backups/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /停用目录|Disabled Skills/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /环境设置|Environment/ })).toBeVisible();

  await page.getByRole("link", { name: /环境设置|Environment/ }).click();
  await expect(page.getByRole("heading", { name: /作者、仓库与许可证策略|Author, repository & license policy/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /本地数据导入导出|Local data import & export/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /桌面安装与应用升级|Desktop install & app updates/ })).toBeVisible();

  await page.route("**/api/app-update", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ currentVersion: "0.1.1", latestVersion: "0.2.0", updateAvailable: true, releaseUrl: "https://github.com/NaCr05/skill-atlas/releases/tag/v0.2.0" }),
  }));
  await page.getByRole("button", { name: /手动检查更新|Check for updates/ }).click();
  await expect(page.getByText("v0.2.0")).toBeVisible();
  await expect(page.getByRole("link", { name: /查看发布说明|View release notes/ })).toBeVisible();
});
