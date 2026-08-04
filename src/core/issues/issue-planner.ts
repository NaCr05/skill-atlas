import { createHash } from "node:crypto";

import type { SkillInventorySummary, SkillSummary } from "@/core/skills/types";

export type InventoryIssueKind = "duplicate-entry" | "missing-dependency";
export interface InventoryIssue {
  id: string;
  kind: InventoryIssueKind;
  severity: "warning" | "blocked";
  title: string;
  affectedSkills: Array<{ id: string; name: string; displayName: string; source: string; directoryPath: string }>;
  missingDependencies?: string[];
  canonicalSkillId?: string;
  migrationCandidateIds: string[];
  suggestions: string[];
}
export interface IssueOverview {
  scannedAt: string;
  total: number;
  duplicateCount: number;
  missingDependencyCount: number;
  issues: InventoryIssue[];
}

function id(kind: InventoryIssueKind, key: string): string {
  return createHash("sha256").update(`${kind}:${key.toLocaleLowerCase()}`).digest("hex").slice(0, 20);
}
function sourceRank(skill: SkillSummary): number {
  return { personal: 0, system: 1, plugin: 2, compatibility: 3 }[skill.source.kind];
}
function summary(skill: SkillSummary) {
  return { id: skill.id, name: skill.name, displayName: skill.displayName, source: skill.source.label, directoryPath: skill.directoryPath };
}

export function planInventoryIssues(inventory: SkillInventorySummary): IssueOverview {
  const issues: InventoryIssue[] = [];
  const groups = new Map<string, SkillSummary[]>();
  for (const skill of inventory.skills) {
    const key = skill.name.toLocaleLowerCase();
    groups.set(key, [...(groups.get(key) || []), skill]);
  }
  for (const [name, group] of groups) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => sourceRank(a) - sourceRank(b));
    const canonical = ordered[0];
    const migrationCandidates = ordered.filter((skill) => skill.source.kind === "compatibility" && skill.source.permission === "migration-only");
    issues.push({
      id: id("duplicate-entry", name), kind: "duplicate-entry", severity: "warning",
      title: `${canonical.name} has ${group.length} active entries`, affectedSkills: ordered.map(summary),
      canonicalSkillId: canonical.id, migrationCandidateIds: migrationCandidates.map((skill) => skill.id),
      suggestions: [
        `Keep ${canonical.source.label} as the preferred entry.`,
        migrationCandidates.length ? "Review compatibility entries one by one and migrate redundant copies into the private archive." : "This group contains no compatibility entry that Skill Atlas may migrate safely.",
      ],
    });
  }
  for (const skill of inventory.skills.filter((entry) => entry.missingDependencies.length)) {
    issues.push({
      id: id("missing-dependency", skill.id), kind: "missing-dependency", severity: "blocked",
      title: `${skill.name} is missing required Skills`, affectedSkills: [summary(skill)],
      missingDependencies: skill.missingDependencies, migrationCandidateIds: [],
      suggestions: skill.missingDependencies.map((dependency) => `Search the Skill marketplace for an exact ${dependency} provider, review its source, then rescan before using ${skill.name}.`),
    });
  }
  issues.sort((a, b) => Number(b.severity === "blocked") - Number(a.severity === "blocked") || a.title.localeCompare(b.title));
  return {
    scannedAt: inventory.scannedAt,
    total: issues.length,
    duplicateCount: issues.filter((issue) => issue.kind === "duplicate-entry").length,
    missingDependencyCount: issues.filter((issue) => issue.kind === "missing-dependency").length,
    issues,
  };
}
