import { expect, test } from "@playwright/test";

test("inventory, filtering, detail, and Prompt copy flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /我的技能/ })).toBeVisible();
  const viewSwitcher = page.locator(".view-switcher");
  await expect(viewSwitcher.getByRole("button").nth(0)).toHaveAccessibleName("紧凑视图");
  await expect(viewSwitcher.getByRole("button", { name: "紧凑视图" })).toHaveAttribute("data-active", "true");
  await viewSwitcher.getByRole("button", { name: "卡片视图" }).click();
  await expect(page.getByText("ready-skill", { exact: true })).toBeVisible();
  await expect(page.getByText("机器译文").first()).toBeVisible();
  await expect(page.getByText(/这是一个用于 ready-skill 相关任务的技能/).first()).toBeVisible();
  await expect(page.getByText(/Creates concise release notes/)).toBeHidden();
  await expect(page.getByText("结构有效", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("基础环境就绪", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/上次扫描/)).toBeVisible();

  await page.getByRole("button", { name: "重新扫描" }).click();
  await expect(page.getByRole("button", { name: "重新扫描" })).toBeEnabled();
  await expect(page.getByText(/磁盘扫描/)).toBeVisible();

  await page.getByPlaceholder("搜索名称、功能或标签…").fill("explicit");
  await expect(page.getByRole("heading", { name: "Explicit Interview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ready-skill" })).toBeHidden();

  await page.getByRole("button", { name: "复制调用提示词" }).click();
  await expect(page.getByRole("dialog", { name: /调用 Explicit Interview/ })).toBeVisible();
  await page.getByLabel(/这次想让它做什么/).fill("请检验我的发布计划");
  await expect(page.locator(".prompt-preview pre")).toContainText("$explicit-skill");
  await expect(page.locator(".prompt-preview pre")).toContainText("请检验我的发布计划");
  await page.getByRole("button", { name: "关闭" }).click();

  await Promise.all([
    page.waitForURL(/\/skills\//),
    page.getByRole("link", { name: "详情" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Explicit Interview" })).toBeVisible();
  await expect(page.getByText("不允许，必须点名")).toBeVisible();
  await expect(page.getByText("用途概览：", { exact: false })).toBeVisible();
  await expect(page.getByText("查看原始 SKILL.md（原文）")).toBeVisible();
});

test("task recommendation and personal workspace remain local", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3178" });
  await page.goto("/");

  const taskInput = page.getByLabel("任务描述");
  await taskInput.fill("帮我处理一下量子咖啡烘焙");
  await page.getByRole("button", { name: "推荐技能" }).click();
  await expect(page.getByText(/暂时没有高置信度匹配/)).toBeVisible();
  await expect(page.locator(".insight-metrics > div").filter({ hasText: "零结果搜索" }).locator("strong")).toHaveText("1");

  await taskInput.fill("帮我写一份发布说明和更新日志");
  await page.getByRole("button", { name: "推荐技能" }).click();
  const recommendation = page.locator(".task-recommendations").getByRole("button", { name: /ready-skill/ });
  await expect(recommendation).toBeVisible();
  await recommendation.click();

  const inspector = page.locator(".skill-inspector");
  await expect(inspector.getByRole("heading", { name: "ready-skill" })).toBeVisible();
  await inspector.getByRole("button", { name: "收藏" }).click();
  await inspector.getByRole("button", { name: "置顶" }).click();
  await inspector.getByLabel("个人备注").fill("发布前检查变更范围和版本号");
  await inspector.getByRole("button", { name: "保存备注" }).click();

  await inspector.getByRole("button", { name: "复制调用提示词" }).click();
  const dialog = page.getByRole("dialog", { name: /调用 ready-skill/ });
  await expect(dialog.locator(".prompt-preview pre")).toContainText("任务目标：");
  await expect(dialog.locator(".prompt-preview pre")).toContainText("执行要求：");
  await dialog.getByRole("button", { name: "复制调用提示词" }).click();
  await expect(dialog.getByRole("button", { name: /已复制/ })).toBeVisible();
  await dialog.getByRole("button", { name: "关闭" }).click();

  await expect(page.locator(".personal-filter-row").getByRole("button", { name: /置顶 1/ })).toBeVisible();
  await expect(page.locator(".personal-filter-row").getByRole("button", { name: /收藏 1/ })).toBeVisible();
  await expect(page.locator(".personal-filter-row").getByRole("button", { name: /最近复制 1/ })).toBeVisible();
  await expect(page.locator(".insight-metrics > div").filter({ hasText: "找到后到复制" }).locator("strong")).not.toHaveText("暂无数据");

  const localState = await page.evaluate(() => JSON.parse(localStorage.getItem("skill-atlas:workspace:v1") || "{}"));
  expect(localState.notes).toBeTruthy();
  expect(Object.values(localState.notes)).toContain("发布前检查变更范围和版本号");

  await page.reload();
  await page.locator(".personal-filter-row").getByRole("button", { name: /收藏 1/ }).click();
  await expect(page.locator(".skill-inspector").getByLabel("个人备注")).toHaveValue("发布前检查变更范围和版本号");
  await expect(page.locator(".personal-filter-row").getByRole("button", { name: /最近复制 1/ })).toBeVisible();
});

test("market adapters degrade without blocking safe review entry", async ({ page }) => {
  await page.goto("/marketplace");
  await expect(page.getByRole("heading", { name: /发现新能力/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "从已知源开始安全审查" })).toBeVisible();
  await page.getByRole("button", { name: /skills.sh 排行榜/ }).click();
  await expect(page.getByText(/需要 Vercel OIDC Token/)).toBeVisible();
  await expect(page.getByRole("link", { name: /打开 skills.sh/ })).toBeVisible();
});

test("mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const chineseOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(chineseOverflow).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "切换到英文" }).click();
  await expect(page.getByRole("heading", { name: "My Skills" })).toBeVisible();
  const englishOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(englishOverflow).toBeLessThanOrEqual(1);
});

test("language switch updates the interface and persists across navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "切换到英文" }).click();

  await expect(page.getByRole("heading", { name: "My Skills" })).toBeVisible();
  await expect(page.getByPlaceholder("Search by name, capability, or tag…")).toBeVisible();
  await expect(page.getByRole("link", { name: /Local Skills/ })).toBeVisible();
  await page.getByRole("button", { name: "Card view" }).click();
  await expect(page.getByText(/Creates concise release notes/).first()).toBeVisible();
  await expect(page.getByText("机器译文").first()).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.goto("/marketplace");
  await expect(page.getByRole("heading", { name: /Discover new capabilities/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch to Chinese" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: /Discover new capabilities/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-language", "en");
});
