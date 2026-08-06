import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { messageCatalogs, translateMessage } from "@/core/i18n/messages";

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([a-zA-Z][\w-]*)\}/g)]
    .map((match) => match[1])
    .sort();
}

describe("keyed interface messages", () => {
  it("keeps every supported language complete and non-empty", () => {
    const chineseKeys = Object.keys(messageCatalogs.zh).sort();
    const englishKeys = Object.keys(messageCatalogs.en).sort();

    expect(englishKeys).toEqual(chineseKeys);
    for (const key of chineseKeys) {
      expect(messageCatalogs.zh[key as keyof typeof messageCatalogs.zh].trim()).not.toBe("");
      expect(messageCatalogs.en[key as keyof typeof messageCatalogs.en].trim()).not.toBe("");
    }
  });

  it("keeps interpolation placeholders aligned across languages", () => {
    for (const key of Object.keys(messageCatalogs.zh) as Array<keyof typeof messageCatalogs.zh>) {
      expect(placeholders(messageCatalogs.en[key])).toEqual(placeholders(messageCatalogs.zh[key]));
    }
  });

  it("interpolates values without changing Skill names", () => {
    expect(translateMessage("market.foundCount", "zh", { count: 12 })).toBe("找到 12 个尚未安装的候选");
    expect(translateMessage("market.foundCount", "en", { count: 12 })).toBe("12 uninstalled candidates found");
  });

  it("keeps the Task Discovery seam on keyed messages", async () => {
    const files = [
      "src/components/task-recommender.tsx",
      "src/components/task-discovery/marketplace-candidate-zone.tsx",
    ];
    const contents = await Promise.all(files.map((file) => readFile(path.join(process.cwd(), file), "utf8")));

    for (const content of contents) {
      expect(content).not.toMatch(/\bt\(/);
      expect(content).not.toMatch(/language === "zh"\s*\?\s*["'`]/);
    }
  });
});
