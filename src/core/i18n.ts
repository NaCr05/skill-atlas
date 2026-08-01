import type { SkillEnvironmentStatus, SkillPermission, SkillSource, SkillSourceKind, SkillStatus, SkillStructureStatus } from "@/core/skills/types";

export type Language = "zh" | "en";

export const LANGUAGE_COOKIE = "skill-atlas-language";
export const DEFAULT_LANGUAGE: Language = "zh";

export function normalizeLanguage(value?: string | null): Language {
  return value === "en" ? "en" : DEFAULT_LANGUAGE;
}

export function pick<T>(language: Language, zh: T, en: T): T {
  return language === "zh" ? zh : en;
}

const STATUS_LABELS: Record<Language, Record<SkillStatus, string>> = {
  zh: {
    usable: "可自动调用",
    "explicit-only": "需显式调用",
    conditional: "有外部条件",
    "missing-dependency": "依赖缺失",
    "invalid-metadata": "元数据异常",
    duplicate: "重复入口",
    internal: "内部能力",
    "external-unavailable": "外部服务不可用",
    unknown: "待识别",
  },
  en: {
    usable: "Automatic invocation",
    "explicit-only": "Explicit invocation",
    conditional: "Conditional",
    "missing-dependency": "Dependency missing",
    "invalid-metadata": "Invalid metadata",
    duplicate: "Duplicate entry",
    internal: "Internal",
    "external-unavailable": "Service unavailable",
    unknown: "Unclassified",
  },
};

const PERMISSION_LABELS: Record<Language, Record<SkillPermission, string>> = {
  zh: {
    manage: "可管理",
    "read-only": "只读",
    "migration-only": "仅迁移",
  },
  en: {
    manage: "Manage",
    "read-only": "Read-only",
    "migration-only": "Migration only",
  },
};

const SOURCE_LABELS: Record<string, { zh: string; en: string }> = {
  "个人 Codex Skills": { zh: "个人 Codex 技能", en: "Personal Codex Skills" },
  "Codex 系统 Skills": { zh: "Codex 系统技能", en: "Codex system Skills" },
  "插件附带 Skills": { zh: "插件附带技能", en: "Plugin Skills" },
  "Agents 兼容目录": { zh: "Agents 兼容目录", en: "Agents compatibility directory" },
  "Skill Manager 共享目录": { zh: "Skill Manager 共享目录", en: "Skill Manager shared directory" },
};

export function statusLabel(status: SkillStatus, language: Language): string {
  return STATUS_LABELS[language][status];
}

export function structureStatusLabel(status: SkillStructureStatus, language: Language): string {
  return {
    zh: { valid: "结构有效", invalid: "结构异常" },
    en: { valid: "Structure valid", invalid: "Structure invalid" },
  }[language][status];
}

export function environmentStatusLabel(status: SkillEnvironmentStatus, language: Language): string {
  return {
    zh: { ready: "基础环境就绪", unverified: "外部工具待确认", "needs-setup": "需要配置", blocked: "环境验证已阻断" },
    en: { ready: "Base environment ready", unverified: "External tools unverified", "needs-setup": "Setup required", blocked: "Environment check blocked" },
  }[language][status];
}

export function permissionLabel(permission: SkillPermission, language: Language): string {
  return PERMISSION_LABELS[language][permission];
}

export function sourceLabel(source: SkillSource, language: Language): string {
  const known = SOURCE_LABELS[source.label];
  if (known) return known[language];
  return source.label;
}

export function sourceKindLabel(kind: SkillSourceKind, language: Language): string {
  const labels: Record<SkillSourceKind, { zh: string; en: string }> = {
    personal: { zh: "个人", en: "PERSONAL" },
    system: { zh: "系统", en: "SYSTEM" },
    plugin: { zh: "插件", en: "PLUGIN" },
    compatibility: { zh: "兼容目录", en: "COMPATIBILITY" },
  };
  return labels[kind][language];
}

export function localeFor(language: Language): string {
  return language === "zh" ? "zh-CN" : "en-US";
}

