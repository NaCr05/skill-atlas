import { expect, test, type Page } from "@playwright/test";

function fulfillAi(page: Page, requests: Array<Record<string, unknown>>) {
  return page.route("**/api/ai/assist", async (route) => {
    const input = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(input);
    const action = input.action;
    const results: Record<string, unknown> = {
      "task-recommendation": {
        summary: "建议先完成界面设计，再进行独立审查。",
        recommendations: [
          { skillName: "ready-skill", reason: "整理可交付结果。", confidence: "high" },
          { skillName: "explicit-skill", reason: "通过访谈补齐约束。", confidence: "medium" },
        ],
        nextStep: "选择两个 Skill 后生成组合方案。",
      },
      "skill-composition": {
        title: "从约束澄清到结果整理",
        rationale: "先明确输入，再整理输出。",
        steps: [
          { skillName: "ready-skill", goal: "整理现有变更。", handoff: "输出变更摘要。" },
          { skillName: "explicit-skill", goal: "补齐遗漏约束。", handoff: "输出确认后的方案。" },
        ],
        combinedPrompt: "$ready-skill $explicit-skill\n\n请按顺序完成任务。",
      },
      "personal-assistant": {
        summary: "可以把常用 Skill 组织成稳定工作流。",
        suggestions: [{ skillName: "ready-skill", reason: "适合沉淀结果。", exampleTask: "整理本周的发布内容。" }],
        habits: ["最近更常使用文档类任务。"],
      },
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ action, provider: "deepseek", generatedAt: new Date().toISOString(), result: results[String(action)] }),
    });
  });
}

test("AI task tools remain idle until each explicit entry is clicked", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await fulfillAi(page, requests);
  await page.goto("/skills");
  expect(requests).toHaveLength(0);

  const taskInput = page.getByLabel("任务描述");
  await taskInput.fill("请帮我整理项目并确认遗漏约束");
  await page.getByRole("button", { name: "推荐技能" }).click();
  expect(requests).toHaveLength(0);

  await page.getByRole("button", { name: "AI 深度推荐" }).click();
  await expect(page.getByText("建议先完成界面设计，再进行独立审查。")).toBeVisible();
  expect(requests.map((request) => request.action)).toEqual(["task-recommendation"]);

  await page.getByRole("button", { name: "智能组合 Skill" }).click();
  await expect(page.getByText("从约束澄清到结果整理")).toBeVisible();
  await expect(page.getByRole("button", { name: "复制组合 Prompt" })).toBeVisible();
  expect(requests.map((request) => request.action)).toEqual(["task-recommendation", "skill-composition"]);

  await page.getByRole("button", { name: "分析我的使用习惯" }).click();
  await expect(page.getByText("可以把常用 Skill 组织成稳定工作流。")).toBeVisible();
  expect(requests.map((request) => request.action)).toEqual(["task-recommendation", "skill-composition", "personal-assistant"]);
  expect(JSON.stringify(requests[2])).not.toContain("notes");
});

test("editing a task prevents an older AI response from replacing the new result", async ({ page }) => {
  const seen: string[] = [];
  await page.route("**/api/ai/assist", async (route) => {
    const input = route.request().postDataJSON() as { task: string; action: string };
    seen.push(input.task);
    await new Promise((resolve) => setTimeout(resolve, input.task.includes("旧任务") ? 260 : 15));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        action: input.action,
        provider: "deepseek",
        generatedAt: new Date().toISOString(),
        result: {
          summary: input.task.includes("旧任务") ? "旧任务结果不应出现" : "新任务结果保持可见",
          recommendations: [{ skillName: "ready-skill", reason: "Matches the current task.", confidence: "high" }],
          nextStep: "Continue with the current task.",
        },
      }),
    }).catch(() => undefined);
  });

  await page.goto("/skills");
  const input = page.getByLabel("任务描述");
  await input.fill("旧任务：整理文档");
  await page.getByRole("button", { name: "AI 深度推荐" }).click();
  await expect.poll(() => seen.length).toBe(1);
  await input.fill("新任务：整理发布说明");
  await page.getByRole("button", { name: "AI 深度推荐" }).click();

  await expect(page.getByText("新任务结果保持可见")).toBeVisible();
  await expect(page.getByText("旧任务结果不应出现")).toHaveCount(0);
});

