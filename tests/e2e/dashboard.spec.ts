import { expect, test } from "@playwright/test";

test("inventory, filtering, detail, and Prompt copy flow", async ({ page }) => {
  await page.goto("/skills");
  await expect(page.getByRole("heading", { name: /技能目录/ })).toBeVisible();
  const viewSwitcher = page.locator(".view-switcher");
  await expect(viewSwitcher.getByRole("button").nth(0)).toHaveAccessibleName("紧凑视图");
  await expect(viewSwitcher.getByRole("button", { name: "紧凑视图" })).toHaveAttribute("data-active", "true");
  await viewSwitcher.getByRole("button", { name: "卡片视图" }).click();
  await expect(page.getByText("ready-skill", { exact: true })).toBeVisible();
  await expect(page.getByText("本地中文摘要").first()).toBeVisible();
  await expect(page.getByText(/“ready-skill”技能用于创建/).first()).toBeVisible();
  await expect(page.getByText(/Creates concise release notes/)).toBeHidden();
  await expect(page.locator(".scan-summary")).toContainText("Skills");
  await expect(page.locator(".scan-summary")).toContainText("已就绪");
  await expect(page.getByText(/扫描于/)).toBeVisible();

  await page.getByRole("button", { name: "重新扫描" }).click();
  await expect(page.getByRole("button", { name: "重新扫描" })).toBeEnabled();
  await expect(page.locator(".scan-summary")).toContainText("磁盘");

  await page.getByPlaceholder("搜索 Skill，或描述你想完成的任务…").fill("explicit");
  await expect(page.getByRole("heading", { name: "Explicit Interview" })).toBeVisible();
  const builder = page.locator(".invocation-builder");
  await expect(page.getByRole("heading", { name: "ready-skill" })).toBeHidden();

  await builder.getByLabel(/这次想让它做什么/).fill("请检验我的发布计划");
  await expect(builder.locator(".invocation-prompt-preview pre")).toContainText("$explicit-skill");
  await expect(builder.locator(".invocation-prompt-preview pre")).toContainText("请检验我的发布计划");
  await builder.getByRole("button", { name: "使用 AI 增强" }).click();
  await expect(page.locator(".inline-notice")).toContainText("未配置 AI 提供商");
  await expect(builder.locator(".invocation-prompt-preview pre")).toContainText("请检验我的发布计划");

  await Promise.all([
    page.waitForURL(/\/skills\//),
    builder.getByRole("link", { name: "完整详情" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Explicit Interview" })).toBeVisible();
  await expect(page.getByText("不允许，必须点名")).toBeVisible();
  await expect(page.getByText("用途概览：", { exact: false })).toBeVisible();
  await expect(page.getByText("查看原始 SKILL.md（原文）")).toBeVisible();
  await expect(page.getByRole("heading", { name: "上游更新与安全替换" })).toBeVisible();
  await expect(page.getByText("备份后原子替换", { exact: true })).toBeVisible();
  await expect(page.getByText("本地指纹", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("精确 GitHub Skill 目录")).toBeVisible();
  const detailPath = page.locator(".detail-sidebar code[data-breakable-path='true']");
  await expect(detailPath).toHaveAttribute("title", /explicit-skill$/);
  const pathPresentation = await detailPath.evaluate((element) => ({
    overflowWrap: getComputedStyle(element).overflowWrap,
    finalSegmentWhiteSpace: getComputedStyle(element.querySelector("span:last-child")!).whiteSpace,
    finalSegment: element.querySelector("span:last-child")?.textContent,
  }));
  expect(pathPresentation).toEqual({
    overflowWrap: "normal",
    finalSegmentWhiteSpace: "nowrap",
    finalSegment: "explicit-skill",
  });
});

test("personal Skills use a reviewed, recoverable removal flow", async ({ page }) => {
  let trashed = false;
  const trashId = "22222222-2222-4222-8222-222222222222";
  const fingerprint = {
    algorithm: "sha256-manifest-v1",
    value: "d".repeat(64),
    fileCount: 2,
    totalBytes: 240,
    complete: true,
  };
  await page.route("**/api/lifecycle/uninstall/inspect", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      planId: "11111111-1111-4111-8111-111111111111",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      skillId: "ready-id",
      skillName: "ready-skill",
      displayName: "ready-skill",
      directoryPath: "C:\\fixture\\.codex\\skills\\ready-skill",
      fingerprint,
      hardDependents: [],
      instructionReferences: [],
      sourceTracking: { status: "untracked" },
      risks: [
        { level: "info", code: "personal-skill", title: "个人可管理 Skill", detail: "只处理个人目录。" },
        { level: "info", code: "complete-backup", title: "完整目录将保留在 Skill Atlas 回收站", detail: "可以恢复。" },
      ],
      removalAllowed: true,
    }),
  }));
  await page.route("**/api/lifecycle/uninstall/confirm", async (route) => {
    trashed = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trashId,
        skillId: "ready-id",
        skillName: "ready-skill",
        originalDirectory: "C:\\fixture\\.codex\\skills\\ready-skill",
        trashDirectory: "C:\\fixture\\.codex\\.skill-atlas\\trash\\" + trashId + "\\skill",
        deletedAt: new Date().toISOString(),
        fileCount: 2,
        totalBytes: 240,
        rollbackAvailable: true,
      }),
    });
  });
  await page.route("**/api/lifecycle/trash", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      rootPath: "C:\\fixture\\.codex\\.skill-atlas\\trash",
      count: trashed ? 1 : 0,
      totalBytes: trashed ? 240 : 0,
      records: trashed ? [{
        trashId,
        skillId: "ready-id",
        skillName: "ready-skill",
        displayName: "ready-skill",
        originalDirectory: "C:\\fixture\\.codex\\skills\\ready-skill",
        trashDirectory: "C:\\fixture\\.codex\\.skill-atlas\\trash\\" + trashId + "\\skill",
        deletedAt: new Date().toISOString(),
        fingerprint,
        sourceTracking: { status: "untracked" },
        state: "committed",
      }] : [],
    }),
  }));
  await page.route("**/api/lifecycle/restore", async (route) => {
    trashed = false;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trashId,
        skillId: "ready-id",
        skillName: "ready-skill",
        restoredDirectory: "C:\\fixture\\.codex\\skills\\ready-skill",
        restoredAt: new Date().toISOString(),
        fileCount: 2,
        totalBytes: 240,
      }),
    });
  });
  await page.route("**/api/lifecycle/purge/inspect", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      planId: "33333333-3333-4333-8333-333333333333",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      trashId,
      skillId: "ready-id",
      skillName: "ready-skill",
      displayName: "ready-skill",
      originalDirectory: "C:\\fixture\\.codex\\skills\\ready-skill",
      trashDirectory: "C:\\fixture\\.codex\\.skill-atlas\\trash\\" + trashId + "\\skill",
      fingerprint,
      confirmationText: "ready-skill",
      deletionAllowed: true,
    }),
  }));
  await page.route("**/api/lifecycle/purge/confirm", async (route) => {
    trashed = false;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trashId,
        skillId: "ready-id",
        skillName: "ready-skill",
        purgedAt: new Date().toISOString(),
        fileCount: 2,
        totalBytes: 240,
        auditTransactionId: "44444444-4444-4444-8444-444444444444",
        auditStatus: "recorded",
        recoverable: false,
      }),
    });
  });

  await page.goto("/skills");
  await page.getByPlaceholder("搜索 Skill，或描述你想完成的任务…").fill("ready-skill");
  await Promise.all([
    page.waitForURL(/\/skills\//),
    page.locator(".invocation-builder").getByRole("link", { name: "完整详情" }).click(),
  ]);
  const lifecycle = page.locator(".lifecycle-actions-panel");
  const removalTrigger = lifecycle.getByRole("button", { name: "移到回收站" });
  await removalTrigger.click();
  const accessibleRemoval = page.getByRole("dialog");
  await expect(accessibleRemoval).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(accessibleRemoval).toBeHidden();
  await expect(removalTrigger).toBeFocused();
  await removalTrigger.click();
  const removal = page.getByRole("dialog", { name: /移到 Skill 回收站/ });
  await expect(removal.getByText("这项审查完全由本机确定性规则完成，不调用外部 AI，也不会执行 Skill 中的脚本。")).toBeVisible();
  await removal.getByLabel(/我确认把这个完整 Skill 目录/).check();
  await Promise.all([
    page.waitForURL(/\/trash$/),
    removal.getByRole("button", { name: "确认移到回收站" }).click(),
  ]);
  const trash = page.locator(".trash-page");
  await expect(trash.getByRole("heading", { name: /Skill 回收站/ })).toBeVisible();
  await expect(trash.locator(".trash-root-card code")).toHaveText("C:\\fixture\\.codex\\.skill-atlas\\trash");
  await expect(trash.getByText("C:\\fixture\\.codex\\skills\\ready-skill", { exact: true })).toBeVisible();
  await expect(trash.getByText("C:\\fixture\\.codex\\.skill-atlas\\trash\\" + trashId + "\\skill", { exact: true })).toBeVisible();
  await trash.getByRole("button", { name: "一键恢复" }).click();
  await expect(trash.getByText("回收站为空")).toBeVisible();

  await page.goto("/skills");
  await page.getByPlaceholder("搜索 Skill，或描述你想完成的任务…").fill("ready-skill");
  await Promise.all([
    page.waitForURL(/\/skills\//),
    page.locator(".invocation-builder").getByRole("link", { name: "完整详情" }).click(),
  ]);
  await page.locator(".lifecycle-actions-panel").getByRole("button", { name: "移到回收站" }).click();
  const secondRemoval = page.getByRole("dialog", { name: /移到 Skill 回收站/ });
  await secondRemoval.getByLabel(/我确认把这个完整 Skill 目录/).check();
  await Promise.all([
    page.waitForURL(/\/trash$/),
    secondRemoval.getByRole("button", { name: "确认移到回收站" }).click(),
  ]);
  await page.getByRole("button", { name: "彻底删除…" }).click();
  const permanentDeletion = page.getByRole("dialog", { name: /彻底删除 · ready-skill/ });
  await expect(permanentDeletion).toBeFocused();
  const permanentDeleteTrigger = page.locator(".trash-page-list .button-danger-quiet");
  await page.keyboard.press("Escape");
  await expect(permanentDeletion).toBeHidden();
  await expect(permanentDeleteTrigger).toBeFocused();
  await permanentDeleteTrigger.click();
  await expect(permanentDeletion).toBeVisible();
  const confirmButton = permanentDeletion.getByRole("button", { name: "永久删除 ready-skill" });
  await expect(confirmButton).toBeDisabled();
  await permanentDeletion.getByLabel(/输入完整 Skill 名称以确认/).fill("wrong-name");
  await expect(confirmButton).toBeDisabled();
  await permanentDeletion.getByLabel(/输入完整 Skill 名称以确认/).fill("ready-skill");
  await confirmButton.click();
  await expect(page.getByText(/已永久删除，无法恢复/)).toBeVisible();
  await expect(page.getByText("回收站为空")).toBeVisible();
});

