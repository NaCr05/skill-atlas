"use client";

import { Activity, Braces, Clock3, Fingerprint, Link2, Route, ShieldCheck } from "lucide-react";

import {
  environmentStatusLabel,
  sourceKindLabel,
  structureStatusLabel,
} from "@/core/i18n";
import type { LocalWorkspaceState } from "@/core/local-workspace";
import { recommendSkills } from "@/core/skills/recommend";
import type { SkillSummary } from "@/core/skills/types";

import { useLanguage } from "./language-provider";

export function CapabilityImprint({
  skill,
  workspace,
  task,
}: {
  skill: SkillSummary;
  workspace: LocalWorkspaceState;
  task: string;
}) {
  const { language, t } = useLanguage();
  const recent = workspace.recentCopies.find((copy) => copy.skillId === skill.id);
  const recommendation = task.trim()
    ? recommendSkills([skill], task, language, 1, workspace.personalLibrary.feedback)[0]
    : undefined;
  const feedback = workspace.personalLibrary.feedback[skill.id];
  const why = recommendation?.reasons.join(" · ")
    || (feedback?.helpful ? t("过去的本地反馈表明它曾经有帮助", "Local feedback says this Skill was helpful before")
      : t("你明确选择了这个 Skill", "You explicitly selected this Skill"));
  const dependencies = skill.missingDependencies.length
    ? t(`缺少 ${skill.missingDependencies.join("、")}`, `Missing ${skill.missingDependencies.join(", ")}`)
    : skill.dependencies.length
      ? t(`${skill.dependencies.length} 项，均已满足`, `${skill.dependencies.length}, all satisfied`)
      : t("未声明", "None declared");

  return (
    <section className="capability-imprint" aria-labelledby={`capability-imprint-${skill.id}`}>
      <header>
        <span id={`capability-imprint-${skill.id}`}><Fingerprint size={14} aria-hidden="true" /> {t("能力印记", "CAPABILITY IMPRINT")}</span>
        <small>{t("本地扫描与使用记录", "Local scan and usage signals")}</small>
      </header>
      <dl>
        <div><dt><Link2 size={12} />{t("来源与作者", "Source & author")}</dt><dd>{sourceKindLabel(skill.source.kind, language)} · {skill.author || skill.plugin?.name || t("未声明", "Not declared")}</dd></div>
        <div><dt><Braces size={12} />{t("结构", "Structure")}</dt><dd>{structureStatusLabel(skill.structureStatus, language)}</dd></div>
        <div><dt><Activity size={12} />{t("环境", "Environment")}</dt><dd>{environmentStatusLabel(skill.environmentStatus, language)}</dd></div>
        <div><dt><Route size={12} />{t("调用方式", "Invocation")}</dt><dd>{skill.allowImplicitInvocation ? t("可自动匹配", "May auto-match") : t("需要点名", "Explicit only")}</dd></div>
        <div><dt><ShieldCheck size={12} />{t("依赖项", "Dependencies")}</dt><dd title={dependencies}>{dependencies}</dd></div>
        <div><dt><Clock3 size={12} />{t("最近使用", "Recent use")}</dt><dd>{recent ? new Date(recent.copiedAt).toLocaleString(language === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : t("尚未复制", "Not copied yet")}</dd></div>
      </dl>
      <p><strong>{t("为什么推荐：", "Why this Skill: ")}</strong>{why}</p>
    </section>
  );
}
