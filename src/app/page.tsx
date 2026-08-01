import { Plus } from "lucide-react";
import Link from "next/link";

import { DashboardClient } from "@/components/dashboard-client";
import { LocalizedText } from "@/components/localized-text";
import { discoverSkills } from "@/core/skills/discover";

export const dynamic = "force-dynamic";

export default async function Home() {
  const inventory = await discoverSkills();

  return (
    <main className="workbench-page">
      <header className="workbench-header">
        <div>
          <span className="eyebrow"><LocalizedText zh="本地技能工作台" en="LOCAL SKILL WORKBENCH" /></span>
          <h1><LocalizedText zh="我的技能" en="My Skills" /></h1>
          <p><LocalizedText zh="找到合适的能力，确认调用规则，然后复制一段真正可用的提示词。" en="Find the right capability, review its invocation rules, and copy a Prompt that is ready to use." /></p>
        </div>
        <Link className="button button-primary" href="/marketplace">
          <Plus size={17} aria-hidden="true" /> <LocalizedText zh="安装新技能" en="Install a Skill" />
        </Link>
      </header>

      <section className="inventory-section workbench-inventory" id="inventory">
        <DashboardClient inventory={inventory} />
      </section>
    </main>
  );
}