test("personal Skills can be disabled and re-enabled in place", async ({ page }) => {
  let disabled = false;
  const disabledId = "55555555-5555-4555-8555-555555555555";
  const fingerprint = { algorithm: "sha256-manifest-v1", value: "a".repeat(64), fileCount: 2, totalBytes: 240, complete: true };
  await page.route("**/api/lifecycle/disable/inspect", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    planId: "11111111-1111-4111-8111-111111111111", expiresAt: new Date(Date.now() + 60_000).toISOString(),
    skillId: "ready-id", skillName: "ready-skill", displayName: "ready-skill",
    directoryPath: "C:\\fixture\\.codex\\skills\\ready-skill", fingerprint, hardDependents: [], disableAllowed: true,
    risks: [{ level: "info", code: "personal-skill", title: "Personal", detail: "Personal" }, { level: "info", code: "complete-private-copy", title: "Complete", detail: "Complete" }],
  }) }));
  await page.route("**/api/lifecycle/disable/confirm", async (route) => {
    disabled = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      disabledId, skillId: "ready-id", skillName: "ready-skill",
      originalDirectory: "C:\\fixture\\.codex\\skills\\ready-skill",
      disabledDirectory: `C:\\fixture\\.codex\\.skill-atlas\\disabled\\${disabledId}\\skill`,
      disabledAt: new Date().toISOString(), fileCount: 2, totalBytes: 240, reEnableAvailable: true,
    }) });
  });
  await page.route("**/api/lifecycle/enable", async (route) => {
    disabled = false;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ disabledId, skillId: "ready-id", skillName: "ready-skill", restoredDirectory: "C:\\fixture\\.codex\\skills\\ready-skill", enabledAt: new Date().toISOString(), fileCount: 2, totalBytes: 240 }) });
  });
  await page.route("**/api/lifecycle/trash", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    rootPath: "C:\\fixture\\.codex\\.skill-atlas\\trash", count: 0, totalBytes: 0, records: [],
    disabledRoot: "C:\\fixture\\.codex\\.skill-atlas\\disabled", disabledCount: disabled ? 1 : 0,
    disabledRecords: disabled ? [{ disabledId, skillId: "ready-id", skillName: "ready-skill", displayName: "ready-skill", originalDirectory: "C:\\fixture\\.codex\\skills\\ready-skill", disabledDirectory: `C:\\fixture\\.codex\\.skill-atlas\\disabled\\${disabledId}\\skill`, disabledAt: new Date().toISOString(), fingerprint, sourceTracking: { status: "untracked" }, state: "committed" }] : [],
  }) }));

  await page.goto("/skills");
  await page.getByPlaceholder("搜索 Skill，或描述你想完成的任务…").fill("ready-skill");
  await Promise.all([
    page.waitForURL(/\/skills\//),
    page.locator(".invocation-builder").getByRole("link", { name: "完整详情" }).click(),
  ]);
  const trigger = page.locator(".lifecycle-actions-panel").getByRole("button", { name: "停用 Skill" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /停用 Skill/ });
  await expect(dialog.getByText("停用只移动完整目录，不执行 Skill 脚本，也不调用外部 AI。")).toBeVisible();
  await dialog.getByLabel(/我确认将此 Skill/).check();
  await Promise.all([page.waitForURL(/\/trash$/), dialog.getByRole("button", { name: "确认停用" }).click()]);
  await expect(page.getByRole("heading", { name: "已停用的 Skill" })).toBeVisible();
  await expect(page.getByText(`C:\\fixture\\.codex\\.skill-atlas\\disabled\\${disabledId}\\skill`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "原位重新启用" }).click();
  await expect(page.getByText(/已恢复到原目录并重新启用/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "已停用的 Skill" })).toBeHidden();
});

