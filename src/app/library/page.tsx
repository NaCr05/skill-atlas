import type { Metadata } from "next";

import { LocalizedText } from "@/components/localized-text";
import { PersonalLibraryClient } from "@/components/personal-library-client";
import { discoverSkills } from "@/core/skills/discover";
import { summarizeSkillInventory } from "@/core/skills/summary";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recipes & flows",
};

export default async function PersonalLibraryPage() {
  const inventory = summarizeSkillInventory(await discoverSkills());
  return <main className="workbench-page personal-library-page">
    <header className="workbench-header library-header"><div><span className="eyebrow"><LocalizedText zh="个人复用层" en="PERSONAL REUSE LAYER" /></span><h1><LocalizedText zh="配方与工作流" en="Recipes & flows" /></h1><p><LocalizedText zh="把有效的 Skill 调用沉淀为本地配方和有序流程，不上传任务正文，也不自动执行。" en="Turn effective Skill invocations into local recipes and ordered flows without uploading task text or auto-running anything." /></p></div></header>
    <PersonalLibraryClient skills={inventory.skills} />
  </main>;
}
