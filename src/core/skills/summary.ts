import type {
  SkillInventory,
  SkillInventorySummary,
  SkillRecord,
  SkillSummary,
} from "./types";

export function summarizeSkill(skill: SkillRecord): SkillSummary {
  const { instructions: _instructions, ...summary } = skill;
  void _instructions;
  return summary;
}

export function summarizeSkillInventory(
  inventory: SkillInventory,
): SkillInventorySummary {
  return {
    ...inventory,
    skills: inventory.skills.map(summarizeSkill),
  };
}
