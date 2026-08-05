import { describe, expect, it } from "vitest";

import { catalogHealthBucket, catalogQuerySkillIds, catalogResultGroups } from "@/core/skills/catalog";
import type { SkillRecord } from "@/core/skills/types";

function skill(name: string, overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: name,
    name,
    displayName: name,
    description: `${name} capability`,
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
    ...overrides,
  };
}

describe("catalog health buckets", () => {
  it("keeps explicit and conditional invocation Skills in ready when their structure and environment are ready", () => {
    expect(catalogHealthBucket(skill("explicit", { status: "explicit-only", allowImplicitInvocation: false }))).toBe("ready");
    expect(catalogHealthBucket(skill("conditional", { status: "conditional" }))).toBe("ready");
  });

  it("separates review findings from setup blockers", () => {
    expect(catalogHealthBucket(skill("duplicate", { status: "duplicate" }))).toBe("review");
    expect(catalogHealthBucket(skill("missing", { status: "missing-dependency", environmentStatus: "needs-setup", missingDependencies: ["peer"] }))).toBe("setup");
  });
});

describe("catalog command results", () => {
  const skills = [
    skill("frontend-design", { description: "Design distinctive production web interfaces." }),
    skill("latex-document", { description: "Create academic papers." }),
    skill("browser", { environmentStatus: "needs-setup", requiredTools: ["chrome"] }),
  ];

  it("combines direct search and deterministic task recommendations", () => {
    const ids = catalogQuerySkillIds(skills, "重新设计前端页面", "zh");
    expect(ids.has("frontend-design")).toBe(true);
  });

  it("keeps an exact Skill name query precise", () => {
    const ids = catalogQuerySkillIds(skills, "frontend-design", "en");
    expect([...ids]).toEqual(["frontend-design"]);
  });

  it("groups recent results when the command is empty", () => {
    const groups = catalogResultGroups(skills, "", "zh", ["latex-document"]);
    expect(groups.find((group) => group.id === "recent")?.items[0]?.skill.name).toBe("latex-document");
  });
});