test("task recommendation and personal workspace remain local", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3178" });
  await page.goto("/skills");

  const taskInput = page.getByLabel("任务描述");
  await taskInput.fill("帮我处理一下量子咖啡烘焙");
  await page.getByRole("button", { name: "推荐技能" }).click();
  await expect(page.getByText(/暂时没有高置信度匹配/)).toBeVisible();
  await expect(page.locator(".insight-metrics > div").filter({ hasText: "零结果搜索" }).locator("strong")).toHaveText("1");

  await taskInput.fill("帮我写一份发布说明和更新日志");
  await page.getByRole("button", { name: "推荐技能" }).click();
  const recommendation = page.locator(".catalog-result-groups").getByRole("option", { name: /ready-skill/ });
  await expect(recommendation).toBeVisible();
  await recommendation.click();

  const builder = page.locator(".invocation-builder");
  await expect(builder.getByRole("heading", { name: "ready-skill" })).toBeVisible();
  await builder.getByRole("button", { name: "收藏" }).click();
  await builder.getByRole("button", { name: "置顶" }).click();
  const note = page.locator(".catalog-personal-note");
  await note.getByText(/个人备注/).click();
  await note.getByLabel("个人备注").fill("发布前检查变更范围和版本号");
  await note.getByRole("button", { name: "保存备注" }).click();

  await expect(builder.locator(".invocation-prompt-preview pre")).toContainText("任务目标：");
  await expect(builder.locator(".invocation-prompt-preview pre")).toContainText("执行要求：");
  await builder.getByRole("button", { name: "复制调用 Prompt" }).click();
  await expect(builder.getByRole("button", { name: /已复制/ })).toBeVisible();

  const catalogFilters = page.locator(".catalog-filter-panel");
  await expect(catalogFilters.getByRole("button", { name: /置顶 1/ })).toBeVisible();
  await expect(catalogFilters.getByRole("button", { name: /收藏 1/ })).toBeVisible();
  await expect(catalogFilters.getByRole("button", { name: /最近复制 1/ })).toBeVisible();
  await expect(page.locator(".insight-metrics > div").filter({ hasText: "找到后到复制" }).locator("strong")).not.toHaveText("暂无数据");

  const localState = await page.evaluate(() => JSON.parse(localStorage.getItem("skill-atlas:workspace:v1") || "{}"));
  expect(localState.notes).toBeTruthy();
  expect(Object.values(localState.notes)).toContain("发布前检查变更范围和版本号");

  await page.reload();
  await page.locator(".catalog-filter-panel").getByRole("button", { name: /收藏 1/ }).click();
  await page.locator(".catalog-personal-note").getByText(/个人备注/).click();
  await expect(page.locator(".catalog-personal-note").getByLabel("个人备注")).toHaveValue("发布前检查变更范围和版本号");
  await expect(page.locator(".catalog-filter-panel").getByRole("button", { name: /最近复制 1/ })).toBeVisible();
});

