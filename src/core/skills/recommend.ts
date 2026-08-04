import type { Language } from "@/core/i18n";
import { translatedSkillDescription, translatedTags, translatedUseCases } from "@/core/skill-translations";
import type { SkillSummary } from "./types";

export interface SkillRecommendation<TSkill extends SkillSummary = SkillSummary> {
  skill: TSkill;
  score: number;
  reasons: string[];
}

interface IntentSignal {
  pattern: RegExp;
  terms: string[];
  zh: string;
  en: string;
}

const INTENT_SIGNALS: IntentSignal[] = [
  { pattern: /前端|网页|网站|页面|界面|视觉|美化|可访问性|移动端|react|ui\b|ux\b|frontend|web design|accessibility/i, terms: ["frontend", "design", "interface", "web", "ui", "ux", "accessibility", "react"], zh: "前端与界面设计", en: "frontend and interface design" },
  { pattern: /论文|学术|latex|公式|参考文献|bibtex|排版/i, terms: ["latex", "document", "academic", "paper", "pdf", "bibliography"], zh: "论文与 LaTeX", en: "papers and LaTeX" },
  { pattern: /联网|搜索|检索|查资料|调研|research|search|exa/i, terms: ["search", "exa", "research", "web", "docs"], zh: "搜索与研究", en: "search and research" },
  { pattern: /目标|计划|规划|路线图|拆解|goal|plan|roadmap/i, terms: ["goal", "plan", "roadmap", "grill", "ticket"], zh: "目标与计划", en: "goals and planning" },
  { pattern: /代码架构|架构改进|重构|技术债|codebase|architecture|refactor/i, terms: ["codebase", "architecture", "engineering", "design", "domain"], zh: "代码与架构", en: "code and architecture" },
  { pattern: /测试|验证|质量|ci\b|debug|调试/i, terms: ["test", "testing", "verify", "validation", "ci", "debug"], zh: "测试与验证", en: "testing and verification" },
  { pattern: /发布说明|更新日志|版本说明|release notes?|changelog/i, terms: ["release", "note", "changelog", "documentation"], zh: "发布说明", en: "release notes" },
  { pattern: /技能|skill|插件|plugin|安装/i, terms: ["skill", "plugin", "installer", "creator", "find"], zh: "技能管理", en: "Skill management" },
  { pattern: /github|pull request|\bpr\b|issue|提交代码/i, terms: ["github", "pull", "request", "issue", "commit", "review"], zh: "GitHub 协作", en: "GitHub collaboration" },
  { pattern: /notebook|jupyter|pandas|数据分析|数据清洗/i, terms: ["jupyter", "notebook", "spreadsheet", "data", "analytics", "pandas"], zh: "数据分析", en: "data analysis" },
  { pattern: /excel|表格|电子表格|spreadsheet/i, terms: ["spreadsheet", "excel", "analytics", "data"], zh: "表格处理", en: "spreadsheet work" },
  { pattern: /ppt|幻灯片|演示文稿|presentation|slides?/i, terms: ["presentation", "slide", "deck"], zh: "演示文稿", en: "presentations" },
  { pattern: /pdf|文档|word|docx/i, terms: ["pdf", "document", "word", "docx"], zh: "文档处理", en: "document work" },
  { pattern: /图片|图像|插画|生成图|image|illustration/i, terms: ["image", "imagegen", "visual", "illustration"], zh: "图像生成", en: "image generation" },
  { pattern: /浏览器|网页操作|自动点击|browser|chrome/i, terms: ["browser", "chrome", "computer", "automation"], zh: "浏览器操作", en: "browser interaction" },
  { pattern: /复盘|项目总结|交接|新人上手|retrospective|onboarding|closeout/i, terms: ["engineering", "harness", "retrospective", "onboarding", "handoff"], zh: "项目复盘与交接", en: "project closeout and onboarding" },
];

const QUERY_STOPWORDS = new Set(["the", "and", "for", "with", "help", "please", "want", "need", "using", "this", "that"]);

function textTokens(value: string): string[] {
  return [...new Set((value.toLocaleLowerCase().match(/[a-z][a-z0-9-]{1,}/g) || [])
    .filter((token) => !QUERY_STOPWORDS.has(token)))];
}

function corpus(skill: SkillSummary): { name: string; all: string } {
  const name = `${skill.name.replaceAll("-", " ")} ${skill.displayName}`.toLocaleLowerCase();
  return {
    name,
    all: `${name} ${skill.description} ${translatedSkillDescription(skill)} ${skill.tags.join(" ")} ${translatedTags(skill.tags).join(" ")} ${skill.useCases.join(" ")} ${translatedUseCases(skill).join(" ")}`.toLocaleLowerCase(),
  };
}

export function recommendSkills<TSkill extends SkillSummary>(
  skills: TSkill[],
  task: string,
  language: Language,
  limit = 5,
): SkillRecommendation<TSkill>[] {
  const cleanTask = task.trim();
  if (!cleanTask) return [];
  const lowerTask = cleanTask.toLocaleLowerCase();
  const queryTokens = textTokens(cleanTask);
  const activeSignals = INTENT_SIGNALS.filter((signal) => signal.pattern.test(lowerTask));

  return skills.map((skill) => {
    const searchable = corpus(skill);
    let score = 0;
    const reasons: string[] = [];

    for (const signal of activeSignals) {
      const nameMatches = signal.terms.filter((term) => searchable.name.includes(term));
      const bodyMatches = signal.terms.filter((term) => !nameMatches.includes(term) && searchable.all.includes(term));
      if (nameMatches.length || bodyMatches.length) {
        score += nameMatches.length * 22 + bodyMatches.length * 6;
        reasons.push(language === "zh" ? signal.zh : signal.en);
      }
    }

    for (const token of queryTokens) {
      if (searchable.name.includes(token)) score += 28;
      else if (searchable.all.includes(token)) score += 5;
    }

    if (score > 0 && skill.environmentStatus === "ready") score += 3;
    if (skill.environmentStatus === "blocked") score -= 40;
    if (skill.environmentStatus === "needs-setup") score -= 10;
    if (skill.status === "duplicate") score -= 15;

    return { skill, score, reasons: [...new Set(reasons)].slice(0, 2) };
  })
    .filter((result) => result.score >= 8)
    .sort((a, b) => b.score - a.score || a.skill.displayName.localeCompare(b.skill.displayName, language === "zh" ? "zh-CN" : "en-US"))
    .slice(0, limit);
}
