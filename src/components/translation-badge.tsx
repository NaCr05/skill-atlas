import { Languages } from "lucide-react";

import type { ChineseDescriptionKind } from "@/core/skill-translations";

export function TranslationBadge({ kind }: { kind: ChineseDescriptionKind }) {
  if (kind === "source") return null;
  const label = kind === "catalog" ? "中文说明" : "本地中文摘要";
  const title = kind === "catalog"
    ? "来自本地中文说明目录；原始技能内容未被改写"
    : "根据原始元数据在本地自动概括；未调用外部 AI，完整技术约束请核对原始 SKILL.md";
  return (
    <span className="translation-badge i18n-zh" title={title}>
      <Languages size={12} aria-hidden="true" /> {label}
    </span>
  );
}
