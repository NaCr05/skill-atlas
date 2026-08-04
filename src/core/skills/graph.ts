import type { SkillSummary } from "./types";

export type SkillGraphRelation = "dependency" | "related";

export type SkillGraphCategory =
  | "design"
  | "engineering"
  | "documents"
  | "research"
  | "data"
  | "productivity"
  | "media"
  | "system";

export const SKILL_GRAPH_CATEGORIES: SkillGraphCategory[] = [
  "design",
  "engineering",
  "documents",
  "research",
  "data",
  "productivity",
  "media",
  "system",
];

export interface SkillGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: SkillGraphRelation;
  reason: string;
}

export interface SkillGraph {
  skills: SkillSummary[];
  edges: SkillGraphEdge[];
}

export interface GlobalGraphLayout {
  positions: Map<string, { x: number; y: number }>;
  categoryLeaders: Map<SkillGraphCategory, string>;
  categoryCounts: Map<SkillGraphCategory, number>;
}

const CATEGORY_SIGNALS: Record<SkillGraphCategory, string[]> = {
  design: ["design", "frontend", "interface", "ui", "ux", "visual", "web-design", "accessibility", "theme", "figma"],
  engineering: ["architecture", "codebase", "coding", "engineering", "github", "security", "testing", "debug", "refactor", "module", "devops"],
  documents: ["document", "latex", "pdf", "presentation", "slides", "spreadsheet", "excel", "notebook", "paper", "academic", "report"],
  research: ["research", "search", "exa", "archive", "knowledge", "memory", "browser", "literary", "zotero"],
  data: ["data", "analytics", "database", "pandas", "sql", "chart", "visualization", "statistics", "dashboard"],
  productivity: ["goal", "grill", "planning", "project", "task", "ticket", "handoff", "productivity", "workflow", "onboarding"],
  media: ["image", "video", "audio", "media", "creative", "pet", "animation", "sprite", "canvas", "remotion"],
  system: ["installer", "plugin", "system", "environment", "computer", "chrome", "codex", "marketplace", "creator", "control"],
};

export function categorizeSkill(skill: SkillSummary): SkillGraphCategory {
  const haystack = `${skill.name} ${skill.displayName} ${skill.description} ${skill.tags.join(" ")} ${skill.useCases.join(" ")}`.toLocaleLowerCase();
  let best: { category: SkillGraphCategory; score: number } = { category: "system", score: 0 };

  for (const category of SKILL_GRAPH_CATEGORIES) {
    const score = CATEGORY_SIGNALS[category].reduce((total, signal) => {
      const nameMatch = skill.name.toLocaleLowerCase().includes(signal) ? 4 : 0;
      const textMatch = haystack.includes(signal) ? 1 : 0;
      return total + nameMatch + textMatch;
    }, 0);
    if (score > best.score) best = { category, score };
  }

  return best.category;
}

function relaxNodeOverlaps(positions: Map<string, { x: number; y: number }>): void {
  const items = [...positions.entries()].sort(([left], [right]) => left.localeCompare(right));
  const requiredWidth = 230 + 42;
  const requiredHeight = 104 + 34;

  for (let pass = 0; pass < 180; pass += 1) {
    let moved = false;
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const [leftId, left] = items[leftIndex];
        const [rightId, right] = items[rightIndex];
        const deltaX = right.x - left.x;
        const deltaY = right.y - left.y;
        const overlapX = requiredWidth - Math.abs(deltaX);
        const overlapY = requiredHeight - Math.abs(deltaY);
        if (overlapX <= 0 || overlapY <= 0) continue;

        moved = true;
        if (overlapX < overlapY) {
          const direction = deltaX === 0 ? (leftId < rightId ? 1 : -1) : Math.sign(deltaX);
          const shift = overlapX / 2 + 0.5;
          left.x -= direction * shift;
          right.x += direction * shift;
        } else {
          const direction = deltaY === 0 ? (leftId < rightId ? 1 : -1) : Math.sign(deltaY);
          const shift = overlapY / 2 + 0.5;
          left.y -= direction * shift;
          right.y += direction * shift;
        }
      }
    }
    if (!moved) break;
  }

  for (const [, position] of items) {
    position.x = Math.round(position.x);
    position.y = Math.round(position.y);
  }
}