test("task history restores an AI result after navigating away without calling AI again", async ({ page }) => {
  let aiRequests = 0;
  await page.route("**/api/ai/assist", async (route) => {
    aiRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        action: "task-recommendation",
        provider: "deepseek",
        generatedAt: new Date().toISOString(),
        result: {
          summary: "先梳理界面目标，再开始实现。",
          recommendations: [{ skillName: "ready-skill", reason: "适合整理交付目标。", confidence: "high" }],
          nextStep: "查看推荐并决定是否加入组合。",
        },
      }),
    });
  });

  await page.goto("/skills");
  await page.getByLabel("任务描述").fill("帮我规划一个项目网站");
  await page.getByRole("button", { name: "AI 深度推荐" }).click();
  await expect(page.getByText("先梳理界面目标，再开始实现。")).toBeVisible();
  expect(aiRequests).toBe(1);

  await page.goto("/marketplace");
  await page.goto("/skills");
  await expect(page.getByLabel("任务描述")).toHaveValue("帮我规划一个项目网站");
  await expect(page.getByText("先梳理界面目标，再开始实现。")).toBeVisible();
  await expect(page.getByRole("region", { name: "近期任务" })).toContainText("DeepSeek · AI 结果");
  expect(aiRequests).toBe(1);
});

test("marketplace history restores prior results without repeating a search", async ({ page }) => {
  let searches = 0;
  await page.route("**/api/marketplace/skillsmp**", async (route) => {
    searches += 1;
    const url = new URL(route.request().url());
    const query = url.searchParams.get("q") || "unknown";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "skillsmp",
        available: true,
        browseUrl: `https://skillsmp.com/search?q=${query}`,
        results: [{
          id: `${query}-id`,
          name: `${query}-skill`,
          description: `Result for ${query}`,
          sourceLabel: "SkillsMP",
          sourceUrl: `https://github.com/example/skills/tree/main/${query}`,
          pageUrl: `https://skillsmp.com/${query}`,
        }],
      }),
    });
  });

  await page.goto("/marketplace");
  const input = page.getByPlaceholder(/前端设计/);
  await input.fill("frontend");
  await page.getByRole("button", { name: "搜索市场" }).click();
  await expect(page.getByRole("heading", { name: "frontend-skill" })).toBeVisible();
  expect(searches).toBe(1);

  await page.goto("/skills");
  await page.goto("/marketplace");
  await expect(input).toHaveValue("frontend");
  await expect(page.getByRole("heading", { name: "frontend-skill" })).toBeVisible();
  expect(searches).toBe(1);

  await input.fill("testing");
  await page.getByRole("button", { name: "搜索市场" }).click();
  await expect(page.getByRole("heading", { name: "testing-skill" })).toBeVisible();
  expect(searches).toBe(2);

  const history = page.getByRole("region", { name: "近期搜索" });
  await expect(history).toContainText("frontend");
  await history.locator(".discovery-history-open").filter({ hasText: "frontend" }).click();
  await expect(input).toHaveValue("frontend");
  await expect(page.getByRole("heading", { name: "frontend-skill" })).toBeVisible();
  expect(searches).toBe(2);
});

