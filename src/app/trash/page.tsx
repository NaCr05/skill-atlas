import type { Metadata } from "next";
import { cookies } from "next/headers";

import { LocalizedText } from "@/components/localized-text";
import { TrashPageClient } from "@/components/trash-page-client";
import { LANGUAGE_COOKIE, normalizeLanguage } from "@/core/i18n";
import { getSkillTrashOverview } from "@/core/lifecycle/skill-trash";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const language = normalizeLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
  return { title: language === "zh" ? "Skill 回收站" : "Skill Trash" };
}

export default async function TrashPage() {
  const overview = await getSkillTrashOverview();
  return (
    <main className="trash-page">
      <header className="page-intro trash-page-intro">
        <span className="eyebrow"><LocalizedText zh="可恢复生命周期 / 本机存储" en="RECOVERABLE LIFECYCLE / LOCAL STORAGE" /></span>
        <h1><LocalizedText zh="Skill 回收站，" en="Skill Trash. " /><em><LocalizedText zh="先恢复，再清理。" en="Recover before you purge." /></em></h1>
        <p><LocalizedText zh="这里保存从个人 Codex Skills 目录移出的完整文件。你可以一键恢复；永久删除必须经过二次检查和名称确认。" en="This page keeps complete files moved out of your personal Codex Skills directory. Restore takes one click; permanent deletion requires a fresh review and exact-name confirmation." /></p>
      </header>
      <TrashPageClient initialOverview={overview} />
    </main>
  );
}
