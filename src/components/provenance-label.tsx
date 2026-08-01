"use client";

import { useLanguage } from "./language-provider";

export function ProvenanceLabel({
  kind,
}: {
  kind: "source" | "dashboard" | "marketplace" | "ai";
}) {
  const { t } = useLanguage();
  const labels = {
    source: t("技能原始信息", "Original Skill content"),
    dashboard: t("面板分析", "Dashboard analysis"),
    marketplace: t("市场数据", "Marketplace data"),
    ai: t("AI 生成", "AI generated"),
  } as const;
  return (
    <span className="provenance" data-kind={kind}>
      {labels[kind]}
    </span>
  );
}
