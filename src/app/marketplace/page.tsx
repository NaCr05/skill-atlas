import type { Metadata } from "next";
import { cookies } from "next/headers";

import { LocalizedText } from "@/components/localized-text";
import { MarketplaceClient } from "@/components/marketplace-client";
import { LANGUAGE_COOKIE, normalizeLanguage } from "@/core/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const language = normalizeLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
  return { title: language === "zh" ? "技能市场" : "Skill Marketplace" };
}

export default function MarketplacePage() {
  return (
    <main className="marketplace-page">
      <header className="page-intro">
        <span className="eyebrow"><LocalizedText zh="发现适配器 / 内置降级方案" en="DISCOVERY ADAPTERS / DEGRADED BY DESIGN" /></span>
        <h1>
          <LocalizedText zh="发现新能力，" en="Discover new capabilities. " />
          <em><LocalizedText zh="先看清再安装。" en="Review before installing." /></em>
        </h1>
        <p><LocalizedText zh="市场数据只负责发现。安装前仍会回到 GitHub 原始目录，展示完整文件、脚本风险和唯一目标路径。" en="Marketplace data is for discovery only. Before installation, Skill Atlas returns to the original GitHub directory to show every file, script risk, and the single target path." /></p>
      </header>
      <MarketplaceClient />
    </main>
  );
}
