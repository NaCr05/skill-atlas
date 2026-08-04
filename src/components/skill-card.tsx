"use client";

import { ArrowRight, FolderOpen, Pin, Star } from "lucide-react";

import { sourceKindLabel, sourceLabel } from "@/core/i18n";
import { skillDescriptionLocalizationKind, translatedSkillDescription } from "@/core/skill-translations";
import type { SkillSummary } from "@/core/skills/types";
import { useLanguage } from "./language-provider";
import { StatusBadge } from "./status-badge";
import { TranslationBadge } from "./translation-badge";

export function SkillCard({
  skill,
  selected,
  favorite,
  pinned,
  onSelect,
}: {
  skill: SkillSummary;
  selected: boolean;
  favorite?: boolean;
  pinned?: boolean;
  onSelect: (skill: SkillSummary) => void;
}) {
  const { language, t } = useLanguage();
  const descriptionKind = skillDescriptionLocalizationKind(skill);
  return (
    <button
      type="button"
      className="skill-card"
      data-source={skill.source.kind}
      data-selected={selected}
      aria-pressed={selected}
      onClick={() => onSelect(skill)}
    >
      <span className="source-spine" aria-hidden="true" />
      <span className="skill-card-topline">
        <span className="source-code">
          {sourceKindLabel(skill.source.kind, language)}
          {(favorite || pinned) && <span className="personal-markers">{pinned && <Pin size={12} aria-label={t("已置顶", "Pinned")} />}{favorite && <Star size={12} aria-label={t("已收藏", "Favorited")} />}</span>}
        </span>
        <StatusBadge status={skill.status} />
      </span>
      <span className="skill-card-body">
        <span className="skill-card-title">{skill.displayName}</span>
        <code>${skill.name}</code>
        <span className="skill-card-description">
          {language === "zh" ? translatedSkillDescription(skill) : skill.description}
        </span>
        {descriptionKind !== "source" && <TranslationBadge kind={descriptionKind} />}
      </span>
      <span className="skill-card-meta">
        <span>
          <FolderOpen size={14} aria-hidden="true" /> {skill.resources.length} {t("个文件", "files")}
        </span>
        <span>{sourceLabel(skill.source, language)}{skill.plugin ? ` · ${skill.plugin.name}@${skill.plugin.version}` : ""}</span>
      </span>
      <span className="skill-card-open">
        {t("查看摘要", "View summary")} <ArrowRight size={15} aria-hidden="true" />
      </span>
    </button>
  );
}