export function globalClusterLayout(skills: SkillSummary[]): GlobalGraphLayout {
  const positions = new Map<string, { x: number; y: number }>();
  const categoryLeaders = new Map<SkillGraphCategory, string>();
  const categoryCounts = new Map<SkillGraphCategory, number>();
  const grouped = new Map(SKILL_GRAPH_CATEGORIES.map((category) => [category, [] as SkillSummary[]]));

  for (const skill of skills) grouped.get(categorizeSkill(skill))?.push(skill);
  for (const group of grouped.values()) {
    group.sort((left, right) =>
      (right.relationships.length + right.dependencies.length) - (left.relationships.length + left.dependencies.length)
      || left.displayName.localeCompare(right.displayName),
    );
  }

  const nodeWidth = 230;
  const nodeHeight = 104;
  const innerRadius = 650;
  const ringStep = 300;
  const verticalScale = 0.82;
  const sectorSpread = 0.54;

  SKILL_GRAPH_CATEGORIES.forEach((category, categoryIndex) => {
    const group = grouped.get(category) ?? [];
    const categoryAngle = -Math.PI / 2 + categoryIndex * (Math.PI * 2 / SKILL_GRAPH_CATEGORIES.length);
    if (group[0]) categoryLeaders.set(category, group[0].id);
    categoryCounts.set(category, group.length);

    let ring = 0;
    let ringStart = 0;
    let ringCapacity = 1;
    group.forEach((skill, index) => {
      while (index >= ringStart + ringCapacity) {
        ringStart += ringCapacity;
        ring += 1;
        ringCapacity = ring + 2;
      }

      const slot = index - ringStart;
      const slotCount = Math.min(ringCapacity, group.length - ringStart);
      const angleOffset = slotCount === 1 ? 0 : (slot / (slotCount - 1) - 0.5) * sectorSpread;
      const orbitalDrift = ring === 0 ? 0 : Math.sin((slot + 1) * (categoryIndex + 2)) * 24;
      const radius = innerRadius + ring * ringStep + orbitalDrift;
      const angle = categoryAngle + angleOffset;

      positions.set(skill.id, {
        x: Math.round(Math.cos(angle) * radius - nodeWidth / 2),
        y: Math.round(Math.sin(angle) * radius * verticalScale - nodeHeight / 2),
      });
    });
  });

  relaxNodeOverlaps(positions);

  return { positions, categoryLeaders, categoryCounts };
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join("::");
}

export function buildSkillGraph(skills: SkillSummary[]): SkillGraph {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const byName = new Map(skills.map((skill) => [skill.name.toLocaleLowerCase(), skill]));
  const edges: SkillGraphEdge[] = [];
  const dependencyPairs = new Set<string>();
  const relatedPairs = new Set<string>();

  for (const skill of skills) {
    for (const dependencyName of skill.dependencies) {
      const target = byName.get(dependencyName.toLocaleLowerCase());
      if (!target || target.id === skill.id) continue;
      const pair = pairKey(skill.id, target.id);
      if (dependencyPairs.has(pair)) continue;
      dependencyPairs.add(pair);
      edges.push({
        id: `dependency:${skill.id}:${target.id}`,
        source: skill.id,
        target: target.id,
        relation: "dependency",
        reason: `${skill.displayName} declares ${target.displayName} as a dependency.`,
      });
    }
  }

  for (const skill of skills) {
    for (const relationship of skill.relationships) {
      const target = byId.get(relationship.id);
      if (!target || target.id === skill.id) continue;
      const pair = pairKey(skill.id, target.id);
      if (dependencyPairs.has(pair) || relatedPairs.has(pair)) continue;
      relatedPairs.add(pair);
      edges.push({
        id: `related:${pair}`,
        source: skill.id,
        target: target.id,
        relation: "related",
        reason: relationship.reason,
      });
    }
  }

  return { skills, edges };
}

export function graphDistances(graph: SkillGraph, centerId: string, maximumDepth: number): Map<string, number> {
  const distances = new Map<string, number>();
  if (!graph.skills.some((skill) => skill.id === centerId)) return distances;

  const adjacency = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  distances.set(centerId, 0);
  const queue = [centerId];
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    const currentDepth = distances.get(current) ?? 0;
    if (currentDepth >= maximumDepth) continue;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, currentDepth + 1);
      queue.push(neighbor);
    }
  }

  return distances;
}

export function constellationLayout(distances: Map<string, number>): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const rings = new Map<number, string[]>();

  for (const [id, depth] of distances) {
    if (!rings.has(depth)) rings.set(depth, []);
    rings.get(depth)?.push(id);
  }

  for (const [depth, ids] of rings) {
    ids.sort();
    if (depth === 0) {
      positions.set(ids[0], { x: 0, y: 0 });
      continue;
    }
    const radiusX = 310 * depth;
    const radiusY = 210 * depth;
    ids.forEach((id, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / ids.length;
      positions.set(id, {
        x: Math.round(Math.cos(angle) * radiusX),
        y: Math.round(Math.sin(angle) * radiusY),
      });
    });
  }

  return positions;
}
