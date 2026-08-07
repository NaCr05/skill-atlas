import { describe, expect, it } from "vitest";

import { recommendSkills } from "@/core/skills/recommend";
import type { SkillRecord } from "@/core/skills/types";

function skill(name: string, description: string): SkillRecord {
  return {
    id: name,
    name,
    displayName: name,
    description,
    source: { kind: "personal", label: "Personal", rootPath: "C:\\skills", permission: "manage" },
    skillPath: `C:\\skills\\${name}\\SKILL.md`,
    directoryPath: `C:\\skills\\${name}`,
    fingerprint: { algorithm: "sha256-manifest-v1", value: name.padEnd(64, "0").slice(0, 64), fileCount: 1, totalBytes: 100, complete: true },
    sourceTracking: { status: "untracked" },
    status: "usable",
    secondaryStatuses: [],
    structureStatus: "valid",
    environmentStatus: "ready",
    environmentReasons: [],
    issues: [],
    allowImplicitInvocation: true,
    instructions: "",
    resources: [],
    dependencies: [],
    referencedSkills: [],
    missingDependencies: [],
    requiredTools: [],
    tags: [],
    useCases: [],
    recommendations: [],
    relationships: [],
    provenance: { author: "unknown", description: "skill-metadata", status: "dashboard-analysis", useCases: "dashboard-inference", relationships: "dashboard-inference", prompt: "dashboard-template" },
  };
}

describe("task description recommendation", () => {
  const skills = [
    skill("frontend-design", "Design distinctive production web interfaces."),
    skill("latex-document", "Create and compile academic LaTeX papers."),
    skill("exa-search", "Search the web for current research."),
  ];

  it("recommends a matching installed Skill from a Chinese task description", () => {
    const results = recommendSkills(skills, "帮我重新设计这个前端页面，让界面更美观", "zh");
    expect(results[0]?.skill.name).toBe("frontend-design");
    expect(results[0]?.reasons).toContain("前端与界面设计");
  });

  it("returns no result for a task without high-confidence signals", () => {
    expect(recommendSkills(skills, "帮我处理一下这个事情", "zh")).toEqual([]);
  });

  it("uses local outcome summaries to refine otherwise similar matches", () => {
    const similar = [
      skill("alpha", "frontend web interface design"),
      skill("beta", "frontend web interface design"),
    ];
    const feedback = {
      alpha: { helpful: 0, notSolved: 0, wrongSkill: 2 },
      beta: { helpful: 3, notSolved: 0, wrongSkill: 0 },
    };
    const results = recommendSkills(similar, "frontend design", "en", 5, feedback);
    expect(results[0]?.skill.name).toBe("beta");
    expect(results[0]?.reasons).toContain("Helpful in past use");
  });
});