export function localizeGeneratedText(text: string, language: Language): string {
  if (language === "zh") return text;

  const exact: Record<string, string> = {
    "该 Skill 没有提供描述。": "This Skill does not provide a description.",
    "该 Skill 需要显式点名，建议使用详情页生成的 Prompt":
      "This Skill must be named explicitly; use the detail page to generate a Prompt.",
    "此来源为只读或兼容目录，不应从控制面板直接修改":
      "This source is read-only or a compatibility directory and should not be modified from the dashboard.",
    "暂未发现高置信度关联。": "No high-confidence relationships found yet.",
    "未发现结构性问题。": "No structural issues found.",
    "SkillsMP 未提供简介。": "SkillsMP did not provide a summary.",
  };
  if (exact[text]) return exact[text];

  const patterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^需要 (.+) 所描述的专门流程时$/, (match) => `When you need the specialized workflow described by ${match[1]}`],
    [/^任务与“(.+)”直接相关时优先调用$/, (match) => `Prioritize this Skill when the task directly matches “${match[1]}”`],
    [/^缺少依赖：(.+)$/, (match) => `Missing dependencies: ${match[1]}`],
    [/^发现 (\d+) 个同名入口$/, (match) => `Found ${match[1]} duplicate entr${match[1] === "1" ? "y" : "ies"}`],
    [/^同名入口优先使用：(.+)$/, (match) => `Preferred duplicate entry: ${match[1]}`],
    [/^用途关键词重叠 (\d+) 项$/, (match) => `${match[1]} overlapping purpose keywords`],
    [/^共同标签：(.+)$/, (match) => `Shared tags: ${match[1]}`],
    [/^共同工具：(.+)$/, (match) => `Shared tools: ${match[1]}`],
    [/^共同用途：(.+)$/, (match) => `Shared purposes: ${match[1]}`],
    [/^共同主题：(.+)$/, (match) => `Shared topic: ${match[1]}`],
    [/^用途交集：(.+)$/, (match) => `Purpose overlap: ${match[1]}`],
    [/^元数据异常，无法验证运行环境$/, () => "Invalid metadata blocks environment verification"],
    [/^声明了外部工具，需在 Codex 会话中确认：(.+)$/, (match) => `Declared external tools must be confirmed in a Codex session: ${match[1]}`],
    [/^缺少技能依赖：(.+)$/, (match) => `Missing Skill dependencies: ${match[1]}`],
    [/^未找到来源目录：(.+)$/, (match) => `Source directory not found: ${match[1]}`],
    [/^Skill 读取失败：(.+)$/, (match) => `Skill read failed: ${match[1]}`],
    [/^来自 (.+) 的热门 Skill$/, (match) => `Popular Skill from ${match[1]}`],
  ];

  for (const [pattern, translate] of patterns) {
    const match = text.match(pattern);
    if (match) return translate(match);
  }
  return text;
}

export function localizeMarketplaceNotice(text: string, language: Language): string {
  if (language === "zh") return text;

  const exact: Record<string, string> = {
    "输入至少一个搜索词。": "Enter at least one search term.",
    "已使用本机环境变量中的 SkillsMP API Key。": "Using the SkillsMP API key configured in this computer's environment.",
    "正在使用 SkillsMP 匿名额度（每日 50 次）。": "Using the SkillsMP anonymous quota (50 requests per day).",
    "skills.sh 官方 API 需要 Vercel OIDC Token；本地核心功能不受影响，可直接打开排行榜网页。":
      "The official skills.sh API requires a Vercel OIDC token. Local features are unaffected, and the leaderboard website remains available.",
  };
  if (exact[text]) return exact[text];

  const patterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^SkillsMP 暂不可用（HTTP (\d+)）。你仍可打开市场网页。$/, (match) => `SkillsMP is unavailable (HTTP ${match[1]}). You can still open the marketplace website.`],
    [/^SkillsMP 连接失败：(.+)$/, (match) => `SkillsMP connection failed: ${match[1]}`],
    [/^skills\.sh API 暂不可用（HTTP (\d+)），可继续使用网页排行榜。$/, (match) => `The skills.sh API is unavailable (HTTP ${match[1]}). You can continue with the web leaderboard.`],
    [/^skills\.sh 连接失败：(.+)$/, (match) => `skills.sh connection failed: ${match[1]}`],
  ];

  for (const [pattern, translate] of patterns) {
    const match = text.match(pattern);
    if (match) return translate(match);
  }
  return text;
}

export function localizeInstallerText(text: string, language: Language): string {
  if (language === "zh") return text;

  const exact: Record<string, string> = {
    "来源边界": "Source boundary",
    "Skill 元数据需要复核": "Skill metadata needs review",
    "目录超过 MVP 安全上限": "Directory exceeds MVP safety limits",
    "包含链接或子模块": "Contains links or submodules",
    "目标目录已存在": "Target directory already exists",
    "MVP 不覆盖或更新现有 Skill，请先保留原目录并改用新的名称/来源。":
      "The MVP does not overwrite or update existing Skills. Preserve the original directory and use a new name or source.",
  };
  if (exact[text]) return exact[text];

  const patterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^包含 (\d+) 个可执行脚本$/, (match) => `Contains ${match[1]} executable script${match[1] === "1" ? "" : "s"}`],
    [/^将从 github\.com\/(.+) 的 (.+) 引用读取 (\d+) 个文件。$/, (match) => `Will read ${match[3]} files from github.com/${match[1]} at ref ${match[2]}.`],
    [/^上限为 (\d+) 个文件和 20 MB；当前为 (\d+) 个文件、(\d+) 字节。$/, (match) => `The limit is ${match[1]} files and 20 MB; this directory contains ${match[2]} files and ${match[3]} bytes.`],
  ];

  for (const [pattern, translate] of patterns) {
    const match = text.match(pattern);
    if (match) return translate(match);
  }
  return text;
}
