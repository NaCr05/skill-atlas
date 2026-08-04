import { describe, expect, it } from "vitest";

import type { MarketplaceResponse } from "@/core/marketplaces/adapter";
import { marketTaskTerms, selectMarketCandidates } from "@/core/marketplaces/candidates";

function response(
  provider: MarketplaceResponse["provider"],
  results: MarketplaceResponse["results"],
): MarketplaceResponse {
  return { provider, available: true, results, browseUrl: `https://${provider}.example` };
}

describe("market candidate selection", () => {
  it("expands common Chinese task intents into marketplace terms", () => {
    expect(marketTaskTerms("设计一个数据分析网站")).toEqual(expect.arrayContaining([
      "web",
      "frontend",
      "data",
      "analytics",
    ]));
  });

  it("removes installed, duplicate, irrelevant leaderboard, and repeated candidates", () => {
    const candidates = selectMarketCandidates([
      response("skillsmp", [
        { id: "installed", name: "frontend-design", description: "Installed", sourceLabel: "SkillsMP", pageUrl: "https://skillsmp.example/installed" },
        { id: "market-ui", name: "market-ui-builder", description: "Build a polished web UI", sourceLabel: "SkillsMP", sourceUrl: "https://github.com/example/skills/tree/main/market-ui-builder", pageUrl: "https://skillsmp.example/ui" },
        { id: "same-name", name: "market-ui-builder", description: "A fork with the same name", sourceLabel: "SkillsMP", sourceUrl: "https://github.com/fork/skills/tree/main/market-ui-builder", pageUrl: "https://skillsmp.example/ui-fork" },
        { id: "duplicate", name: "duplicate-ui", description: "Duplicate", sourceLabel: "SkillsMP", pageUrl: "https://skillsmp.example/duplicate", duplicate: true },
      ]),
      response("skills.sh", [
        { id: "same-source", name: "same-ui", description: "Frontend UI", sourceLabel: "skills.sh", sourceUrl: "https://github.com/example/skills/tree/main/market-ui-builder", pageUrl: "https://skills.sh/same" },
        { id: "unrelated", name: "database-migration", description: "Postgres schema migrations", sourceLabel: "skills.sh", pageUrl: "https://skills.sh/unrelated" },
      ]),
    ], ["FRONTEND-DESIGN"], "从零设计网站前端");

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: "skillsmp:market-ui",
      name: "market-ui-builder",
    });
  });

  it("namespaces source IDs and caps the context sent onward", () => {
    const results = Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      name: `web-skill-${index}`,
      description: "Web design helper",
      sourceLabel: "SkillsMP",
      pageUrl: `https://skillsmp.example/${index}`,
    }));
    const candidates = selectMarketCandidates([response("skillsmp", results)], [], "web design");

    expect(candidates).toHaveLength(12);
    expect(candidates[0]?.id).toBe("skillsmp:0");
  });
});
