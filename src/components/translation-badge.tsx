import { Languages } from "lucide-react";

export function TranslationBadge() {
  return (
    <span className="translation-badge i18n-zh" title="由本地翻译目录自动生成，原始技能内容未被改写">
      <Languages size={12} aria-hidden="true" /> 机器译文
    </span>
  );
}