test("editing a marketplace query prevents stale search results from winning", async ({ page }) => {
  await page.route("**/api/marketplace/skillsmp**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") || "";
    await new Promise((resolve) => setTimeout(resolve, query === "old" ? 260 : 15));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "skillsmp",
        available: true,
        browseUrl: "https://skillsmp.com/",
        results: [{
          id: query,
          name: query === "old" ? "stale-market-skill" : "current-market-skill",
          description: "A grounded marketplace result.",
          sourceLabel: "SkillsMP",
          pageUrl: "https://skillsmp.com/",
        }],
      }),
    }).catch(() => undefined);
  });

  await page.goto("/marketplace");
  const input = page.getByPlaceholder(/前端设计|frontend design/);
  await input.fill("old");
  await page.getByRole("button", { name: "搜索市场" }).click();
  await input.fill("new");
  await page.getByRole("button", { name: "搜索市场" }).click();

  await expect(page.getByRole("heading", { name: "current-market-skill" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "stale-market-skill" })).toHaveCount(0);
});

test("installation AI explanation is advisory and requires its own click", async ({ page }) => {
  let aiRequests = 0;
  await page.route("**/api/install/inspect", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      planId: "plan-1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      sourceUrl: "https://github.com/example/repo/tree/main/skill",
      repository: "example/repo",
      ref: "main",
      revision: "0123456789abcdef",
      fingerprint: { algorithm: "sha256-manifest-v1", value: "a".repeat(64), fileCount: 1, totalBytes: 120, complete: true },
      sourceDirectory: "skill",
      skillName: "sample-skill",
      description: "A sample Skill.",
      targetDirectory: "C:\\skills\\sample-skill",
      files: [{ path: "SKILL.md", size: 120 }],
      totalBytes: 120,
      risks: [{ level: "info", title: "Review source", detail: "No blocking issue was found." }],
      installAllowed: true,
    }),
  }));
  await page.route("**/api/ai/assist", async (route) => {
    aiRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        action: "installation-explanation",
        provider: "openai",
        generatedAt: new Date().toISOString(),
        result: { summary: "来源清晰，但安装前仍应核对文件。", verdict: "safe-to-consider", strengths: ["目录较小。"], watchItems: ["确认作者身份。"], questions: [] },
      }),
    });
  });

  await page.goto("/marketplace");
  await page.locator(".manual-install input").first().fill("https://github.com/example/repo/tree/main/skill");
  await page.locator(".manual-install .button-primary").click();
  await expect(page.getByRole("dialog", { name: /sample-skill/ })).toBeVisible();
  expect(aiRequests).toBe(0);

  await page.getByRole("button", { name: "让 AI 解读审查单" }).click();
  await expect(page.getByText("来源清晰，但安装前仍应核对文件。")).toBeVisible();
  expect(aiRequests).toBe(1);
  await expect(page.getByRole("checkbox")).not.toBeChecked();
});