test("market adapters degrade without blocking safe review entry", async ({ page }) => {
  await page.goto("/marketplace");
  await expect(page.getByRole("heading", { name: /发现新能力/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "从已知源开始安全审查" })).toBeVisible();
  await page.getByRole("button", { name: /skills.sh 排行榜/ }).click();
  await expect(page.getByText(/需要 Vercel OIDC Token/)).toBeVisible();
  await expect(page.getByRole("link", { name: /打开 skills.sh/ })).toBeVisible();
});

test("market result starts the same review-and-install checkpoint directly", async ({ page }) => {
  let inspectRequests = 0;
  await page.route("**/api/marketplace/skillsmp**", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      provider: "skillsmp",
      available: true,
      browseUrl: "https://skillsmp.com/search?q=frontend",
      results: [{
        id: "direct-review",
        name: "direct-review-skill",
        description: "A reviewable Skill.",
        sourceLabel: "SkillsMP",
        sourceUrl: "https://github.com/example/skills/tree/main/direct-review-skill",
        pageUrl: "https://skillsmp.com/direct-review-skill",
      }],
    }),
  }));
  await page.route("**/api/install/inspect", async (route) => {
    inspectRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        planId: "2f6221a2-d76a-471d-94ee-6708c8c8f000",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        sourceUrl: "https://github.com/example/skills/tree/main/direct-review-skill",
        repository: "example/skills",
        ref: "main",
        revision: "0123456789abcdef",
        fingerprint: { algorithm: "sha256-manifest-v1", value: "c".repeat(64), fileCount: 1, totalBytes: 120, complete: true },
        sourceDirectory: "direct-review-skill",
        skillName: "direct-review-skill",
        description: "A reviewable Skill.",
        targetDirectory: "C:\\skills\\direct-review-skill",
        files: [{ path: "SKILL.md", size: 120 }],
        totalBytes: 120,
        risks: [{ level: "info", title: "来源边界", detail: "来自受审查的 GitHub 目录。" }],
        installAllowed: true,
      }),
    });
  });

  await page.goto("/marketplace");
  await page.getByPlaceholder(/前端设计/).fill("frontend");
  await page.getByRole("button", { name: "搜索市场" }).click();
  await page.getByRole("button", { name: "审查并安装" }).click();
  const installationDialog = page.getByRole("dialog", { name: /direct-review-skill/ });
  await expect(installationDialog).toBeVisible();
  await expect(installationDialog).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(installationDialog).toBeHidden();
  expect(inspectRequests).toBe(1);
});

