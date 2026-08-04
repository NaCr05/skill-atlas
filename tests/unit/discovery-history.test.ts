import { describe, expect, it } from "vitest";

import {
  DISCOVERY_HISTORY_KEY,
  readDiscoveryHistory,
  recordMarketplaceDiscovery,
  recordTaskDiscovery,
  saveMarketplaceDraft,
  saveTaskDraft,
} from "@/core/discovery-history";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    raw: () => values.get(DISCOVERY_HISTORY_KEY),
  };
}

const marketResponse = {
  provider: "skillsmp" as const,
  available: true,
  browseUrl: "https://skillsmp.com/search?q=frontend",
  results: [{
    id: "frontend-design",
    name: "frontend-design",
    description: "Design polished interfaces.",
    sourceLabel: "SkillsMP",
    sourceUrl: "https://github.com/example/skills/tree/main/frontend-design",
    pageUrl: "https://skillsmp.com/frontend-design",
  }],
};

describe("discovery history", () => {
  it("restores drafts and bounded task and marketplace results locally", () => {
    const storage = memoryStorage();
    saveTaskDraft("正在编辑的新任务", storage);
    saveMarketplaceDraft("skillsmp", "前端设计", storage);
    for (let index = 0; index < 10; index += 1) {
      recordTaskDiscovery({ query: `任务 ${index}`, mode: "local" }, storage);
      recordMarketplaceDiscovery({
        provider: "skillsmp",
        query: `搜索 ${index}`,
        response: { ...marketResponse, browseUrl: `https://skillsmp.com/search?q=${index}` },
      }, storage);
    }

    const restored = readDiscoveryHistory(storage);
    expect(restored.taskEntries).toHaveLength(8);
    expect(restored.marketplaceEntries).toHaveLength(8);
    expect(restored.taskEntries[0]?.query).toBe("任务 9");
    expect(restored.marketplaceEntries[0]?.response.results[0]?.name).toBe("frontend-design");
    expect(storage.raw()).not.toContain("undefined");
  });

  it("stores AI task output for replay without another provider request", () => {
    const storage = memoryStorage();
    recordTaskDiscovery({
      query: "帮我规划网站开发",
      mode: "ai",
      aiResponse: {
        action: "task-recommendation",
        provider: "deepseek",
        generatedAt: new Date().toISOString(),
        result: {
          summary: "先设计，再实现。",
          recommendations: [{ skillName: "frontend-design", reason: "适合页面设计。", confidence: "high" }],
          nextStep: "打开推荐结果。",
        },
      },
    }, storage);

    const restored = readDiscoveryHistory(storage).taskEntries[0];
    expect(restored?.mode).toBe("ai");
    expect(restored?.aiResponse?.provider).toBe("deepseek");
    expect(restored?.aiResponse?.result.summary).toBe("先设计，再实现。");
  });

  it("recovers from malformed data and strips unsafe stored links", () => {
    const storage = memoryStorage();
    storage.setItem(DISCOVERY_HISTORY_KEY, "not-json");
    expect(readDiscoveryHistory(storage).taskEntries).toEqual([]);

    storage.setItem(DISCOVERY_HISTORY_KEY, JSON.stringify({
      version: 1,
      taskDraft: "",
      marketplaceDraft: { provider: "skillsmp", query: "unsafe" },
      taskEntries: [],
      marketplaceEntries: [{
        provider: "skillsmp",
        query: "unsafe",
        searchedAt: new Date().toISOString(),
        response: {
          ...marketResponse,
          results: [{ ...marketResponse.results[0], pageUrl: "javascript:alert(1)" }],
        },
      }],
    }));
    expect(readDiscoveryHistory(storage).marketplaceEntries[0]?.response.results).toEqual([]);
  });
});
