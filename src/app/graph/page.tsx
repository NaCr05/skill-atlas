import "@xyflow/react/dist/style.css";

import { SkillGraphClient } from "@/components/skill-graph-client";
import { discoverSkills } from "@/core/skills/discover";
import { summarizeSkillInventory } from "@/core/skills/summary";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const inventory = summarizeSkillInventory(await discoverSkills());
  return <SkillGraphClient inventory={inventory} />;
}