test("installed Skill focus link filters and selects the requested Skill", async ({ page }) => {
  await page.goto("/skills?skill=ready-skill#inventory");
  await expect(page.getByRole("combobox", { name: /搜索技能/ })).toHaveValue("ready-skill");
  await expect(page.locator(".invocation-builder").getByRole("heading", { name: "ready-skill" })).toBeVisible();
});

test("settings explains environment readiness and repair paths", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "环境体检" })).toBeVisible();
  await expect(page.getByText("项目目录", { exact: true })).toBeVisible();
  await expect(page.getByText("Node.js 运行时", { exact: true })).toBeVisible();
  await expect(page.getByText("npm 包管理器", { exact: true })).toBeVisible();
  await expect(page.getByText("个人 Skills 目录", { exact: true })).toBeVisible();
  await expect(page.getByText("启动前完整检查", { exact: true })).toBeVisible();
  await expect(page.getByText("start-skill-atlas.cmd --check", { exact: true })).toBeVisible();
  await expect(page.getByText("AI 提示词增强 · 未配置", { exact: true })).toBeVisible();
  await expect(page.getByText("当前提供商：未配置；默认模板始终可用", { exact: true })).toBeVisible();
});

test("AI provider settings can be saved in the page and survive a refresh", async ({ page }) => {
  try {
    await page.goto("/settings");
    await page.getByRole("radio", { name: /^DeepSeek / }).check();
    await page.getByLabel("API Key").nth(1).fill("deepseek-browser-test-key");
    await expect(page.getByLabel("模型").nth(1)).toHaveValue("deepseek-v4-flash");
    await page.getByRole("button", { name: "保存 AI 连接" }).click();

    await expect(page.getByText("AI 连接已保存并立即生效。")).toBeVisible();
    await expect(page.locator(".ai-live-status strong")).toHaveText("DeepSeek");
    await expect(page.locator(".ai-live-status em")).toHaveText("连接就绪");

    await page.reload();
    await expect(page.locator(".ai-live-status strong")).toHaveText("DeepSeek");
    await expect(page.getByText("AI 提示词增强 · DeepSeek", { exact: true })).toBeVisible();
    await expect(page.getByLabel("API Key").nth(1)).toHaveValue("");
    await expect(page.getByLabel("API Key").nth(1)).toHaveAttribute("placeholder", "已配置；留空保持不变");

    const response = await page.request.get("/api/settings/ai");
    expect(response.ok()).toBe(true);
    expect(await response.text()).not.toContain("deepseek-browser-test-key");
  } finally {
    await page.request.delete("/api/settings/ai");
  }
});

test("mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/skills");
  const chineseOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(chineseOverflow).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "切换到英文" }).click();
  await expect(page.getByRole("heading", { name: "Skill Catalog" })).toBeVisible();
  const englishOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(englishOverflow).toBeLessThanOrEqual(1);

  await page.goto("/settings");
  const settingsOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(settingsOverflow).toBeLessThanOrEqual(1);
});

test("language switch updates the interface and persists across navigation", async ({ page }) => {
  await page.goto("/skills");
  await page.getByRole("button", { name: "切换到英文" }).click();

  await expect(page.getByRole("heading", { name: "Skill Catalog" })).toBeVisible();
  await expect(page.getByPlaceholder("Search Skills, or describe what you want to accomplish…")).toBeVisible();
  await expect(page.getByRole("link", { name: /Skill catalog/ })).toBeVisible();
  await page.getByRole("button", { name: "Card view" }).click();
  await expect(page.getByText(/Creates concise release notes/).first()).toBeVisible();
  await expect(page.getByText("本地中文摘要").first()).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.goto("/marketplace");
  await expect(page.getByRole("heading", { name: /Discover new capabilities/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch to Chinese" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: /Discover new capabilities/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-language", "en");
});
