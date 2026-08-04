import { describe, expect, it } from "vitest";

import { buildSkillGraph, categorizeSkill, constellationLayout, globalClusterLayout, graphDistances } from "@/core/skills/graph";
import type { SkillRecord } from "@/core/skills/types";

function skill(name: string, dependencies: string[] = []): SkillRecord {
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
    dependencies,
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

describe("Skill knowledge graph", () => {
  it("prioritizes an explicit dependency over an inferred relationship", () => {
    const design = skill("frontend-design", ["design-review"]);
    const review = skill("design-review");
    design.relationships = [{ id: review.id, name: review.displayName, reason: "Shared frontend purpose" }];

    const graph = buildSkillGraph([design, review]);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ source: design.id, target: review.id, relation: "dependency" });
  });

  it("limits the constellation to the selected relationship depth", () => {
    const first = skill("first", ["second"]);
    const second = skill("second", ["third"]);
    const third = skill("third");
    const graph = buildSkillGraph([first, second, third]);

    expect([...graphDistances(graph, first.id, 1).entries()]).toEqual([["first", 0], ["second", 1]]);
    expect(graphDistances(graph, first.id, 2).get("third")).toBe(2);
  });

  it("places the focused Skill at the center", () => {
    const positions = constellationLayout(new Map([["focus", 0], ["peer", 1]]));
    expect(positions.get("focus")).toEqual({ x: 0, y: 0 });
    expect(positions.get("peer")).not.toEqual({ x: 0, y: 0 });
  });

  it("groups every installed Skill into the global capability map", () => {
    const design = skill("frontend-design");
    design.description = "Design distinctive web interfaces and UI systems.";
    const paper = skill("latex-document");
    paper.description = "Create academic papers and professional documents.";

    const layout = globalClusterLayout([design, paper]);

    expect(categorizeSkill(design)).toBe("design");
    expect(categorizeSkill(paper)).toBe("documents");
    expect(layout.positions.size).toBe(2);
    expect(layout.categoryCounts.get("design")).toBe(1);
    expect(layout.categoryCounts.get("documents")).toBe(1);
    expect(layout.positions.get(design.id)?.y).toBeLessThan(0);
    expect(layout.positions.get(paper.id)?.x).toBeGreaterThan(0);
  });

  it("keeps dense radial groups from overlapping in the automatic layout", () => {
    const denseDesignGroup = Array.from({ length: 18 }, (_, index) => {
      const record = skill(`frontend-design-${index}`);
      record.description = "Design frontend interfaces and UI systems.";
      return record;
    });
    const positions = [...globalClusterLayout(denseDesignGroup).positions.entries()];

    for (let leftIndex = 0; leftIndex < positions.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < positions.length; rightIndex += 1) {
        const [, left] = positions[leftIndex];
        const [, right] = positions[rightIndex];
        const cardsOverlap = Math.abs(left.x - right.x) < 230 && Math.abs(left.y - right.y) < 104;
        expect(cardsOverlap).toBe(false);
      }
    }
  });
});
