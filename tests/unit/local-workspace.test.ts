import { describe, expect, it } from "vitest";

import {
  LOCAL_WORKSPACE_KEY,
  medianCopyJourneyMs,
  readLocalWorkspace,
  recordPromptCopy,
  recordZeroResultSearch,
  writeLocalWorkspace,
} from "@/core/local-workspace";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    raw: () => values.get(LOCAL_WORKSPACE_KEY),
  };
}

describe("local workspace", () => {
  it("persists favorites, pins, and bounded notes without a server", () => {
    const storage = memoryStorage();
    writeLocalWorkspace({
      version: 1,
      favorites: ["skill-a"],
      pinned: ["skill-a"],
      notes: { "skill-a": "用于毕业论文" },
      recentCopies: [],
      analytics: { zeroResultSearches: [], copyJourneys: [] },
    }, storage);
    expect(storage.raw()).toContain("用于毕业论文");
    expect(readLocalWorkspace(storage)).toMatchObject({ favorites: ["skill-a"], pinned: ["skill-a"] });
  });

  it("deduplicates zero-result events and calculates the median copy journey", () => {
    const storage = memoryStorage();
    recordZeroResultSearch("不存在的任务", "task-recommendation", storage);
    recordZeroResultSearch("不存在的任务", "task-recommendation", storage);
    expect(readLocalWorkspace(storage).analytics.zeroResultSearches).toHaveLength(1);

    recordPromptCopy({ skillId: "one", skillName: "one", displayName: "One", language: "zh", journeyStartedAt: Date.now() - 1_000 }, storage);
    recordPromptCopy({ skillId: "two", skillName: "two", displayName: "Two", language: "zh", journeyStartedAt: Date.now() - 3_000 }, storage);
    expect(medianCopyJourneyMs(readLocalWorkspace(storage))).toBeGreaterThanOrEqual(2_000);
  });

  it("recovers from malformed local data", () => {
    const storage = memoryStorage();
    storage.setItem(LOCAL_WORKSPACE_KEY, "not-json");
    expect(readLocalWorkspace(storage).version).toBe(1);
    expect(readLocalWorkspace(storage).favorites).toEqual([]);
  });
});
