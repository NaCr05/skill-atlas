import { describe, expect, it, vi } from "vitest";

import { searchSkillsMp } from "@/core/marketplaces/skillsmp";
import { loadSkillsShLeaderboard } from "@/core/marketplaces/skills-sh";

describe("marketplace adapters", () => {
  it("normalizes SkillsMP responses", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ data: { skills: [{ id: "1", name: "UI Audit", description: "Reviews UI", githubUrl: "https://github.com/acme/skills/tree/main/ui-audit", skillUrl: "https://skillsmp.com/ui-audit", stars: 42 }] } }),
    ) as unknown as typeof fetch;
    const response = await searchSkillsMp("ui", 5, { fetcher });
    expect(response.available).toBe(true);
    expect(response.results[0]).toMatchObject({ name: "UI Audit", stars: 42, sourceUrl: "https://github.com/acme/skills/tree/main/ui-audit", pageUrl: "https://skillsmp.com/ui-audit" });
  });

  it("degrades to the public skills.sh page without OIDC", async () => {
    const response = await loadSkillsShLeaderboard("trending", 5, { token: "" });
    expect(response.available).toBe(false);
    expect(response.browseUrl).toContain("skills.sh");
  });
});
