import { describe, expect, it } from "vitest";

import { planInventoryIssues } from "@/core/issues/issue-planner";
import type { SkillInventorySummary, SkillSummary } from "@/core/skills/types";

function skill(
  id: string,
  name: string,
  source: SkillSummary["source"],
  missingDependencies: string[] = [],
): SkillSummary {
  return {
    id,
    name,
    displayName: name,
    description: `${name} fixture`,
    source,
    directoryPath: `${source.rootPath}/${name}`,
    missingDependencies,
  } as SkillSummary;
}

function inventory(skills: SkillSummary[]): SkillInventorySummary {
  return {
    codexHome: "C:/fixture/.codex",
    detectedFrom: "CODEX_HOME",
    scannedAt: "2026-08-04T00:00:00.000Z",
    durationMs: 1,
    cache: { hit: false, ttlMs: 0, expiresAt: "2026-08-04T00:00:00.000Z" },
    sourceRoots: [],
    skills,
    warnings: [],
  };
}

describe("inventory issue planner", () => {
  it("groups duplicates, chooses the manageable copy, and exposes only safe migration candidates", () => {
    const personal = { kind: "personal", label: "Personal", rootPath: "C:/fixture/.codex/skills", permission: "manage" } as const;
    const compatibility = { kind: "compatibility", label: "Agents", rootPath: "C:/fixture/.agents/skills", permission: "migration-only" } as const;

    const result = planInventoryIssues(inventory([
      skill("personal-id", "sample", personal),
      skill("compat-id", "sample", compatibility),
    ]));

    expect(result.duplicateCount).toBe(1);
    expect(result.issues[0]).toMatchObject({
      kind: "duplicate-entry",
      canonicalSkillId: "personal-id",
      migrationCandidateIds: ["compat-id"],
    });
  });

  it("creates one blocked, reviewable issue for each Skill with missing dependencies", () => {
    const personal = { kind: "personal", label: "Personal", rootPath: "C:/fixture/.codex/skills", permission: "manage" } as const;
    const result = planInventoryIssues(inventory([
      skill("consumer", "consumer", personal, ["peer-one", "peer-two"]),
    ]));

    expect(result.missingDependencyCount).toBe(1);
    expect(result.issues[0]).toMatchObject({
      kind: "missing-dependency",
      severity: "blocked",
      missingDependencies: ["peer-one", "peer-two"],
      migrationCandidateIds: [],
    });
    expect(result.issues[0].suggestions).toHaveLength(2);
  });
});