test("market discovery recommends only grounded uninstalled candidates and hands off to review", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const marketRequests: string[] = [];
  const aiRequests: Array<Record<string, unknown>> = [];
  let inspectRequests = 0;
  let installRequests = 0;
  await page.route("**/api/marketplace/skillsmp**", async (route) => {
    marketRequests.push("skillsmp");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "skillsmp",
        available: true,
        browseUrl: "https://skillsmp.com/search?q=website",
        results: [
          {
            id: "market-ui",
            name: "market-ui-builder",
            description: "Build polished website interfaces.",
            author: "example",
            sourceLabel: "SkillsMP",
            sourceUrl: "https://github.com/example/skills/tree/main/market-ui-builder",
            pageUrl: "https://skillsmp.com/market-ui-builder",
            stars: 120,
          },
          {
            id: "already-installed",
            name: "ready-skill",
            description: "This result is already installed.",
            sourceLabel: "SkillsMP",
            pageUrl: "https://skillsmp.com/ready-skill",
          },
        ],
      }),
    });
  });
  await page.route("**/api/marketplace/skills-sh**", async (route) => {
    marketRequests.push("skills.sh");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "skills.sh",
        available: false,
        browseUrl: "https://skills.sh/trending",
        results: [],
        notice: "skills.sh 官方 API 需要 Vercel OIDC Token。",
      }),
    });
  });
  await page.route("**/api/ai/assist", async (route) => {
    const input = route.request().postDataJSON() as Record<string, unknown>;
    aiRequests.push(input);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        action: "market-candidate-ranking",
        provider: "deepseek",
        generatedAt: new Date().toISOString(),
        result: {
          summary: "这个候选可以补齐已安装技能中的前端实现能力。",
          recommendations: [{
            candidateId: "skillsmp:market-ui",
            reason: "它与网站搭建任务直接相关。",
            confidence: "high",
            complements: ["ready-skill"],
          }],
          capabilityGap: "本地已有规划能力，但缺少专门的页面实现辅助。",
          nextStep: "先核对来源与文件差异，再决定是否安装。",
        },
      }),
    });
  });
  await page.route("**/api/install/inspect", async (route) => {
    inspectRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        planId: "1f6221a2-d76a-471d-94ee-6708c8c8f000",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        sourceUrl: "https://github.com/example/skills/tree/main/market-ui-builder",
        repository: "example/skills",
        ref: "main",
        revision: "0123456789abcdef",
        fingerprint: { algorithm: "sha256-manifest-v1", value: "b".repeat(64), fileCount: 1, totalBytes: 120, complete: true },
        sourceDirectory: "market-ui-builder",
        skillName: "market-ui-builder",
        description: "Build polished website interfaces.",
        targetDirectory: "C:\\skills\\market-ui-builder",
        files: [{ path: "SKILL.md", size: 120 }],
        totalBytes: 120,
        risks: [{ level: "info", title: "来源边界", detail: "来自受审查的 GitHub 目录。" }],
        installAllowed: true,
      }),
    });
  });
  await page.route("**/api/install/confirm", async (route) => {
    installRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillName: "market-ui-builder",
        targetDirectory: "C:\\skills\\market-ui-builder",
        fileCount: 1,
        totalBytes: 120,
        verifiedFiles: ["SKILL.md"],
        sourceTracking: "recorded",
      }),
    });
  });

  await page.goto("/skills");
  await page.getByLabel("任务描述").fill("从零开始搭建一个网站");
  await page.getByRole("button", { name: "推荐技能" }).click();
  const marketZone = page.locator(".market-candidate-zone");
  await expect(marketZone).toBeVisible();
  expect(marketRequests).toHaveLength(0);
  expect(aiRequests).toHaveLength(0);

  await marketZone.getByRole("button", { name: "搜索市场候选" }).click();
  await expect(marketZone.getByRole("heading", { name: "market-ui-builder" })).toBeVisible();
  await expect(marketZone.getByText("未安装", { exact: true })).toBeVisible();
  await expect(marketZone.getByRole("heading", { name: "ready-skill" })).toHaveCount(0);
  expect(marketRequests.sort()).toEqual(["skills.sh", "skillsmp"]);
  expect(aiRequests).toHaveLength(0);

  await marketZone.getByRole("button", { name: "AI 筛选这些候选" }).click();
  await expect(marketZone.getByText("它与网站搭建任务直接相关。")).toBeVisible();
  await expect(marketZone.getByText("$ready-skill")).toBeVisible();
  expect(aiRequests).toHaveLength(1);
  expect(aiRequests[0]?.action).toBe("market-candidate-ranking");
  expect(JSON.stringify(aiRequests[0])).not.toContain("already-installed");

  await marketZone.getByRole("button", { name: "审查并安装" }).click();
  const dialog = page.getByRole("dialog", { name: /market-ui-builder/ });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(inspectRequests).toBe(1);
  expect(installRequests).toBe(0);
  expect(aiRequests).toHaveLength(1);
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await expect(dialog.getByRole("button", { name: "确认并安装完整目录" })).toBeDisabled();

  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "确认并安装完整目录" }).click();
  expect(installRequests).toBe(1);
  const success = page.locator(".installation-success");
  await expect(success).toBeVisible();
  await expect(success.getByRole("link", { name: "查看已安装 Skill" })).toHaveAttribute("href", "/skills?skill=market-ui-builder#inventory");
  await success.getByRole("button", { name: "复制调用 Prompt" }).click();
  await expect(success.getByRole("button", { name: "调用 Prompt 已复制" })).toBeVisible();
});
