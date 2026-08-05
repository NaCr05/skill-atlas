import { Plus } from "lucide-react";
import Link from "next/link";

import { discoverSkills } from "@/core/skills/discover";
import { summarizeSkillInventory } from "@/core/skills/summary";

import { DashboardClient } from "./dashboard-client";
import { LocalizedText } from "./localized-text";

export async function CatalogPage({ focusedSkillName = "" }: { focusedSkillName?: string }) {
  const inventory = summarizeSkillInventory(await discoverSkills());

  return (
    <main className="workbench-page catalog-page">
      <header className="workbench-header catalog-header">
        <div>
          <span className="eyebrow"><LocalizedText zh="本地能力目录" en="LOCAL CAPABILITY CATALOG" /></span>
          <h1><LocalizedText zh="技能目录" en="Skill Catalog" /></h1>
          <p><LocalizedText zh="查找可信的本地 Skill，确认调用条件，并生成可直接使用的提示词。" en="Find a trusted local Skill, confirm how it should be invoked, and generate a ready-to-use Prompt." /></p>
        </div>
        <Link className="button button-primary" href="/marketplace">
          <Plus size={17} aria-hidden="true" /> <LocalizedText zh="安装新 Skill" en="Install a Skill" />
        </Link>
      </header>

      <section className="inventory-section workbench-inventory" id="inventory">
        <DashboardClient inventory={inventory} initialFocusedSkillName={focusedSkillName} />
      </section>
    </main>
  );
}
