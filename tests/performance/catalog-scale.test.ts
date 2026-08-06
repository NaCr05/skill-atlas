import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import { catalogQuerySkillIds, catalogResultGroups } from "@/core/skills/catalog";
import { DEFAULT_CATALOG_PAGE_SIZE, paginateCatalog } from "@/core/skills/pagination";
import { recommendSkills } from "@/core/skills/recommend";
import type { SkillSummary } from "@/core/skills/types";

function catalog(size: number): SkillSummary[] {
  return Array.from({ length: size }, (_, index) => {
    const name = index % 7 === 0 ? `frontend-design-${index}` : `catalog-skill-${index}`;
    return {
      id: name,
      name,
      displayName: name,
      description: index % 7 === 0
        ? "Design distinctive production web interfaces and dashboards."
        : `Local workflow capability ${index}.`,
      source: { kind: "personal", label: "Personal", rootPath: "C:\\skills", permission: "manage" },
      skillPath: `C:\\skills\\${name}\\SKILL.md`,
      directoryPath: `C:\\skills\\${name}`,
      fingerprint: {
        algorithm: "sha256-manifest-v1",
        value: index.toString(16).padStart(64, "0"),
        fileCount: 1,
        totalBytes: 100,
        complete: true,
      },
      sourceTracking: { status: "untracked" },
      status: "usable",
      secondaryStatuses: [],
      structureStatus: "valid",
      environmentStatus: "ready",
      environmentReasons: [],
      issues: [],
      allowImplicitInvocation: true,
      resources: [],
      dependencies: [],
      referencedSkills: [],
      missingDependencies: [],
      requiredTools: [],
      tags: index % 7 === 0 ? ["frontend", "design"] : ["workflow"],
      useCases: index % 7 === 0 ? ["重新设计前端页面"] : [],
      recommendations: [],
      relationships: [],
      provenance: {
        author: "unknown",
        description: "skill-metadata",
        status: "dashboard-analysis",
        useCases: "dashboard-inference",
        relationships: "dashboard-inference",
        prompt: "dashboard-template",
      },
    };
  });
}

function exerciseCatalog(skills: SkillSummary[]): number {
  const startedAt = performance.now();
  for (let iteration = 0; iteration < 12; iteration += 1) {
    catalogQuerySkillIds(skills, "重新设计前端页面", "zh");
    catalogResultGroups(skills, "frontend design", "en", ["catalog-skill-1"]);
    recommendSkills(skills, "帮我重新设计前端页面", "zh");
  }
  return performance.now() - startedAt;
}

describe("catalog scale budget", () => {
  it.each([
    { size: 500, budgetMs: 1_000 },
    { size: 1_000, budgetMs: 2_000 },
  ])("keeps deterministic discovery responsive for $size Skill summaries", ({ size, budgetMs }) => {
    const skills = catalog(size);
    exerciseCatalog(skills.slice(0, 50));

    const elapsedMs = exerciseCatalog(skills);

    expect(elapsedMs).toBeLessThan(budgetMs);
    expect(catalogQuerySkillIds(skills, `catalog-skill-${size - 1}`, "en").has(`catalog-skill-${size - 1}`)).toBe(true);
    expect(paginateCatalog(skills, 1).items).toHaveLength(DEFAULT_CATALOG_PAGE_SIZE);
  });
});
