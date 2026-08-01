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
});
